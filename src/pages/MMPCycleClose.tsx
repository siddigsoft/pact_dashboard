import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { EmailNotificationService } from '@/services/email-notification.service';
import { logMMPAudit } from '@/services/mmpAudit.service';
import { checkAndSendCycleReminders } from '@/services/cycleReminderService';
import { useCycleCloseReadiness } from '@/hooks/useCycleCloseReadiness';
import { CloseReadinessChecklist } from '@/components/close/CloseReadinessChecklist';
import { ReconciliationSummary } from '@/components/close/ReconciliationSummary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, MapPin,
  ArrowRight, ArrowLeft, FileText, BarChart3, Filter, Download,
  ChevronDown, ChevronUp, Search, RefreshCw, FileSpreadsheet,
  Bell, TrendingUp, TrendingDown, Minus, Star, Shield, ShieldAlert,
  Activity, Target, Layers, SortAsc, SortDesc,
  BookOpen, RotateCcw, HelpCircle, Loader2, DollarSign, Lightbulb,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { CycleMMPCard } from '@/components/cycle/CycleMMPCard';
import { CycleCoveragePredictor, MmpPredictionPanel } from '@/components/cycle/CycleCoveragePredictor';
import { CycleReportsTab } from '@/components/cycle/CycleReportsTab';
import { CycleComparisonTab } from '@/components/cycle/CycleComparisonTab';
import { CycleScorecardTab } from '@/components/cycle/CycleScorecardTab';
import { CostRecoveryDialog } from '@/components/cycle/CostRecoveryDialog';
import type { CostRecoverySite } from '@/components/cycle/CostRecoveryDialog';
import { MoneyTrailPanel } from '@/components/cycle/MoneyTrailPanel';
import { WFPUploadZone } from '@/components/cycle/WFPUploadZone';
import { WFPMatchReviewTable } from '@/components/cycle/WFPMatchReviewTable';
import { WFPBulkActions } from '@/components/cycle/WFPBulkActions';
import { RolledAllocationsPanel } from '@/components/cycle/RolledAllocationsPanel';
import { parseWFPRow, matchAll, summarise } from '@/utils/wfpMatcher';
import type { MatchResult, MatchSummary } from '@/utils/wfpMatcher';
import { logPaymentEvent } from '@/services/paymentEventLogger';
import { dispatchNotification } from '@/lib/notify';
import AdhocSiteVisitsTab from '@/components/mmp/AdhocSiteVisitsTab';

const NOT_COVERED_REASONS = [
  { value: 'not_distributed', label: 'Not Distributed', labelAr: 'لم يتم التوزيع' },
  { value: 'cp_not_confirmed', label: 'CP Not Confirmed / Switched Off', labelAr: 'لم يتم تأكيد CP / مغلق' },
  { value: 'security_concerns', label: 'Security Concerns', labelAr: 'مخاوف أمنية' },
  { value: 'access_denied', label: 'Access Denied / Area Inaccessible', labelAr: 'الوصول مرفوض / المنطقة غير متاحة' },
  { value: 'staff_unavailable', label: 'Staff Unavailable', labelAr: 'الموظفون غير متاحين' },
  { value: 'weather_disaster', label: 'Weather / Natural Disaster', labelAr: 'الطقس / كارثة طبيعية' },
  { value: 'budget_constraints', label: 'Budget Constraints', labelAr: 'قيود الميزانية' },
  { value: 'time_constraints', label: 'Time Constraints', labelAr: 'قيود الوقت' },
  { value: 'duplicate_site', label: 'Duplicate Site', labelAr: 'موقع مكرر' },
  { value: 'other', label: 'Other (specify)', labelAr: 'أخرى (حدد)' },
] as const;

type NotCoveredReason = typeof NOT_COVERED_REASONS[number]['value'];

interface UncoveredSite {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  mmp_id: string;
  mmp_name?: string;
  hub?: string;
  not_covered_reason: NotCoveredReason | null;
  not_covered_reason_other: string | null;
  not_covered_at: string | null;
  not_covered_by: string | null;
}

interface CycleStats {
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonedSites: number;
  pendingReasonSites: number;
  coverageRate: number;
}

interface ClosedCycleRecord {
  id: string;
  name: string;
  month: number | null;
  year: number | null;
  region: string | null;
  cycle_status: string;
  cycle_closed_at: string | null;
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonBreakdown?: Record<string, number>;
}

type CloseScope = 'full' | 'hub' | 'state' | 'activity';

interface CycleCloseRecord {
  id: string;
  scope: CloseScope;
  scopeValue: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  siteCount: number;
  status: 'closing' | 'pending_approval' | 'closed';
}

interface MmpScopeOptions {
  hubs: string[];
  states: string[];
  activities: string[];
}

interface FollowUpRecord {
  id: string;
  siteId: string;
  siteName: string;
  reason: string;
  suggestedAction: string;
  createdAt: string;
  mmpName?: string;
}

interface NotCoveredAdvanceSite {
  id: string;
  site_name: string;
  site_code: string | null;
  state: string | null;
  mmp_id: string;
  mmp_name: string | null;
  enumerator_id: string | null;
  enumerator_name: string | null;
  supervisor_id: string | null;
  total_approved_advance: number;
  advance_count: number;
  recovery_log_id: string | null;
  recovery_decision: string | null;
  repayment_status: string | null;
}

const fetchAdminFomSuperAdminRecipients = async () => {
  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .in('role', ['admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin', 'fom', 'Field Operation Manager (FOM)'])
    .eq('status', 'approved');

  return (recipients || []).filter((r: any) => r.email);
};

const getSuperAdminEmails = async (): Promise<string[]> => {
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
    .eq('status', 'approved');
  return (admins || []).filter((a: any) => a.email).map((a: any) => a.email);
};

const HIGH_PRIORITY_REASONS = ['security_concerns', 'access_denied', 'staff_unavailable'];

const RECOVERY_DECISION_CONFIG: Record<string, { label: string; labelAr: string; color: string }> = {
  rolled:          { label: 'Rolled to Next MMP',  labelAr: 'مُرحَّل للدورة التالية', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  return_required: { label: 'Return Required',     labelAr: 'مطلوب الإعادة',         color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  writeoff:        { label: 'Written Off',         labelAr: 'مشطوب',                 color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
};

const FOLLOW_UP_ACTIONS: Record<string, string> = {
  security_concerns: 'Coordinate with security team and local authorities before next cycle visit',
  access_denied: 'Engage community leaders and obtain required access permits for next cycle',
  staff_unavailable: 'Pre-assign backup staff and confirm availability before next cycle starts',
};

const MMPCycleClose = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles, refreshMMPFiles } = useMMP();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [uncoveredSites, setUncoveredSites] = useState<UncoveredSite[]>([]);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState<NotCoveredReason | ''>('');
  const [bulkOtherText, setBulkOtherText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHub, setFilterHub] = useState<string>('all');
  const [filterReason, setFilterReason] = useState<string>('all');
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active');
  
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // When arriving from the readiness checklist "Resolve" button the URL
    // carries ?mmpId=X — pre-select that MMP in the Uncovered Sites dropdown.
    const mmpIdParam = searchParams.get('mmpId');
    if (mmpIdParam) {
      setSelectedMmpId(mmpIdParam);
    }
  }, [searchParams]);
  const [closedCycles, setClosedCycles] = useState<ClosedCycleRecord[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [closingCycle, setClosingCycle] = useState(false);
  const [finalizingCycle, setFinalizingCycle] = useState(false);
  const [selectedMmpId, setSelectedMmpId] = useState<string>('all');
  const [siteVisitCounts, setSiteVisitCounts] = useState<Record<string, { total: number; statusCounts: Record<string, number> }>>({});
  const followUps = useMemo<FollowUpRecord[]>(() => {
    return uncoveredSites
      .filter(s => s.not_covered_reason && HIGH_PRIORITY_REASONS.includes(s.not_covered_reason))
      .map(s => ({
        id: s.id,
        siteId: s.id,
        siteName: s.site_name,
        reason: s.not_covered_reason!,
        suggestedAction: FOLLOW_UP_ACTIONS[s.not_covered_reason!] || 'Review and address before next cycle',
        createdAt: s.not_covered_at || new Date().toISOString(),
        mmpName: s.mmp_name,
      }));
  }, [uncoveredSites]);
  const [comparisonCycle1, setComparisonCycle1] = useState<string>('');
  const [comparisonCycle2, setComparisonCycle2] = useState<string>('');
  const [checklistMmpId, setChecklistMmpId] = useState<string | null>(null);
  const cycleReadiness = useCycleCloseReadiness(checklistMmpId);
  const [reconciliationAcknowledged, setReconciliationAcknowledged] = useState(false);

  // When user opens the checklist for an MMP, auto-sync the Uncovered Sites tab filter
  // so navigating there immediately shows only that MMP's sites.
  useEffect(() => {
    setReconciliationAcknowledged(false);
    if (checklistMmpId) {
      setSelectedMmpId(checklistMmpId);
    } else {
      setSelectedMmpId('all');
    }
  }, [checklistMmpId]);

  // Derive the first actionable blocker from the readiness checklist
  const nextBlocker = useMemo(() => {
    return cycleReadiness.items.find(i => !i.passed && !i.notConfigured) ?? null;
  }, [cycleReadiness.items]);

  const [financeOverrideDialog, setFinanceOverrideDialog] = useState<{
    mmpId: string;
    issues: string[];
    action: 'finalize' | 'approve';
  } | null>(null);
  const [financeOverrideJustification, setFinanceOverrideJustification] = useState('');
  const [pendingScopedClose, setPendingScopedClose] = useState<{ scope: CloseScope; scopeValue: string } | null>(null);
  const [qualityData, setQualityData] = useState<{ hub: string; avgScore: number; count: number }[]>([]);
  const [activeHubFilter, setActiveHubFilter] = useState<string>('all');
  const [activeSort, setActiveSort] = useState<'name' | 'coverage' | 'status'>('status');
  const [activeSortDir, setActiveSortDir] = useState<'asc' | 'desc'>('desc');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [mmpScopeOptions, setMmpScopeOptions] = useState<Record<string, MmpScopeOptions>>({});

  // Phase B — Exceptions tab + Cost Recovery
  const [notCoveredAdvanceSites, setNotCoveredAdvanceSites] = useState<NotCoveredAdvanceSite[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [costRecoveryDialogState, setCostRecoveryDialogState] = useState<{
    site: CostRecoverySite;
    advanceId: string | null;
    amount: number;
  } | null>(null);
  const [showMoneyTrailMmpId, setShowMoneyTrailMmpId] = useState<string | null>(null);

  // Phase C — WFP Confirmation tab
  const [wfpResults, setWfpResults] = useState<MatchResult[]>([]);
  const [wfpSummary, setWfpSummary] = useState<MatchSummary | null>(null);
  const [wfpUploadId, setWfpUploadId] = useState<string | null>(null);
  const [wfpFilename, setWfpFilename] = useState<string | null>(null);
  const [wfpApplying, setWfpApplying] = useState(false);
  const [wfpSaving, setWfpSaving] = useState(false);
  const [loadingWFP, setLoadingWFP] = useState(false);
  const [wfpAppliedUpload, setWfpAppliedUpload] = useState<{ filename: string; applied_at: string } | null>(null);

  const isAdmin = hasAnyRole(['admin', 'Admin', 'super_admin', 'Super Admin']);
  const isSuperAdmin = hasAnyRole(['super_admin', 'Super Admin']);
  const isSupervisor = hasAnyRole(['Supervisor', 'supervisor']);
  const isFOM = hasAnyRole(['fom', 'Field Operation Manager (FOM)']);
  const canManageCycle = isAdmin;
  const canAssignReasons = isAdmin || isSupervisor || isFOM;

  const [userHubName, setUserHubName] = useState<string>('');

  useEffect(() => {
    if (isSupervisor && currentUser?.hubId) {
      const hubIds = [currentUser.hubId];
      if ((currentUser as any)?.secondaryHubId) {
        hubIds.push((currentUser as any).secondaryHubId);
      }

      supabase.from('hubs').select('name').in('id', hubIds)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const names = data.map((h: any) => h.name).filter(Boolean);
            const displayName = names.join(' & ');
            setUserHubName(displayName);
            setFilterHub(displayName);
          }
        });
    }
  }, [isSupervisor, currentUser?.hubId, (currentUser as any)?.secondaryHubId]);

  const activeMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => {
      const cycleStatus = (m as any).cycle_status || 'active';
      return cycleStatus === 'active' || cycleStatus === 'closing' || cycleStatus === 'pending_approval';
    });
  }, [mmpFiles]);

  const closingMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => (m as any).cycle_status === 'closing');
  }, [mmpFiles]);

  const fetchUncoveredSites = useCallback(async () => {
    setLoading(true);
    try {
      const closingIds = closingMmps.map(m => m.id);
      // Active MMPs that are NOT already counted in the closing set
      const activeOnlyIds = activeMmps
        .map(m => m.id)
        .filter(id => !closingIds.includes(id));

      const allRelevantIds = [...closingIds, ...activeOnlyIds];
      if (allRelevantIds.length === 0) {
        setUncoveredSites([]);
        setLoading(false);
        return;
      }

      // Fetch ALL site entries for relevant MMPs in one paginated pass,
      // then filter in JavaScript with case-normalisation.
      //
      // WHY: PostgreSQL IN() is case-sensitive. Statuses stored as 'Pending',
      // 'PENDING', or ' pending ' are silently missed by SQL status filters.
      // Fetching all rows and normalising in JS (same approach as
      // fetchSiteVisitCounts) is the safest way to catch every variant.
      const PAGE = 1000;

      const RESOLVED_STATUSES_NORM = new Set([
        'submitted', 'wfp_confirmed', 'rejected', 'not_covered',
        'approved', 'cancelled', 'completed', 'verified',
      ]);

      const fetchAllPagesForIds = async (ids: string[]): Promise<any[]> => {
        if (ids.length === 0) return [];
        let all: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: pageData, error } = await supabase
            .from('mmp_site_entries')
            .select('id, site_name, site_code, state, locality, status, mmp_file_id, not_covered_flag, not_covered_reason, not_covered_reason_other, not_covered_at, not_covered_by')
            .in('mmp_file_id', ids)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          all = [...all, ...(pageData || [])];
          if (!pageData || pageData.length < PAGE) break;
        }
        return all;
      };

      const [closingRaw, activeRaw] = await Promise.all([
        fetchAllPagesForIds(closingIds),
        fetchAllPagesForIds(activeOnlyIds),
      ]);

      // For closing MMPs: keep not_covered_flag=true OR any unresolved status
      const closingData = closingRaw.filter(s => {
        if (s.not_covered_flag === true) return true;
        const norm = (s.status ?? '').toLowerCase().trim();
        return !RESOLVED_STATUSES_NORM.has(norm);
      });

      // For active MMPs: keep only unresolved statuses
      const activeData = activeRaw.filter(s => {
        const norm = (s.status ?? '').toLowerCase().trim();
        return !RESOLVED_STATUSES_NORM.has(norm);
      });

      // Deduplicate by id in case any entry appears in both sets
      const seen = new Set<string>();
      const allData: any[] = [];
      for (const row of [...closingData, ...activeData]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          allData.push(row);
        }
      }

      const sites: UncoveredSite[] = allData.map(s => {
        const mmpFileId = (s as any).mmp_file_id;
        const mmp = mmpFiles?.find(m => m.id === mmpFileId);
        return {
          id: s.id,
          site_name: s.site_name,
          site_code: s.site_code || '',
          state: s.state || '',
          locality: s.locality || '',
          status: s.status,
          mmp_id: mmpFileId || '',
          mmp_name: mmp?.name || 'Unknown MMP',
          hub: mmp?.hub || mmp?.region || '',
          not_covered_reason: s.not_covered_reason as NotCoveredReason | null,
          not_covered_reason_other: s.not_covered_reason_other,
          not_covered_at: s.not_covered_at,
          not_covered_by: s.not_covered_by,
        };
      });

      setUncoveredSites(sites);
    } catch (err) {
      console.error('Error fetching uncovered sites:', err);
      toast({ title: 'Error', description: 'Failed to load uncovered sites', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [closingMmps, activeMmps, mmpFiles, toast]);

  // Phase B: load not-covered sites that have approved advances + their recovery status
  const loadExceptionsData = useCallback(async (mmpId: string) => {
    setLoadingExceptions(true);
    try {
      // 1. Get all not-covered entries for this MMP
      const { data: notCoveredEntries, error: ncErr } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, mmp_file_id, accepted_by, not_covered_reason')
        .eq('mmp_file_id', mmpId)
        .or('not_covered_flag.eq.true,status.eq.not_covered')
        .limit(10000);

      if (ncErr) throw ncErr;
      if (!notCoveredEntries || notCoveredEntries.length === 0) {
        setNotCoveredAdvanceSites([]);
        return;
      }

      // 2. Get approved/paid advances for those sites
      const notCoveredSiteIds = (notCoveredEntries as any[]).map((e: any) => e.id);
      const { data: advances } = await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, requested_amount, status')
        .in('status', ['approved', 'partially_paid', 'fully_paid'])
        .in('mmp_site_entry_id', notCoveredSiteIds);

      // 3. Get recovery log for this MMP
      const { data: recoveryRows } = await supabase
        .from('cost_recovery_log')
        .select('site_entry_id, id, decision, repayment_status')
        .eq('mmp_id', mmpId);

      // 4. Get enumerator names for affected users
      const enumeratorIds = [...new Set((notCoveredEntries as any[]).map((e: any) => e.accepted_by).filter(Boolean))];
      let enumeratorMap: Record<string, { name: string; supervisor_id: string | null }> = {};
      if (enumeratorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, supervisor_id')
          .in('id', enumeratorIds);
        (profiles || []).forEach((p: any) => {
          enumeratorMap[p.id] = { name: p.full_name || p.id, supervisor_id: p.supervisor_id || null };
        });
      }

      // 5. Get MMP name
      const mmpRow = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmpRow?.name || null;

      // Aggregate by site entry
      const advanceMap: Record<string, { total: number; count: number; firstId: string }> = {};
      (advances || []).forEach((a: any) => {
        const siteId = a.mmp_site_entry_id;
        if (!siteId) return;
        if (!advanceMap[siteId]) advanceMap[siteId] = { total: 0, count: 0, firstId: a.id };
        advanceMap[siteId].total += a.requested_amount || 0;
        advanceMap[siteId].count += 1;
      });

      const recoveryMap: Record<string, { id: string; decision: string; repayment_status: string }> = {};
      (recoveryRows || []).forEach((r: any) => {
        recoveryMap[r.site_entry_id] = { id: r.id, decision: r.decision, repayment_status: r.repayment_status };
      });

      // Build the Exceptions list — only sites with approved advances
      const result: NotCoveredAdvanceSite[] = (notCoveredEntries as any[])
        .filter(e => advanceMap[e.id])
        .map(e => {
          const adv = advanceMap[e.id] || { total: 0, count: 0, firstId: '' };
          const rec = recoveryMap[e.id] || null;
          const enumInfo = enumeratorMap[e.accepted_by] || null;
          return {
            id: e.id,
            site_name: e.site_name,
            site_code: e.site_code || null,
            state: e.state || null,
            mmp_id: mmpId,
            mmp_name: mmpName,
            enumerator_id: e.accepted_by || null,
            enumerator_name: enumInfo?.name || null,
            supervisor_id: enumInfo?.supervisor_id || null,
            total_approved_advance: adv.total,
            advance_count: adv.count,
            recovery_log_id: rec?.id || null,
            recovery_decision: rec?.decision || null,
            repayment_status: rec?.repayment_status || null,
          };
        });

      setNotCoveredAdvanceSites(result);
    } catch (err) {
      console.warn('[MMPCycleClose] loadExceptionsData error:', err);
      setNotCoveredAdvanceSites([]);
    } finally {
      setLoadingExceptions(false);
    }
  }, [mmpFiles]);

  // Phase C: load existing WFP upload state for a MMP
  const loadWFPTab = useCallback(async (mmpId: string) => {
    setLoadingWFP(true);
    try {
      // Check for an already-applied upload
      const { data: uploads } = await supabase
        .from('wfp_confirmation_uploads')
        .select('id, filename, status, applied_at, matched_count, weak_count, unmatched_count, row_count')
        .eq('mmp_id', mmpId)
        .order('uploaded_at', { ascending: false })
        .limit(10);

      const applied = (uploads || []).find((u: any) => u.status === 'applied');
      setWfpAppliedUpload(applied ? { filename: applied.filename, applied_at: applied.applied_at } : null);

      // If there's a 'ready' upload (not yet applied), restore its results
      const ready = (uploads || []).find((u: any) => u.status === 'ready');
      if (ready && wfpResults.length === 0) {
        const { data: matchRows } = await supabase
          .from('wfp_match_results')
          .select('*')
          .eq('upload_id', ready.id)
          .order('wfp_row_number', { ascending: true });

        if (matchRows && matchRows.length > 0) {
          // Fetch site entries to reconstruct matched_site
          const siteIds = matchRows.filter((r: any) => r.site_entry_id).map((r: any) => r.site_entry_id);
          let siteMap: Record<string, { id: string; site_name: string; site_code: string | null; state: string | null; locality: string | null }> = {};
          if (siteIds.length > 0) {
            const { data: sites } = await supabase
              .from('mmp_site_entries')
              .select('id, site_name, site_code, state, locality')
              .in('id', siteIds)
              .limit(10000);
            (sites || []).forEach((s: any) => { siteMap[s.id] = s; });
          }

          const restored: MatchResult[] = matchRows.map((r: any) => ({
            wfp_site_name: r.wfp_site_name || '',
            wfp_state: r.wfp_state || '',
            wfp_locality: r.wfp_locality || '',
            wfp_partner: r.wfp_partner || '',
            wfp_activity: r.wfp_activity || '',
            wfp_row_number: r.wfp_row_number,
            site_entry_id: r.site_entry_id || null,
            match_tier: r.match_tier || 'none',
            match_score: r.match_score || 0,
            match_notes: r.match_notes || '',
            outcome: r.outcome || 'pending',
            review_note: r.review_note || '',
            matched_site: r.site_entry_id ? siteMap[r.site_entry_id] : undefined,
          }));

          setWfpResults(restored);
          setWfpSummary(summarise(restored));
          setWfpUploadId(ready.id);
          setWfpFilename(ready.filename);
        }
      }
    } catch (err) {
      console.warn('[WFP] loadWFPTab error:', err);
    } finally {
      setLoadingWFP(false);
    }
  }, [wfpResults.length]);

  // Phase B: load exceptions data when the exceptions tab is active and a MMP is selected
  useEffect(() => {
    if (activeTab === 'exceptions' && checklistMmpId) {
      loadExceptionsData(checklistMmpId);
      setShowMoneyTrailMmpId(checklistMmpId);
    }
  }, [activeTab, checklistMmpId, loadExceptionsData]);

  // Phase C: load WFP tab data when wfp tab is active and a MMP is selected
  useEffect(() => {
    if (activeTab === 'wfp' && checklistMmpId) {
      loadWFPTab(checklistMmpId);
    }
  }, [activeTab, checklistMmpId, loadWFPTab]);

  // Phase C: parse file → run matching → show review table
  const handleWFPFileParsed = useCallback(async (rawRows: Record<string, unknown>[], filename: string, mmpId: string) => {
    setWfpSaving(true);
    try {
      // 1. Parse WFP rows
      const wfpRows = rawRows
        .map((r, i) => parseWFPRow(r, i + 2)) // row 1 = headers
        .filter(Boolean) as ReturnType<typeof parseWFPRow>[];

      // 2. Fetch all site entries for this MMP
      const { data: siteEntries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality')
        .eq('mmp_file_id', mmpId)
        .limit(10000);

      const sites = (siteEntries || []) as { id: string; site_name: string; site_code: string | null; state: string | null; locality: string | null }[];

      // 3. Run matching
      const results = matchAll(wfpRows as NonNullable<typeof wfpRows[0]>[], sites);
      const summary = summarise(results);

      // 4. Save upload record
      const { data: uploadData, error: uploadErr } = await supabase
        .from('wfp_confirmation_uploads')
        .insert({
          mmp_id: mmpId,
          filename,
          row_count: results.length,
          matched_count: summary.strong,
          weak_count: summary.weak + summary.fuzzy,
          unmatched_count: summary.none,
          status: 'ready',
        })
        .select('id')
        .single();

      if (uploadErr || !uploadData) throw uploadErr || new Error('Failed to save upload');
      const uploadId = uploadData.id;

      // 5. Save match rows
      const matchInserts = results.map(r => ({
        upload_id: uploadId,
        mmp_id: mmpId,
        wfp_site_name: r.wfp_site_name,
        wfp_state: r.wfp_state,
        wfp_locality: r.wfp_locality,
        wfp_partner: r.wfp_partner,
        wfp_activity: r.wfp_activity,
        wfp_row_number: r.wfp_row_number,
        site_entry_id: r.site_entry_id,
        match_tier: r.match_tier,
        match_score: r.match_score,
        match_notes: r.match_notes,
        outcome: r.outcome,
      }));

      await supabase.from('wfp_match_results').insert(matchInserts);

      setWfpResults(results);
      setWfpSummary(summary);
      setWfpUploadId(uploadId);
      setWfpFilename(filename);

      toast({
        title: 'WFP file parsed',
        description: `${summary.strong} auto-confirmed, ${summary.weak + summary.fuzzy} need review, ${summary.none} no match`,
      });
    } catch (err) {
      console.error('[WFP] handleWFPFileParsed error:', err);
      toast({ title: 'Error', description: 'Failed to save WFP match data', variant: 'destructive' });
    } finally {
      setWfpSaving(false);
    }
  }, [toast]);

  // Phase C: save manual review decisions then apply all outcomes to mmp_site_entries
  const handleWFPApply = useCallback(async (mmpId: string) => {
    if (!wfpUploadId) return;
    setWfpApplying(true);
    try {
      const userId = currentUser?.id;

      // 1. Update manual review decisions in DB
      const manualRows = wfpResults.filter(r => r.match_tier === 'weak' || r.match_tier === 'fuzzy');
      for (const r of manualRows) {
        await supabase.from('wfp_match_results')
          .update({ outcome: r.outcome, review_note: r.review_note || null, reviewed_by: userId || null, reviewed_at: new Date().toISOString() })
          .eq('upload_id', wfpUploadId)
          .eq('wfp_row_number', r.wfp_row_number);
      }

      // 2. Apply outcomes to mmp_site_entries + log events
      const confirmed = wfpResults.filter(r => r.outcome === 'confirmed' && r.site_entry_id);
      const rejected  = wfpResults.filter(r => r.outcome === 'rejected'  && r.site_entry_id);

      for (const r of confirmed) {
        await supabase.from('mmp_site_entries')
          .update({ status: 'wfp_confirmed' })
          .eq('id', r.site_entry_id!);

        await logPaymentEvent({
          eventType: 'site_confirmed',
          siteEntryId: r.site_entry_id!,
          mmpId,
          performedBy: userId,
          metadata: { wfp_upload_id: wfpUploadId, match_tier: r.match_tier, match_score: r.match_score, wfp_site_name: r.wfp_site_name },
        });

        // Notify enumerator of confirmation
        const { data: entry } = await supabase
          .from('mmp_site_entries')
          .select('accepted_by, site_name')
          .eq('id', r.site_entry_id!)
          .single();

        if (entry?.accepted_by) {
          await dispatchNotification({
            recipientId: entry.accepted_by,
            eventType: 'site_confirmed',
            title: 'Site Visit WFP Confirmed ✓',
            body: `Your visit to ${entry.site_name || r.wfp_site_name} has been confirmed by WFP.`,
            metadata: { site_entry_id: r.site_entry_id, mmp_id: mmpId },
          });
        }
      }

      // Build enumerator → rejected sites map (for bundled notifications — Enhancement 3)
      const enumRejectedMap: Record<string, { enumId: string; sites: string[] }> = {};

      for (const r of rejected) {
        await supabase.from('mmp_site_entries')
          .update({ status: 'rejected' })
          .eq('id', r.site_entry_id!);

        await logPaymentEvent({
          eventType: 'site_rejected',
          siteEntryId: r.site_entry_id!,
          mmpId,
          performedBy: userId,
          metadata: { wfp_upload_id: wfpUploadId, match_tier: r.match_tier, match_score: r.match_score, wfp_site_name: r.wfp_site_name },
        });

        // Collect enumerator + site name for bundled notification
        const { data: entry } = await supabase
          .from('mmp_site_entries')
          .select('accepted_by, site_name')
          .eq('id', r.site_entry_id!)
          .single();

        if (entry?.accepted_by) {
          if (!enumRejectedMap[entry.accepted_by]) {
            enumRejectedMap[entry.accepted_by] = { enumId: entry.accepted_by, sites: [] };
          }
          enumRejectedMap[entry.accepted_by].sites.push(entry.site_name || r.wfp_site_name || r.site_entry_id!);
        }
      }

      // Enhancement 3: Send ONE bundled notification per enumerator (not one per site)
      const mmpLabel = activeMmps.find(m => m.id === mmpId)?.name || 'this MMP cycle';
      for (const { enumId, sites } of Object.values(enumRejectedMap)) {
        const isBundled = sites.length > 1;
        await dispatchNotification({
          recipientId: enumId,
          eventType: 'site_rejected',
          title: isBundled ? `${sites.length} Site Visits Not Found in WFP Data` : 'Site Visit Not Found in WFP Data',
          body: isBundled
            ? `${sites.length} of your sites were not found in the WFP data for ${mmpLabel}: ${sites.join(', ')}. Contact your supervisor for next steps.`
            : `Your visit to ${sites[0]} was not found in the WFP confirmation file for ${mmpLabel}. Contact your supervisor.`,
          metadata: { mmp_id: mmpId, rejected_sites: sites, bundled: isBundled },
        });
      }

      // 3. Mark upload as applied
      await supabase.from('wfp_confirmation_uploads')
        .update({ status: 'applied', applied_at: new Date().toISOString(), applied_by: userId || null })
        .eq('id', wfpUploadId);

      setWfpAppliedUpload({ filename: wfpFilename || '', applied_at: new Date().toISOString() });
      cycleReadiness.refresh();

      toast({
        title: 'WFP results applied',
        description: `${confirmed.length} confirmed, ${rejected.length} rejected. Status updated on all sites.`,
      });
    } catch (err) {
      console.error('[WFP] handleWFPApply error:', err);
      toast({ title: 'Error', description: 'Failed to apply WFP results', variant: 'destructive' });
    } finally {
      setWfpApplying(false);
    }
  }, [wfpUploadId, wfpResults, wfpFilename, currentUser, cycleReadiness, toast]);

  const fetchClosedCycles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('mmp_files')
        .select('id, name, month, hub, cycle_status, cycle_closed_at')
        .eq('cycle_status', 'closed')
        .order('cycle_closed_at', { ascending: false });

      if (error) throw error;

      const records: ClosedCycleRecord[] = (data || []).map(m => ({
        id: m.id,
        name: m.name,
        month: m.month,
        year: null,
        region: (m as any).hub || 'Unknown',
        cycle_status: m.cycle_status || 'closed',
        cycle_closed_at: m.cycle_closed_at,
        totalSites: 0,
        completedSites: 0,
        uncoveredSites: 0,
        reasonBreakdown: {},
      }));

      if (records.length > 0) {
        const coveredStatuses = ['submitted', 'wfp_confirmed', 'completed', 'verified'];
        await Promise.all(records.map(async (r) => {
          const [totalRes, completedRes, uncoveredRes] = await Promise.all([
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id),
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id).in('status', coveredStatuses),
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id).eq('not_covered_flag', true),
          ]);
          r.totalSites = totalRes.count ?? 0;
          r.completedSites = completedRes.count ?? 0;
          r.uncoveredSites = uncoveredRes.count ?? 0;
          r.reasonBreakdown = {};
          // paginate reason breakdown for not-covered sites
          const PAGE = 1000;
          for (let from = 0; ; from += PAGE) {
            const { data: reasons } = await supabase
              .from('mmp_site_entries')
              .select('not_covered_reason')
              .eq('mmp_file_id', r.id)
              .eq('not_covered_flag', true)
              .not('not_covered_reason', 'is', null)
              .range(from, from + PAGE - 1);
            (reasons || []).forEach((s: any) => {
              r.reasonBreakdown![s.not_covered_reason] = (r.reasonBreakdown![s.not_covered_reason] || 0) + 1;
            });
            if (!reasons || reasons.length < PAGE) break;
          }
        }));
      }

      setClosedCycles(records);
    } catch (err) {
      console.error('Error fetching closed cycles:', err);
    }
  }, []);

  const fetchMmpScopeOptions = useCallback(async (mmpId: string): Promise<MmpScopeOptions> => {
    try {
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('hub_office, state, main_activity, activity_at_site')
        .eq('mmp_file_id', mmpId)
        .limit(10000);

      const hubs = new Set<string>();
      const states = new Set<string>();
      const activities = new Set<string>();

      (entries || []).forEach((e: any) => {
        if (e.hub_office) hubs.add(e.hub_office);
        if (e.state) states.add(e.state);
        if (e.main_activity) activities.add(e.main_activity);
        if (e.activity_at_site) activities.add(e.activity_at_site);
      });

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      if (mmp?.hub) hubs.add(mmp.hub);
      if (mmp?.region) hubs.add(mmp.region);

      const options: MmpScopeOptions = {
        hubs: Array.from(hubs).filter(Boolean).sort(),
        states: Array.from(states).filter(Boolean).sort(),
        activities: Array.from(activities).filter(Boolean).sort(),
      };

      setMmpScopeOptions(prev => ({ ...prev, [mmpId]: options }));
      return options;
    } catch (err) {
      console.error('Error fetching scope options:', err);
      return { hubs: [], states: [], activities: [] };
    }
  }, [mmpFiles]);

  const handleScopedClose = async (mmpId: string, scope: CloseScope, scopeValue: string) => {
    if (!canManageCycle) return;

    if (scope === 'full') {
      handleStartClosingCycle(mmpId);
      return;
    }

    setPendingScopedClose({ scope, scopeValue });
    setChecklistMmpId(mmpId);
    return;
  };

  const executeScopedClose = async (mmpId: string, scope: CloseScope, scopeValue: string) => {
    if (!canManageCycle) return;
    setClosingCycle(true);
    try {
      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';

      let siteEntryIds: string[] = [];

      if (scope === 'hub') {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .eq('hub_office', scopeValue)
          .limit(10000);
        siteEntryIds = (entries || []).map((e: any) => e.id);
      } else if (scope === 'state') {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .eq('state', scopeValue)
          .limit(10000);
        siteEntryIds = (entries || []).map((e: any) => e.id);
      } else if (scope === 'activity') {
        let activityName = scopeValue;
        let subFilterField: string | null = null;
        let subFilterValue: string | null = null;
        if (scopeValue.includes('||')) {
          const parts = scopeValue.split('||');
          activityName = parts[0];
          const subParts = parts[1]?.split(':');
          if (subParts && subParts.length === 2) {
            subFilterField = subParts[0] === 'state' ? 'state' : 'hub_office';
            subFilterValue = subParts[1];
          }
        }
        let query = supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .or(`main_activity.eq.${activityName},activity_at_site.eq.${activityName}`);
        if (subFilterField && subFilterValue) {
          query = query.eq(subFilterField, subFilterValue);
        }
        const { data: entries } = await query.limit(10000);
        siteEntryIds = (entries || []).map((e: any) => e.id);
      }

      if (siteEntryIds.length === 0) {
        toast({ title: 'No Sites Found', description: `No site entries match the selected ${scope}.`, variant: 'destructive' });
        setClosingCycle(false);
        return;
      }

      // Phase A: site_visits table is dropped — mark not_covered directly on mmp_site_entries
      const { data: matchedVisits } = await supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('mmp_file_id', mmpId)
        .in('id', siteEntryIds)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted'])
        .limit(10000);

      const visitIds = (matchedVisits || []).map((v: any) => v.id);

      if (visitIds.length > 0) {
        const { error: svError } = await supabase
          .from('mmp_site_entries')
          .update({ not_covered_flag: true } as any)
          .in('id', visitIds);
        if (svError) throw svError;
      }

      const newRecord: CycleCloseRecord = {
        id: crypto.randomUUID(),
        scope,
        scopeValue,
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.fullName || '',
        siteCount: visitIds.length,
        status: 'closing',
      };

      const existingRecords: CycleCloseRecord[] = (mmp as any)?.cycle_close_records || [];
      const updatedRecords = [...existingRecords, newRecord];

      const currentStatus = (mmp as any)?.cycle_status || 'active';
      const updateData: any = {
        cycle_close_records: updatedRecords,
      };
      if (currentStatus === 'active') {
        updateData.cycle_status = 'closing';
        updateData.cycle_closing_started_at = new Date().toISOString();
        updateData.cycle_closing_started_by = currentUser?.id;
        updateData.cycle_close_deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('mmp_files')
        .update(updateData)
        .eq('id', mmpId);

      if (error) throw error;

      const scopeLabels: Record<CloseScope, string> = { full: 'Full MMP', hub: 'Hub', state: 'State', activity: 'Activity' };

      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: currentStatus,
        newStatus: 'closing',
        affectedSites: visitIds.length,
        metadata: {
          cycleAction: 'scoped_close',
          closeScope: scope,
          closeScopeValue: scopeValue,
          closeScopeLabel: scopeLabels[scope],
        },
      });

      let displayValue = scopeValue;
      if (scope === 'activity' && scopeValue.includes('||')) {
        const parts = scopeValue.split('||');
        const subParts = parts[1]?.split(':');
        displayValue = `${parts[0]} (${subParts?.[0] === 'state' ? 'State' : 'Hub'}: ${subParts?.[1]})`;
      }
      toast({
        title: `${scopeLabels[scope]} Close Started`,
        description: `Closing ${displayValue}: ${visitIds.length} site visits flagged as not covered.`,
      });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to start scoped close', variant: 'destructive' });
    } finally {
      setClosingCycle(false);
    }
  };

  useEffect(() => {
    fetchUncoveredSites();
    fetchClosedCycles();
  }, [fetchUncoveredSites, fetchClosedCycles]);

  useEffect(() => {
    activeMmps.forEach(mmp => {
      if (!mmpScopeOptions[mmp.id]) {
        fetchMmpScopeOptions(mmp.id);
      }
    });
  }, [activeMmps, fetchMmpScopeOptions, mmpScopeOptions]);

  useEffect(() => {
    const fetchSiteVisitCounts = async () => {
      const mmpIds = (mmpFiles || []).filter(m => {
        const cs = (m as any).cycle_status || 'active';
        return cs === 'active' || cs === 'closing' || cs === 'pending_approval';
      }).map(m => m.id);
      if (mmpIds.length === 0) return;
      try {
        // Fetch ALL site entries for all relevant MMPs in a single paginated
        // round-trip, then compute bucket counts in JS using the same
        // .toLowerCase().trim() normalisation that useCycleCloseReadiness uses.
        //
        // Why this matters: PostgreSQL's IN() does exact-match comparisons, so
        // a status stored as e.g. 'Submitted' (capital S) or ' pending ' (with
        // spaces) would be missed by SQL filters but correctly handled here.
        const PAGE = 1000;
        let allSites: Array<{ mmp_file_id: string; status: string | null; not_covered_flag: boolean | null }> = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('mmp_site_entries')
            .select('mmp_file_id, status, not_covered_flag')
            .in('mmp_file_id', mmpIds)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          allSites = [...allSites, ...(data || [])];
          if (!data || data.length < PAGE) break;
        }

        // Collect per-status counts dynamically — no hardcoded buckets.
        // Sites with not_covered_flag=true but a non-terminal status are counted
        // under their actual status value so the user can see the full picture.
        const counts: Record<string, { total: number; statusCounts: Record<string, number> }> = {};
        mmpIds.forEach(id => { counts[id] = { total: 0, statusCounts: {} }; });

        allSites.forEach(site => {
          const c = counts[site.mmp_file_id];
          if (!c) return;
          // Normalise: lowercase + trim, fall back to 'not_covered' for flagged entries
          let s = (site.status ?? '').toLowerCase().trim();
          if (!s || (site.not_covered_flag && s === 'pending')) s = 'not_covered';
          c.total++;
          c.statusCounts[s] = (c.statusCounts[s] ?? 0) + 1;
        });

        setSiteVisitCounts(counts);
      } catch (err) {
        console.error('Error fetching site visit counts:', err);
      }
    };
    fetchSiteVisitCounts();
  }, [mmpFiles]);

  useEffect(() => {
    if (isAdmin) {
      checkAndSendCycleReminders().catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    const fetchQualityData = async () => {
      try {
        const PAGE = 1000;
        let allQuality: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: pageData } = await supabase
            .from('mmp_site_entries')
            .select('mmp_file_id, additional_data')
            .range(from, from + PAGE - 1);
          allQuality = [...allQuality, ...(pageData || [])];
          if (!pageData || pageData.length < PAGE) break;
        }
        if (allQuality.length > 0) {
          const hubScores: Record<string, { total: number; count: number }> = {};
          allQuality.forEach((s: any) => {
            const qualityScore = Number(s?.additional_data?.quality_score);
            if (!Number.isFinite(qualityScore)) return;
            const mmp = mmpFiles?.find(m => m.id === s.mmp_file_id);
            const hub = mmp?.hub || mmp?.region || 'Unknown';
            if (!hubScores[hub]) hubScores[hub] = { total: 0, count: 0 };
            hubScores[hub].total += qualityScore;
            hubScores[hub].count++;
          });
          setQualityData(Object.entries(hubScores).map(([hub, d]) => ({
            hub,
            avgScore: Math.round((d.total / d.count) * 10) / 10,
            count: d.count,
          })));
        }
      } catch (err) {
        console.error('Error fetching quality data:', err);
      }
    };
    fetchQualityData();
  }, [mmpFiles]);

  const cycleStats = useMemo((): CycleStats => {
    const totalSites = uncoveredSites.length;
    const reasonedSites = uncoveredSites.filter(s => s.not_covered_reason).length;
    const pendingReasonSites = totalSites - reasonedSites;
    const completedSiteCount = 0;
    return {
      totalSites,
      completedSites: completedSiteCount,
      uncoveredSites: totalSites,
      reasonedSites,
      pendingReasonSites,
      coverageRate: totalSites > 0 ? Math.round((reasonedSites / totalSites) * 100) : 100,
    };
  }, [uncoveredSites]);

  const hubs = useMemo(() => {
    const hubSet = new Set(uncoveredSites.map(s => s.hub).filter(Boolean));
    return Array.from(hubSet).sort();
  }, [uncoveredSites]);

  const filteredSites = useMemo(() => {
    return uncoveredSites.filter(site => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!site.site_name.toLowerCase().includes(q) &&
            !site.site_code.toLowerCase().includes(q) &&
            !site.state.toLowerCase().includes(q) &&
            !site.locality.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterHub !== 'all') {
        const filterHubs = filterHub.split(' & ');
        if (!filterHubs.includes(site.hub || '')) return false;
      }
      if (filterReason === 'pending' && site.not_covered_reason) return false;
      if (filterReason === 'assigned' && !site.not_covered_reason) return false;
      if (filterReason !== 'all' && filterReason !== 'pending' && filterReason !== 'assigned' && site.not_covered_reason !== filterReason) return false;
      if (selectedMmpId !== 'all' && site.mmp_id !== selectedMmpId) return false;
      return true;
    });
  }, [uncoveredSites, searchQuery, filterHub, filterReason, selectedMmpId]);

  const handleStartClosingCycle = async (mmpId: string) => {
    if (!canManageCycle) return;
    setClosingCycle(true);
    try {
      const { data: affectedVisits } = await supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('mmp_file_id', mmpId)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted'])
        .limit(10000);

      const affectedCount = affectedVisits?.length || 0;

      const fullCloseRecord: CycleCloseRecord = {
        id: crypto.randomUUID(),
        scope: 'full',
        scopeValue: 'Full MMP',
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.fullName || '',
        siteCount: affectedCount,
        status: 'closing',
      };

      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const existingRecords: CycleCloseRecord[] = (mmpData as any)?.cycle_close_records || [];

      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_closing_started_at: new Date().toISOString(),
          cycle_closing_started_by: currentUser?.id,
          cycle_close_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          cycle_close_records: [...existingRecords, fullCloseRecord],
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const { error: svError } = await supabase
        .from('mmp_site_entries')
        .update({ not_covered_flag: true } as any)
        .eq('mmp_file_id', mmpId)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      if (svError) throw svError;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';
      const mmpHub = mmp?.hub || mmp?.region || '';

      let supervisorQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id')
        .in('role', ['Supervisor', 'supervisor'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);

        if (hubData && hubData.length > 0) {
          supervisorQuery = supervisorQuery.eq('hub_id', hubData[0].id);
        }
      }

      const { data: supervisors } = await supervisorQuery;

      if (supervisors && supervisors.length > 0) {
        await Promise.allSettled(
          supervisors.map(sup =>
            NotificationTriggerService.send({
              userId: sup.id,
              title: `Cycle Closing: Reasons Required`,
              message: `MMP "${mmpName}" is being closed. Please provide reasons for uncovered sites in your hub.`,
              titleAr: `إغلاق الدورة: الأسباب مطلوبة`,
              messageAr: `يتم إغلاق MMP "${mmpName}". يرجى تقديم أسباب للمواقع غير المغطاة في مركزك.`,
              type: 'warning',
              category: 'assignments',
              priority: 'high',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        );
      }

      let fomQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id')
        .in('role', ['fom', 'Field Operation Manager (FOM)'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubDataFom } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);

        if (hubDataFom && hubDataFom.length > 0) {
          fomQuery = fomQuery.eq('hub_id', hubDataFom[0].id);
        }
      }

      const { data: foms } = await fomQuery;

      if (foms && foms.length > 0) {
        await Promise.allSettled(
          foms.map(fom =>
            NotificationTriggerService.send({
              userId: fom.id,
              title: `Cycle Closing: Reasons Required`,
              message: `MMP "${mmpName}" is being closed. Please ensure your supervisors provide reasons for uncovered sites.`,
              titleAr: `إغلاق الدورة: الأسباب مطلوبة`,
              messageAr: `يتم إغلاق MMP "${mmpName}". يرجى التأكد من أن المشرفين يقدمون أسباباً للمواقع غير المغطاة.`,
              type: 'warning',
              category: 'assignments',
              priority: 'high',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        );
      }

      const uncoveredCount = uncoveredSites.filter(s => s.mmp_id === mmpId).length;
      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'active',
        newStatus: 'closing',
        affectedSites: uncoveredCount,
        metadata: { cycleAction: 'start_close' },
      });

      toast({ title: 'Cycle Closing Started', description: 'Uncovered sites have been flagged. Supervisors and FOMs have been notified to provide reasons.' });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      console.error('Error starting cycle close:', err);
      toast({ title: 'Error', description: err.message || 'Failed to start cycle close', variant: 'destructive' });
    } finally {
      setClosingCycle(false);
    }
  };

  const handleAssignReason = async (siteId: string, reason: NotCoveredReason, otherText?: string) => {
    if (!canAssignReasons) return;
    setSaving(true);
    try {
      const updateData: any = {
        not_covered_reason: reason,
        not_covered_reason_other: reason === 'other' ? otherText : null,
        not_covered_at: new Date().toISOString(),
        not_covered_by: currentUser?.id,
      };

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;

      setUncoveredSites(prev => prev.map(s =>
        s.id === siteId
          ? { ...s, not_covered_reason: reason, not_covered_reason_other: reason === 'other' ? otherText || null : null, not_covered_at: updateData.not_covered_at, not_covered_by: updateData.not_covered_by }
          : s
      ));

      const site = uncoveredSites.find(s => s.id === siteId);
      if (site) {
        await logMMPAudit({
          mmpId: site.mmp_id,
          mmpName: site.mmp_name || 'MMP',
          action: 'status_change',
          performedBy: currentUser?.id || '',
          performedByName: currentUser?.fullName,
          reason: reason,
          metadata: { cycleAction: 'assign_reason', siteId, siteName: site.site_name, reason },
        });

        const reasonLabel = NOT_COVERED_REASONS.find(nr => nr.value === reason)?.label || reason;
        const mmpObj = mmpFiles?.find(m => m.id === site.mmp_id);
        const mmpName = mmpObj?.name || site.mmp_name || 'MMP';
        const mmpHub = mmpObj?.hub || mmpObj?.region || '';
        const assignedByName = currentUser?.fullName || 'System';

        const totalMmpUncovered = uncoveredSites.filter(s => s.mmp_id === site.mmp_id).length;
        const totalMmpReasoned = uncoveredSites.filter(s => s.mmp_id === site.mmp_id && (s.id === siteId || s.not_covered_reason)).length;
        const progressPct = totalMmpUncovered > 0 ? Math.round((totalMmpReasoned / totalMmpUncovered) * 100) : 100;

        try {
          const recipients = await fetchAdminFomSuperAdminRecipients();
          const superAdminCc = await getSuperAdminEmails();

          await Promise.allSettled(
            recipients.map(async (r: any) => {
              const recipientCc = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin')
                ? [] : superAdminCc.filter(e => e !== r.email);

              await EmailNotificationService.sendNotification(
                r.email,
                r.full_name || 'Team',
                {
                  title: `Cycle Close: Reason Assigned for Uncovered Site`,
                  message: `A reason has been assigned for an uncovered site during the cycle close process for MMP "${mmpName}".`,
                  titleAr: `إغلاق الدورة: تم تعيين سبب لموقع غير مغطى`,
                  messageAr: `تم تعيين سبب لموقع غير مغطى أثناء عملية إغلاق الدورة لـ MMP "${mmpName}".`,
                  type: 'warning',
                  actionUrl: '/mmp/cycle-close?tab=uncovered',
                  actionLabel: 'View Uncovered Sites | عرض المواقع غير المغطاة',
                  details: [
                    { label: 'MMP / خطة الرصد', value: mmpName },
                    { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                    { label: 'Site / الموقع', value: site.site_name },
                    { label: 'Site Code / رمز الموقع', value: site.site_code || 'N/A' },
                    { label: 'State / الولاية', value: site.state || 'N/A' },
                    { label: 'Locality / المحلية', value: site.locality || 'N/A' },
                    { label: 'Reason / السبب', value: reasonLabel },
                    ...(reason === 'other' && otherText ? [{ label: 'Details / التفاصيل', value: otherText }] : []),
                    { label: 'Assigned By / تم التعيين بواسطة', value: assignedByName },
                    { label: 'Date / التاريخ', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                    { label: 'Progress / التقدم', value: `${totalMmpReasoned}/${totalMmpUncovered} sites (${progressPct}%)` },
                  ],
                  cc: recipientCc,
                }
              );
            })
          );
        } catch (emailErr) {
          console.error('Error sending cycle close reason email:', emailErr);
        }
      }

      toast({ title: 'Reason Assigned', description: 'The reason has been saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to assign reason', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAssignReason = async () => {
    if (!canAssignReasons || !bulkReason || selectedSites.size === 0) return;
    setSaving(true);
    try {
      const siteIds = Array.from(selectedSites);
      const updateData: any = {
        not_covered_reason: bulkReason,
        not_covered_reason_other: bulkReason === 'other' ? bulkOtherText : null,
        not_covered_at: new Date().toISOString(),
        not_covered_by: currentUser?.id,
      };

      const { error } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .in('id', siteIds);

      if (error) throw error;

      setUncoveredSites(prev => prev.map(s =>
        siteIds.includes(s.id)
          ? { ...s, not_covered_reason: bulkReason as NotCoveredReason, not_covered_reason_other: bulkReason === 'other' ? bulkOtherText || null : null, not_covered_at: updateData.not_covered_at, not_covered_by: updateData.not_covered_by }
          : s
      ));

      setSelectedSites(new Set());
      setBulkReason('');
      setBulkOtherText('');

      await logMMPAudit({
        mmpId: 'bulk',
        mmpName: 'Bulk Assignment',
        action: 'bulk_operation',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        affectedSites: siteIds.length,
        metadata: { cycleAction: 'bulk_assign_reason', reason: bulkReason, siteCount: siteIds.length },
      });

      const reasonLabel = NOT_COVERED_REASONS.find(nr => nr.value === bulkReason)?.label || bulkReason;
      const assignedByName = currentUser?.fullName || 'System';
      const affectedSiteNames = uncoveredSites.filter(s => siteIds.includes(s.id)).map(s => s.site_name).slice(0, 5);
      const affectedMmpIds = [...new Set(uncoveredSites.filter(s => siteIds.includes(s.id)).map(s => s.mmp_id))];
      const affectedMmpNames = affectedMmpIds.map(id => mmpFiles?.find(m => m.id === id)?.name || 'MMP').join(', ');

      try {
        const recipients = await fetchAdminFomSuperAdminRecipients();
        const superAdminCc = await getSuperAdminEmails();

        await Promise.allSettled(
          recipients.map(async (r: any) => {
            const recipientCc = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin')
              ? [] : superAdminCc.filter(e => e !== r.email);

            await EmailNotificationService.sendNotification(
              r.email,
              r.full_name || 'Team',
              {
                title: `Cycle Close: Bulk Reason Assignment (${siteIds.length} Sites)`,
                message: `Reasons have been bulk-assigned for ${siteIds.length} uncovered sites during the cycle close process.`,
                titleAr: `إغلاق الدورة: تعيين أسباب جماعي (${siteIds.length} موقع)`,
                messageAr: `تم تعيين أسباب بشكل جماعي لـ ${siteIds.length} موقع غير مغطى أثناء عملية إغلاق الدورة.`,
                type: 'warning',
                actionUrl: '/mmp/cycle-close?tab=uncovered',
                actionLabel: 'View Uncovered Sites | عرض المواقع غير المغطاة',
                details: [
                  { label: 'MMP(s) / خطط الرصد', value: affectedMmpNames },
                  { label: 'Sites Affected / المواقع المتأثرة', value: `${siteIds.length} sites` },
                  { label: 'Sample Sites / نماذج مواقع', value: affectedSiteNames.join(', ') + (siteIds.length > 5 ? ` +${siteIds.length - 5} more` : '') },
                  { label: 'Reason / السبب', value: reasonLabel },
                  ...(bulkReason === 'other' && bulkOtherText ? [{ label: 'Details / التفاصيل', value: bulkOtherText }] : []),
                  { label: 'Assigned By / تم التعيين بواسطة', value: assignedByName },
                  { label: 'Date / التاريخ', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                ],
                cc: recipientCc,
              }
            );
          })
        );
      } catch (emailErr) {
        console.error('Error sending bulk assign reason email:', emailErr);
      }

      toast({ title: 'Bulk Assign Complete', description: `Reason assigned to ${siteIds.length} sites.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to bulk assign', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const checkFinanceReadinessForClose = async (mmpId: string): Promise<{ ok: boolean; issues: string[] }> => {
    let advancesRes, withdrawalsRes, costSubsRes;
    try {
      // Filter cost submissions by mmp_id FK directly — avoids counting
      // submissions from other MMPs in the same calendar month.
      const costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status')
        .eq('mmp_id', mmpId)
        .or('tier1_status.eq.pending,tier2_status.eq.pending');

      [advancesRes, withdrawalsRes, costSubsRes] = await Promise.all([
        supabase.from('down_payment_requests').select('id, status, metadata').eq('mmp_id', mmpId),
        supabase.from('withdrawal_requests').select('id, status').eq('mmp_id', mmpId),
        costSubsQuery,
      ]);
    } catch {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify finance readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'] };
    }

    // Only block on cost submissions error (required table).
    // advances/withdrawals tables are optional — gracefully treat errors as empty
    // to match server RPC behavior which also handles missing tables gracefully.
    if (costSubsRes.error) {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify cost submission readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'] };
    }

    // advances: treat query error as empty (optional table, server RPC handles gracefully)
    // Gate logic:
    //   - fully_paid / paid / reconciled → cleared (no issue)
    //   - approved (zero disbursement) → "pending payment via report" — NOT blocking
    //   - partially_paid and not reconciled → blocking
    const advances = (!advancesRes.error && advancesRes.data || []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
    const unreconciledAdvances = advances.filter(a => {
      const meta = a.metadata ?? {};
      const isCleared = a.status === 'fully_paid' || a.status === 'paid' || meta['reconciled'] === true || Boolean(meta['reconciled_at']);
      return a.status === 'partially_paid' && !isCleared;
    }).length;

    // withdrawals: treat query error as empty (optional table, server RPC handles gracefully)
    const pendingWithdrawals = ((!withdrawalsRes.error && withdrawalsRes.data || []) as Array<{ id: string; status: string }>).filter(
      w => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? ''),
    ).length;

    const pendingCostSubs = (costSubsRes.data || []).length;

    const issues: string[] = [];
    if (unreconciledAdvances > 0) issues.push(`${unreconciledAdvances} unreconciled transport advance(s)`);
    if (pendingWithdrawals > 0) issues.push(`${pendingWithdrawals} pending withdrawal request(s)`);
    if (pendingCostSubs > 0) issues.push(`${pendingCostSubs} pending cost submission(s) (tier 1 or tier 2 pending)`);

    return { ok: issues.length === 0, issues };
  };

  const handleFinalizeCycleClose = async (mmpId: string) => {
    if (!canManageCycle) return;
    const unreasoned = uncoveredSites.filter(s => s.mmp_id === mmpId && !s.not_covered_reason);
    if (unreasoned.length > 0) {
      toast({ title: 'Cannot Close', description: `${unreasoned.length} sites still need a reason. All uncovered sites must have reasons before closing.`, variant: 'destructive' });
      return;
    }

    const { ok: financeOk, issues: financeIssues } = await checkFinanceReadinessForClose(mmpId);
    if (!financeOk) {
      if (isSuperAdmin) {
        setFinanceOverrideJustification('');
        setFinanceOverrideDialog({ mmpId, issues: financeIssues, action: 'finalize' });
        return;
      }
      toast({
        title: 'Finance Gate — Cycle Cannot Be Closed',
        description: `Resolve the following before closing:\n• ${financeIssues.join('\n• ')}`,
        variant: 'destructive',
      });
      return;
    }

    setFinalizingCycle(true);
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'pending_approval',
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'closing',
        newStatus: 'pending_approval',
        affectedSites: uncoveredSites.filter(s => s.mmp_id === mmpId).length,
        metadata: { cycleAction: 'submit_for_approval' },
      });

      toast({ title: 'Submitted for Approval', description: 'The cycle has been submitted for FOM/Director approval.' });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit for approval', variant: 'destructive' });
    } finally {
      setFinalizingCycle(false);
    }
  };

  const handleApproveCycle = async (mmpId: string, skipFinanceCheck = false, overrideJustification?: string) => {
    if (!skipFinanceCheck) {
      const { ok: financeOk, issues: financeIssues } = await checkFinanceReadinessForClose(mmpId);
      if (!financeOk) {
        if (isSuperAdmin) {
          setFinanceOverrideJustification('');
          setFinanceOverrideDialog({ mmpId, issues: financeIssues, action: 'approve' });
          return;
        }
        toast({
          title: 'Finance Gate — Approval Blocked',
          description: `Resolve the following before approving:\n• ${financeIssues.join('\n• ')}`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const existingRecords: CycleCloseRecord[] = (mmpData as any)?.cycle_close_records || [];
      const updatedRecords = existingRecords.map(r => ({
        ...r,
        status: 'closed' as const,
      }));

      const now = new Date().toISOString();
      const mmpSnap = mmpFiles?.find(m => m.id === mmpId);
      const snapshotRecord = {
        id: `snapshot-${now}`,
        scope: 'full',
        status: 'closed' as const,
        closedAt: now,
        closedBy: currentUser?.id,
        closedByName: currentUser?.fullName,
        hubOrRegion: mmpSnap?.hub || mmpSnap?.region || null,
        month: mmpSnap?.month ?? null,
        name: mmpSnap?.name ?? null,
      };
      const finalRecords = [
        ...updatedRecords,
        snapshotRecord,
      ];

      const { error } = await supabase.rpc('cycle_approve_close', {
        p_mmp_id: mmpId,
        p_close_records: JSON.parse(JSON.stringify(finalRecords)),
        p_super_admin_override: skipFinanceCheck && !!overrideJustification,
        p_override_justification: overrideJustification || null,
      });

      if (error) throw error;

      await supabase
        .from('mmp_site_entries')
        .update({ status: 'cancelled' })
        .eq('mmp_file_id', mmpId)
        .eq('not_covered_flag', true)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'pending_approval',
        newStatus: 'closed',
        metadata: { cycleAction: 'approve_close' },
      });

      toast({ title: 'Cycle Approved & Closed', description: 'The MMP cycle has been approved and closed.' });
      await refreshMMPFiles();
      await fetchClosedCycles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to approve cycle', variant: 'destructive' });
    }
  };

  const handleRejectCycle = async (mmpId: string, note: string) => {
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_approval_note: note,
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'pending_approval',
        newStatus: 'closing',
        metadata: { cycleAction: 'reject_close', rejectionNote: note },
      });

      toast({ title: 'Cycle Rejected', description: 'Cycle has been returned to closing status.' });
      await refreshMMPFiles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to reject cycle', variant: 'destructive' });
    }
  };

  const handleFinanceOverrideConfirm = async () => {
    if (!financeOverrideDialog) return;
    const { mmpId, action, issues } = financeOverrideDialog;
    const justification = financeOverrideJustification.trim();
    if (!justification) {
      toast({ title: 'Justification Required', description: 'Provide a written justification before overriding.', variant: 'destructive' });
      return;
    }

    const mmp = mmpFiles?.find(m => m.id === mmpId);
    const auditId = await logMMPAudit({
      mmpId,
      mmpName: mmp?.name || 'MMP',
      action: 'bypass',
      performedBy: currentUser?.id || '',
      performedByName: currentUser?.fullName,
      metadata: {
        overrideAction: action === 'finalize' ? 'finalize_close' : 'approve_close',
        justification,
        pendingIssues: issues,
      },
    });

    if (!auditId) {
      toast({ title: 'Override Blocked', description: 'Failed to record override justification. Action blocked.', variant: 'destructive' });
      return;
    }

    setFinanceOverrideDialog(null);
    setFinanceOverrideJustification('');

    if (action === 'finalize') {
      setFinalizingCycle(true);
      try {
        const { error } = await supabase
          .from('mmp_files')
          .update({ cycle_status: 'pending_approval' } as any)
          .eq('id', mmpId);
        if (error) throw error;
        await logMMPAudit({
          mmpId,
          mmpName: mmp?.name || 'MMP',
          action: 'status_change',
          performedBy: currentUser?.id || '',
          performedByName: currentUser?.fullName,
          previousStatus: 'closing',
          newStatus: 'pending_approval',
          metadata: { cycleAction: 'submit_for_approval', superAdminOverride: true },
        });
        toast({ title: 'Submitted for Approval (Override)', description: 'Finance gate bypassed by Super Admin and recorded to audit log.' });
        await refreshMMPFiles();
        await fetchUncoveredSites();
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to submit for approval', variant: 'destructive' });
      } finally {
        setFinalizingCycle(false);
      }
    } else {
      await handleApproveCycle(mmpId, true, justification);
    }
  };

  const handleCycleCloseOverride = async (mmpId: string, justification: string) => {
    const auditId = await logMMPAudit({
      mmpId,
      mmpName: mmpFiles?.find(m => m.id === mmpId)?.name || 'MMP',
      action: 'status_change',
      performedBy: currentUser?.id || '',
      performedByName: currentUser?.fullName,
      metadata: {
        cycleAction: 'superadmin_finance_gate_override',
        justification,
        overriddenAt: new Date().toISOString(),
      },
    });
    if (!auditId) {
      toast({
        title: 'Override Blocked',
        description: 'Could not record justification in the audit trail. Override aborted to preserve compliance.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Override Recorded', description: 'Justification logged. Proceeding to close the cycle.' });
    const pending = pendingScopedClose;
    setPendingScopedClose(null);
    if (pending) {
      executeScopedClose(mmpId, pending.scope, pending.scopeValue);
    } else {
      handleStartClosingCycle(mmpId);
    }
  };

  const handleScheduleReminders = async () => {
    try {
      const result = await checkAndSendCycleReminders();
      toast({
        title: 'Reminders Processed',
        description: `Sent ${result.sent} reminders across ${result.cycles} overdue cycles.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send reminders', variant: 'destructive' });
    }
  };

  const toggleSiteSelection = (siteId: string) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const filteredIds = filteredSites.map(s => s.id);
    const allSelected = filteredIds.every(id => selectedSites.has(id));
    if (allSelected) {
      setSelectedSites(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedSites(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const getReasonLabel = (reason: string | null) => {
    if (!reason) return 'Pending';
    const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
    return r?.label || reason;
  };

  const getReasonLabelAr = (reason: string | null) => {
    if (!reason) return 'معلق';
    const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
    return r?.labelAr || '';
  };

  const getReasonBadgeVariant = (reason: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!reason) return 'destructive';
    return 'secondary';
  };

  const exportCoverageReport = (mmpId?: string) => {
    const sites = mmpId ? uncoveredSites.filter(s => s.mmp_id === mmpId) : uncoveredSites;
    const csv = [
      ['Site Name', 'Site Code', 'State', 'Locality', 'Hub', 'Status', 'Reason', 'Other Details', 'Flagged At'].join(','),
      ...sites.map(s => [
        `"${s.site_name}"`,
        s.site_code,
        s.state,
        s.locality,
        s.hub || '',
        s.status,
        getReasonLabel(s.not_covered_reason),
        s.not_covered_reason_other || '',
        s.not_covered_at || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coverage-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendReminders = async (mmpId: string) => {
    try {
      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';
      const mmpHub = mmp?.hub || mmp?.region || '';

      const mmpUncoveredCount = uncoveredSites.filter(s => s.mmp_id === mmpId).length;
      const mmpReasonedCount = uncoveredSites.filter(s => s.mmp_id === mmpId && s.not_covered_reason).length;
      const mmpPendingCount = mmpUncoveredCount - mmpReasonedCount;
      const progressPct = mmpUncoveredCount > 0 ? Math.round((mmpReasonedCount / mmpUncoveredCount) * 100) : 100;
      const deadlineStr = (mmp as any)?.cycle_close_deadline ? new Date((mmp as any).cycle_close_deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, role')
        .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);
        if (hubData && hubData.length > 0) {
          const hubId = hubData[0].id;
          const { data: hubRecipients } = await supabase
            .from('profiles')
            .select('id, full_name, email, hub_id, role')
            .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)'])
            .eq('hub_id', hubId)
            .eq('status', 'approved');

          const { data: superAdmins } = await supabase
            .from('profiles')
            .select('id, full_name, email, hub_id, role')
            .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
            .eq('status', 'approved');

          const combined = [...(hubRecipients || []), ...(superAdmins || [])];
          const uniqueById = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

          const superAdminCc = await getSuperAdminEmails();

          if (uniqueById.length > 0) {
            await Promise.allSettled(
              uniqueById.map(async (r: any) => {
                const isSuperAdminRole = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin');

                await NotificationTriggerService.send({
                  userId: r.id,
                  title: `OVERDUE: Cycle Close Reasons Required`,
                  message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} sites still need reasons. Please submit immediately.`,
                  titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                  messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} مواقع لا تزال بحاجة إلى أسباب. يرجى التقديم فوراً.`,
                  type: 'error',
                  category: 'assignments',
                  priority: 'urgent',
                  link: '/mmp/cycle-close?tab=uncovered',
                  relatedEntityId: mmpId,
                  relatedEntityType: 'mmpFile',
                });

                if (r.email) {
                  const recipientCc = isSuperAdminRole ? [] : superAdminCc.filter(e => e !== r.email);

                  await EmailNotificationService.sendNotification(
                    r.email,
                    r.full_name || 'Team',
                    {
                      title: `OVERDUE: Cycle Close Reasons Required`,
                      message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} uncovered sites still require reasons to be submitted.`,
                      titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                      messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} موقع غير مغطى لا يزال يحتاج إلى تقديم أسباب.`,
                      type: 'error',
                      actionUrl: '/mmp/cycle-close?tab=uncovered',
                      actionLabel: 'Review & Submit Reasons | مراجعة وتقديم الأسباب',
                      details: [
                        { label: 'MMP / خطة الرصد', value: mmpName },
                        { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                        { label: 'Deadline / الموعد النهائي', value: deadlineStr },
                        { label: 'Total Uncovered / إجمالي غير المغطى', value: `${mmpUncoveredCount} sites` },
                        { label: 'Reasons Submitted / الأسباب المقدمة', value: `${mmpReasonedCount} (${progressPct}%)` },
                        { label: 'Still Pending / لا يزال معلقاً', value: `${mmpPendingCount} sites` },
                      ],
                      cc: recipientCc,
                    }
                  );
                }
              })
            );
          }

          toast({ title: 'Reminders Sent', description: `Reminders sent to ${uniqueById.length} supervisors, FOMs, and super admins.` });
          return;
        }
      }

      const { data: recipients } = await recipientQuery;
      const superAdminCc = await getSuperAdminEmails();

      if (recipients && recipients.length > 0) {
        await Promise.allSettled(
          recipients.map(async (r: any) => {
            const isSuperAdminRole = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin');

            await NotificationTriggerService.send({
              userId: r.id,
              title: `OVERDUE: Cycle Close Reasons Required`,
              message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} sites still need reasons. Please submit immediately.`,
              titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
              messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} مواقع لا تزال بحاجة إلى أسباب. يرجى التقديم فوراً.`,
              type: 'error',
              category: 'assignments',
              priority: 'urgent',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            });

            if (r.email) {
              const recipientCc = isSuperAdminRole ? [] : superAdminCc.filter(e => e !== r.email);
              await EmailNotificationService.sendNotification(
                r.email,
                r.full_name || 'Team',
                {
                  title: `OVERDUE: Cycle Close Reasons Required`,
                  message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} uncovered sites still require reasons to be submitted.`,
                  titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                  messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} موقع غير مغطى لا يزال يحتاج إلى تقديم أسباب.`,
                  type: 'error',
                  actionUrl: '/mmp/cycle-close?tab=uncovered',
                  actionLabel: 'Review & Submit Reasons | مراجعة وتقديم الأسباب',
                  details: [
                    { label: 'MMP / خطة الرصد', value: mmpName },
                    { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                    { label: 'Deadline / الموعد النهائي', value: deadlineStr },
                    { label: 'Total Uncovered / إجمالي غير المغطى', value: `${mmpUncoveredCount} sites` },
                    { label: 'Reasons Submitted / الأسباب المقدمة', value: `${mmpReasonedCount} (${progressPct}%)` },
                    { label: 'Still Pending / لا يزال معلقاً', value: `${mmpPendingCount} sites` },
                  ],
                  cc: recipientCc,
                }
              );
            }
          })
        );
      }

      toast({ title: 'Reminders Sent', description: `Reminders sent to ${recipients?.length || 0} supervisors, FOMs, and super admins.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send reminders', variant: 'destructive' });
    }
  };

  const exportCoverageReportExcel = async (mmpId?: string) => {
    const XLSX = await import('xlsx');
    const sites = mmpId ? uncoveredSites.filter(s => s.mmp_id === mmpId) : uncoveredSites;
    const wsData = sites.map(s => ({
      'Site Name': s.site_name,
      'Site Code': s.site_code,
      'State': s.state,
      'Locality': s.locality,
      'Hub': s.hub || '',
      'Status': s.status,
      'Reason': getReasonLabel(s.not_covered_reason),
      'Other Details': s.not_covered_reason_other || '',
      'Flagged At': s.not_covered_at || '',
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Uncovered Sites');
    XLSX.writeFile(wb, `coverage-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const reasonBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    uncoveredSites.forEach(s => {
      const key = s.not_covered_reason || 'pending';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [uncoveredSites]);

  const hubBreakdown = useMemo(() => {
    const counts: Record<string, { total: number; reasoned: number; pending: number }> = {};
    uncoveredSites.forEach(s => {
      const hub = s.hub || 'Unknown';
      if (!counts[hub]) counts[hub] = { total: 0, reasoned: 0, pending: 0 };
      counts[hub].total++;
      if (s.not_covered_reason) counts[hub].reasoned++;
      else counts[hub].pending++;
    });
    return counts;
  }, [uncoveredSites]);

  const overallSummary = useMemo(() => {
    const totalMmps = activeMmps.length;
    const closingCount = activeMmps.filter(m => (m as any).cycle_status === 'closing').length;
    const pendingApprovalCount = activeMmps.filter(m => (m as any).cycle_status === 'pending_approval').length;
    const activeCount = totalMmps - closingCount - pendingApprovalCount;
    let totalSites = 0;
    let completedSites = 0;
    Object.values(siteVisitCounts).forEach(c => {
      totalSites += c.total;
      completedSites += c.completed;
    });
    const overallCoverage = totalSites > 0 ? Math.round((completedSites / totalSites) * 100) : 0;
    const totalUncovered = uncoveredSites.length;
    const totalReasoned = uncoveredSites.filter(s => s.not_covered_reason).length;
    const reasonCompletion = totalUncovered > 0 ? Math.round((totalReasoned / totalUncovered) * 100) : 100;
    const overdueCount = activeMmps.filter(m => {
      const deadline = (m as any).cycle_close_deadline;
      return (m as any).cycle_status === 'closing' && deadline && new Date(deadline) < new Date();
    }).length;
    return { totalMmps, activeCount, closingCount, pendingApprovalCount, totalSites, completedSites, overallCoverage, totalUncovered, totalReasoned, reasonCompletion, overdueCount };
  }, [activeMmps, siteVisitCounts, uncoveredSites]);

  const activeHubs = useMemo(() => {
    const hubSet = new Set(activeMmps.map(m => m.hub || m.region || '').filter(Boolean));
    return Array.from(hubSet).sort();
  }, [activeMmps]);

  const filteredActiveMmps = useMemo(() => {
    let mmps = [...activeMmps];
    if (activeHubFilter !== 'all') {
      mmps = mmps.filter(m => (m.hub || m.region || '') === activeHubFilter);
    }
    mmps.sort((a, b) => {
      let cmp = 0;
      if (activeSort === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (activeSort === 'coverage') {
        const aCov = siteVisitCounts[a.id] ? ((siteVisitCounts[a.id].statusCounts?.['completed'] ?? 0) / (siteVisitCounts[a.id].total || 1)) : 0;
        const bCov = siteVisitCounts[b.id] ? ((siteVisitCounts[b.id].statusCounts?.['completed'] ?? 0) / (siteVisitCounts[b.id].total || 1)) : 0;
        cmp = aCov - bCov;
      } else {
        const statusOrder: Record<string, number> = { closing: 0, pending_approval: 1, active: 2 };
        const aOrder = statusOrder[(a as any).cycle_status || 'active'] ?? 2;
        const bOrder = statusOrder[(b as any).cycle_status || 'active'] ?? 2;
        cmp = aOrder - bOrder;
      }
      return activeSortDir === 'desc' ? -cmp : cmp;
    });
    return mmps;
  }, [activeMmps, activeHubFilter, activeSort, activeSortDir, siteVisitCounts]);

  const hubProgressData = useMemo(() => {
    const hubMap: Record<string, { total: number; completed: number; uncovered: number; reasoned: number; mmpCount: number }> = {};
    activeMmps.forEach(m => {
      const hub = m.hub || m.region || 'Unknown';
      if (!hubMap[hub]) hubMap[hub] = { total: 0, completed: 0, uncovered: 0, reasoned: 0, mmpCount: 0 };
      hubMap[hub].mmpCount++;
      const counts = siteVisitCounts[m.id];
      if (counts) {
        hubMap[hub].total += counts.total;
        hubMap[hub].completed += counts.statusCounts?.['completed'] ?? 0;
      }
    });
    uncoveredSites.forEach(s => {
      const hub = s.hub || 'Unknown';
      if (!hubMap[hub]) hubMap[hub] = { total: 0, completed: 0, uncovered: 0, reasoned: 0, mmpCount: 0 };
      hubMap[hub].uncovered++;
      if (s.not_covered_reason) hubMap[hub].reasoned++;
    });
    return Object.entries(hubMap)
      .map(([hub, d]) => ({ hub, ...d, coverage: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0 }))
      .sort((a, b) => a.coverage - b.coverage);
  }, [activeMmps, siteVisitCounts, uncoveredSites]);

  const filteredClosedCycles = useMemo(() => {
    if (!archiveSearch.trim()) return closedCycles;
    const q = archiveSearch.toLowerCase();
    return closedCycles.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.region || '').toLowerCase().includes(q)
    );
  }, [closedCycles, archiveSearch]);

  const uncoveredMmpOptions = useMemo(() => {
    const mmpIds = new Set(uncoveredSites.map(s => s.mmp_id));
    // Include both active and closing MMPs that have entries in the list
    const allRelevant = [...activeMmps, ...closingMmps.filter(
      m => !activeMmps.some(a => a.id === m.id),
    )];
    return allRelevant.filter(m => mmpIds.has(m.id));
  }, [uncoveredSites, activeMmps, closingMmps]);

  if (!canManageCycle && !canAssignReasons) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-card rounded-xl shadow text-center" data-testid="access-denied">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="mmp-cycle-close-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">MMP Cycle Close</h1>
              {(isAdmin || isFOM) && <Badge variant="outline"><Shield className="h-3 w-3 mr-1" /> {isAdmin ? 'Admin' : 'FOM'} View</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage MMP cycle lifecycle, track coverage gaps, and close monitoring periods
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchUncoveredSites(); fetchClosedCycles(); }} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCoverageReport()} data-testid="button-export">
            <Download className="h-4 w-4 mr-1" /> Export Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCoverageReportExcel()} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(checklistMmpId ? `/reconciliation-dashboard?mmpId=${checklistMmpId}` : '/reconciliation-dashboard')}
              data-testid="button-goto-reconciliation"
            >
              <BarChart3 className="h-4 w-4 mr-1" /> Reconciliation
            </Button>
          )}
        </div>
      </div>

      <PageInfoBanner
        title="MMP Cycle Close - Coverage Management"
        description="This page manages the complete end-of-cycle process for Monthly Monitoring Plans (MMPs). After each monitoring month ends, teams use this page to account for every site — visited or not — resolve all finance obligations tied to that cycle, and formally archive the period. The six tabs guide you from reviewing live coverage stats → assigning reasons to missed sites → passing a readiness checklist → submitting for approval → and finally archiving with full reports. Closed cycles are permanently stored for trend analysis, scorecard benchmarking, and cross-cycle comparison."
        descriptionAr="تُدير هذه الصفحة عملية إغلاق دورة خطط المراقبة الشهرية (MMP) من البداية إلى النهاية. بعد انتهاء كل شهر مراقبة، تستخدم الفرق هذه الصفحة لمحاسبة كل موقع — سواء تمت زيارته أم لا — وحسم جميع الالتزامات المالية المرتبطة بالدورة، وأرشفة الفترة رسمياً. تقودك الأجزاء الستة من مراجعة إحصائيات التغطية المباشرة → تعيين أسباب المواقع التي لم تُزَر → اجتياز قائمة الجاهزية → تقديم الدورة للموافقة → وأخيراً الأرشفة مع التقارير الكاملة. تُحفظ الدورات المغلقة بشكل دائم لتحليل الاتجاهات والمقارنة عبر الدورات."
        workflowSteps={[
          { step: 1, role: 'Admin', action: 'Initiate cycle close', description: 'On the Active Cycles tab, find the MMP for the completed month. Click "Start Close". The system immediately auto-flags every site that was not completed or officially cancelled.' },
          { step: 2, role: 'Supervisor', action: 'Assign reasons to uncovered sites', description: 'Switch to the Uncovered Sites tab. Assign a reason to each flagged site (security incident, access denied, flooding, budget cut, data collector absent, etc.). Use Bulk Assign to apply one reason to many sites at once.' },
          { step: 3, role: 'Admin', action: 'Pass the readiness checklist', description: 'Click the MMP row to open the Cycle Close panel. The Readiness Checklist must show all green ticks: site visits resolved, no pending cost submissions, transport advances reconciled, withdrawal requests processed, cost recoveries addressed, and WFP file applied.' },
          { step: 4, role: 'Admin', action: 'Resolve finance blocks', description: 'If any finance gate is red: go to Finance → Cost Submissions to approve/reject pending items; go to Reconciliation to mark advances as reconciled. If a gate shows amber "(not configured)", see the guide below for what SQL migration to run.' },
          { step: 5, role: 'Admin', action: 'Submit for approval', description: 'Once the checklist score reaches 100%, click "Submit for Approval". A notification is sent to the FOM and Country Director.' },
          { step: 6, role: 'FOM', action: 'Approve or reject', description: 'FOM reviews the final coverage report, quality scores, and finance summary. They click Approve (with optional comment) or Reject with a reason to send back to the admin.' },
          { step: 7, role: 'System', action: 'Archive the cycle', description: 'On approval the cycle status becomes Closed. All stats (coverage %, COMPLETED, UNCOVERED, OVERDUE counts, reason breakdowns, quality scores) are permanently archived and appear in the Closed Cycles and Comparison tabs.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير', action: 'بدء إغلاق الدورة', description: 'في تبويب الدورات النشطة، ابحث عن خطة المراقبة الشهرية للشهر المكتمل. انقر "بدء الإغلاق". يقوم النظام فوراً بتحديد كل موقع لم يُكتمل أو يُلغَ رسمياً.' },
          { step: 2, role: 'المشرف', action: 'تعيين أسباب المواقع غير المغطاة', description: 'انتقل إلى تبويب المواقع غير المغطاة. عيّن سبباً لكل موقع (حادث أمني، رفض الوصول، فيضانات، تخفيضات الميزانية، غياب جامع البيانات، إلخ). استخدم "التعيين الجماعي" لتطبيق سبب واحد على مواقع متعددة دفعةً واحدة.' },
          { step: 3, role: 'المدير', action: 'اجتياز قائمة جاهزية الإغلاق', description: 'انقر على صف خطة المراقبة لفتح لوحة إغلاق الدورة. يجب أن تظهر قائمة الجاهزية بعلامات خضراء: المواقع محسومة، لا توجد تقديمات تكلفة معلقة، تسوية السلف المالية، معالجة طلبات السحب، معالجة استرداد التكاليف، وتطبيق ملف WFP.' },
          { step: 4, role: 'المدير', action: 'حسم إشكاليات المالية', description: 'إذا كان أي بند مالي أحمر: اذهب إلى المالية → تقديمات التكاليف لاعتماد أو رفض البنود المعلقة؛ اذهب إلى التسوية لتحديد السلف كمسوّاة. إذا كان البند يعرض تحذير "(غير مُهيَّأ)" بالأصفر، راجع الدليل أدناه لمعرفة الترحيل المطلوب.' },
          { step: 5, role: 'المدير', action: 'تقديم للموافقة', description: 'بمجرد وصول نسبة القائمة إلى 100%، انقر "تقديم للموافقة". يُرسَل إشعار إلى مدير العمليات الميدانية والمدير القُطري.' },
          { step: 6, role: 'المشرف والمدير', action: 'موافقة أو رفض', description: 'يراجع مدير العمليات الميدانية تقرير التغطية النهائي ودرجات الجودة والملخص المالي. ينقر موافقة (مع تعليق اختياري) أو رفض مع سبب لإعادتها إلى المدير.' },
          { step: 7, role: 'النظام', action: 'أرشفة الدورة', description: 'عند الموافقة، يصبح وضع الدورة "مغلقة". تُؤرشَف جميع الإحصائيات (نسبة التغطية، الأعداد، تفاصيل الأسباب، درجات الجودة) بشكل دائم وتظهر في تبويبي الدورات المغلقة والمقارنة.' },
        ]}
      />

      <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 mb-4" data-testid="operational-guide">
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-green-100/50 dark:hover:bg-green-900/30 rounded-md transition-colors"
              data-testid="button-toggle-guide"
            >
              <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300 flex-1">
                MMP Cycle Close Operational Guide / دليل إغلاق دورة خطة المراقبة الشهرية
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-green-600 dark:text-green-400 transition-transform duration-200 ${guideOpen ? '' : '-rotate-90'}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-5 space-y-5 text-sm">

              {/* ── Section 1: Tab Overview ── */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* English */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Understanding Each Tab</h4>
                  <div className="space-y-2 text-muted-foreground">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Active Cycles</Badge></div>
                      <p className="text-xs leading-snug">Shows every MMP currently open or in the closing process. Each row displays the MMP name, month/year, coverage %, and live counts of COMPLETED / UNCOVERED / OVERDUE site visits. This is where you click <strong>"Start Close"</strong> to begin the cycle-close workflow for an MMP.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Uncovered Sites</Badge></div>
                      <p className="text-xs leading-snug">All sites the system auto-flagged as not visited during the cycle. You must assign a <strong>reason</strong> to every site before the cycle can be closed. Reasons include: Security Incident, Access Denied, Flooding / Road Damage, Budget Cut, Data Collector Absent, Site Relocated, Duplicate Site, Weather, or Other. Use <strong>Bulk Assign</strong> to apply one reason to many sites instantly.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Reports</Badge></div>
                      <p className="text-xs leading-snug">Coverage analytics for any active or recently closed MMP: overall coverage %, per-hub breakdowns, reason-frequency charts, follow-up action queue for high-priority gaps (e.g. sites missed 2+ consecutive cycles), and data quality scores per data collector.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Comparison</Badge></div>
                      <p className="text-xs leading-snug">Select any two closed cycles and compare them side-by-side. The view highlights coverage trend (improving / declining), recurring uncovered sites, reason-pattern shifts, and hubs that improved or regressed between cycles.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Scorecard</Badge></div>
                      <p className="text-xs leading-snug">A performance matrix per hub across the last N cycles. Shows coverage trend lines, average gap size, most frequent uncovered-reason, and an overall performance colour (green / amber / red). Used by Country Directors to identify which hubs need intervention.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5"><Badge variant="secondary" className="text-[10px]">Closed Cycles</Badge></div>
                      <p className="text-xs leading-snug">Permanent archive of every fully closed cycle. Each entry shows final coverage %, total sites, reason breakdown, quality scores, who approved it, and the approval date. You can export individual cycles as PDF or Excel for donor reporting.</p>
                    </div>
                  </div>
                </div>
                {/* Arabic */}
                <div className="space-y-2" dir="rtl">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">فهم كل تبويب</h4>
                  <div className="space-y-2 text-muted-foreground">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">الدورات النشطة</Badge></div>
                      <p className="text-xs leading-snug text-right">يعرض جميع خطط المراقبة الشهرية المفتوحة أو قيد الإغلاق. يُظهر كل صف اسم الخطة والشهر والسنة ونسبة التغطية وعدد الزيارات (مكتملة / غير مغطاة / متأخرة). من هنا تنقر <strong>"بدء الإغلاق"</strong> لبدء سير عمل إغلاق الدورة.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">المواقع غير المغطاة</Badge></div>
                      <p className="text-xs leading-snug text-right">جميع المواقع التي حددها النظام تلقائياً على أنها لم تُزَر خلال الدورة. يجب تعيين <strong>سبب</strong> لكل موقع قبل إغلاق الدورة. الأسباب تشمل: حادث أمني، رفض الوصول، فيضانات / تلف الطريق، تخفيضات الميزانية، غياب جامع البيانات، نقل الموقع، موقع مكرر، طقس سيئ، أو أخرى. استخدم <strong>التعيين الجماعي</strong> لتطبيق سبب واحد على عدة مواقع دفعةً.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">التقارير</Badge></div>
                      <p className="text-xs leading-snug text-right">تحليلات التغطية لأي خطة نشطة أو مغلقة حديثاً: نسبة التغطية الإجمالية، التفاصيل حسب المحور، مخططات تكرار الأسباب، قائمة الإجراءات المتابعة للفجوات ذات الأولوية العالية، ودرجات جودة البيانات لكل جامع بيانات.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">المقارنة</Badge></div>
                      <p className="text-xs leading-snug text-right">اختر أي دورتين مغلقتين وقارن بينهما جنباً إلى جنب. تُبرز الواجهة اتجاه التغطية (تحسّن / تراجع)، والمواقع المتكررة في عدم التغطية، وتحولات أنماط الأسباب، والمحاور التي تحسّنت أو تراجعت بين الدورتين.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">بطاقة الأداء</Badge></div>
                      <p className="text-xs leading-snug text-right">مصفوفة أداء لكل محور عبر آخر N دورات. تُظهر منحنيات اتجاه التغطية ومتوسط الفجوات وأكثر أسباب غياب التغطية تكراراً ولون أداء إجمالي (أخضر / أصفر / أحمر). يستخدمها المديرون القُطريون لتحديد المحاور التي تحتاج تدخلاً.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-row-reverse"><Badge variant="secondary" className="text-[10px]">الدورات المغلقة</Badge></div>
                      <p className="text-xs leading-snug text-right">أرشيف دائم لكل دورة مغلقة بالكامل. يُظهر كل إدخال نسبة التغطية النهائية وإجمالي المواقع وتفصيل الأسباب ودرجات الجودة ومن وافق ومتى. يمكنك تصدير كل دورة كملف PDF أو Excel لتقارير المانحين.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Step-by-step cycle close ── */}
              <div className="border-t border-green-200/60 dark:border-green-800/60 pt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">How to Close a Cycle — Step by Step</h4>
                  <ol className="space-y-2 text-xs text-muted-foreground list-none">
                    {[
                      { n: 1, title: 'Go to Active Cycles tab', body: 'Find the MMP whose monitoring month has ended. Check the COMPLETED / UNCOVERED / OVERDUE counts are accurate. If numbers look wrong, click Refresh.' },
                      { n: 2, title: 'Click "Start Close"', body: 'The button appears on the MMP row (Admin / FOM only). The system auto-flags every site that is not in a terminal status (completed, approved, cancelled, not-covered). The MMP status changes to "Closing".' },
                      { n: 3, title: 'Assign reasons — Uncovered Sites tab', body: 'Every flagged site needs a reason. Click a site to assign individually, or tick multiple sites and use "Bulk Assign". Reasons are required before the site-visits gate can go green.' },
                      { n: 4, title: 'Open the Cycle Close panel', body: 'Click the MMP row or the "Close Cycle" button to open the slide-out panel. This shows the Readiness Checklist, Finance Reconciliation Review, and the Submit button.' },
                      { n: 5, title: 'Check the Readiness Checklist', body: 'Six gates must all be green (✓) before you can submit. A red (✗) means action is required now. An amber warning means the feature needs a database table created — see the guide below.' },
                      { n: 6, title: 'Resolve finance blocks', body: 'Red "cost submissions" gate → go to Finance → Cost Submissions, approve or reject all pending items for this cycle month. Red "transport advances" gate → go to Reconciliation Dashboard, mark the relevant advances as reconciled.' },
                      { n: 7, title: 'Finance Reconciliation Review', body: 'Below the checklist you see Total / Pending / Cleared counts for cost submissions. "Pending" items block closing — resolve them in Finance before returning here.' },
                      { n: 8, title: 'Submit for Approval', body: 'Once checklist score = 100%, the Submit button becomes active. Click it. A notification goes to the FOM and Country Director with a link to review.' },
                      { n: 9, title: 'FOM / Country Director Approves', body: 'They review the coverage report, quality scores, and finance summary on this same panel. They click Approve (optionally add a note) or Reject with a reason. Rejection sends the cycle back to you for corrections.' },
                      { n: 10, title: 'Cycle is Archived', body: 'Approved cycles move to the Closed Cycles tab with a permanent record. The MMP is unlocked for the next cycle. Export PDF or Excel for donor reports.' },
                    ].map(s => (
                      <li key={s.n} className="flex gap-2 items-start">
                        <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-green-600 dark:bg-green-500 text-white text-[10px] font-bold mt-0.5">{s.n}</span>
                        <span><strong className="text-foreground">{s.title}:</strong> {s.body}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {/* Arabic steps */}
                <div className="space-y-2" dir="rtl">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">كيفية إغلاق دورة — خطوة بخطوة</h4>
                  <ol className="space-y-2 text-xs text-muted-foreground list-none">
                    {[
                      { n: 1, title: 'انتقل إلى تبويب الدورات النشطة', body: 'ابحث عن خطة المراقبة الشهرية التي انتهى شهر مراقبتها. تحقق من دقة أعداد المواقع (مكتملة / غير مغطاة / متأخرة). إذا بدت الأرقام غير صحيحة، انقر "تحديث".' },
                      { n: 2, title: 'انقر "بدء الإغلاق"', body: 'تظهر الزر على صف خطة المراقبة (للمدير ومدير العمليات فقط). يحدد النظام تلقائياً كل موقع ليس في وضع نهائي (مكتمل، معتمد، ملغى، غير مغطى). يتغير وضع الخطة إلى "قيد الإغلاق".' },
                      { n: 3, title: 'تعيين الأسباب — تبويب المواقع غير المغطاة', body: 'كل موقع محدد يحتاج إلى سبب. انقر على موقع للتعيين الفردي، أو حدد مواقع متعددة واستخدم "التعيين الجماعي". الأسباب مطلوبة قبل أن يتحول بند المواقع إلى أخضر.' },
                      { n: 4, title: 'افتح لوحة إغلاق الدورة', body: 'انقر على صف خطة المراقبة أو زر "إغلاق الدورة" لفتح اللوحة الجانبية. تعرض هذه اللوحة قائمة الجاهزية ومراجعة التسوية المالية وزر التقديم.' },
                      { n: 5, title: 'تحقق من قائمة جاهزية الإغلاق', body: 'ستة بنود يجب أن تكون خضراء (✓) قبل التقديم. الأحمر (✗) يعني إجراءً مطلوباً الآن. التحذير الأصفر يعني أن الميزة تحتاج إنشاء جدول في قاعدة البيانات — راجع الدليل أدناه.' },
                      { n: 6, title: 'حسم إشكاليات المالية', body: 'بند "تقديمات التكلفة" أحمر → اذهب إلى المالية → تقديمات التكاليف، اعتمد أو ارفض جميع البنود المعلقة لشهر الدورة. بند "السلف المالية" أحمر → اذهب إلى لوحة التسوية وحدّد السلف ذات الصلة كمسوّاة.' },
                      { n: 7, title: 'مراجعة التسوية المالية', body: 'أسفل القائمة ترى أعداد الإجمالي / المعلق / المسوّى لتقديمات التكاليف. البنود "المعلقة" تمنع الإغلاق — حسمها في المالية قبل العودة هنا.' },
                      { n: 8, title: 'تقديم للموافقة', body: 'حين تبلغ نسبة القائمة 100%، يصبح زر التقديم نشطاً. انقر عليه. يُرسَل إشعار إلى مدير العمليات الميدانية والمدير القُطري مع رابط المراجعة.' },
                      { n: 9, title: 'موافقة مدير العمليات / المدير القُطري', body: 'يراجعون تقرير التغطية ودرجات الجودة والملخص المالي في نفس اللوحة. ينقرون موافقة (مع ملاحظة اختيارية) أو رفض مع سبب. الرفض يُعيد الدورة إليك للتصحيح.' },
                      { n: 10, title: 'أرشفة الدورة', body: 'تنتقل الدورات المعتمدة إلى تبويب الدورات المغلقة مع سجل دائم. يُفتح خطة المراقبة للدورة التالية. صدّر PDF أو Excel لتقارير المانحين.' },
                    ].map(s => (
                      <li key={s.n} className="flex gap-2 items-start flex-row-reverse">
                        <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-green-600 dark:bg-green-500 text-white text-[10px] font-bold mt-0.5">{s.n}</span>
                        <span className="text-right"><strong className="text-foreground">{s.title}:</strong> {s.body}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* ── Section 3: Readiness Checklist gates explained ── */}
              <div className="border-t border-green-200/60 dark:border-green-800/60 pt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Readiness Checklist — What Each Gate Means</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {[
                      { gate: 'All site visits resolved', meaning: 'Every entry in the MMP must be in a terminal status: Completed, Approved, Cancelled, or Not Covered (with a reason). Sites still in Draft / Assigned / In Progress / Submitted / Overdue block this gate.' },
                      { gate: 'No pending cost submissions', meaning: 'All operational cost submissions whose expense date falls in this cycle\'s month must be approved or rejected by both finance tiers. Go to Finance → Cost Submissions, filter by month, and resolve each pending item.' },
                      { gate: 'All transport advances reconciled', meaning: 'Every down-payment advance linked to a site visit in this MMP that has been approved or paid must be marked as reconciled (receipts matched). Go to Reconciliation Dashboard to complete this.' },
                      { gate: 'All withdrawal requests processed', meaning: 'All cash withdrawal requests tied to this MMP must reach a terminal status (approved, rejected, completed, or paid). This gate requires the withdrawal_requests database table — run supabase/withdrawal_requests_migration.sql if it shows amber "(not configured)".' },
                      { gate: 'All not-covered cost recoveries addressed', meaning: 'If any not-covered site received an advance payment, you must decide: Roll to Next MMP, Return Required, or Write-Off. Sites with an advance but no recovery decision block this gate. Go to the Exceptions tab to resolve.' },
                      { gate: 'WFP confirmation file applied', meaning: 'If any site visit is in "Submitted" status, you must upload the WFP-cleaned Excel file and apply it. This confirms or rejects each submitted visit per WFP records. Go to the WFP tab inside the Cycle Close panel.' },
                    ].map(g => (
                      <div key={g.gate}>
                        <p className="font-medium text-foreground">{g.gate}</p>
                        <p className="leading-snug">{g.meaning}</p>
                      </div>
                    ))}
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 mt-1">
                      <p className="font-medium text-amber-800 dark:text-amber-300">Amber "(not configured)" warning</p>
                      <p className="text-amber-700 dark:text-amber-400">Means the database table for that gate has not been created yet. The gate is inactive — it will not block closing. To activate it, run the corresponding SQL migration file from the <code className="font-mono">supabase/</code> folder in your Supabase SQL Editor. Currently: <code className="font-mono">withdrawal_requests_migration.sql</code>.</p>
                    </div>
                  </div>
                </div>
                {/* Arabic */}
                <div className="space-y-2" dir="rtl">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">قائمة الجاهزية — معنى كل بند</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {[
                      { gate: 'تسوية جميع زيارات المواقع', meaning: 'يجب أن يكون كل إدخال في خطة المراقبة في وضع نهائي: مكتمل، معتمد، ملغى، أو غير مغطى (مع سبب). المواقع في وضع مسودة / مُعيَّن / قيد التنفيذ / مُقدَّم / متأخر تمنع هذا البند.' },
                      { gate: 'لا توجد تقديمات تكلفة معلقة', meaning: 'جميع تقديمات التكاليف التشغيلية التي يقع تاريخ نفقتها في شهر هذه الدورة يجب أن تكون معتمدة أو مرفوضة من كلا المستويين الماليين. اذهب إلى المالية → تقديمات التكاليف، صفّي حسب الشهر وحسم كل بند معلق.' },
                      { gate: 'تسوية جميع سلف المواصلات', meaning: 'كل سلفة دفع مسبق مرتبطة بزيارة موقع في هذه الخطة وتمت الموافقة عليها أو صرفها يجب تحديدها كمسوّاة (مطابقة الإيصالات). اذهب إلى لوحة التسوية لإتمام ذلك.' },
                      { gate: 'معالجة جميع طلبات السحب', meaning: 'يجب أن تصل جميع طلبات سحب النقد المرتبطة بهذه الخطة إلى وضع نهائي (معتمد، مرفوض، مكتمل، أو مدفوع). هذا البند يتطلب جدول withdrawal_requests في قاعدة البيانات — قم بتشغيل withdrawal_requests_migration.sql إذا ظهر تحذير أصفر "(غير مُهيَّأ)".' },
                      { gate: 'معالجة جميع استردادات تكاليف المواقع غير المغطاة', meaning: 'إذا تلقّى أي موقع غير مغطى دفعة سلفة، يجب اتخاذ قرار: ترحيل إلى الخطة التالية، أو استرداد مطلوب، أو شطب. المواقع التي لديها سلفة بلا قرار استرداد تمنع هذا البند. اذهب إلى تبويب الاستثناءات للحل.' },
                      { gate: 'تطبيق ملف تأكيد WFP', meaning: 'إذا كان أي موقع في وضع "مُقدَّم"، يجب تحميل ملف Excel المُنقَّح من WFP وتطبيقه. يؤكد ذلك أو يرفض كل زيارة مُقدَّمة وفق سجلات WFP. اذهب إلى تبويب WFP داخل لوحة إغلاق الدورة.' },
                    ].map(g => (
                      <div key={g.gate}>
                        <p className="font-medium text-foreground text-right">{g.gate}</p>
                        <p className="leading-snug text-right">{g.meaning}</p>
                      </div>
                    ))}
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 mt-1">
                      <p className="font-medium text-amber-800 dark:text-amber-300 text-right">تحذير أصفر "(غير مُهيَّأ)"</p>
                      <p className="text-amber-700 dark:text-amber-400 text-right">يعني أن جدول قاعدة البيانات الخاص بهذا البند لم يُنشَأ بعد. البند غير نشط ولن يمنع الإغلاق. لتفعيله، شغّل ملف الترحيل SQL المقابل من مجلد <code className="font-mono">supabase/</code> في محرر SQL لـ Supabase. حالياً: <code className="font-mono">withdrawal_requests_migration.sql</code>.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 4: Finance Reconciliation Review ── */}
              <div className="border-t border-green-200/60 dark:border-green-800/60 pt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Finance Reconciliation Review Card</h4>
                  <p className="text-xs text-muted-foreground leading-snug">Shown below the checklist, this card gives a real-time finance snapshot for the cycle. <strong className="text-foreground">Total</strong> = all cost submissions for the cycle month. <strong className="text-foreground">Pending</strong> = items still awaiting tier-1 or tier-2 approval (these block closing). <strong className="text-foreground">Cleared</strong> = fully approved or rejected submissions. Click <em>Open Reconciliation Dashboard</em> to go directly to the finance tool and clear pending items.</p>
                </div>
                <div className="space-y-1.5" dir="rtl">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">بطاقة مراجعة التسوية المالية</h4>
                  <p className="text-xs text-muted-foreground leading-snug text-right">تظهر أسفل القائمة وتعرض لقطة مالية فورية للدورة. <strong className="text-foreground">الإجمالي</strong> = جميع تقديمات التكاليف لشهر الدورة. <strong className="text-foreground">المعلق</strong> = البنود التي لا تزال تنتظر اعتماد المستوى الأول أو الثاني (تمنع الإغلاق). <strong className="text-foreground">المسوّى</strong> = التقديمات المعتمدة أو المرفوضة بالكامل. انقر على <em>فتح لوحة التسوية</em> للانتقال مباشرةً إلى أداة المالية وحسم البنود المعلقة.</p>
                </div>
              </div>

            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {overallSummary.totalMmps > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="summary-dashboard">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-blue-500/10 shrink-0">
                  <Layers className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Active MMPs</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-mmps">{overallSummary.totalMmps}</div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {overallSummary.activeCount > 0 && <Badge variant="secondary" data-testid="badge-active-count">{overallSummary.activeCount} Active</Badge>}
                {overallSummary.closingCount > 0 && <Badge variant="destructive" data-testid="badge-closing-count">{overallSummary.closingCount} Closing</Badge>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-emerald-500/10 shrink-0">
                  <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Coverage</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-overall-coverage">{overallSummary.overallCoverage}%</div>
              <Progress value={overallSummary.overallCoverage} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-green-500/10 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Completed</div>
              </div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-completed-total">{overallSummary.completedSites}</div>
              <div className="text-xs text-muted-foreground mt-0.5">of {overallSummary.totalSites} sites</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-red-500/10 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Uncovered</div>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-uncovered-total">{overallSummary.totalUncovered}</div>
              {overallSummary.totalUncovered > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">{overallSummary.totalReasoned} reasoned</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-amber-500/10 shrink-0">
                  <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Reasons</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-reason-completion">{overallSummary.reasonCompletion}%</div>
              {overallSummary.totalUncovered > 0 && (
                <Progress value={overallSummary.reasonCompletion} className="h-1 mt-1.5" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              {overallSummary.overdueCount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-destructive/10 shrink-0">
                      <Clock className="h-3.5 w-3.5 text-destructive" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Overdue</div>
                  </div>
                  <div className="text-2xl font-bold text-destructive" data-testid="text-overdue-count">{overallSummary.overdueCount}</div>
                </>
              ) : overallSummary.pendingApprovalCount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-purple-500/10 shrink-0">
                      <Shield className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Approval</div>
                  </div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-pending-approval">{overallSummary.pendingApprovalCount}</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-green-500/10 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Overdue</div>
                  </div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-on-track">0</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-cycle-close" className="flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="active" data-testid="tab-active" className="gap-1.5 px-3 py-2">
            <Activity className="h-3.5 w-3.5" />
            <span>Active Cycles</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">الدورات النشطة</span>
          </TabsTrigger>
          <TabsTrigger value="uncovered" data-testid="tab-uncovered" className="gap-1.5 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Uncovered Sites</span>
            {cycleStats.uncoveredSites > 0 && <Badge variant="destructive" className="ml-0.5 text-[10px] px-1.5 py-0">{cycleStats.uncoveredSites}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports" className="gap-1.5 px-3 py-2">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Reports</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">التقارير</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison" className="gap-1.5 px-3 py-2">
            <Layers className="h-3.5 w-3.5" />
            <span>Comparison</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">المقارنة</span>
          </TabsTrigger>
          <TabsTrigger value="scorecard" data-testid="tab-scorecard" className="gap-1.5 px-3 py-2">
            <Star className="h-3.5 w-3.5" />
            <span>Scorecard</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">بطاقة الاداء</span>
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions" className="gap-1.5 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>Exceptions</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">الاستثناءات</span>
            {notCoveredAdvanceSites.filter(s => !s.recovery_decision).length > 0 && (
              <Badge variant="destructive" className="ml-0.5 text-[10px] px-1.5 py-0">
                {notCoveredAdvanceSites.filter(s => !s.recovery_decision).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="wfp" data-testid="tab-wfp" className="gap-1.5 px-3 py-2">
            <Shield className="h-3.5 w-3.5 text-blue-500" />
            <span>WFP Confirmation</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">تأكيد WFP</span>
            {wfpAppliedUpload && (
              <Badge className="ml-0.5 text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700">Applied</Badge>
            )}
            {!wfpAppliedUpload && wfpSummary && wfpSummary.pendingReview > 0 && (
              <Badge variant="destructive" className="ml-0.5 text-[10px] px-1.5 py-0">{wfpSummary.pendingReview}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="adhoc" data-testid="tab-adhoc" className="gap-1.5 px-3 py-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            <span>Ad-hoc Visits</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">الزيارات الطارئة</span>
          </TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive" className="gap-1.5 px-3 py-2">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Closed Cycles</span>
            {closedCycles.length > 0 && <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0">{closedCycles.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeMmps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex items-center justify-center h-16 w-16 mx-auto bg-muted rounded-full mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No Active MMP Cycles</h3>
                <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
                  All MMP cycles have been closed or there are no approved MMPs available for cycle management.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card data-testid="active-filters">
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                      <Select value={activeHubFilter} onValueChange={setActiveHubFilter}>
                        <SelectTrigger className="w-[180px]" data-testid="select-active-hub-filter">
                          <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <SelectValue placeholder="All Hubs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Hubs</SelectItem>
                          {activeHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={activeSort} onValueChange={v => setActiveSort(v as any)}>
                        <SelectTrigger className="w-[160px]" data-testid="select-active-sort">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status">Sort by Status</SelectItem>
                          <SelectItem value="name">Sort by Name</SelectItem>
                          <SelectItem value="coverage">Sort by Coverage</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActiveSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        data-testid="button-sort-direction"
                      >
                        {activeSortDir === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {canManageCycle && (
                        <Button variant="outline" size="sm" onClick={handleScheduleReminders} data-testid="button-schedule-reminders">
                          <Bell className="h-3.5 w-3.5 mr-1.5" /> Reminders
                        </Button>
                      )}
                      <Badge variant="secondary" data-testid="badge-showing-count">
                        {filteredActiveMmps.length} of {activeMmps.length} MMPs
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pre-Close Checklist Dialog — opens when user clicks Close on an MMP card */}
              <Dialog
                open={!!checklistMmpId}
                onOpenChange={(open) => {
                  if (!open) { setChecklistMmpId(null); setPendingScopedClose(null); setReconciliationAcknowledged(false); }
                }}
              >
                <DialogContent className="max-w-none w-screen h-screen m-0 rounded-none flex flex-col overflow-hidden p-0" data-testid="section-cycle-close-checklist">
                  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                      Pre-Close Checklist
                    </DialogTitle>
                    <DialogDescription>
                      {mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'} — review all requirements before starting the close process
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="max-w-2xl mx-auto space-y-3">
                    {/* Next-step guide card */}
                    {!cycleReadiness.loading && nextBlocker && (
                      <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3" data-testid="banner-next-step">
                        <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Next step to unblock</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{nextBlocker.label}</p>
                        </div>
                        {nextBlocker.link && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-xs border-amber-500/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950"
                            onClick={() => {
                              setChecklistMmpId(null);
                              setPendingScopedClose(null);
                              setReconciliationAcknowledged(false);
                              if (nextBlocker.link!.startsWith('/mmp/cycle-close')) {
                                const url = new URL(nextBlocker.link!, window.location.origin);
                                const tab = url.searchParams.get('tab');
                                if (tab) setActiveTab(tab);
                              } else {
                                const activeMmpName = checklistMmpId ? (mmpFiles?.find(m => m.id === checklistMmpId)?.name || '') : '';
                                let dest = nextBlocker.link!;
                                if (dest === '/finance' && checklistMmpId) {
                                  dest = `/finance?mmpId=${checklistMmpId}&mmpName=${encodeURIComponent(activeMmpName)}`;
                                }
                                navigate(dest);
                              }
                            }}
                            data-testid="button-next-step-resolve"
                          >
                            Resolve <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    )}

                    {!cycleReadiness.loading && cycleReadiness.allPassed && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-400/40 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-800 dark:text-green-200" data-testid="banner-all-clear">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                        All requirements met — you can proceed to close this cycle.
                      </div>
                    )}

                    <CloseReadinessChecklist
                      title="Cycle Close Readiness"
                      items={cycleReadiness.items}
                      score={cycleReadiness.score}
                      allPassed={cycleReadiness.allPassed}
                      loading={cycleReadiness.loading}
                      isSuperAdmin={isSuperAdmin}
                      onOverride={(justification) => handleCycleCloseOverride(checklistMmpId, justification)}
                      overrideLabel="Override & Start Closing"
                    />
                    <ReconciliationSummary
                      mmpId={checklistMmpId ?? undefined}
                      mmpContextLabel={mmpFiles?.find(m => m.id === checklistMmpId)?.name}
                    />
                    {cycleReadiness.allPassed && !cycleReadiness.loading && (
                      <div className="space-y-3 pt-1">
                        <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20 p-3" data-testid="label-reconciliation-ack">
                          <input
                            type="checkbox"
                            checked={reconciliationAcknowledged}
                            onChange={e => setReconciliationAcknowledged(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0"
                            data-testid="checkbox-reconciliation-ack"
                          />
                          <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">
                            I have reviewed the reconciliation summary above and confirm that all financial obligations for this cycle are accounted for.
                          </span>
                        </label>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setChecklistMmpId(null); setPendingScopedClose(null); setReconciliationAcknowledged(false); }}
                            data-testid="button-cancel-close-gate"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              const mmpId = checklistMmpId!;
                              const pending = pendingScopedClose;
                              setChecklistMmpId(null);
                              setPendingScopedClose(null);
                              setReconciliationAcknowledged(false);
                              if (pending) {
                                executeScopedClose(mmpId, pending.scope, pending.scopeValue);
                              } else {
                                handleStartClosingCycle(mmpId);
                              }
                            }}
                            disabled={closingCycle || !reconciliationAcknowledged}
                            data-testid="button-proceed-close-cycle"
                          >
                            {pendingScopedClose ? `Proceed to Close (${pendingScopedClose.scope})` : 'Proceed to Close Cycle'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="grid gap-4">
                {filteredActiveMmps.map(mmp => {
                  const cycleStatus = (mmp as any).cycle_status || 'active';
                  const mmpUncovered = uncoveredSites.filter(s => s.mmp_id === mmp.id);

                  return (
                    <div key={mmp.id} className="space-y-0">
                      <CycleMMPCard
                        mmp={mmp}
                        uncoveredSites={mmpUncovered}
                        cycleStatus={cycleStatus}
                        canManageCycle={canManageCycle}
                        isFOM={isFOM}
                        isAdmin={isAdmin}
                        closingCycle={closingCycle}
                        finalizingCycle={finalizingCycle}
                        siteVisitCounts={siteVisitCounts[mmp.id]}
                        scopeOptions={mmpScopeOptions[mmp.id]}
                        handleStartClosingCycle={(mmpId) => {
                          if (cycleStatus === 'active' && canManageCycle) {
                            setChecklistMmpId(mmpId);
                          } else {
                            handleStartClosingCycle(mmpId);
                          }
                        }}
                        handleScopedClose={handleScopedClose}
                        handleFinalizeCycleClose={handleFinalizeCycleClose}
                        handleApproveCycle={handleApproveCycle}
                        handleRejectCycle={handleRejectCycle}
                        handleSendReminders={handleSendReminders}
                        setSelectedMmpId={setSelectedMmpId}
                        setActiveTab={setActiveTab}
                        getReasonLabel={getReasonLabel}
                      />
                      <MmpPredictionPanel mmp={mmp} counts={siteVisitCounts[mmp.id]} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {hubProgressData.length > 1 && (
            <Card data-testid="card-hub-progress">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Hub Coverage Progress
                </CardTitle>
                <CardDescription>Coverage breakdown by hub across all active MMPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hubProgressData.map(h => (
                    <div key={h.hub} className="space-y-1" data-testid={`hub-progress-${h.hub}`}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{h.hub}</span>
                          <Badge variant="outline" className="shrink-0">{h.mmpCount} MMPs</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <span>{h.completed}/{h.total} sites</span>
                          <span className="font-semibold text-foreground">{h.coverage}%</span>
                        </div>
                      </div>
                      <Progress value={h.coverage} className="h-1.5" />
                      {h.uncovered > 0 && (
                        <div className="flex gap-3 text-xs text-muted-foreground pl-1">
                          <span>{h.uncovered} uncovered</span>
                          <span>{h.reasoned} reasoned</span>
                          <span>{h.uncovered - h.reasoned} pending</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <CycleCoveragePredictor activeMmps={activeMmps} siteVisitCounts={siteVisitCounts} />
        </TabsContent>

        <TabsContent value="uncovered" className="space-y-4">
          {checklistMmpId && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-300/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-xs" data-testid="banner-cycle-context-uncovered">
              <ArrowLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-blue-800 dark:text-blue-200">
                Closing: <strong>{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</strong> — sites filtered to this cycle.
              </span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-700 dark:text-blue-300 ml-auto" onClick={() => setActiveTab('active')} data-testid="button-back-to-checklist">
                ← Back to checklist
              </Button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by site name, code, state..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-sites"
              />
            </div>
            <Select value={selectedMmpId} onValueChange={setSelectedMmpId}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-mmp">
                <SelectValue placeholder="All MMPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MMPs</SelectItem>
                {uncoveredMmpOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterHub} onValueChange={setFilterHub}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-hub">
                <SelectValue placeholder="All Hubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hubs</SelectItem>
                {hubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-reason">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending Reason</SelectItem>
                <SelectItem value="assigned">Reason Assigned</SelectItem>
                {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
              </SelectContent>
            </Select>
            {canAssignReasons && filterHub !== 'all' && (
              <Button size="sm" variant="outline" onClick={() => {
                const hubSites = filteredSites.filter(s => !s.not_covered_reason).map(s => s.id);
                setSelectedSites(new Set(hubSites));
              }} data-testid="button-select-hub-pending">
                Select All Pending in {filterHub}
              </Button>
            )}
          </div>

          {filteredSites.length !== uncoveredSites.length && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
              <span data-testid="text-filter-count">Showing {filteredSites.length} of {uncoveredSites.length} uncovered sites</span>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedMmpId('all'); setFilterHub('all'); setFilterReason('all'); setSearchQuery(''); }} data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          )}

          {canAssignReasons && selectedSites.size > 0 && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800" data-testid="card-bulk-assign">
              <CardContent className="py-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {selectedSites.size} site(s) selected
                  </span>
                  <Select value={bulkReason} onValueChange={v => setBulkReason(v as NotCoveredReason)}>
                    <SelectTrigger className="w-[250px]" data-testid="select-bulk-reason">
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
                    </SelectContent>
                  </Select>
                  {bulkReason === 'other' && (
                    <Textarea
                      placeholder="Specify reason..."
                      value={bulkOtherText}
                      onChange={e => setBulkOtherText(e.target.value)}
                      className="w-[250px] h-8 min-h-[32px]"
                      data-testid="input-bulk-other-reason"
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={handleBulkAssignReason}
                    disabled={!bulkReason || saving || (bulkReason === 'other' && !bulkOtherText.trim())}
                    data-testid="button-bulk-assign"
                  >
                    Assign to All
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Loading uncovered sites...</CardContent>
            </Card>
          ) : filteredSites.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium">
                  {uncoveredSites.length === 0 ? 'No Uncovered Sites' : 'No matching sites'}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {uncoveredSites.length === 0 ? 'All sites have been covered or no cycle is in closing phase.' : 'Try adjusting your filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center px-3 py-2 bg-muted rounded-t-lg text-xs font-medium text-muted-foreground">
                <div className="w-8">
                  <Checkbox
                    checked={filteredSites.length > 0 && filteredSites.every(s => selectedSites.has(s.id))}
                    onCheckedChange={toggleAllFiltered}
                    data-testid="checkbox-select-all"
                  />
                </div>
                <div className="flex-1 grid grid-cols-6 gap-2">
                  <span className="col-span-2">Site</span>
                  <span>State</span>
                  <span>Hub</span>
                  <span>Status</span>
                  <span>Reason</span>
                </div>
              </div>
              {filteredSites.map(site => (
                <SiteRow
                  key={site.id}
                  site={site}
                  selected={selectedSites.has(site.id)}
                  onToggle={() => toggleSiteSelection(site.id)}
                  onAssignReason={handleAssignReason}
                  canAssign={canAssignReasons}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <CycleReportsTab
            reasonBreakdown={reasonBreakdown}
            hubBreakdown={hubBreakdown}
            cycleStats={cycleStats}
            followUps={followUps}
            qualityData={qualityData}
            uncoveredSitesCount={uncoveredSites.length}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <CycleComparisonTab
            closedCycles={closedCycles}
            comparisonCycle1={comparisonCycle1}
            comparisonCycle2={comparisonCycle2}
            setComparisonCycle1={setComparisonCycle1}
            setComparisonCycle2={setComparisonCycle2}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        <TabsContent value="scorecard" className="space-y-4">
          <CycleScorecardTab
            closedCycles={closedCycles}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        {/* ── EXCEPTIONS TAB — Section B: Not-Covered Cost Resolutions (Phase B) ── */}
        <TabsContent value="exceptions" className="space-y-4">
          {!checklistMmpId ? (
            <Card>
              <CardContent className="py-10 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-amber-400 mb-4" />
                <h3 className="text-lg font-medium mb-1">Select a Cycle</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Choose an active MMP to review its cost-recovery exceptions.
                </p>
                {activeMmps.length > 0 ? (
                  <div className="max-w-xs mx-auto">
                    <Select onValueChange={(val) => setChecklistMmpId(val)}>
                      <SelectTrigger data-testid="select-exceptions-mmp">
                        <SelectValue placeholder="Select MMP…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeMmps.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">No active MMP cycles found.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Section header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Section B — Not-Covered Cost Resolutions
                    <span dir="rtl" className="text-xs text-muted-foreground font-normal">استرداد تكاليف المواقع غير المشمولة</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Not-covered sites that received an advance payment must be resolved before the cycle can close.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadExceptionsData(checklistMmpId)}
                  disabled={loadingExceptions}
                  data-testid="button-refresh-exceptions"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingExceptions ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Pre-allocations rolled INTO this MMP from a prior cycle */}
              <RolledAllocationsPanel mmpId={checklistMmpId} />

              {/* KPI summary cards */}
              {!loadingExceptions && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Sites with Advances',
                      labelAr: 'مواقع مدفوعة',
                      value: notCoveredAdvanceSites.length,
                      color: 'text-foreground',
                      testId: 'kpi-exceptions-total',
                    },
                    {
                      label: 'Pending Decision',
                      labelAr: 'بانتظار القرار',
                      value: notCoveredAdvanceSites.filter(s => !s.recovery_decision).length,
                      color: 'text-amber-600 dark:text-amber-400',
                      testId: 'kpi-exceptions-pending',
                    },
                    {
                      label: 'Resolved',
                      labelAr: 'محسومة',
                      value: notCoveredAdvanceSites.filter(s => Boolean(s.recovery_decision)).length,
                      color: 'text-green-600 dark:text-green-400',
                      testId: 'kpi-exceptions-resolved',
                    },
                    {
                      label: 'Total at Risk (SDG)',
                      labelAr: 'المجموع المعرض للخطر',
                      value: notCoveredAdvanceSites
                        .filter(s => !s.recovery_decision)
                        .reduce((sum, s) => sum + s.total_approved_advance, 0)
                        .toLocaleString(),
                      color: 'text-red-600 dark:text-red-400',
                      testId: 'kpi-exceptions-amount',
                    },
                  ].map(kpi => (
                    <Card key={kpi.label} className="p-3" data-testid={kpi.testId}>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p dir="rtl" className="text-[10px] text-muted-foreground/70">{kpi.labelAr}</p>
                      <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                    </Card>
                  ))}
                </div>
              )}

              {/* Site list */}
              {loadingExceptions ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading exceptions…</span>
                </div>
              ) : notCoveredAdvanceSites.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-3" />
                    <h3 className="text-base font-medium">No Pending Cost Recoveries</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      All not-covered sites either had no approved advances or have already been resolved.
                    </p>
                    <p dir="rtl" className="text-muted-foreground text-xs mt-1">لا توجد مواقع غير مشمولة تحتاج إلى قرار استرداد.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {notCoveredAdvanceSites.map(site => {
                    const isPending = !site.recovery_decision;
                    const decisionBadge = site.recovery_decision
                      ? RECOVERY_DECISION_CONFIG[site.recovery_decision] || { label: site.recovery_decision, color: 'bg-muted text-muted-foreground', labelAr: '' }
                      : null;

                    return (
                      <Card key={site.id} className={isPending ? 'border-amber-200 dark:border-amber-800' : ''} data-testid={`row-exception-${site.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{site.site_name}</span>
                                {site.site_code && <span className="text-xs text-muted-foreground">{site.site_code}</span>}
                                {site.state && <Badge variant="outline" className="text-xs">{site.state}</Badge>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                {site.enumerator_name && <span>Enumerator: {site.enumerator_name}</span>}
                                <span className="font-medium text-foreground">
                                  Advance: {site.total_approved_advance.toLocaleString()} SDG
                                </span>
                                {site.advance_count > 1 && <span>({site.advance_count} payments)</span>}
                              </div>
                              {site.recovery_decision === 'return_required' && site.repayment_status && (
                                <div className="mt-1">
                                  <Badge
                                    variant="outline"
                                    className={site.repayment_status === 'settled' ? 'text-green-600 border-green-300' : 'text-amber-600 border-amber-300'}
                                  >
                                    Repayment: {site.repayment_status}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {decisionBadge ? (
                                <Badge className={decisionBadge.color} data-testid={`badge-decision-${site.id}`}>
                                  {decisionBadge.label}
                                  <span dir="rtl" className="ml-1 text-[10px] opacity-70">{decisionBadge.labelAr}</span>
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs" data-testid={`badge-pending-${site.id}`}>
                                  Needs Decision
                                  <span dir="rtl" className="ml-1 text-[10px] opacity-80">يحتاج قرار</span>
                                </Badge>
                              )}
                              {canManageCycle && (
                                <Button
                                  size="sm"
                                  variant={isPending ? 'default' : 'outline'}
                                  onClick={() => {
                                    setCostRecoveryDialogState({
                                      site: {
                                        id: site.id,
                                        site_name: site.site_name,
                                        site_code: site.site_code,
                                        state: site.state,
                                        mmp_id: site.mmp_id,
                                        mmp_name: site.mmp_name,
                                        enumerator_id: site.enumerator_id,
                                        enumerator_name: site.enumerator_name,
                                        supervisor_id: site.supervisor_id,
                                      },
                                      advanceId: null,
                                      amount: site.total_approved_advance,
                                    });
                                  }}
                                  data-testid={`button-resolve-${site.id}`}
                                >
                                  {isPending ? 'Resolve' : 'Change Decision'}
                                  <span dir="rtl" className="mr-1 text-[10px] opacity-70">{isPending ? 'حسم' : 'تغيير القرار'}</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Money Trail for the whole MMP */}
              {showMoneyTrailMmpId && canManageCycle && (
                <MoneyTrailPanel
                  mode="mmp"
                  mmpId={showMoneyTrailMmpId}
                  title="MMP Money Trail"
                  maxRows={10}
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* ── WFP CONFIRMATION TAB (Phase C) ── */}
        <TabsContent value="wfp" className="space-y-4">
          {!checklistMmpId ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Select an MMP</h3>
                <p className="text-sm text-muted-foreground mb-4">Choose an active MMP to upload and review WFP confirmation data.</p>
                {activeMmps.length > 0 ? (
                  <div className="max-w-xs mx-auto">
                    <Select onValueChange={(val) => setChecklistMmpId(val)}>
                      <SelectTrigger data-testid="select-wfp-mmp">
                        <SelectValue placeholder="Select MMP…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeMmps.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">No active MMP cycles found.</p>
                )}
              </CardContent>
            </Card>
          ) : loadingWFP ? (
            <Card>
              <CardContent className="py-12 flex justify-center items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Loading WFP data…</span>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Already Applied banner */}
              {wfpAppliedUpload && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">WFP Results Applied</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                      {wfpAppliedUpload.filename} · Applied {new Date(wfpAppliedUpload.applied_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {wfpResults.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const XLSX = await import('xlsx');
                          const rows = wfpResults.map(r => ({
                            'WFP Site Name':   r.wfp_site_name || '',
                            'PACT Site Name':  r.matched_site?.site_name || '',
                            'WFP State':       r.wfp_state || '',
                            'WFP Locality':    r.wfp_locality || '',
                            'WFP Partner':     r.wfp_partner || '',
                            'WFP Activity':    r.wfp_activity || '',
                            'Match Tier':      r.match_tier,
                            'Match Score':     r.match_score != null ? `${Math.round(r.match_score * 100)}%` : '',
                            'Outcome':         r.outcome,
                            'Notes':           r.match_notes || '',
                          }));
                          const wb = XLSX.utils.book_new();
                          const ws = XLSX.utils.json_to_sheet(rows);
                          ws['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
                          XLSX.utils.book_append_sheet(wb, ws, 'WFP Results');
                          const confirmed = wfpResults.filter(r => r.outcome === 'confirmed').length;
                          const rejected  = wfpResults.filter(r => r.outcome === 'rejected').length;
                          const none      = wfpResults.filter(r => r.match_tier === 'none').length;
                          const summary   = XLSX.utils.aoa_to_sheet([
                            ['WFP Match Results Summary'],
                            ['File', wfpAppliedUpload.filename],
                            ['Applied', new Date(wfpAppliedUpload.applied_at).toLocaleString()],
                            ['Total Rows', wfpResults.length],
                            ['Confirmed', confirmed],
                            ['Rejected', rejected],
                            ['No Match (WFP rows)', none],
                          ]);
                          XLSX.utils.book_append_sheet(wb, summary, 'Summary');
                          XLSX.writeFile(wb, `wfp-results-${checklistMmpId?.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.xlsx`);
                        }}
                        data-testid="button-wfp-export-results"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export Report
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => {
                      setWfpAppliedUpload(null);
                      setWfpResults([]);
                      setWfpSummary(null);
                      setWfpUploadId(null);
                      setWfpFilename(null);
                    }} data-testid="button-wfp-reupload">
                      Re-upload
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload zone (hidden after applied) */}
              {!wfpAppliedUpload && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      Upload WFP Cleaned Excel
                      <span dir="rtl" className="text-xs font-normal text-muted-foreground">رفع ملف WFP</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Upload the WFP monthly monitoring confirmation file. Column headers are automatically recognised across any WFP format variant.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WFPUploadZone
                      disabled={wfpSaving}
                      onFileParsed={(rows, filename) => handleWFPFileParsed(rows, filename, checklistMmpId)}
                    />
                    {wfpSaving && (
                      <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Matching {wfpFilename || 'file'} against MMP sites…
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Summary KPI cards */}
              {wfpSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total WFP Rows', labelAr: 'إجمالي الصفوف', value: wfpSummary.total, color: 'text-foreground', bg: 'bg-muted/40' },
                    { label: 'Auto-Confirmed', labelAr: 'مؤكد تلقائياً', value: wfpSummary.strong, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                    { label: 'Need Review', labelAr: 'يحتاج مراجعة', value: wfpSummary.pendingReview, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
                    { label: 'No Match', labelAr: 'لا تطابق', value: wfpSummary.none, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
                  ].map(card => (
                    <Card key={card.label} className={`${card.bg} border-0 shadow-none`}>
                      <CardContent className="pt-4 pb-3 px-4">
                        <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                        <p className="text-xs font-medium mt-0.5">{card.label}</p>
                        <p dir="rtl" className="text-[10px] text-muted-foreground">{card.labelAr}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Bulk actions — evidence requests for unconfirmed sites (pre-apply) */}
              {wfpResults.length > 0 && !wfpAppliedUpload && (
                <WFPBulkActions
                  results={wfpResults}
                  mmpId={checklistMmpId}
                  mmpName={activeMmps.find(m => m.id === checklistMmpId)?.name || null}
                />
              )}

              {/* Match review table */}
              {wfpResults.length > 0 && !wfpAppliedUpload && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base">Review Matches</CardTitle>
                      <div className="flex gap-2 items-center">
                        {wfpSummary && wfpSummary.pendingReview > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {wfpSummary.pendingReview} pending decisions
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          disabled={wfpApplying || (wfpSummary?.pendingReview ?? 0) > 0}
                          onClick={() => handleWFPApply(checklistMmpId)}
                          data-testid="button-wfp-apply"
                        >
                          {wfpApplying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                          Apply Results
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="text-xs">
                      Strong matches are auto-confirmed. Review weak and fuzzy matches manually before applying.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WFPMatchReviewTable
                      results={wfpResults}
                      onChange={updated => {
                        setWfpResults(updated);
                        setWfpSummary(summarise(updated));
                      }}
                      disabled={wfpApplying}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="adhoc" className="space-y-4">
          <AdhocSiteVisitsTab canManage={isAdmin || isFOM || hasAnyRole(['Coordinator', 'coordinator'])} />
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          {closedCycles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Closed Cycles</h3>
                <p className="text-muted-foreground text-sm mt-1">Closed MMP cycles will appear here for historical review.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {closedCycles.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search closed cycles by name or region..."
                    value={archiveSearch}
                    onChange={e => setArchiveSearch(e.target.value)}
                    className="pl-9 max-w-sm"
                    data-testid="input-search-archive"
                  />
                </div>
              )}
              <div className="space-y-3">
                {filteredClosedCycles.map(cycle => {
                  const coverageRate = cycle.totalSites > 0 ? Math.round((cycle.completedSites / cycle.totalSites) * 100) : 0;
                  return (
                    <Card key={cycle.id} data-testid={`card-closed-cycle-${cycle.id}`}>
                      <CardHeader className="pb-2 cursor-pointer hover-elevate" onClick={() => setExpandedCycle(expandedCycle === cycle.id ? null : cycle.id)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-base" data-testid={`text-closed-name-${cycle.id}`}>{cycle.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {cycle.region || 'No region'} &middot; {cycle.month ? `Month ${cycle.month}` : ''} {cycle.year || ''} &middot;
                              Closed: {cycle.cycle_closed_at ? new Date(cycle.cycle_closed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={coverageRate >= 80 ? 'secondary' : 'destructive'} className="text-xs" data-testid={`badge-coverage-${cycle.id}`}>
                              {coverageRate}% covered
                            </Badge>
                            <Badge variant="outline">Closed</Badge>
                            {expandedCycle === cycle.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardHeader>
                      {expandedCycle === cycle.id && (
                        <CardContent className="pt-0 space-y-3">
                          <div className="grid grid-cols-4 gap-3 text-center text-sm">
                            <div className="bg-muted rounded-lg p-3">
                              <div className="text-lg font-bold" data-testid={`text-archive-total-${cycle.id}`}>{cycle.totalSites}</div>
                              <div className="text-xs text-muted-foreground">Total Sites</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-green-600 dark:text-green-400" data-testid={`text-archive-completed-${cycle.id}`}>{cycle.completedSites}</div>
                              <div className="text-xs text-muted-foreground">Completed</div>
                            </div>
                            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-red-600 dark:text-red-400" data-testid={`text-archive-uncovered-${cycle.id}`}>{cycle.uncoveredSites}</div>
                              <div className="text-xs text-muted-foreground">Uncovered</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-blue-600 dark:text-blue-400" data-testid={`text-archive-coverage-${cycle.id}`}>{coverageRate}%</div>
                              <div className="text-xs text-muted-foreground">Coverage</div>
                            </div>
                          </div>
                          {cycle.reasonBreakdown && Object.keys(cycle.reasonBreakdown).length > 0 && (
                            <div className="space-y-1.5">
                              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason Breakdown</h4>
                              {Object.entries(cycle.reasonBreakdown).sort((a,b) => b[1]-a[1]).map(([reason, count]) => (
                                <div key={reason} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="text-muted-foreground">{getReasonLabel(reason)} <span dir="rtl" className="text-muted-foreground/70 text-xs">{getReasonLabelAr(reason)}</span></span>
                                  <Badge variant="outline" className="text-xs">{count}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReport(cycle.id)} data-testid={`button-export-csv-${cycle.id}`}>
                              <Download className="h-3 w-3 mr-1" /> CSV
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReportExcel(cycle.id)} data-testid={`button-export-xlsx-${cycle.id}`}>
                              <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {closedCycles.length > 1 && (
            <Card data-testid="card-trend-analysis">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Trend Analysis Across Cycles
                </CardTitle>
                <CardDescription>Recurring patterns in uncovered site reasons</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const aggregated: Record<string, number> = {};
                  closedCycles.forEach(c => {
                    if (c.reasonBreakdown) {
                      Object.entries(c.reasonBreakdown).forEach(([reason, count]) => {
                        aggregated[reason] = (aggregated[reason] || 0) + count;
                      });
                    }
                  });
                  const total = Object.values(aggregated).reduce((a, b) => a + b, 0);
                  if (total === 0) return <p className="text-muted-foreground text-sm text-center py-4">No trend data available</p>;
                  return (
                    <div className="space-y-2">
                      {Object.entries(aggregated).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                        <div key={reason} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span>{getReasonLabel(reason)} <span dir="rtl" className="text-muted-foreground/70 text-xs">{getReasonLabelAr(reason)}</span></span>
                            <span className="text-xs text-muted-foreground">{count} ({Math.round((count / total) * 100)}%)</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-indigo-500"
                              style={{ width: `${(count / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground mt-3">Aggregated across {closedCycles.length} closed cycles</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Phase B: Cost Recovery Dialog */}
      {costRecoveryDialogState && (
        <CostRecoveryDialog
          open={Boolean(costRecoveryDialogState)}
          onOpenChange={open => { if (!open) setCostRecoveryDialogState(null); }}
          site={costRecoveryDialogState.site}
          advanceId={costRecoveryDialogState.advanceId}
          advanceAmount={costRecoveryDialogState.amount}
          currency="SDG"
          onDecisionSaved={() => {
            setCostRecoveryDialogState(null);
            if (checklistMmpId) {
              loadExceptionsData(checklistMmpId);
              cycleReadiness.refresh();
            }
          }}
        />
      )}

      {financeOverrideDialog && (
        <AlertDialog open onOpenChange={open => { if (!open) setFinanceOverrideDialog(null); }}>
          <AlertDialogContent data-testid="dialog-finance-override">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
                Super Admin Finance Gate Override
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm">
                    The following finance obligations are still pending. As Super Admin you may override, but this action will be permanently logged to the audit trail.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 border border-amber-500/20">
                    {financeOverrideDialog.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="finance-override-justification">
                      Override Justification <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      id="finance-override-justification"
                      value={financeOverrideJustification}
                      onChange={e => setFinanceOverrideJustification(e.target.value)}
                      placeholder="Provide a written justification for overriding the finance gate..."
                      className="text-sm min-h-[80px]"
                      data-testid="textarea-finance-override-justification"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setFinanceOverrideDialog(null)} data-testid="button-cancel-finance-override">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleFinanceOverrideConfirm}
                disabled={!financeOverrideJustification.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-confirm-finance-override"
              >
                Override & Proceed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

interface SiteRowProps {
  site: UncoveredSite;
  selected: boolean;
  onToggle: () => void;
  onAssignReason: (siteId: string, reason: NotCoveredReason, otherText?: string) => void;
  canAssign: boolean;
  saving: boolean;
}

const SiteRow = ({ site, selected, onToggle, onAssignReason, canAssign, saving }: SiteRowProps) => {
  const [localReason, setLocalReason] = useState<NotCoveredReason | ''>(site.not_covered_reason || '');
  const [localOther, setLocalOther] = useState(site.not_covered_reason_other || '');
  const [expanded, setExpanded] = useState(false);

  const handleSaveReason = () => {
    if (!localReason) return;
    onAssignReason(site.id, localReason as NotCoveredReason, localReason === 'other' ? localOther : undefined);
  };

  return (
    <div className={`border rounded-lg px-3 py-2 ${selected ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : 'bg-card'}`} data-testid={`row-site-${site.id}`}>
      <div className="flex items-center">
        <div className="w-8">
          <Checkbox checked={selected} onCheckedChange={onToggle} data-testid={`checkbox-site-${site.id}`} />
        </div>
        <div className="flex-1 grid grid-cols-6 gap-2 items-center text-sm cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="col-span-2">
            <div className="font-medium truncate">{site.site_name}</div>
            <div className="text-xs text-muted-foreground">{site.site_code}</div>
          </div>
          <div className="text-muted-foreground truncate">{site.state}</div>
          <div className="text-muted-foreground truncate">{site.hub || '—'}</div>
          <div>
            <Badge variant="outline">{site.status}</Badge>
          </div>
          <div>
            <Badge variant={getReasonBadgeVariant(site.not_covered_reason)} data-testid={`badge-reason-${site.id}`}>
              {site.not_covered_reason ? (<>{getReasonLabel(site.not_covered_reason)} <span dir="rtl" className="text-muted-foreground/70 text-[10px]">{getReasonLabelAr(site.not_covered_reason)}</span></>) : 'No Reason'}
            </Badge>
          </div>
        </div>
        <div className="w-6">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && canAssign && (
        <div className="mt-3 pt-3 border-t pl-8">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Reason for Not Covered</label>
              <Select value={localReason} onValueChange={v => setLocalReason(v as NotCoveredReason)}>
                <SelectTrigger className="w-full" data-testid={`select-reason-${site.id}`}>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {localReason === 'other' && (
              <div className="space-y-1 flex-1">
                <label className="text-xs text-muted-foreground">Details</label>
                <Textarea
                  value={localOther}
                  onChange={e => setLocalOther(e.target.value)}
                  placeholder="Specify reason..."
                  className="min-h-[32px] h-8"
                  data-testid={`input-other-reason-${site.id}`}
                />
              </div>
            )}
            <Button
              size="sm"
              onClick={handleSaveReason}
              disabled={!localReason || saving || (localReason === 'other' && !localOther.trim())}
              data-testid={`button-save-reason-${site.id}`}
            >
              Save
            </Button>
          </div>
          {site.not_covered_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(site.not_covered_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

function getReasonBadgeVariant(reason: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!reason) return 'destructive';
  return 'secondary';
}

function getReasonLabel(reason: string | null) {
  if (!reason) return 'Pending';
  const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
  return r?.label || reason;
}

function getReasonLabelAr(reason: string | null) {
  if (!reason) return 'معلق';
  const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
  return r?.labelAr || '';
}

export default MMPCycleClose;
