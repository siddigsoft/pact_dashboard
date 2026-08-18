
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, Loader2, Download, ChevronDown, ChevronRight, Search, ArrowUpDown, Maximize2, Minimize2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { WizardState, UncoveredReason } from '../CycleCloseWizard';
import type { RoleFlags } from '../CycleCloseWizard';
import { filterByHubAccess, getHubAccessInfo } from '@/utils/hubAccessControl';
import { exportFormattedNotCovered } from '@/utils/cycleCloseExport';
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
  activity_at_site: string | null;
  main_activity: string | null;
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
  currentUser?: any;
  roleFlags?: RoleFlags;
}

export default function Step4MarkUncovered({ wizardState, updateWizardState, onNext, onBack, canAdvance, canGoBack, currentUser, roleFlags }: Props) {
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
  const [showSiteStatus, setShowSiteStatus] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [sortCol, setSortCol] = useState<keyof SiteDetail>('state');
  const [sortAsc, setSortAsc] = useState(true);
  const [coverageFilter, setCoverageFilter] = useState<'' | 'Covered' | 'Not Covered' | 'Pending'>('');
  const [activityFilter, setActivityFilter] = useState<string>('');
  const [showUnmatchedWfp, setShowUnmatchedWfp] = useState(false);
  const [unmatchedWfpSearch, setUnmatchedWfpSearch] = useState('');
  const [expandedUnmatchedRows, setExpandedUnmatchedRows] = useState<Set<number>>(new Set());
  const [draftSaving, setDraftSaving] = useState(false);

  const isCoordinator = !!roleFlags?.isCoordinator;
  const isSupervisor = !!roleFlags?.isSupervisor;
  const isAdminLike = !!roleFlags?.isAdmin || !!roleFlags?.isSuperAdmin;
  const canEditReasons = isCoordinator;
  const canConfirmReasons = isSupervisor;
  const shouldScopeToAssignment = isCoordinator || isSupervisor;
  const hubAccessInfo = useMemo(() => getHubAccessInfo(currentUser ?? null), [currentUser]);

  const normalize = (value: string | null | undefined) =>
    (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseState = (value: string | null | undefined) =>
    normalize(value).replace(/state$/, '');
  const assignedStateBase = baseState(currentUser?.stateId || currentUser?.state_id || '');

  const scopeRows = useCallback(<T extends { state?: string; hub_office?: string }>(rows: T[]): T[] => {
    if (!shouldScopeToAssignment) return rows;
    if (hubAccessInfo.isHubSupervisor) {
      const byHub = filterByHubAccess(rows as any[], hubAccessInfo as any) as T[];
      if (byHub.length > 0) return byHub;
    }
    if (!assignedStateBase) return rows;
    return rows.filter(r => baseState(r.state) === assignedStateBase);
  }, [assignedStateBase, hubAccessInfo, shouldScopeToAssignment]);

  // Refs to prevent re-running loaders when wizard state object references change
  // without the underlying data actually changing.
  const loadedMmpIdRef   = useRef<string | null>(null);
  const matchResultsRef  = useRef(wizardState.matchResults);
  const resolvedSitesRef = useRef(wizardState.resolvedSites);
  const unmatchedRef     = useRef(wizardState.unmatchedMmpSiteIds);

  useEffect(() => {
    if (!wizardState.selectedMmpId) return;
    const idChanged       = loadedMmpIdRef.current !== wizardState.selectedMmpId;
    const matchChanged    = matchResultsRef.current !== wizardState.matchResults;
    const resolvedChanged = resolvedSitesRef.current !== wizardState.resolvedSites;
    const unmatchedChanged= unmatchedRef.current !== wizardState.unmatchedMmpSiteIds;
    if (!idChanged && !matchChanged && !resolvedChanged && !unmatchedChanged) return;
    // Update refs
    loadedMmpIdRef.current   = wizardState.selectedMmpId;
    matchResultsRef.current  = wizardState.matchResults;
    resolvedSitesRef.current = wizardState.resolvedSites;
    unmatchedRef.current     = wizardState.unmatchedMmpSiteIds;
    loadUncoveredSites();
    loadCoverageBreakdown();
    loadSiteStatusDetails();
  }, [wizardState.selectedMmpId, wizardState.resolvedSites, wizardState.unmatchedMmpSiteIds, wizardState.matchResults]);

  const loadUncoveredSites = async () => {
    setLoading(true);
    try {
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
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, state, locality, hub_office, accepted_by, status, not_covered_reason, not_covered_reason_other, not_covered_flag, not_covered_confirm_status, not_covered_confirmed_by, not_covered_confirmed_at, not_covered_confirmation_note')
        .eq('mmp_file_id', wizardState.selectedMmpId!)
        .eq('status', 'not_covered');
      if (error) {
        console.error('loadUncoveredSites fallback error:', error);
        setSites([]);
        return;
      }
      const scoped = scopeRows(data ?? []);
      setSites(scoped.map((s: any) => ({
        id: s.id,
        site_name: s.site_name,
        state: s.state ?? '',
        locality: s.locality ?? '',
        hub_office: s.hub_office ?? '',
        enumerator_name: '—',
        source: 'manual' as const,
      })));
      const restored = scoped.reduce((acc: Record<string, UncoveredReason>, s: any) => {
        if (!s.not_covered_reason) return acc;
        acc[s.id] = {
          reason: s.not_covered_reason,
          note: s.not_covered_note ?? s.not_covered_reason_other ?? '',
          flagged: !!(s.needs_followup ?? s.not_covered_flag),
          status: (s.not_covered_confirm_status === 'confirmed' ? 'confirmed' : 'draft'),
          confirmedBy: s.not_covered_confirmed_by ?? null,
          confirmedAt: s.not_covered_confirmed_at ?? null,
          confirmationNote: s.not_covered_confirmation_note ?? null,
        };
        return acc;
      }, {});
      if (Object.keys(restored).length) {
        updateWizardState({ uncoveredReasons: { ...wizardState.uncoveredReasons, ...restored } });
      }
      setLoading(false);
      return;
    }

    // NOTE: accepted_by has no FK to profiles — query plain columns only,
    // then do a separate lookup for any enumerator names we need.
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, hub_office, accepted_by, not_covered_reason, not_covered_reason_other, not_covered_flag, not_covered_confirm_status, not_covered_confirmed_by, not_covered_confirmed_at, not_covered_confirmation_note')
      .in('id', allIds);

    if (error) {
      console.error('loadUncoveredSites error:', error);
      setLoading(false);
      return;
    }

    const scopedData = scopeRows(data ?? []);
    const notInWfpSet = new Set(notInWfpIds);
    const step3Set    = new Set(step3NotCovered);

    // Resolve any UUID-shaped accepted_by values to profile full_names
    const isUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const uuids = [...new Set(
      scopedData.map((s: any) => s.accepted_by).filter((v: any) => v && isUuid(String(v)))
    )];
    const nameMap: Record<string, string> = {};
    if (uuids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uuids);
      for (const p of profiles ?? []) if (p.full_name) nameMap[p.id] = p.full_name;
    }

    setSites(scopedData.map((s: any) => {
      const raw = s.accepted_by ?? '';
      const resolved = raw && isUuid(raw) ? (nameMap[raw] ?? raw) : (raw || '—');
      return {
        id: s.id,
        site_name: s.site_name,
        state: s.state ?? '',
        locality: s.locality ?? '',
        hub_office: s.hub_office ?? '',
        enumerator_name: resolved,
        source: step3Set.has(s.id) ? 'not_covered'
              : notInWfpSet.has(s.id) ? 'not_in_wfp'
              : 'rejected_match',
      };
    }));
    const restored = scopedData.reduce((acc: Record<string, UncoveredReason>, s: any) => {
      if (!s.not_covered_reason) return acc;
      acc[s.id] = {
        reason: s.not_covered_reason,
        note: s.not_covered_note ?? s.not_covered_reason_other ?? '',
        flagged: !!(s.needs_followup ?? s.not_covered_flag),
        status: (s.not_covered_confirm_status === 'confirmed' ? 'confirmed' : 'draft'),
        confirmedBy: s.not_covered_confirmed_by ?? null,
        confirmedAt: s.not_covered_confirmed_at ?? null,
        confirmationNote: s.not_covered_confirmation_note ?? null,
      };
      return acc;
    }, {});
    if (Object.keys(restored).length) {
      updateWizardState({ uncoveredReasons: { ...wizardState.uncoveredReasons, ...restored } });
    }
    } catch (err) {
      console.error('loadUncoveredSites failed:', err);
      setSites([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Coverage breakdown by state ───────────────────────────────────────────
  const loadCoverageBreakdown = async () => {
    const { data: allSites } = await supabase
      .from('mmp_site_entries')
      .select('id, state')
      .eq('mmp_file_id', wizardState.selectedMmpId!);

    if (!allSites?.length) return;
    const scopedSites = scopeRows(allSites ?? []);
    if (!scopedSites.length) {
      setCoverageRows([]);
      return;
    }

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
    for (const s of scopedSites) {
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
      .select('id, site_code, site_name, state, locality, hub_office, status, activity_at_site, main_activity')
      .eq('mmp_file_id', wizardState.selectedMmpId);

    if (!allSites?.length) { setSiteDetailsLoading(false); return; }
    const scopedAllSites = scopeRows(allSites ?? []);
    if (!scopedAllSites.length) {
      setSiteDetails([]);
      setSiteDetailsLoading(false);
      return;
    }

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

    const details: SiteDetail[] = scopedAllSites.map(s => {
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
        id:               s.id,
        site_code:        s.site_code ?? '',
        site_name:        s.site_name ?? '',
        state:            s.state ?? '',
        locality:         s.locality ?? '',
        hub_office:       s.hub_office ?? '',
        activity_at_site: s.activity_at_site ?? null,
        main_activity:    s.main_activity ?? null,
        system_status:    s.status ?? '—',
        wfp_in_file:      !!mr,
        wfp_row_primary:  mr ? (mr.wfpRow[primaryWfpCol] ?? null) : null,
        match_score:      mr ? mr.matchScore : null,
        match_level:      mr ? mr.matchLevel : null,
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
    const current = wizardState.uncoveredReasons[siteId] ?? { reason: '', note: '', flagged: false, status: 'draft' };
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === (patch.reason ?? current.reason));
    updateWizardState({
      uncoveredReasons: {
        ...wizardState.uncoveredReasons,
        [siteId]: {
          ...current,
          ...patch,
          flagged: !!reasonMeta?.flagged,
          status: 'draft',
          confirmedBy: null,
          confirmedAt: null,
        },
      },
    });
  };

  const applyBulk = () => {
    if (!bulkReason || selected.size === 0) return;
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === bulkReason);
    const patch: Record<string, UncoveredReason> = {};
    selected.forEach(id => {
      patch[id] = { reason: bulkReason, note: bulkNote, flagged: !!reasonMeta?.flagged, status: 'draft', confirmedBy: null, confirmedAt: null };
    });
    updateWizardState({ uncoveredReasons: { ...wizardState.uncoveredReasons, ...patch } });
    setSelected(new Set());
    setBulkReason('');
    setBulkNote('');
  };

  const persistReasonDraft = async (siteId: string, reasonData: UncoveredReason) => {
    const { error } = await (supabase as any).rpc('set_not_covered_reason', {
      p_site_id: siteId,
      p_reason: reasonData.reason,
      p_note: reasonData.note ?? '',
      p_flagged: !!reasonData.flagged,
    });
    if (error) throw error;
  };

  const persistSupervisorConfirmation = async (siteId: string, reasonData: UncoveredReason) => {
    if (reasonData.status !== 'confirmed') return;
    const { error } = await (supabase as any).rpc('confirm_not_covered_reason', {
      p_site_id: siteId,
      p_confirmation_note: reasonData.confirmationNote ?? '',
      p_confirm: true,
    });
    if (error) throw error;
  };

  const saveDraftReasons = async () => {
    setDraftSaving(true);
    try {
      for (const [siteId, reasonData] of Object.entries(wizardState.uncoveredReasons)) {
        if (!reasonData.reason) continue;
        await persistReasonDraft(siteId, reasonData);
        await persistSupervisorConfirmation(siteId, reasonData);
      }
    } finally {
      setDraftSaving(false);
    }
  };

  const saveAndNext = async () => {
    setSaving(true);
    try {
      await saveDraftReasons();
      onNext();
    } finally {
      setSaving(false);
    }
  };

  const confirmReason = async (siteId: string) => {
    if (!canConfirmReasons) return;
    const current = wizardState.uncoveredReasons[siteId];
    if (!current?.reason) return;
    const nowIso = new Date().toISOString();
    updateWizardState({
      uncoveredReasons: {
        ...wizardState.uncoveredReasons,
        [siteId]: {
          ...current,
          status: 'confirmed',
          confirmedBy: currentUser?.id ?? null,
          confirmedAt: nowIso,
        },
      },
    });
    await (supabase as any).rpc('confirm_not_covered_reason', {
      p_site_id: siteId,
      p_confirmation_note: current.confirmationNote ?? '',
      p_confirm: true,
    });
  };

  const returnReasonToDraft = async (siteId: string) => {
    if (!canConfirmReasons) return;
    const current = wizardState.uncoveredReasons[siteId];
    if (!current?.reason) return;
    updateWizardState({
      uncoveredReasons: {
        ...wizardState.uncoveredReasons,
        [siteId]: {
          ...current,
          status: 'draft',
          confirmedBy: null,
          confirmedAt: null,
        },
      },
    });
    await (supabase as any).rpc('confirm_not_covered_reason', {
      p_site_id: siteId,
      p_confirmation_note: current.confirmationNote ?? '',
      p_confirm: false,
    });
  };

  const exportNotCoveredReport = () => {
    void exportFormattedNotCovered(sites, coverageRows, wizardState);
  };

  if (loading) {
    return <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading sites…</div>;
  }

  const allAssigned = sites.every(s => !!wizardState.uncoveredReasons[s.id]?.reason);
  const allConfirmed = sites.every(s => !!wizardState.uncoveredReasons[s.id]?.reason && wizardState.uncoveredReasons[s.id]?.status === 'confirmed');
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

      {isAdminLike && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription>
            Read-only stage: Coordinators must enter uncovered reasons and Supervisors must confirm them before Admin/Super Admin can proceed.
          </AlertDescription>
        </Alert>
      )}

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

      {/* ── Unmatched WFP Rows panel ─────────────────────────────────────── */}
      {(() => {
        const unmatchedRows = wizardState.matchResults.filter(r => r.status === 'unmatched');
        if (unmatchedRows.length === 0) return null;

        const primaryPair    = wizardState.matchingPairs[0] ?? null;
        const secondaryPairs = wizardState.matchingPairs.slice(1);
        const wfpCols        = wizardState.fileColumns;

        const searchLow = unmatchedWfpSearch.toLowerCase();
        const visibleRows = unmatchedRows.filter(r => {
          if (!searchLow) return true;
          return Object.values(r.wfpRow).some(v => String(v).toLowerCase().includes(searchLow));
        });

        const exportUnmatched = async () => {
          const ExcelJS = (await import('exceljs')).default;
          const { saveAs } = await import('file-saver');
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet('Unmatched WFP Rows');
          const headers = ['#', ...wfpCols];
          const hr = ws.addRow(headers);
          hr.eachCell(c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891b2' } };
            c.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
          });
          ws.views = [{ state: 'frozen', ySplit: 1 }];
          unmatchedRows.forEach((r, i) => {
            const vals = [i + 1, ...wfpCols.map(col => r.wfpRow[col] ?? '')];
            const dr = ws.addRow(vals);
            dr.eachCell(c => {
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFf0f9ff' } };
              c.font = { size: 10, name: 'Calibri' };
            });
          });
          headers.forEach((h, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(h.length + 4, 12), 40); });
          const buf = await wb.xlsx.writeBuffer();
          saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `unmatched-wfp-rows-${wizardState.selectedMmp?.name ?? 'cycle'}.xlsx`);
        };

        return (
          <div className="border rounded-lg shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center bg-orange-50 dark:bg-orange-950/20 border-b">
              <button
                type="button"
                onClick={() => setShowUnmatchedWfp(v => !v)}
                className="flex-1 flex items-center gap-2 flex-wrap px-4 py-3 font-medium hover:bg-orange-100/60 transition-colors text-left"
              >
                <span className="text-sm">⚠️ Unmatched WFP Rows</span>
                <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs">{unmatchedRows.length} rows</Badge>
                <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
                  WFP file rows that could not be matched to any MMP site
                </span>
              </button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs mr-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={exportUnmatched}>
                <Download className="h-3 w-3 mr-1" /> Export
              </Button>
              <button
                type="button"
                onClick={() => setShowUnmatchedWfp(v => !v)}
                className="px-3 py-3 text-muted-foreground hover:text-foreground hover:bg-orange-100/60 transition-colors flex-shrink-0"
              >
                {showUnmatchedWfp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>

            {showUnmatchedWfp && (
              <>
                {/* Search bar */}
                <div className="border-b bg-white dark:bg-slate-900 px-4 py-2.5 flex items-center gap-3">
                  <div className="relative flex-1 max-w-80">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="Search any WFP column value…"
                      value={unmatchedWfpSearch}
                      onChange={e => setUnmatchedWfpSearch(e.target.value)}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{visibleRows.length} of {unmatchedRows.length} rows</span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-8 text-center">#</th>
                        <th className="px-3 py-2.5 text-left font-semibold min-w-[180px]">
                          {primaryPair ? primaryPair.wfpColumn : 'Primary Value'}
                        </th>
                        {secondaryPairs.map(p => (
                          <th key={p.wfpColumn} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                            {p.wfpColumn}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left font-semibold">All Fields</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r, i) => {
                        const isExpanded = expandedUnmatchedRows.has(r.rowIndex);
                        const toggle = () => setExpandedUnmatchedRows(prev => {
                          const n = new Set(prev);
                          isExpanded ? n.delete(r.rowIndex) : n.add(r.rowIndex);
                          return n;
                        });
                        const primaryVal = primaryPair ? (r.wfpRow[primaryPair.wfpColumn] ?? '—') : '—';

                        return (
                          <>
                            <tr
                              key={r.rowIndex}
                              className={`border-t transition-colors hover:bg-orange-50/40 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}
                            >
                              <td className="px-3 py-2 text-center text-muted-foreground">{r.rowIndex + 1}</td>
                              <td className="px-3 py-2 font-medium">{primaryVal}</td>
                              {secondaryPairs.map(p => (
                                <td key={p.wfpColumn} className="px-3 py-2 text-muted-foreground max-w-[140px] truncate" title={r.wfpRow[p.wfpColumn] ?? ''}>
                                  {r.wfpRow[p.wfpColumn] ?? '—'}
                                </td>
                              ))}
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={toggle}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  {isExpanded ? 'Hide' : `${wfpCols.filter(c => r.wfpRow[c] && r.wfpRow[c] !== '').length} fields`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${r.rowIndex}-exp`} className="border-t bg-orange-50/30 dark:bg-orange-950/10">
                                <td colSpan={3 + secondaryPairs.length} className="px-5 py-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1">
                                    {wfpCols.filter(col => r.wfpRow[col] != null && r.wfpRow[col] !== '').map(col => (
                                      <div key={col} className="flex gap-1.5 text-[11px] min-w-0">
                                        <span className="text-muted-foreground font-mono shrink-0 truncate max-w-[110px]" title={col}>{col}:</span>
                                        <span className="font-medium break-all">{r.wfpRow[col]}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                      {visibleRows.length === 0 && (
                        <tr>
                          <td colSpan={3 + secondaryPairs.length} className="px-4 py-10 text-center text-muted-foreground italic">
                            No rows match the search
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer note */}
                <div className="border-t px-4 py-2 bg-orange-50/50 text-[10px] text-orange-800">
                  These WFP file rows had no MMP site matching them (score below threshold). They are informational only and do not affect site coverage counts.
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Full Site Status Table + Inline Reason Assignment ──────────────── */}
      {(() => {
        // Helpers
        const toggleSort = (col: keyof SiteDetail) => {
          if (sortCol === col) setSortAsc(a => !a);
          else { setSortCol(col); setSortAsc(true); }
        };
        const matchingStatusColor = (s: SiteDetail['matching_status']) => {
          if (s === 'Auto-Confirmed' || s === 'Confirmed') return 'bg-green-100 text-green-700 border-green-300';
          if (s === 'Extra')           return 'bg-teal-100 text-teal-700 border-teal-300';
          if (s === 'Needs Review')    return 'bg-amber-100 text-amber-700 border-amber-300';
          if (s === 'Rejected')        return 'bg-red-100 text-red-700 border-red-300';
          if (s === 'Not in WFP File') return 'bg-slate-100 text-slate-600 border-slate-300';
          return 'bg-orange-100 text-orange-700 border-orange-300';
        };
        const coverageColor = (c: SiteDetail['coverage']) =>
          c === 'Covered'     ? 'bg-green-100 text-green-700 border-green-300' :
          c === 'Not Covered' ? 'bg-red-100 text-red-700 border-red-300'       :
                                'bg-amber-100 text-amber-700 border-amber-300';

        // Which sites need a reason assigned?
        const uncoveredSiteIds = new Set(sites.map(s => s.id));
        const siteSourceMap: Record<string, UncoveredSite['source']> = {};
        for (const s of sites) siteSourceMap[s.id] = s.source;

        const searchLow = siteSearch.toLowerCase();
        const uniqueStates     = [...new Set(siteDetails.map(s => s.state).filter(Boolean))].sort();
        const uniqueActivities = [...new Set(siteDetails.map(s => s.activity_at_site).filter(Boolean))].sort() as string[];

        const filtered = siteDetails
          .filter(s =>
            (!stateFilter    || s.state             === stateFilter) &&
            (!activityFilter || s.activity_at_site  === activityFilter) &&
            (!coverageFilter || s.coverage          === coverageFilter) &&
            (!searchLow ||
              s.site_name.toLowerCase().includes(searchLow)  ||
              s.locality.toLowerCase().includes(searchLow)   ||
              s.hub_office.toLowerCase().includes(searchLow) ||
              s.site_code.toLowerCase().includes(searchLow))
          )
          .sort((a, b) => {
            const av = String(a[sortCol] ?? '');
            const bv = String(b[sortCol] ?? '');
            return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });

        // How many uncovered in current filter still need a reason
        const pendingInView = filtered.filter(s => uncoveredSiteIds.has(s.id) && !wizardState.uncoveredReasons[s.id]?.reason).length;

        const exportSiteStatus = async () => {
          const headers = [
            'Site Code', 'Site Name', 'State', 'Locality', 'Hub / Office',
            'System Status', 'In WFP File', 'WFP Row (Primary)', 'Match Score',
            'Match Level', 'Matching Status', 'Action Taken', 'Coverage',
            'Activity at Site', 'Main Activity', 'Not-Covered Reason',
          ];
          const ExcelJS = (await import('exceljs')).default;
          const { saveAs } = await import('file-saver');
          const wb = new ExcelJS.Workbook();
          const sheet = wb.addWorksheet('Site Status');
          const hr = sheet.addRow(headers);
          hr.eachCell(c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891b2' } };
            c.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
          });
          sheet.views = [{ state: 'frozen', ySplit: 1 }];
          filtered.forEach((s, i) => {
            const dr = sheet.addRow([
              s.site_code, s.site_name, s.state, s.locality, s.hub_office,
              s.system_status, s.wfp_in_file ? 'Yes' : 'No',
              s.wfp_row_primary ?? '—',
              s.match_score != null ? `${s.match_score}%` : '—',
              s.match_level ?? '—', s.matching_status, s.action_taken ?? '—',
              s.coverage, s.activity_at_site ?? '—', s.main_activity ?? '—',
              s.not_covered_reason ?? (wizardState.uncoveredReasons[s.id]?.reason ?? '—'),
            ]);
            dr.eachCell(c => {
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFf0f9ff' } };
              c.font = { size: 10, name: 'Calibri' };
            });
          });
          headers.forEach((h, i) => { sheet.getColumn(i + 1).width = Math.min(Math.max(h.length + 4, 12), 40); });
          const buf = await wb.xlsx.writeBuffer();
          saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `site-status-${wizardState.selectedMmp?.name ?? 'cycle'}.xlsx`);
        };

        const SortTh = ({ col, label, className = '' }: { col: keyof SiteDetail; label: string; className?: string }) => (
          <th
            className={`px-3 py-2.5 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 ${className}`}
            onClick={() => toggleSort(col)}
          >
            <span className="flex items-center gap-1">
              {label}
              <ArrowUpDown className={`h-3 w-3 flex-shrink-0 ${sortCol === col ? 'text-primary' : 'text-muted-foreground/30'}`} />
            </span>
          </th>
        );

        // Count badges for the header
        const covCount  = siteDetails.filter(s => s.coverage === 'Covered').length;
        const ncCount   = siteDetails.filter(s => s.coverage === 'Not Covered').length;
        const pendCount = siteDetails.filter(s => s.coverage === 'Pending').length;

        const panelContent = (
          <div className={`flex flex-col overflow-hidden ${isFullScreen ? 'h-full' : 'border rounded-lg shadow-sm'}`}>

            {/* ── Panel header (toggle) ──────────────────────────────── */}
            <div className="flex items-center bg-slate-50 dark:bg-slate-900 border-b">
              <button
                type="button"
                onClick={() => setShowSiteStatus(v => !v)}
                className="flex-1 flex items-center gap-2 flex-wrap px-4 py-3 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <span className="text-sm">🗂 Full Site Status Table</span>
                {siteDetailsLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  : <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">{siteDetails.length} sites</Badge>
                }
                <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">✓ {covCount}</Badge>
                <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">✗ {ncCount}</Badge>
                {pendCount > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">⏳ {pendCount}</Badge>}
                {sites.length > 0 && (
                  <Badge className={`text-xs ${allAssigned ? 'bg-green-100 text-green-700 border-green-300' : 'bg-orange-100 text-orange-700 border-orange-300'}`}>
                    {allAssigned ? '✓ All reasons assigned' : `${sites.filter(s => !wizardState.uncoveredReasons[s.id]?.reason).length} reasons pending`}
                  </Badge>
                )}
                <span className="text-xs font-normal text-muted-foreground hidden sm:inline">WFP · System · Activity · Matching · Reason</span>
              </button>
              {/* Fullscreen toggle */}
              <button
                type="button"
                title={isFullScreen ? 'Exit full screen' : 'Open full screen'}
                onClick={e => { e.stopPropagation(); setIsFullScreen(v => !v); setShowSiteStatus(true); }}
                className="px-3 py-3 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
              >
                {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowSiteStatus(v => !v)}
                className="px-3 py-3 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
              >
                {showSiteStatus ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>

            {showSiteStatus && (
              <>
                {/* ── Filters toolbar ───────────────────────────────── */}
                <div className="border-b bg-white dark:bg-slate-900 px-4 py-2.5 space-y-2">
                  {/* Row 1: search + count */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        className="h-8 pl-8 text-xs"
                        placeholder="Search site name, locality, hub, code…"
                        value={siteSearch}
                        onChange={e => setSiteSearch(e.target.value)}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium shrink-0">
                      {filtered.length} of {siteDetails.length} sites
                    </span>
                  </div>

                  {/* Row 2: State / Activity dropdowns + coverage chips + export buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* State dropdown */}
                    <Select value={stateFilter || '__all__'} onValueChange={v => setStateFilter(v === '__all__' ? '' : v)}>
                      <SelectTrigger className={`h-7 text-xs w-40 ${stateFilter ? 'border-blue-400 bg-blue-50 text-blue-800' : ''}`}>
                        <SelectValue placeholder="All States" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All States</SelectItem>
                        {uniqueStates.map(st => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Activity dropdown */}
                    <Select value={activityFilter || '__all__'} onValueChange={v => setActivityFilter(v === '__all__' ? '' : v)}>
                      <SelectTrigger className={`h-7 text-xs w-40 ${activityFilter ? 'border-purple-400 bg-purple-50 text-purple-800' : ''}`}>
                        <SelectValue placeholder="All Activities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Activities</SelectItem>
                        {uniqueActivities.map(act => (
                          <SelectItem key={act} value={act}>{act}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Clear all filters shortcut */}
                    {(stateFilter || activityFilter || coverageFilter) && (
                      <button
                        type="button"
                        onClick={() => { setStateFilter(''); setActivityFilter(''); setCoverageFilter(''); }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-muted-foreground hover:bg-slate-100 transition-colors"
                      >
                        Clear filters ×
                      </button>
                    )}

                    {/* Coverage filter buttons */}
                    {(['', 'Covered', 'Not Covered', 'Pending'] as const).map(cf => (
                      <button
                        key={cf}
                        type="button"
                        onClick={() => setCoverageFilter(cf)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                          coverageFilter === cf
                            ? cf === ''           ? 'bg-slate-700 text-white border-slate-700'
                            : cf === 'Covered'    ? 'bg-green-600 text-white border-green-600'
                            : cf === 'Not Covered'? 'bg-red-600 text-white border-red-600'
                                                  : 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-muted-foreground border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cf === '' ? 'All' : cf}
                        {cf === 'Covered'     && ` (${covCount})`}
                        {cf === 'Not Covered' && ` (${ncCount})`}
                        {cf === 'Pending'     && ` (${pendCount})`}
                      </button>
                    ))}

                    <div className="flex-1" />

                    {/* Export buttons */}
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={exportSiteStatus}>
                      <Download className="h-3 w-3 mr-1" /> Export All
                    </Button>
                    {(() => {
                      const niw = filtered.filter(s => s.matching_status === 'Not in WFP File');
                      return niw.length > 0 ? (
                        <Button
                          type="button" size="sm" variant="outline"
                          className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => exportNotInWfpReport(
                            niw.map(s => ({
                              site_code: s.site_code, site_name: s.site_name,
                              state: s.state, locality: s.locality,
                              hub_office: s.hub_office, system_status: s.system_status,
                            } satisfies NotInWfpSite)),
                            wizardState.selectedMmp?.name ?? 'Cycle'
                          )}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Not-in-WFP ({niw.length})
                        </Button>
                      ) : null;
                    })()}
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={exportNotCoveredReport} disabled={sites.length === 0}>
                      <Download className="h-3 w-3 mr-1" /> Not-Covered Report
                    </Button>
                  </div>
                </div>

                {/* ── Bulk assignment bar (only when rows selected) ──── */}
                {selected.size > 0 && (
                  <div className="border-b px-4 py-2.5 bg-blue-50 dark:bg-blue-950/20 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                      {selected.size} site{selected.size > 1 ? 's' : ''} selected — bulk assign:
                    </span>
                    <Select value={bulkReason} onValueChange={setBulkReason} disabled={!canEditReasons}>
                      <SelectTrigger className="h-7 text-xs w-52" data-testid="select-bulk-reason">
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
                      disabled={!canEditReasons}
                      className="h-7 min-h-[1.75rem] text-xs resize-none flex-1 min-w-32"
                      rows={1}
                    />
                    <Button type="button" size="sm" className="h-7 text-xs" onClick={applyBulk} disabled={!bulkReason || !canEditReasons} data-testid="button-apply-bulk">
                      Apply to {selected.size}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setSelected(new Set())} disabled={!canEditReasons}>
                      Clear
                    </Button>
                  </div>
                )}

                {/* ── Flags / alerts ────────────────────────────────── */}
                {flaggedCount > 0 && (
                  <div className="border-b px-4 py-2 bg-red-50 flex items-center gap-2 text-xs text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                    {flaggedCount} site{flaggedCount > 1 ? 's' : ''} flagged with Security / Access issues — follow-up actions will be auto-created for the next cycle.
                  </div>
                )}

                {/* ── Table ─────────────────────────────────────────── */}
                {siteDetailsLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="overflow-x-auto" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        <tr>
                          {/* Select-all checkbox */}
                          <th className="px-3 py-2.5 w-8">
                            <Checkbox
                              checked={selected.size > 0 && [...filtered].filter(s => uncoveredSiteIds.has(s.id)).every(s => selected.has(s.id))}
                              disabled={!canEditReasons}
                              onCheckedChange={v => {
                                const ids = filtered.filter(s => uncoveredSiteIds.has(s.id)).map(s => s.id);
                                setSelected(prev => {
                                  const n = new Set(prev);
                                  ids.forEach(id => v ? n.add(id) : n.delete(id));
                                  return n;
                                });
                              }}
                            />
                          </th>
                          <SortTh col="site_name"       label="Site Name"       className="min-w-[140px]" />
                          <SortTh col="state"           label="State" />
                          <SortTh col="locality"        label="Locality" />
                          <SortTh col="hub_office"       label="Hub / Office" />
                          <SortTh col="activity_at_site" label="Activity"       className="min-w-[120px]" />
                          <SortTh col="system_status"    label="Sys. Status" />
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">WFP</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">WFP Row (Primary)</th>
                          <SortTh col="match_score"     label="Score" />
                          <SortTh col="matching_status" label="Matching Status"  className="min-w-[130px]" />
                          <SortTh col="coverage"        label="Coverage" />
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap min-w-[180px]">
                            Reason Not Covered
                            {pendingInView > 0 && (
                              <span className="ml-1.5 text-[10px] text-orange-600 font-normal">{pendingInView} pending</span>
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s, i) => {
                          const needsReason  = uncoveredSiteIds.has(s.id);
                          const assigned     = wizardState.uncoveredReasons[s.id];
                          const isSelected   = selected.has(s.id);
                          const isFlagged    = assigned?.flagged;
                          const source       = siteSourceMap[s.id];
                          const sourceLabel  = source === 'rejected_match' ? 'WFP Rejected'
                                             : source === 'not_in_wfp'    ? 'Not in WFP File'
                                             : source === 'not_covered'   ? 'Unresolved (Step 3)'
                                             : null;
                          const reasonLabel  = NOT_COVERED_REASONS.find(r => r.value === assigned?.reason)?.label ?? null;

                          return (
                            <tr
                              key={s.id}
                              className={`border-t transition-colors
                                ${isFlagged    ? 'bg-red-50/60 dark:bg-red-950/20' :
                                  isSelected   ? 'bg-blue-50/60 dark:bg-blue-950/20' :
                                  i % 2 === 1  ? 'bg-muted/20' : ''}
                                hover:bg-primary/5`}
                            >
                              {/* Checkbox — only for uncovered sites */}
                              <td className="px-3 py-2">
                                {needsReason ? (
                                  <Checkbox
                                    checked={isSelected}
                                    disabled={!canEditReasons}
                                    onCheckedChange={v => setSelected(prev => {
                                      const n = new Set(prev);
                                      v ? n.add(s.id) : n.delete(s.id);
                                      return n;
                                    })}
                                    data-testid={`checkbox-site-${s.id}`}
                                  />
                                ) : <span />}
                              </td>

                              {/* Site name + source badge */}
                              <td className="px-3 py-2">
                                <div className="font-medium leading-tight" title={s.site_name}>{s.site_name || '—'}</div>
                                {sourceLabel && (
                                  <span className={`text-[10px] px-1 rounded border leading-tight inline-block mt-0.5
                                    ${source === 'rejected_match' ? 'border-orange-300 text-orange-700' :
                                      source === 'not_in_wfp'    ? 'border-slate-400 text-slate-600' :
                                                                    'border-purple-300 text-purple-700'}`}>
                                    {sourceLabel}
                                  </span>
                                )}
                              </td>

                              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{s.state || '—'}</td>
                              <td className="px-3 py-2 max-w-[110px] truncate text-muted-foreground" title={s.locality}>{s.locality || '—'}</td>
                              <td className="px-3 py-2 max-w-[120px] truncate" title={s.hub_office}>{s.hub_office || '—'}</td>

                              {/* Activity */}
                              <td className="px-3 py-2 max-w-[130px]" title={[s.activity_at_site, s.main_activity].filter(Boolean).join(' · ')}>
                                {s.activity_at_site
                                  ? <span className="truncate block text-slate-700 dark:text-slate-300">{s.activity_at_site}</span>
                                  : <span className="text-muted-foreground/50">—</span>}
                                {s.main_activity && s.main_activity !== s.activity_at_site && (
                                  <span className="text-[10px] text-muted-foreground truncate block">{s.main_activity}</span>
                                )}
                              </td>

                              {/* System status */}
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-[10px] capitalize font-normal">{s.system_status}</Badge>
                              </td>

                              {/* In WFP file */}
                              <td className="px-3 py-2 text-center">
                                {s.wfp_in_file
                                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                  : <span className="text-muted-foreground/50 text-base leading-none">—</span>}
                              </td>

                              {/* WFP primary value */}
                              <td className="px-3 py-2 max-w-[130px] truncate text-muted-foreground" title={s.wfp_row_primary ?? ''}>
                                {s.wfp_row_primary ?? '—'}
                              </td>

                              {/* Match score */}
                              <td className="px-3 py-2 text-center">
                                {s.match_score != null
                                  ? <span className={`font-semibold tabular-nums ${s.match_score >= 80 ? 'text-green-600' : s.match_score >= 55 ? 'text-amber-600' : 'text-red-500'}`}>
                                      {s.match_score}%
                                    </span>
                                  : <span className="text-muted-foreground/50">—</span>}
                              </td>

                              {/* Matching status */}
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-[10px] ${matchingStatusColor(s.matching_status)}`}>
                                  {s.matching_status}
                                </Badge>
                              </td>

                              {/* Coverage */}
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-[10px] ${coverageColor(s.coverage)}`}>
                                  {s.coverage}
                                </Badge>
                              </td>

                              {/* Reason — editable dropdown for uncovered sites */}
                              <td className="px-3 py-1.5">
                                {needsReason ? (
                                  <div className="space-y-1">
                                    {isFlagged && (
                                      <span className="text-[10px] text-red-600 flex items-center gap-0.5">
                                        <AlertTriangle className="h-3 w-3" /> Follow-up flagged
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <Badge variant="outline" className={`text-[10px] ${assigned?.status === 'confirmed' ? 'text-green-700 border-green-300 bg-green-50' : 'text-amber-700 border-amber-300 bg-amber-50'}`}>
                                        {assigned?.status === 'confirmed' ? 'Supervisor Confirmed' : 'Draft'}
                                      </Badge>
                                      {assigned?.confirmedAt && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {new Date(assigned.confirmedAt).toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                    <Select
                                      value={assigned?.reason ?? ''}
                                      onValueChange={v => setReason(s.id, { reason: v })}
                                      disabled={!canEditReasons}
                                    >
                                      <SelectTrigger className={`h-7 text-[11px] w-full ${assigned?.reason ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}`} data-testid={`select-reason-${s.id}`}>
                                        <SelectValue placeholder="Select reason…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    {assigned?.reason === 'other' && (
                                      <Textarea
                                        placeholder="Specify…"
                                        value={assigned?.note ?? ''}
                                        onChange={e => setReason(s.id, { note: e.target.value })}
                                        disabled={!canEditReasons}
                                        className="h-6 min-h-[1.5rem] text-[11px] w-full resize-none"
                                        rows={1}
                                        data-testid={`input-reason-note-${s.id}`}
                                      />
                                    )}
                                    {canConfirmReasons && assigned?.reason && (
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-6 text-[10px] bg-green-600 hover:bg-green-700 text-white px-2"
                                          onClick={() => void confirmReason(s.id)}
                                          disabled={assigned?.status === 'confirmed'}
                                        >
                                          Confirm
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-6 text-[10px] px-2"
                                          onClick={() => void returnReasonToDraft(s.id)}
                                          disabled={assigned?.status !== 'confirmed'}
                                        >
                                          Return to Draft
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/50 text-base leading-none">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground italic">
                              No sites match the current filter
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Footer: legend + progress ──────────────────────── */}
                <div className="border-t px-4 py-2.5 bg-muted/20 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px]">
                  <span className="font-semibold text-muted-foreground uppercase tracking-wider">Legend:</span>
                  {(['Auto-Confirmed','Confirmed','Extra','Needs Review','Rejected','Not in WFP File'] as SiteDetail['matching_status'][]).map(st => (
                    <span key={st} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${matchingStatusColor(st)}`}>{st}</span>
                  ))}
                  {sites.length > 0 && !allAssigned && (
                    <span className="ml-auto text-orange-700 font-medium">
                      <AlertCircle className="h-3 w-3 inline mr-0.5" />
                      {sites.filter(s => !wizardState.uncoveredReasons[s.id]?.reason).length} site{sites.filter(s => !wizardState.uncoveredReasons[s.id]?.reason).length !== 1 ? 's' : ''} still need a reason before advancing
                    </span>
                  )}
                  {sites.length > 0 && allAssigned && !allConfirmed && (
                    <span className="ml-auto text-amber-700 font-medium">
                      <AlertCircle className="h-3 w-3 inline mr-0.5" />
                      {sites.filter(s => wizardState.uncoveredReasons[s.id]?.status !== 'confirmed').length} site{sites.filter(s => wizardState.uncoveredReasons[s.id]?.status !== 'confirmed').length !== 1 ? 's' : ''} still need supervisor confirmation
                    </span>
                  )}
                  {sites.length === 0 && (
                    <span className="ml-auto text-green-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> No uncovered sites — ready to continue
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        );

        return isFullScreen ? (
          <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-950 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white text-sm flex-shrink-0">
              <span className="font-semibold">🗂 Full Site Status Table — {wizardState.selectedMmp?.name ?? 'Cycle'}</span>
              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-xs"
              >
                <X className="h-3.5 w-3.5" /> Exit Full Screen
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">{panelContent}</div>
          </div>
        ) : panelContent;
      })()}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step4">← Back</Button>}
          {(canEditReasons || canConfirmReasons) && (
            <Button type="button" variant="outline" size="sm" onClick={() => void saveDraftReasons()} disabled={draftSaving}>
              {draftSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save Draft
            </Button>
          )}
        </div>
        <Button type="button" onClick={saveAndNext} disabled={!canAdvance || saving} data-testid="button-next-step4">
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Next: Resolve Exceptions →
        </Button>
      </div>
    </div>
  );
}
