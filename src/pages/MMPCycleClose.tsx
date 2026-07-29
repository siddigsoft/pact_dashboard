import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
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
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, RefreshCw, FileSpreadsheet,
  Bell, TrendingUp, TrendingDown, Minus, Star, Shield, ShieldAlert,
  Activity, Target, Layers, SortAsc, SortDesc,
  BookOpen, RotateCcw, HelpCircle, Loader2, DollarSign, Lightbulb,
  ReceiptText, ExternalLink, PlayCircle, Eye,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { WFPColumnMapper } from '@/components/cycle/WFPColumnMapper';
import { CycleCloseGuide } from '@/components/cycle/CycleCloseGuide';
import { EnumeratorReconciliation } from '@/components/cycle/EnumeratorReconciliation';
import { RolledAllocationsPanel } from '@/components/cycle/RolledAllocationsPanel';
import { parseWFPRow, parseWFPRowWithMapping, matchAll, summarise, detectColumns, findSitesNotInWfp, COMPLETE_STATUSES } from '@/utils/wfpMatcher';
import type { MatchResult, MatchSummary, SiteEntry } from '@/utils/wfpMatcher';
import { logPaymentEvent } from '@/services/paymentEventLogger';
import { dispatchNotification } from '@/lib/notify';
import AdhocSiteVisitsTab from '@/components/mmp/AdhocSiteVisitsTab';
import { exportToExcel, exportMultiSheetExcel } from '@/utils/report-export';
import { exportStandardExcel, type StandardSheetSpec, sumField } from '@/utils/standardExcelExport';
import { format } from 'date-fns';
import { checkFinanceReadinessForClose, canSubmitForApproval, mmpCostSubmissionOrFilter } from '@/utils/cycleCloseGates';
import {
  buildCostApproveUpdate,
  buildCostRejectUpdate,
  getPendingCostTierLabel,
  isCostFullyApproved,
  PENDING_COST_TIER_FILTER,
  type OperationalCostTierInput,
} from '@/utils/operationalCostApproval';
import { approveCycleClose } from '@/services/cycleCloseService';
import { getLatestExchangeRate } from '@/utils/exchange-rate-service';

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

interface ClosedCycleFinancialSnapshot {
  enumeratorFees: number;
  transportFees: number;
  opCosts: number;
  advancesRecovered: number;
  currency: string;
  payableSiteCount: number;
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
  financialSnapshot?: ClosedCycleFinancialSnapshot | null;
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
  rolled:            { label: 'Rolled to Next MMP',      labelAr: 'مُرحَّل للدورة التالية',  color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  return_required:   { label: 'Return Required',         labelAr: 'مطلوب الإعادة',           color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  writeoff:          { label: 'Written Off',             labelAr: 'مشطوب',                   color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  redirect_to_fees:  { label: 'Redirected to Fees',      labelAr: 'محوَّل إلى أتعاب العداد', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
};

const FOLLOW_UP_ACTIONS: Record<string, string> = {
  security_concerns: 'Coordinate with security team and local authorities before next cycle visit',
  access_denied: 'Engage community leaders and obtain required access permits for next cycle',
  staff_unavailable: 'Pre-assign backup staff and confirm availability before next cycle starts',
};

const MMPCycleClose = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles, refreshMMPFiles } = useMMP();
  const { hasAnyRole, isSuperAdmin: isSuperAdminCheck } = useAuthorization();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number | null>(null);
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
    getLatestExchangeRate().then(r => { if (r) setLiveExchangeRate(r.rate); });
  }, []);

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
    // When arriving from the "View Closing Guide" button (MMP page) or MMP Management
    // banner, ?wizardFor=X auto-selects that MMP and opens the close readiness checklist.
    // Do NOT guard on mmpFiles — set immediately so the checklist opens on first render;
    // the readiness hook handles the loading state while data arrives.
    const wizardForParam = searchParams.get('wizardFor');
    if (wizardForParam) {
      setChecklistMmpId(wizardForParam);
    }
  }, [searchParams]);
  const [closedCycles, setClosedCycles] = useState<ClosedCycleRecord[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [reopenConfirmId, setReopenConfirmId] = useState<string | null>(null);
  const [reopeningCycle, setReopeningCycle] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [abortingClose, setAbortingClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closingCycle, setClosingCycle] = useState(false);
  const [finalizingCycle, setFinalizingCycle] = useState(false);
  const [pendingViaReportCount, setPendingViaReportCount] = useState(0);
  const [selectedMmpId, setSelectedMmpId] = useState<string>('all');

  interface CostSubSummary { category: string; count: number; approvedCents: number; pendingCents: number; currency: string; }
  interface AdvanceSummary { status: string; count: number; totalCents: number; currency: string; }
  interface AdvanceDetail {
    id: string;
    siteEntryId: string | null;
    requesterName: string;
    siteName: string;
    paymentType: string;
    requestedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    currency: string;
  }
  interface SiteReviewEntry {
    id: string;
    siteName: string;
    siteCode: string;
    state: string;
    locality: string;
    status: string;
    enumeratorId: string | null;
    enumeratorName: string;
    enumeratorFee: number;
    transportFee: number;
    totalFee: number;
    costAcknowledged: boolean;
    advanceId: string | null;
    advanceRequested: number;
    advancePaid: number;
    advanceRemaining: number;
    netToPay: number;
    currency: string;
  }
  interface WithdrawalDetail {
    id: string;
    userName: string;
    amount: number;
    currency: string;
    status: string;
    reason: string;
  }
  interface EnumeratorCostDetail {
    id: string;
    enumeratorName: string;
    siteName: string;
    siteCode: string;
    state: string;
    locality: string;
    enumeratorFee: number;
    transportFee: number;
    totalCost: number;
    status: string;
    costAcknowledged: boolean;
    currency: string;
  }
  interface CycleSummaryData {
    costSubs: CostSubSummary[];
    advances: AdvanceSummary[];
    advanceDetails: AdvanceDetail[];
    withdrawals: WithdrawalDetail[];
    enumeratorCosts: EnumeratorCostDetail[];
    totalApprovedCents: number;
    totalAdvancesCents: number;
    totalWithdrawalAmount: number;
    totalEnumeratorFee: number;
    totalTransportFee: number;
    currency: string;
  }
  const [cycleSummaryData, setCycleSummaryData] = useState<CycleSummaryData | null>(null);
  const [loadingCycleSummary, setLoadingCycleSummary] = useState(false);
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

  const skipMmpResetRef = useRef(false);


  // Defined early (right after its state deps) to prevent any temporal dead zone issues
  const fetchCycleSummary = useCallback(async (mmpId: string) => {
    setLoadingCycleSummary(true);
    setCycleSummaryData(null);
    try {
      const { data: costRows } = await supabase
        .from('operational_cost_submissions')
        .select('expense_category, amount_cents, currency, tier1_status, tier2_status, tier3_status, tier4_status, submitter_role')
        .or(mmpCostSubmissionOrFilter(mmpId));
      const catMap: Record<string, { count: number; approvedCents: number; pendingCents: number; currency: string }> = {};
      (costRows || []).forEach((r: any) => {
        const cat = r.expense_category || 'Other';
        if (!catMap[cat]) catMap[cat] = { count: 0, approvedCents: 0, pendingCents: 0, currency: r.currency || 'SDG' };
        catMap[cat].count++;
        const cents = r.amount_cents ?? 0;
        const fullyApproved = isCostFullyApproved(r);
        if (fullyApproved) catMap[cat].approvedCents += cents;
        else catMap[cat].pendingCents += cents;
      });
      const costSubs = Object.entries(catMap).map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => (b.approvedCents + b.pendingCents) - (a.approvedCents + a.pendingCents));
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('mmp_file_id', mmpId)
        .limit(10000);
      const entryIds = (entries || []).map((e: any) => e.id);
      let advances: AdvanceSummary[] = [];
      let advanceDetails: AdvanceDetail[] = [];
      if (entryIds.length > 0) {
        const PAGE = 1000;
        let allAdv: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from('down_payment_requests')
            .select('id, mmp_site_entry_id, status, requested_amount, total_paid_amount, remaining_amount, payment_type, site_name, currency, requested_by')
            .in('mmp_site_entry_id', entryIds)
            .range(from, from + PAGE - 1);
          allAdv = [...allAdv, ...(data || [])];
          if (!data || data.length < PAGE) break;
        }
        // Build status-grouped summary (keep existing)
        const advMap: Record<string, { count: number; totalCents: number; currency: string }> = {};
        allAdv.forEach((a: any) => {
          const s = a.status || 'unknown';
          if (!advMap[s]) advMap[s] = { count: 0, totalCents: 0, currency: a.currency || 'SDG' };
          advMap[s].count++;
          advMap[s].totalCents += Math.round((a.requested_amount ?? 0) * 100);
        });
        advances = Object.entries(advMap).map(([status, v]) => ({ status, ...v }));

        // Fetch requester names
        const requesterIds = [...new Set(allAdv.map((a: any) => a.requested_by).filter(Boolean))];
        const nameMap: Record<string, string> = {};
        if (requesterIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, display_name')
            .in('id', requesterIds);
          (profiles || []).forEach((p: any) => {
            nameMap[p.id] = p.display_name || p.full_name || 'Unknown';
          });
        }

        advanceDetails = allAdv.map((a: any) => ({
          id: a.id,
          siteEntryId: a.mmp_site_entry_id ?? null,
          requesterName: nameMap[a.requested_by] || 'Unknown',
          siteName: a.site_name || '—',
          paymentType: a.payment_type || 'full_advance',
          requestedAmount: a.requested_amount ?? 0,
          paidAmount: a.total_paid_amount ?? 0,
          remainingAmount: a.remaining_amount ?? (a.requested_amount ?? 0) - (a.total_paid_amount ?? 0),
          status: a.status || 'unknown',
          currency: a.currency || 'SDG',
        }));
      }

      // Withdrawal requests for this MMP
      let withdrawals: WithdrawalDetail[] = [];
      const { data: wdRaw } = await supabase
        .from('withdrawal_requests')
        .select('id, user_id, amount, currency, status, reason, request_reason')
        .eq('mmp_id', mmpId);
      if (wdRaw && wdRaw.length > 0) {
        const wdUserIds = [...new Set(wdRaw.map((w: any) => w.user_id).filter(Boolean))];
        const wdNameMap: Record<string, string> = {};
        if (wdUserIds.length > 0) {
          const { data: wdProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, display_name')
            .in('id', wdUserIds);
          (wdProfiles || []).forEach((p: any) => {
            wdNameMap[p.id] = p.display_name || p.full_name || 'Unknown';
          });
        }
        withdrawals = wdRaw.map((w: any) => ({
          id: w.id,
          userName: wdNameMap[w.user_id] || 'Unknown',
          amount: w.amount ?? 0,
          currency: w.currency || 'SDG',
          status: w.status || 'unknown',
          reason: w.request_reason || w.reason || '—',
        }));
      }

      // Enumerator costs from mmp_site_entries
      let enumeratorCosts: EnumeratorCostDetail[] = [];
      const { data: siteEntries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, accepted_by, monitoring_by, enumerator_fee, transport_fee, cost, cost_acknowledged')
        .eq('mmp_file_id', mmpId)
        .order('site_name');
      if (siteEntries && siteEntries.length > 0) {
        // Build name map by UUID (accepted_by)
        const enumeratorIds = [...new Set((siteEntries as any[]).map((e: any) => e.accepted_by).filter(Boolean))];
        const enumNameMap: Record<string, string> = {};
        if (enumeratorIds.length > 0) {
          const { data: enumProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, display_name')
            .in('id', enumeratorIds);
          (enumProfiles || []).forEach((p: any) => {
            enumNameMap[p.id] = p.display_name || p.full_name || 'Unknown';
          });
        }
        // Build name map by email (monitoring_by stores email)
        const monitoringEmails = [...new Set((siteEntries as any[]).map((e: any) => e.monitoring_by).filter(Boolean))];
        const enumByEmailMap: Record<string, string> = {};
        if (monitoringEmails.length > 0) {
          const { data: emailProfiles } = await supabase
            .from('profiles')
            .select('email, full_name, display_name')
            .in('email', monitoringEmails);
          (emailProfiles || []).forEach((p: any) => {
            if (p.email) enumByEmailMap[p.email] = p.display_name || p.full_name || p.email;
          });
        }
        enumeratorCosts = (siteEntries as any[]).map((e: any) => ({
          id: e.id,
          enumeratorName:
            enumNameMap[e.accepted_by] ||
            enumByEmailMap[e.monitoring_by] ||
            e.monitoring_by ||
            'Unassigned',
          siteName: e.site_name || '—',
          siteCode: e.site_code || '—',
          state: e.state || '—',
          locality: e.locality || '—',
          enumeratorFee: e.enumerator_fee ?? 0,
          transportFee: e.transport_fee ?? 0,
          totalCost: e.cost ?? ((e.enumerator_fee ?? 0) + (e.transport_fee ?? 0)),
          status: e.status || 'unknown',
          costAcknowledged: e.cost_acknowledged ?? false,
          currency: 'SDG',
        }));
      }

      const totalApprovedCents = costSubs.reduce((s, r) => s + r.approvedCents, 0);
      const totalAdvancesCents = advances.reduce((s, r) => s + r.totalCents, 0);
      const totalWithdrawalAmount = withdrawals
        .filter(w => !['rejected', 'cancelled'].includes(w.status))
        .reduce((s, w) => s + w.amount, 0);
      const totalEnumeratorFee = enumeratorCosts.reduce((s, e) => s + e.enumeratorFee, 0);
      const totalTransportFee = enumeratorCosts.reduce((s, e) => s + e.transportFee, 0);
      const currency = costSubs[0]?.currency || advances[0]?.currency || withdrawals[0]?.currency || 'SDG';
      setCycleSummaryData({ costSubs, advances, advanceDetails, withdrawals, enumeratorCosts, totalApprovedCents, totalAdvancesCents, totalWithdrawalAmount, totalEnumeratorFee, totalTransportFee, currency });
    } catch {
      // Non-critical — summary is informational only
    } finally {
      setLoadingCycleSummary(false);
    }
  }, []);

  const fetchAllSiteDetails = useCallback(async (mmpId: string) => {
    setLoadingAllSites(true);
    try {
      const { data: siteEntries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, accepted_by, monitoring_by, enumerator_fee, transport_fee, cost, cost_acknowledged')
        .eq('mmp_file_id', mmpId)
        .order('site_name');
      if (!siteEntries || siteEntries.length === 0) { setAllSiteReviewData([]); return; }
      const enumIds = [...new Set((siteEntries as any[]).map((e: any) => e.accepted_by).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (enumIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, display_name').in('id', enumIds);
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.display_name || p.full_name || 'Unknown'; });
      }
      const siteIds = (siteEntries as any[]).map((e: any) => e.id);
      const { data: advances } = await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, requested_amount, total_paid_amount, remaining_amount, status, currency')
        .in('mmp_site_entry_id', siteIds);
      const advMap: Record<string, any> = {};
      (advances || []).forEach((a: any) => {
        const sid = a.mmp_site_entry_id;
        if (!sid) return;
        const existing = advMap[sid];
        const priority = ['approved', 'partially_paid', 'fully_paid'];
        if (!existing || priority.includes(a.status)) advMap[sid] = a;
      });
      const data: SiteReviewEntry[] = (siteEntries as any[]).map((e: any) => {
        const adv = advMap[e.id];
        const enumFee = e.enumerator_fee ?? 0;
        const transFee = e.transport_fee ?? 0;
        const totalFee = e.cost ?? (enumFee + transFee);
        const advReq = adv?.requested_amount ?? 0;
        const advPaid = adv?.total_paid_amount ?? 0;
        const advRem = adv?.remaining_amount ?? Math.max(0, advReq - advPaid);
        const netToPay = Math.max(0, totalFee - advPaid);
        return {
          id: e.id, siteName: e.site_name || '—', siteCode: e.site_code || '—',
          state: e.state || '—', locality: e.locality || '—', status: e.status || 'unknown',
          enumeratorId: e.accepted_by ?? null,
          enumeratorName: nameMap[e.accepted_by] || e.monitoring_by || 'Unassigned',
          enumeratorFee: enumFee, transportFee: transFee, totalFee,
          costAcknowledged: e.cost_acknowledged ?? false,
          advanceId: adv?.id ?? null, advanceRequested: advReq, advancePaid: advPaid,
          advanceRemaining: advRem, netToPay, currency: adv?.currency || 'SDG',
        };
      });
      setAllSiteReviewData(data);
    } catch (err) {
      console.error('[SiteReview] fetchAllSiteDetails error:', err);
    } finally {
      setLoadingAllSites(false);
    }
  }, []);

  const [paymentRequestedAt, setPaymentRequestedAt] = useState<string | null>(null);
  const [paymentsConfirmedAt, setPaymentsConfirmedAt] = useState<string | null>(null);
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [confirmingPayments, setConfirmingPayments] = useState(false);
  const [paymentRequestNote, setPaymentRequestNote] = useState('');

  // ── All remaining state declarations hoisted here to avoid TDZ errors ──────
  const [reconciliationAcknowledged, setReconciliationAcknowledged] = useState(false);
  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeEdits, setFeeEdits] = useState<Record<string, { enum: number; transport: number }>>({});
  const [savingFees, setSavingFees] = useState(false);
  const [allSiteReviewData, setAllSiteReviewData] = useState<SiteReviewEntry[]>([]);
  const [loadingAllSites, setLoadingAllSites] = useState(false);
  const [siteReviewSearch, setSiteReviewSearch] = useState('');
  const [siteReviewStatusFilter, setSiteReviewStatusFilter] = useState('all');
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [feesLockedAt, setFeesLockedAt] = useState<string | null>(null);
  const [feesLockedRate, setFeesLockedRate] = useState<number | null>(null);
  const [lockingFees, setLockingFees] = useState(false);
  const [updateWallets, setUpdateWallets] = useState(true);
  const [walletUpdateResults, setWalletUpdateResults] = useState<{ success: number; failed: number } | null>(null);
  const [cycleSubmittedAt, setCycleSubmittedAt] = useState<string | null>(null);
  const guideScrolledStepRef = useRef<string | null>(null);
  // Finance tab state
  type FinanceCost = OperationalCostTierInput & {
    id: string;
    description: string | null;
    vendor: string | null;
    amount_cents: number;
    currency: string | null;
    expense_date: string | null;
    expense_category: string | null;
  };

  const COST_APPROVAL_SELECT =
    'id, description, vendor, amount_cents, currency, expense_date, expense_category, tier1_status, tier2_status, tier3_status, tier4_status, submitter_role, status';

  const applyCostApprovalUpdate = async (
    costId: string,
    update: Record<string, string | null>,
  ): Promise<OperationalCostTierInput> => {
    const { data, error } = await supabase
      .from('operational_cost_submissions')
      .update(update)
      .eq('id', costId)
      .select('id, tier1_status, tier2_status, tier3_status, tier4_status, submitter_role, status');
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        'Database security policy blocked this approval. Open Cost Submission to approve with signature, or contact an admin.',
      );
    }
    return data[0];
  };
  type FinanceAdvance = { id: string; status: string; amount_cents: number | null; currency: string | null };
  const [financeCosts, setFinanceCosts] = useState<FinanceCost[]>([]);
  const [financeAdvances, setFinanceAdvances] = useState<FinanceAdvance[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeApproving, setFinanceApproving] = useState<Set<string>>(new Set());
  const [financeRejecting, setFinanceRejecting] = useState<Set<string>>(new Set());
  const [financeApprovingAll, setFinanceApprovingAll] = useState(false);
  const [financeRejectDialog, setFinanceRejectDialog] = useState<{ open: boolean; costId: string | null; reason: string }>({ open: false, costId: null, reason: '' });
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
  const fetchedScopeIdsRef = useRef<Set<string>>(new Set());
  const [notCoveredAdvanceSites, setNotCoveredAdvanceSites] = useState<NotCoveredAdvanceSite[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [costRecoveryDialogState, setCostRecoveryDialogState] = useState<{
    site: CostRecoverySite;
    advanceId: string | null;
    amount: number;
  } | null>(null);
  const [showMoneyTrailMmpId, setShowMoneyTrailMmpId] = useState<string | null>(null);
  const [wfpResults, setWfpResults] = useState<MatchResult[]>([]);
  const [wfpSummary, setWfpSummary] = useState<MatchSummary | null>(null);
  const [wfpUploadId, setWfpUploadId] = useState<string | null>(null);
  const [wfpFilename, setWfpFilename] = useState<string | null>(null);
  const [wfpApplying, setWfpApplying] = useState(false);
  const [wfpSaving, setWfpSaving] = useState(false);
  const [loadingWFP, setLoadingWFP] = useState(false);
  const [wfpAppliedUpload, setWfpAppliedUpload] = useState<{ filename: string; applied_at: string } | null>(null);
  const [wfpNotInWfpSites, setWfpNotInWfpSites] = useState<SiteEntry[]>([]);
  const [wfpMatchedIncomplete, setWfpMatchedIncomplete] = useState<MatchResult[]>([]);
  const [wfpRawRows, setWfpRawRows] = useState<Record<string, unknown>[] | null>(null);
  const [wfpRawHeaders, setWfpRawHeaders] = useState<string[]>([]);
  const [wfpDetectedCols, setWfpDetectedCols] = useState<Record<string, string>>({});
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [userHubName, setUserHubName] = useState<string>('');
  const [bannerRejectMmpId, setBannerRejectMmpId] = useState<string | null>(null);
  const [bannerRejectNote, setBannerRejectNote] = useState('');
  // ─────────────────────────────────────────────────────────────────────────────

  const handleRequestPayments = useCallback(async (mmpId: string) => {
    setRequestingPayment(true);
    try {
      const now = new Date().toISOString();
      const mmp = (mmpFiles?.find(m => m.id === mmpId) as any);
      const existing = mmp?.payment_tracking || {};
      const { error } = await supabase.from('mmp_files').update({
        payment_tracking: { ...existing, payment_requested_at: now, payment_requested_by: currentUser?.id, payment_note: paymentRequestNote || null },
      } as any).eq('id', mmpId);
      if (error) throw error;
      setPaymentRequestedAt(now);
      await refreshMMPFiles();
      toast({ title: '📤 Payment Request Sent', description: 'Payment request logged. Return here to confirm once finance processes all payments.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to request payments', variant: 'destructive' });
    } finally {
      setRequestingPayment(false);
    }
  }, [mmpFiles, currentUser, paymentRequestNote, refreshMMPFiles, toast]);

  const handleConfirmPaymentsDone = useCallback(async (mmpId: string) => {
    setConfirmingPayments(true);
    try {
      const now = new Date().toISOString();
      const mmp = (mmpFiles?.find(m => m.id === mmpId) as any);
      const existing = mmp?.payment_tracking || {};
      const { error } = await supabase.from('mmp_files').update({
        payment_tracking: { ...existing, payments_confirmed_at: now, payments_confirmed_by: currentUser?.id },
      } as any).eq('id', mmpId);
      if (error) throw error;
      setPaymentsConfirmedAt(now);
      await refreshMMPFiles();
      toast({ title: '✅ Payments Confirmed', description: 'All payments confirmed. You can now submit this cycle for approval.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to confirm payments', variant: 'destructive' });
    } finally {
      setConfirmingPayments(false);
    }
  }, [mmpFiles, currentUser, refreshMMPFiles, toast]);

  const handleLockFees = useCallback(async (mmpId: string) => {
    const rate = parseFloat(exchangeRateInput);
    if (!rate || rate <= 0) {
      toast({ title: 'Invalid Rate', description: 'Please enter a valid exchange rate greater than 0.', variant: 'destructive' });
      return;
    }
    setLockingFees(true);
    setWalletUpdateResults(null);
    try {
      const eligibleStatuses = ['dispatched', 'assigned', 'submitted', 'wfp_confirmed', 'completed', 'verified', 'approved'];
      const sitesToUpdate = allSiteReviewData.filter(s => eligibleStatuses.includes(s.status));
      if (sitesToUpdate.length === 0) {
        toast({ title: 'No Eligible Sites', description: 'No dispatched/completed sites found to update.', variant: 'destructive' });
        return;
      }

      // Bulk update mmp_site_entries fees to SDG equivalent.
      // Re-lock guard: if fees were already converted to SDG by a previous lock
      // (feesLockedRate != null), reverse the old rate first so we always
      // convert from the original USD base — avoids SDG × newRate double-conversion.
      let feeUpdateFailed = 0;
      for (const site of sitesToUpdate) {
        const prevRate = feesLockedRate;
        const baseEnum = prevRate ? site.enumeratorFee / prevRate : site.enumeratorFee;
        const baseTrans = prevRate ? site.transportFee / prevRate : site.transportFee;
        const newEnumFee = Math.round(baseEnum * rate);
        const newTransFee = Math.round(baseTrans * rate);
        const { error: feeErr } = await supabase.from('mmp_site_entries').update({
          enumerator_fee: newEnumFee,
          transport_fee: newTransFee,
          cost: newEnumFee + newTransFee,
          currency: 'SDG',
        }).eq('id', site.id);
        if (feeErr) feeUpdateFailed++;
      }

      // Wallet updates — one transaction per site per enumerator
      let walletSuccess = 0;
      let walletFailed = 0;
      if (updateWallets) {
        for (const site of sitesToUpdate) {
          if (!site.enumeratorId) continue;
          const prevRate = feesLockedRate;
          const baseEnum = prevRate ? site.enumeratorFee / prevRate : site.enumeratorFee;
          const baseTrans = prevRate ? site.transportFee / prevRate : site.transportFee;
          const sdgTotal = Math.round((baseEnum + baseTrans) * rate);
          if (sdgTotal <= 0) continue;
          try {
            const { error } = await supabase.from('wallet_transactions').insert({
              user_id: site.enumeratorId,
              type: 'site_visit_fee',
              amount: sdgTotal,
              currency: 'SDG',
              description: `MMP Cycle Fee — ${site.siteName} (1 USD = ${rate.toLocaleString()} SDG)`,
              related_site_visit_id: site.id,
              site_visit_id: site.id,
              metadata: {
                reference_type: 'mmp_site_entry',
                mmp_id: mmpId,
                site_entry_id: site.id,
              },
              created_at: new Date().toISOString(),
            } as any);
            if (error) walletFailed++;
            else walletSuccess++;
          } catch {
            walletFailed++;
          }
        }
        setWalletUpdateResults({ success: walletSuccess, failed: walletFailed });
      }

      // Persist rate + timestamp in mmp_files.payment_tracking
      const now = new Date().toISOString();
      const mmp = (mmpFiles?.find(m => m.id === mmpId) as any);
      const existing = mmp?.payment_tracking || {};
      await supabase.from('mmp_files').update({
        payment_tracking: {
          ...existing,
          exchange_rate_applied: rate,
          exchange_rate_applied_at: now,
          exchange_rate_applied_by: currentUser?.id,
          exchange_rate_sites_updated: sitesToUpdate.length,
        },
      } as any).eq('id', mmpId);

      setFeesLockedAt(now);
      setFeesLockedRate(rate);

      // Audit log
      const mmpName = (mmpFiles?.find(m => m.id === mmpId) as any)?.name || 'MMP';

      // Notify each unique enumerator whose wallet was credited
      if (updateWallets && walletSuccess > 0) {
        const notifiedIds = new Set<string>();
        for (const site of sitesToUpdate) {
          if (!site.enumeratorId || notifiedIds.has(site.enumeratorId)) continue;
          notifiedIds.add(site.enumeratorId);
          NotificationTriggerService.send({
            userId: site.enumeratorId,
            title: 'Cycle Fee Calculated',
            titleAr: 'تم احتساب أتعاب الدورة',
            message: `Your field fees for MMP "${mmpName}" have been converted at 1 USD = ${rate.toLocaleString()} SDG and credited to your wallet.`,
            messageAr: `تم احتساب أتعابك الميدانية لمشروع "${mmpName}" بسعر صرف 1 دولار = ${rate.toLocaleString()} جنيه سوداني وإضافتها لمحفظتك.`,
            type: 'success',
            category: 'wallet',
            priority: 'normal',
            relatedEntityType: 'mmpFile',
            relatedEntityId: mmpId,
          }).catch(() => {});
        }
      }

      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'fee_lock',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        affectedSites: sitesToUpdate.length,
        metadata: {
          exchange_rate: rate,
          rate_label: `1 USD = ${rate.toLocaleString()} SDG`,
          sites_updated: sitesToUpdate.length,
          wallets_updated: updateWallets ? walletSuccess : 'skipped',
          locked_at: now,
        },
      });

      await refreshMMPFiles();
      await fetchCycleSummary(mmpId);
      await fetchAllSiteDetails(mmpId);

      const walletMsg = updateWallets
        ? walletSuccess > 0 ? ` Wallet updated for ${walletSuccess} enumerator${walletSuccess !== 1 ? 's' : ''}.` : ' Wallet update skipped (no eligible wallets).'
        : '';
      const feeFailMsg = feeUpdateFailed > 0 ? ` ⚠️ ${feeUpdateFailed} site fee update${feeUpdateFailed !== 1 ? 's' : ''} failed (RLS or DB error) — check those sites manually.` : '';
      toast({
        title: `✅ Fees Locked at 1 USD = ${rate.toLocaleString()} SDG`,
        description: `${sitesToUpdate.length - feeUpdateFailed} of ${sitesToUpdate.length} site fees converted to SDG.${walletMsg}${feeFailMsg}`,
        variant: feeUpdateFailed > 0 ? 'destructive' : 'default',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to lock fees', variant: 'destructive' });
    } finally {
      setLockingFees(false);
    }
  }, [allSiteReviewData, exchangeRateInput, updateWallets, mmpFiles, currentUser, refreshMMPFiles, fetchCycleSummary, fetchAllSiteDetails, toast]);

  const exportPaymentSheetExcel = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const mmpName = mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'Cycle';
    const advMap: Record<string, AdvanceDetail> = {};
    cycleSummaryData.advanceDetails.forEach(a => { if (a.siteEntryId) advMap[a.siteEntryId] = a; });
    const totalGross = cycleSummaryData.enumeratorCosts.reduce((s, e) => s + e.totalCost, 0);
    const totalAdvPaid = Object.values(advMap).reduce((s, a) => s + a.paidAmount, 0);
    const totalNet = Math.max(0, totalGross - totalAdvPaid);

    const headers = [
      'Enumerator', 'Site Name', 'Site Code', 'State', 'Locality', 'Visit Status',
      'Enum. Fee (SDG)', 'Transport Fee (SDG)', 'Gross Total (SDG)',
      'Advance Paid (SDG)', 'Advance Remaining (SDG)', 'NET TO PAY (SDG)', 'Cost Ack.'
    ];

    const rows = cycleSummaryData.enumeratorCosts.map(e => {
      const adv = advMap[e.id];
      const advPaid = adv?.paidAmount ?? 0;
      return [
        e.enumeratorName, e.siteName, e.siteCode,
        e.state, e.locality, e.status.replace(/_/g, ' '),
        e.enumeratorFee, e.transportFee,
        e.totalCost,
        advPaid > 0 ? advPaid : 0,
        adv && adv.remainingAmount > 0 ? adv.remainingAmount : 0,
        Math.max(0, e.totalCost - advPaid),
        e.costAcknowledged ? 'Yes' : 'No'
      ];
    });

    const totalAdvRem = Object.values(advMap).reduce((s, a) => s + Math.max(0, a.remainingAmount), 0);
    const totalsRow = [
      'TOTAL', '', '', '', '', '',
      cycleSummaryData.totalEnumeratorFee, cycleSummaryData.totalTransportFee,
      totalGross, totalAdvPaid,
      totalAdvRem,
      totalNet, ''
    ];

    const summaryRows = [
      ['MMP Cycle', mmpName],
      ['Generated', format(new Date(), 'dd/MM/yyyy')],
      ['Total Dispatched Sites', cycleSummaryData.enumeratorCosts.length],
      ['Gross Fees (SDG)', totalGross],
      ['Advances Already Paid (SDG)', totalAdvPaid],
      ['NET AMOUNT TO PAY (SDG)', totalNet],
      ['Approved Op. Costs (SDG)', cycleSummaryData.totalApprovedCents / 100],
    ];

    if (feesLockedRate) {
      summaryRows.push(['─── Exchange Rate ───', '']);
      summaryRows.push(['Rate Applied (1 USD → SDG)', feesLockedRate]);
      summaryRows.push(['Rate Locked On', feesLockedAt ? format(new Date(feesLockedAt), 'dd/MM/yyyy') : '']);
      summaryRows.push(['Note', 'All fees above are in SDG at the locked rate']);
    } else {
      summaryRows.push(['Exchange Rate', 'Not locked — fees may still be in USD']);
    }

    exportStandardExcel({
      reportTitle: `PACT Command Center - ${mmpName} Payment Sheet`,
      subtitleLine: `Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')} | Total Sites: ${cycleSummaryData.enumeratorCosts.length}`,
      mainSheet: {
        sheetName: 'Payment Sheet',
        headers,
        rows,
        totalsRow,
        colWidths: { 0: 20, 1: 25, 2: 12, 3: 15, 4: 15, 5: 15, 6: 18, 7: 18, 8: 18, 9: 18, 10: 22, 11: 18, 12: 10 }
      },
      summarySheet: {
        title: 'Cycle Payment Summary',
        rows: summaryRows,
        colWidths: [30, 30]
      },
      filenamePrefix: `${mmpName.replace(/\s+/g, '_')}_payment_sheet`
    });
  }, [cycleSummaryData, checklistMmpId, mmpFiles, feesLockedRate, feesLockedAt]);

  const exportPaymentSheetPDF = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const mmpName = mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'Cycle';
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF('landscape');
    const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 297, 28, 'F');
    doc.setFontSize(18); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('PACT Field Operations', 14, 12);
    doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.text('Field Staff Payment Sheet', 14, 21);
    doc.setFontSize(9); doc.text(`Generated: ${genDate}`, 200, 12); doc.text(`MMP: ${mmpName}`, 200, 20);
    if (feesLockedRate) {
      doc.setFontSize(8); doc.setTextColor(220, 180, 0);
      doc.text(`Exchange Rate: 1 USD = ${feesLockedRate.toLocaleString()} SDG  ·  Locked: ${new Date(feesLockedAt!).toLocaleDateString('en-GB')}`, 200, 27);
      doc.setTextColor(255, 255, 255);
    }
    const advMap: Record<string, AdvanceDetail> = {};
    cycleSummaryData.advanceDetails.forEach(a => { if (a.siteEntryId) advMap[a.siteEntryId] = a; });
    const totalGross = cycleSummaryData.enumeratorCosts.reduce((s, e) => s + e.totalCost, 0);
    const totalAdvPaid = Object.values(advMap).reduce((s, a) => s + a.paidAmount, 0);
    const totalNet = Math.max(0, totalGross - totalAdvPaid);
    const cur = cycleSummaryData.currency;
    let y = 35;
    autoTable(doc, {
      startY: y,
      head: [['Gross Total Fees', 'Advances Already Paid', 'NET TO PAY', 'Approved Op. Costs']],
      body: [[`${totalGross.toLocaleString()} ${cur}`, totalAdvPaid > 0 ? `−${totalAdvPaid.toLocaleString()} ${cur}` : '—', `${totalNet.toLocaleString()} ${cur}`, `${(cycleSummaryData.totalApprovedCents / 100).toLocaleString()} ${cur}`]],
      theme: 'grid',
      headStyles: { fillColor: [17, 24, 39], fontSize: 10, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { fontSize: 11, fontStyle: 'bold' },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > 155) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Payment Breakdown — Per Site', 14, y); y += 5;
    autoTable(doc, {
      startY: y,
      head: [['Enumerator', 'Site', 'State', 'Enum. Fee', 'Transport', 'Gross', 'Adv. Paid', 'NET TO PAY', 'Status']],
      body: cycleSummaryData.enumeratorCosts.map(e => {
        const adv = advMap[e.id];
        const advPaid = adv?.paidAmount ?? 0;
        return [e.enumeratorName, e.siteName.substring(0, 24), e.state,
          e.enumeratorFee > 0 ? e.enumeratorFee.toLocaleString() : '—',
          e.transportFee > 0 ? e.transportFee.toLocaleString() : '—',
          e.totalCost.toLocaleString(),
          advPaid > 0 ? `−${advPaid.toLocaleString()}` : '—',
          Math.max(0, e.totalCost - advPaid).toLocaleString(),
          e.status.replace(/_/g, ' ')];
      }),
      foot: [['TOTAL', '', '', cycleSummaryData.totalEnumeratorFee.toLocaleString(), cycleSummaryData.totalTransportFee.toLocaleString(), totalGross.toLocaleString(), totalAdvPaid > 0 ? `−${totalAdvPaid.toLocaleString()}` : '—', totalNet.toLocaleString(), '']],
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], fontSize: 8, fontStyle: 'bold', textColor: 255 },
      footStyles: { fillColor: [209, 250, 229], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      didParseCell: (data) => {
        if ((data.section === 'body' || data.section === 'foot') && data.column.index === 7) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [5, 150, 105] as any;
        }
      },
    });
    // Signature page
    doc.addPage();
    doc.setFillColor(17, 24, 39); doc.rect(0, 0, 297, 16, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Authorisation Signatures', 14, 11);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
    doc.text(`MMP: ${mmpName}  ·  ${genDate}${feesLockedRate ? `  ·  Rate: 1 USD = ${feesLockedRate.toLocaleString()} SDG` : ''}`, 100, 11);
    const sigBoxes = [
      { label: 'Prepared By', role: 'Admin / Field Operations' },
      { label: 'Reviewed & Verified By', role: 'Field Operations Manager (FOM)' },
      { label: 'Authorized By', role: 'Finance Director' },
    ];
    const sigY = 26;
    sigBoxes.forEach((box, i) => {
      const x = 14 + (i * 93);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(box.label, x, sigY);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(box.role, x, sigY + 5);
      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.4);
      doc.rect(x, sigY + 9, 84, 38, 'S');
      doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120); doc.setFontSize(8);
      doc.text('Full Name:', x + 3, sigY + 18);
      doc.setDrawColor(180, 180, 180);
      doc.line(x + 26, sigY + 18, x + 80, sigY + 18);
      doc.text('Date:', x + 3, sigY + 28);
      doc.line(x + 26, sigY + 28, x + 80, sigY + 28);
      doc.text('Signature:', x + 3, sigY + 41);
      doc.line(x + 26, sigY + 41, x + 80, sigY + 41);
    });
    doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text('This document is confidential. Authorised signatories confirm the accuracy of the payment amounts and approve disbursement.', 14, sigY + 58);

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`PACT Command Center — Confidential — Page ${i} of ${pageCount}`, 14, 200);
    }
    doc.save(`${mmpName}-payment-sheet-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [cycleSummaryData, checklistMmpId, mmpFiles, feesLockedRate, feesLockedAt]);

  useEffect(() => {
    if (checklistMmpId) {
      const mmp = mmpFiles?.find(m => m.id === checklistMmpId) as any;
      const tracking = mmp?.payment_tracking || {};
      setPaymentRequestedAt(tracking.payment_requested_at || null);
      setPaymentsConfirmedAt(tracking.payments_confirmed_at || null);
      setPaymentRequestNote('');
      setFeesLockedAt(tracking.exchange_rate_applied_at || null);
      setFeesLockedRate(tracking.exchange_rate_applied ?? null);
      setExchangeRateInput(tracking.exchange_rate_applied ? String(tracking.exchange_rate_applied) : '');
      setWalletUpdateResults(null);
      setCycleSubmittedAt(tracking.submitted_at || null);
      fetchCycleSummary(checklistMmpId);
      fetchAllSiteDetails(checklistMmpId);
    } else {
      setCycleSummaryData(null);
      setAllSiteReviewData([]);
      setPaymentRequestedAt(null);
      setPaymentsConfirmedAt(null);
      setFeesLockedAt(null);
      setFeesLockedRate(null);
      setExchangeRateInput('');
      setCycleSubmittedAt(null);
    }
  }, [checklistMmpId, mmpFiles, fetchCycleSummary, fetchAllSiteDetails]);

  const cycleReadiness = useCycleCloseReadiness(checklistMmpId);

  const submitEligibility = useMemo(() => {
    const unreasoned = checklistMmpId
      ? uncoveredSites.filter(s => s.mmp_id === checklistMmpId && !s.not_covered_reason).length
      : 0;
    return canSubmitForApproval({
      allReadinessPassed: cycleReadiness.allPassed,
      feesLockedAt,
      paymentsConfirmedAt,
      unreasonedSiteCount: unreasoned,
    });
  }, [checklistMmpId, uncoveredSites, cycleReadiness.allPassed, feesLockedAt, paymentsConfirmedAt]);

  const cascadeApproveCost = useCallback(async (cost: FinanceCost, userId: string): Promise<FinanceCost | null> => {
    let current: FinanceCost = { ...cost };
    for (let step = 0; step < 4; step++) {
      const update = buildCostApproveUpdate(current, userId);
      if (Object.keys(update).length === 0) break;
      const row = await applyCostApprovalUpdate(cost.id, update);
      current = { ...current, ...row };
      if (isCostFullyApproved(current)) return null;
    }
    return current;
  }, []);

  const handleApproveCost = useCallback(async (costId: string) => {
    const cost = financeCosts.find(c => c.id === costId);
    if (!cost || !currentUser?.id) return;
    const update = buildCostApproveUpdate(cost, currentUser.id);
    if (Object.keys(update).length === 0) return;
    setFinanceApproving(prev => new Set(prev).add(costId));
    try {
      const row = await applyCostApprovalUpdate(costId, update);
      const updated: FinanceCost = { ...cost, ...row };
      if (isCostFullyApproved(updated)) {
        setFinanceCosts(prev => prev.filter(c => c.id !== costId));
        toast({ title: 'Approved', description: 'Cost submission fully approved.' });
      } else {
        const nextTier = getPendingCostTierLabel(updated);
        setFinanceCosts(prev => prev.map(c => (c.id === costId ? updated : c)));
        toast({
          title: 'Tier approved',
          description: nextTier
            ? `Advanced to ${nextTier}. Approve again to continue.`
            : 'Cost submission updated.',
        });
      }
    } catch (e: any) {
      toast({ title: 'Approval Failed', description: e.message || 'Could not update the record.', variant: 'destructive' });
    } finally {
      setFinanceApproving(prev => { const s = new Set(prev); s.delete(costId); return s; });
    }
  }, [financeCosts, currentUser?.id, toast]);

  const handleRejectCost = useCallback(async (costId: string, reason: string) => {
    const cost = financeCosts.find(c => c.id === costId);
    if (!cost || !currentUser?.id) return;
    const update = buildCostRejectUpdate(cost, currentUser.id, reason);
    if (Object.keys(update).length === 0) return;
    setFinanceRejecting(prev => new Set(prev).add(costId));
    try {
      await applyCostApprovalUpdate(costId, update);
      setFinanceCosts(prev => prev.filter(c => c.id !== costId));
      toast({ title: 'Rejected', description: 'Cost submission rejected.' });
    } catch (e: any) {
      toast({ title: 'Rejection Failed', description: e.message || 'Could not update the record.', variant: 'destructive' });
    } finally {
      setFinanceRejecting(prev => { const s = new Set(prev); s.delete(costId); return s; });
    }
  }, [financeCosts, currentUser?.id, toast]);

  const refetchFinance = useCallback(async () => {
    if (!selectedMmpId || selectedMmpId === 'all') return;
    setFinanceLoading(true);
    try {
      const { data: costs } = await supabase
        .from('operational_cost_submissions')
        .select(COST_APPROVAL_SELECT)
        .or(mmpCostSubmissionOrFilter(selectedMmpId))
        .or(PENDING_COST_TIER_FILTER);
      setFinanceCosts((costs as FinanceCost[]) || []);
    } finally { setFinanceLoading(false); }
  }, [selectedMmpId]);

  const handleApproveAllCosts = useCallback(async () => {
    if (!currentUser?.id || financeCosts.length === 0) return;
    setFinanceApprovingAll(true);
    const total = financeCosts.length;
    try {
      const stillPending: FinanceCost[] = [];
      for (const cost of financeCosts) {
        const remaining = await cascadeApproveCost(cost, currentUser.id);
        if (remaining) stillPending.push(remaining);
      }
      setFinanceCosts(stillPending);
      const cleared = total - stillPending.length;
      if (stillPending.length === 0) {
        toast({ title: 'All Approved', description: `${total} cost submission(s) fully approved.` });
      } else {
        toast({
          title: 'Partially approved',
          description: `${cleared} cleared. ${stillPending.length} still need further tier approval.`,
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'One or more approvals failed.', variant: 'destructive' });
      await refetchFinance();
    } finally {
      setFinanceApprovingAll(false);
    }
  }, [financeCosts, currentUser?.id, toast, cascadeApproveCost, refetchFinance]);

  useEffect(() => {
    if (activeTab !== 'finance' || !selectedMmpId || selectedMmpId === 'all') {
      setFinanceCosts([]);
      setFinanceAdvances([]);
      return;
    }
    const fetchFinance = async () => {
      setFinanceLoading(true);
      try {
        const { data: costs } = await supabase
          .from('operational_cost_submissions')
          .select(COST_APPROVAL_SELECT)
          .or(mmpCostSubmissionOrFilter(selectedMmpId))
          .or(PENDING_COST_TIER_FILTER);
        setFinanceCosts((costs as FinanceCost[]) || []);

        const { data: siteEntries } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', selectedMmpId);
        const siteIds = (siteEntries || []).map((s: { id: string }) => s.id);
        if (siteIds.length > 0) {
          const { data: advances } = await supabase
            .from('down_payment_requests')
            .select('id, status, amount_cents, currency')
            .in('mmp_site_entry_id', siteIds)
            .eq('status', 'approved');
          setFinanceAdvances((advances as FinanceAdvance[]) || []);
        } else {
          setFinanceAdvances([]);
        }
      } catch { /* non-critical */ }
      finally { setFinanceLoading(false); }
    };
    fetchFinance();
  }, [activeTab, selectedMmpId]);

  // Called from the Pre-Close Checklist to resolve an item without leaving the page
  const handleChecklistResolveItem = (itemId: string) => {
    const mmpId = checklistMmpId;
    // Prevent the checklistMmpId→null effect from resetting selectedMmpId to 'all'
    skipMmpResetRef.current = true;
    setChecklistMmpId(null);
    setPendingScopedClose(null);
    setReconciliationAcknowledged(false);
    if (mmpId) setSelectedMmpId(mmpId);
    if (itemId === 'cost_submissions' || itemId === 'transport_advances') {
      setActiveTab('finance');
    } else if (itemId === 'site_visits') {
      setActiveTab('uncovered');
    } else {
      const item = cycleReadiness.items.find(i => i.id === itemId);
      if (item?.link) navigate(item.link);
    }
  };

  // When user opens the checklist for an MMP, auto-sync the Uncovered Sites tab filter
  // so navigating there immediately shows only that MMP's sites.
  // When the checklist is explicitly closed (not resolved), reset to 'all'.
  useEffect(() => {
    setReconciliationAcknowledged(false);
    if (checklistMmpId) {
      setSelectedMmpId(checklistMmpId);
    } else if (!skipMmpResetRef.current) {
      setSelectedMmpId('all');
    }
    skipMmpResetRef.current = false;
  }, [checklistMmpId]);

  // Derive the first actionable blocker from the readiness checklist
  const nextBlocker = useMemo(() => {
    return cycleReadiness.items.find(i => !i.passed && !i.notConfigured) ?? null;
  }, [cycleReadiness.items]);

  // Cycle status of the MMP currently in the checklist dialog
  const checklistMmpStatus = useMemo(() => {
    if (!checklistMmpId) return 'active';
    return (mmpFiles?.find(m => m.id === checklistMmpId) as any)?.cycle_status || 'active';
  }, [checklistMmpId, mmpFiles]);

  // Role flags — declared early to avoid temporal dead zone issues.
  const isSuperAdmin = isSuperAdminCheck();
  const isAdmin = isSuperAdmin || hasAnyRole(['admin']);
  const isSupervisor = hasAnyRole(['supervisor']);
  const isFOM = hasAnyRole(['fom']);
  const canManageCycle = isAdmin || isSuperAdmin;
  // Only Admin / Super Admin manage cycle close steps.
  // FOM role is limited to receiving notifications and confirming (approve/reject) in Step 9.
  const canAssignReasons = canManageCycle;


  // Supervisor hub-filter removed — supervisors are no longer engaged in the cycle close flow.

  const activeMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => {
      const cycleStatus = (m as any).cycle_status || 'active';
      return cycleStatus === 'active' || cycleStatus === 'closing' || cycleStatus === 'pending_approval';
    });
  }, [mmpFiles]);

  const closingMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => (m as any).cycle_status === 'closing');
  }, [mmpFiles]);

  const pendingApprovalMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => (m as any).cycle_status === 'pending_approval');
  }, [mmpFiles]);

  // Stable refs — updated every render so fetchUncoveredSites can access
  // the latest values without being in its useCallback dependency array.
  // This prevents infinite loops caused by mmpFiles/activeMmps/closingMmps
  // getting new references on every render (especially while TanStack Query
  // is loading, filesQuery.data ?? [] creates a new array each render).
  const mmpFilesRef = useRef(mmpFiles);
  const activeMmpsRef = useRef(activeMmps);
  const closingMmpsRef = useRef(closingMmps);
  mmpFilesRef.current = mmpFiles;
  activeMmpsRef.current = activeMmps;
  closingMmpsRef.current = closingMmps;

  // includeActive=true fetches entries for ALL active MMPs (expensive — only
  // call this lazily when the Uncovered Sites tab is open). The default
  // (false) fetches only closing MMP data so the checklist loads quickly.
  const fetchUncoveredSites = useCallback(async (includeActive = false) => {
    setLoading(true);
    try {
      // Read from refs so this callback never needs mmpFiles/activeMmps/closingMmps
      // in its dependency array (they are new references every render while TanStack
      // Query is loading, which was causing an infinite re-render loop).
      const closingIds = closingMmpsRef.current.map(m => m.id);
      // Active MMPs that are NOT already counted in the closing set.
      // Only included when the caller explicitly opts in (lazy tab load).
      const activeOnlyIds = includeActive
        ? activeMmpsRef.current.map(m => m.id).filter(id => !closingIds.includes(id))
        : [];

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

      // Try with the full not_covered_* columns first.
      // If those columns don't exist yet (migration not applied), fall back to
      // base columns only — the filter then uses status alone.
      const fetchAllPagesForIds = async (ids: string[]): Promise<any[]> => {
        if (ids.length === 0) return [];
        const FULL_COLS = 'id, site_name, site_code, state, locality, status, mmp_file_id, not_covered_flag, not_covered_reason, not_covered_reason_other, not_covered_at, not_covered_by';
        const BASE_COLS = 'id, site_name, site_code, state, locality, status, mmp_file_id';

        // Probe: try one row with full columns to detect missing columns
        let useFull = true;
        const probe = await supabase.from('mmp_site_entries').select(FULL_COLS).in('mmp_file_id', ids.slice(0,1)).limit(1);
        if (probe.error && probe.error.message?.includes('column')) {
          useFull = false;
          console.warn('[fetchUncoveredSites] not_covered_* columns not found — apply migration 20260727c_mmp_site_entries_not_covered_columns.sql in Supabase. Falling back to status-only filter.');
        }

        let all: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: pageData, error } = await supabase
            .from('mmp_site_entries')
            .select(useFull ? FULL_COLS : BASE_COLS)
            .in('mmp_file_id', ids)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          all = [...all, ...(pageData || [])];
          if (!pageData || pageData.length < PAGE) break;
        }
        return all;
      };

      // Race the combined fetch against a 60-second timeout so loading always
      // clears even if Supabase stalls (fetch() has no built-in timeout).
      const FETCH_TIMEOUT_MS = 60_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Site data load timed out — try refreshing')), FETCH_TIMEOUT_MS)
      );
      const [closingRaw, activeRaw] = await Promise.race([
        Promise.all([
          fetchAllPagesForIds(closingIds),
          fetchAllPagesForIds(activeOnlyIds),
        ]),
        timeoutPromise,
      ]) as [any[], any[]]; // eslint-disable-line @typescript-eslint/no-explicit-any

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
        const mmp = mmpFilesRef.current?.find(m => m.id === mmpFileId);
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
  // Empty deps: mmpFiles/activeMmps/closingMmps are accessed via refs (updated
  // every render) so they never need to be in this array. Including them caused
  // an infinite loop because filesQuery.data ?? [] creates a new array reference
  // on every render while TanStack Query is loading. toast is also excluded
  // (stable shadcn dispatch). This callback is intentionally created once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase B: load not-covered sites that have approved advances + their recovery status
  const loadExceptionsData = useCallback(async (mmpId: string) => {
    setLoadingExceptions(true);
    try {
      // 1. Get all not-covered entries for this MMP.
      // Try with not_covered_flag filter first; if the column is missing
      // (migration not yet applied) fall back to status-only filter.
      let { data: notCoveredEntries, error: ncErr } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, mmp_file_id, accepted_by, not_covered_reason')
        .eq('mmp_file_id', mmpId)
        .or('not_covered_flag.eq.true,status.eq.not_covered')
        .limit(10000);

      if (ncErr && (ncErr.message?.includes('column') || (ncErr as any).code === '42703')) {
        // Column missing — fall back to status-only
        ({ data: notCoveredEntries, error: ncErr } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, state, mmp_file_id, accepted_by')
          .eq('mmp_file_id', mmpId)
          .eq('status', 'not_covered')
          .limit(10000));
      }

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

      // 5. Get MMP name (use ref so stale closure doesn't return undefined)
      const mmpRow = mmpFilesRef.current?.find(m => m.id === mmpId);
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
  // mmpFiles accessed via mmpFilesRef so it doesn't need to be in deps
  // (including it caused a re-render loop via the loadExceptionsData useEffect).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Internal helper that does the actual matching after columns are known
  const runWFPMatching = useCallback(async (
    rawRows: Record<string, unknown>[],
    filename: string,
    mmpId: string,
    columnMapping?: Record<string, string>,
  ) => {
    setWfpSaving(true);
    setShowColumnMapper(false);
    try {
      // 1. Parse WFP rows (with optional column mapping)
      const wfpRows = rawRows
        .map((r, i) => columnMapping
          ? parseWFPRowWithMapping(r, i + 2, columnMapping)
          : parseWFPRow(r, i + 2))
        .filter(Boolean) as ReturnType<typeof parseWFPRow>[];

      if (wfpRows.length === 0) {
        toast({ title: 'No rows parsed', description: 'Could not find any site rows in the file. Check column headers and try again.', variant: 'destructive' });
        return;
      }

      // 2. Fetch all site entries for this MMP — include status for completion check
      const { data: siteEntries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status')
        .eq('mmp_file_id', mmpId)
        .limit(10000);

      const sites = (siteEntries || []) as SiteEntry[];

      // 3. Run matching
      const results = matchAll(wfpRows as NonNullable<typeof wfpRows[0]>[], sites);
      const summary = summarise(results);

      // 3b. Compute "sites not in WFP file" — MMP sites with no WFP match
      const notInWfp = findSitesNotInWfp(results, sites);
      setWfpNotInWfpSites(notInWfp);

      // 3c. Compute "matched but not yet complete in system"
      const matchedIncomplete = results.filter(r => {
        const st = (r.site_status || '').toLowerCase();
        return r.outcome === 'confirmed' && r.site_entry_id && !COMPLETE_STATUSES.has(st);
      });
      setWfpMatchedIncomplete(matchedIncomplete);

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

      const incompletePart = matchedIncomplete.length > 0
        ? ` · ${matchedIncomplete.length} matched but not yet complete in system`
        : '';
      const notInWfpPart = notInWfp.length > 0
        ? ` · ${notInWfp.length} MMP sites not in WFP file`
        : '';
      toast({
        title: 'WFP file matched',
        description: `${summary.confirmed - matchedIncomplete.length} ready to confirm · ${summary.weak + summary.fuzzy} need review · ${summary.none} no match${incompletePart}${notInWfpPart}`,
      });
    } catch (err) {
      console.error('[WFP] runWFPMatching error:', err);
      toast({ title: 'Error', description: 'Failed to process WFP file', variant: 'destructive' });
    } finally {
      setWfpSaving(false);
    }
  }, [toast]);

  // Public handler: detect columns first, show mapper if needed, else run matching directly
  const handleWFPFileParsed = useCallback((rawRows: Record<string, unknown>[], filename: string, mmpId: string, headers: string[]) => {
    setWfpRawRows(rawRows);
    setWfpRawHeaders(headers);
    setWfpFilename(filename);

    const detection = detectColumns(rawRows);
    setWfpDetectedCols(detection.found);

    if (detection.missing.length > 0) {
      // Required columns not found — show the column mapper
      setShowColumnMapper(true);
    } else {
      // Auto-detected — proceed immediately
      runWFPMatching(rawRows, filename, mmpId);
    }
  }, [runWFPMatching]);

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
          .update({ outcome: r.outcome, review_note: r.match_notes || null, reviewed_by: userId || null, reviewed_at: new Date().toISOString() })
          .eq('upload_id', wfpUploadId)
          .eq('wfp_row_number', r.wfp_row_number);
      }

      // 2. Apply outcomes to mmp_site_entries + log events
      // CRITICAL: only promote sites that are actually complete in the system.
      // Sites matched in WFP but not yet submitted/completed stay as-is and are
      // shown in the "Matched but Not Complete" panel so the team can follow up.
      const confirmedAndComplete = wfpResults.filter(r =>
        r.outcome === 'confirmed' && r.site_entry_id && r.visit_complete === true,
      );
      const matchedButStillIncomplete = wfpResults.filter(r =>
        r.outcome === 'confirmed' && r.site_entry_id && !r.visit_complete,
      );
      const rejected = wfpResults.filter(r => r.outcome === 'rejected' && r.site_entry_id);

      // Update local state so the panel stays accurate after apply
      setWfpMatchedIncomplete(matchedButStillIncomplete);

      for (const r of confirmedAndComplete) {
        await supabase.from('mmp_site_entries')
          .update({ status: 'wfp_confirmed' })
          .eq('id', r.site_entry_id!);

        await logPaymentEvent({
          eventType: 'site_confirmed',
          siteEntryId: r.site_entry_id!,
          mmpId,
          performedById: userId,
          metadata: { wfp_upload_id: wfpUploadId, match_tier: r.match_tier, match_score: r.match_score, wfp_site_name: r.wfp_site_name },
        });

        // Notify enumerator of confirmation
        const { data: entry } = await supabase
          .from('mmp_site_entries')
          .select('accepted_by, site_name')
          .eq('id', r.site_entry_id!)
          .single();

        if (entry?.accepted_by) {
          const siteLabel = entry.site_name || r.wfp_site_name || 'your site';
          await dispatchNotification({
            event: 'site_confirmed',
            recipientIds: [entry.accepted_by],
            titleEn: 'Site Visit WFP Confirmed ✓',
            titleAr: 'تم تأكيد زيارة الموقع من WFP ✓',
            messageEn: `Your visit to ${siteLabel} has been confirmed by WFP.`,
            messageAr: `تم تأكيد زيارتك إلى ${siteLabel} من قبل WFP.`,
            entityType: 'mmp_site_entry',
            entityId: r.site_entry_id!,
            metadata: { site_entry_id: r.site_entry_id!, mmp_id: mmpId },
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
          performedById: userId,
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
          event: 'site_rejected',
          recipientIds: [enumId],
          titleEn: isBundled ? `${sites.length} Site Visits Not Found in WFP Data` : 'Site Visit Not Found in WFP Data',
          titleAr: isBundled ? `${sites.length} زيارات مواقع غير موجودة في بيانات WFP` : 'زيارة موقع غير موجودة في بيانات WFP',
          messageEn: isBundled
            ? `${sites.length} of your sites were not found in the WFP data for ${mmpLabel}: ${sites.join(', ')}. Contact your supervisor for next steps.`
            : `Your visit to ${sites[0]} was not found in the WFP confirmation file for ${mmpLabel}. Contact your supervisor.`,
          messageAr: isBundled
            ? `${sites.length} من مواقعك لم تُعثر في بيانات WFP لـ ${mmpLabel}: ${sites.join(', ')}. تواصل مع مشرفك.`
            : `زيارتك إلى ${sites[0]} لم تُعثر في ملف تأكيد WFP لـ ${mmpLabel}. تواصل مع مشرفك.`,
          entityType: 'mmp',
          entityId: mmpId,
          metadata: { mmp_id: mmpId, rejected_sites: sites.join(', '), bundled: isBundled, site_count: sites.length },
        });
      }

      // 3. Mark upload as applied
      await supabase.from('wfp_confirmation_uploads')
        .update({ status: 'applied', applied_at: new Date().toISOString(), applied_by: userId || null })
        .eq('id', wfpUploadId);

      setWfpAppliedUpload({ filename: wfpFilename || '', applied_at: new Date().toISOString() });
      cycleReadiness.refresh();

      const skipped = matchedButStillIncomplete.length;
      const skipNote = skipped > 0 ? ` · ${skipped} matched-but-incomplete site${skipped > 1 ? 's' : ''} skipped — visit not yet complete` : '';
      toast({
        title: 'WFP results applied',
        description: `${confirmedAndComplete.length} confirmed · ${rejected.length} rejected${skipNote}`,
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
        .select('id, name, month, hub, cycle_status, cycle_closed_at, cycle_close_records')
        .eq('cycle_status', 'closed')
        .order('cycle_closed_at', { ascending: false });

      if (error) throw error;

      const records: ClosedCycleRecord[] = (data || []).map(m => {
        const closeRecords: any[] = (m as any).cycle_close_records || [];
        const snapEntries = closeRecords.filter((r: any) => r.id?.startsWith('snapshot-') && r.status === 'closed');
        const snapEntry = snapEntries[snapEntries.length - 1] ?? null;
        const financialSnapshot: ClosedCycleFinancialSnapshot | null = snapEntry?.financialSnapshot ?? null;
        return {
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
          financialSnapshot,
        };
      });

      if (records.length > 0) {
        // Probe once for not_covered_flag column; fall back to status-only if missing.
        const { error: flagProbeErr } = await supabase
          .from('mmp_site_entries')
          .select('not_covered_flag')
          .limit(1);
        const hasNotCoveredFlag = !flagProbeErr ||
          !(flagProbeErr.message?.includes('column') || (flagProbeErr as any).code === '42703');

        const coveredStatuses = ['submitted', 'wfp_confirmed', 'completed', 'verified'];
        await Promise.all(records.map(async (r) => {
          const uncoveredQuery = hasNotCoveredFlag
            ? supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id).eq('not_covered_flag', true)
            : supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id).eq('status', 'not_covered');
          const [totalRes, completedRes, uncoveredRes] = await Promise.all([
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id),
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', r.id).in('status', coveredStatuses),
            uncoveredQuery,
          ]);
          r.totalSites = totalRes.count ?? 0;
          r.completedSites = completedRes.count ?? 0;
          r.uncoveredSites = uncoveredRes.count ?? 0;
          r.reasonBreakdown = {};
          if (!hasNotCoveredFlag) return; // reason breakdown requires the not_covered_reason column too
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

      // Use the ref so this callback never needs mmpFiles in its dep array.
      // Adding mmpFiles as a dep would recreate the function on every mmpFiles
      // reference change, which triggers the scope-options effect and cascades
      // into extra renders and redundant network calls.
      const mmp = mmpFilesRef.current?.find(m => m.id === mmpId);
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
  // mmpFiles accessed via mmpFilesRef.current — no dep needed; stable callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (svError) {
          const isMissingCol = svError.message?.includes('column') || (svError as any).code === '42703';
          if (isMissingCol) {
            console.warn('[executeScopedClose] not_covered_flag column missing — apply migration 20260727c. Skipping flag step.');
          } else {
            throw svError;
          }
        }
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

  // Primary loading effect — fetch only closing MMP data eagerly so the
  // checklist loads quickly. Active MMP uncovered data is loaded lazily
  // when the user opens the Uncovered Sites tab (see effect below).
  // Previously this depended on activeMmpsLength, which caused repeated
  // heavy fetches (9 active MMPs × 3000 entries) every time TanStack Query
  // updated, making the page hang for up to 20 seconds on load.
  useEffect(() => {
    fetchUncoveredSites(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUncoveredSites]);

  // Lazy — load active MMP uncovered sites only when that tab is open.
  // This avoids fetching thousands of rows on every page load.
  useEffect(() => {
    if (activeTab === 'uncovered') {
      fetchUncoveredSites(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Lazy — closed cycle history is only needed on the "archive" tab.
  // Loading it at startup fired N×4 parallel Supabase requests (3 count queries
  // + 1 paginated reason breakdown per closed cycle), which saturated Chrome's
  // 6-connection-per-host pool and made the page unresponsive on mount.
  // handleApproveCycle already calls fetchClosedCycles() directly when a cycle
  // closes, so the list is always fresh when the archive tab opens.
  useEffect(() => {
    if (activeTab !== 'archive') return;
    fetchClosedCycles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchClosedCycles, activeTab]);

  // Lazy — only fetch scope options for the MMP currently being worked on.
  // Previously this ran for every active MMP at startup, each loading up to
  // 10,000 rows, which contributed heavily to the page-unresponsive hang.
  useEffect(() => {
    if (!checklistMmpId) return;
    if (fetchedScopeIdsRef.current.has(checklistMmpId)) return;
    fetchedScopeIdsRef.current.add(checklistMmpId);
    fetchMmpScopeOptions(checklistMmpId);
  }, [checklistMmpId, fetchMmpScopeOptions]);

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
        // Probe for not_covered_flag column; fall back to status-only if missing.
        let useFlag = true;
        {
          const { error: flagProbe } = await supabase
            .from('mmp_site_entries')
            .select('mmp_file_id, status, not_covered_flag')
            .in('mmp_file_id', mmpIds.slice(0, 1))
            .limit(1);
          if (flagProbe && (flagProbe.message?.includes('column') || (flagProbe as any).code === '42703')) {
            useFlag = false;
          }
        }
        let allSites: Array<{ mmp_file_id: string; status: string | null; not_covered_flag: boolean | null }> = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('mmp_site_entries')
            .select(useFlag ? 'mmp_file_id, status, not_covered_flag' : 'mmp_file_id, status')
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
    // Quality scores are only rendered on the "reports" tab — skip the full
    // mmp_site_entries paginated scan on every other tab to avoid unnecessary load.
    if (activeTab !== 'reports') return;
    const fetchQualityData = async () => {
      // Only query active/closing MMPs — avoids pulling all historical closed-cycle
      // entries and dramatically reduces query cost for large deployments.
      const activeMmpIds = (mmpFiles || [])
        .filter(m => {
          const s = (m as any).cycle_status || 'active';
          return s === 'active' || s === 'closing' || s === 'pending_approval';
        })
        .map(m => m.id);
      if (activeMmpIds.length === 0) return;

      try {
        const PAGE = 1000;
        let allQuality: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: pageData } = await supabase
            .from('mmp_site_entries')
            .select('mmp_file_id, additional_data')
            .in('mmp_file_id', activeMmpIds)
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
  // Lazy — quality scores are only shown on the "reports" tab.
  // Previously this fired at startup downloading all site entries a third time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmpFiles, activeTab]);

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

      // If not_covered_flag column is missing (migration not applied yet) we
      // log a warning and continue — the cycle still moves to 'closing' and
      // the wizard opens. Apply migration 20260727c_mmp_site_entries_not_covered_columns.sql
      // in Supabase to enable full site-flagging.
      if (svError) {
        const isMissingCol = svError.message?.includes('column') || (svError as any).code === '42703';
        if (isMissingCol) {
          console.warn('[handleStartClosingCycle] not_covered_flag column not found — migration not applied. Skipping flag step and continuing cycle close.');
        } else {
          throw svError;
        }
      }

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';
      const mmpHub = mmp?.hub || mmp?.region || '';

      // Notify FOM users that a cycle close has been initiated and their approval will be required.
      // Supervisors and coordinators are not engaged in the cycle close flow.
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
              title: `Cycle Close Initiated — Your Approval Required`,
              message: `Admin has initiated the cycle close process for MMP "${mmpName}". Once all steps are complete, you will be asked to review and approve or reject the cycle.`,
              titleAr: `بدء إغلاق الدورة — موافقتك مطلوبة`,
              messageAr: `بدأ المدير عملية إغلاق الدورة لـ MMP "${mmpName}". بمجرد اكتمال جميع الخطوات، ستُطلب منك مراجعة الدورة والموافقة عليها أو رفضها.`,
              type: 'info',
              category: 'assignments',
              priority: 'high',
              link: '/mmp/cycle-close',
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

      await refreshMMPFiles();
      await fetchUncoveredSites();
      // Immediately select the MMP so the close readiness checklist opens in one flow
      setChecklistMmpId(mmpId);
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

  const exportCycleSummaryExcel = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const mmpName = mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'Cycle';
    const fmt = (cents: number, cur: string) => `${(cents / 100).toLocaleString()} ${cur}`;

    // Main Sheet: Cost Submissions
    const costHeaders = ['Category', 'Submissions', 'Approved Amount', 'Pending Amount', 'Total Amount'];
    const costRows = cycleSummaryData.costSubs.map(r => [
      r.category,
      r.count,
      fmt(r.approvedCents, r.currency),
      fmt(r.pendingCents, r.currency),
      fmt(r.approvedCents + r.pendingCents, r.currency),
    ]);
    const costTotalsRow = [
      'TOTAL',
      cycleSummaryData.costSubs.reduce((s, r) => s + r.count, 0),
      fmt(cycleSummaryData.totalApprovedCents, cycleSummaryData.currency),
      fmt(cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0), cycleSummaryData.currency),
      fmt(cycleSummaryData.costSubs.reduce((s, r) => s + r.approvedCents + r.pendingCents, 0), cycleSummaryData.currency),
    ];

    const breakdownSheets: any[] = [];

    // Sheet 2: Transport Advances (per person)
    const advHeaders = ['Recipient', 'Site', 'Type', 'Total Advanced', 'Paid', 'Remaining', 'Status'];
    const advRows = cycleSummaryData.advanceDetails.map(a => [
      a.requesterName,
      a.siteName,
      a.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
      `${a.requestedAmount.toLocaleString()} ${a.currency}`,
      a.paidAmount > 0 ? `${a.paidAmount.toLocaleString()} ${a.currency}` : '—',
      a.remainingAmount > 0 ? `${a.remainingAmount.toLocaleString()} ${a.currency}` : 'Settled',
      a.remainingAmount <= 0 ? 'Fully Paid' : a.paidAmount > 0 ? 'Partial' : a.status,
    ]);
    if (advRows.length > 0) {
      breakdownSheets.push({
        title: 'Transport Advances Breakdown',
        sheetName: 'Transport Advances',
        headers: advHeaders,
        rows: advRows,
        colWidths: [20, 20, 15, 18, 18, 18, 15]
      });
    }

    // Sheet 3: Withdrawal Requests
    if (cycleSummaryData.withdrawals.length > 0) {
      const wdHeaders = ['Requested By', 'Amount', 'Status', 'Reason'];
      const wdRows = cycleSummaryData.withdrawals.map(w => [
        w.userName,
        `${w.amount.toLocaleString()} ${w.currency}`,
        w.status,
        w.reason,
      ]);
      breakdownSheets.push({
        title: 'Withdrawal Requests Breakdown',
        sheetName: 'Withdrawal Requests',
        headers: wdHeaders,
        rows: wdRows,
        colWidths: [20, 18, 15, 30]
      });
    }

    // Sheet 4: Enumerator Costs
    if (cycleSummaryData.enumeratorCosts.length > 0) {
      const enumHeaders = ['Enumerator', 'Site Name', 'Site Code', 'State', 'Locality', 'Enumerator Fee (SDG)', 'Transport Fee (SDG)', 'Total Cost (SDG)', 'Visit Status', 'Cost Acknowledged'];
      const enumRows = cycleSummaryData.enumeratorCosts.map(e => [
        e.enumeratorName,
        e.siteName,
        e.siteCode,
        e.state,
        e.locality,
        e.enumeratorFee,
        e.transportFee,
        e.totalCost,
        e.status,
        e.costAcknowledged ? 'Yes' : 'No',
      ]);
      breakdownSheets.push({
        title: 'Enumerator Costs Breakdown',
        sheetName: 'Enumerator Costs',
        headers: enumHeaders,
        rows: enumRows,
        colWidths: [20, 25, 12, 15, 15, 18, 18, 18, 15, 12]
      });
    }

    // Sheet 5: Coverage snapshot from siteVisitCounts
    const counts = siteVisitCounts[checklistMmpId];
    if (counts) {
      const covHeaders = ['Status', 'Count'];
      const covRows = Object.entries(counts.statusCounts).map(([status, count]) => [status, count]);
      covRows.push(['TOTAL SITES', counts.total]);
      breakdownSheets.push({
        title: 'Site Coverage Summary',
        sheetName: 'Site Coverage',
        headers: covHeaders,
        rows: covRows,
        colWidths: [25, 12]
      });
    }

    exportStandardExcel({
      reportTitle: `PACT Command Center - ${mmpName} Cycle Summary`,
      subtitleLine: `Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')} | MMP: ${mmpName}`,
      mainSheet: {
        sheetName: 'Cost Submissions',
        headers: costHeaders,
        rows: costRows,
        totalsRow: costTotalsRow,
        colWidths: { 0: 25, 1: 15, 2: 20, 3: 20, 4: 20 }
      },
      breakdownSheets,
      filenamePrefix: `${mmpName.replace(/\s+/g, '_')}_cycle_summary`
    });
  }, [cycleSummaryData, checklistMmpId, mmpFiles, siteVisitCounts]);

  const exportCycleSummaryPDF = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const mmpName = (mmpFiles?.find(m => m.id === checklistMmpId) as any)?.name || checklistMmpId?.slice(0, 8) || 'cycle';
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF('landscape');
    const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // Header
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 297, 28, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT Field Operations', 14, 12);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Cycle Financial Obligations Report', 14, 21);
    doc.setFontSize(10);
    doc.text(`Generated: ${genDate}`, 200, 12);
    doc.text(`MMP: ${mmpName}`, 200, 20);

    let y = 35;

    // Summary KPIs
    const totalEnumCost = cycleSummaryData.totalEnumeratorFee + cycleSummaryData.totalTransportFee;
    const totalRemainingAdv = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.remainingAmount, 0);
    const totalPendingFees = cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0) / 100;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Amount (SDG)']],
      body: [
        ['Enumerator Fees (Field Staff)', cycleSummaryData.totalEnumeratorFee.toLocaleString()],
        ['Transport Fees', cycleSummaryData.totalTransportFee.toLocaleString()],
        ['Total Enumerator + Transport Cost', totalEnumCost.toLocaleString()],
        ['Approved Operational Cost Submissions', (cycleSummaryData.totalApprovedCents / 100).toLocaleString()],
        ['Pending Cost Submissions (fees)', totalPendingFees.toLocaleString()],
        ['Advance Balances — Still to Settle', totalRemainingAdv.toLocaleString()],
        ['Cash Withdrawal Requests (active)', cycleSummaryData.totalWithdrawalAmount.toLocaleString()],
        ['TOTAL OUTSTANDING', (totalEnumCost + totalPendingFees + totalRemainingAdv + cycleSummaryData.totalWithdrawalAmount).toLocaleString()],
      ],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 10, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.row.index === 7) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [254, 243, 199];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // Section 1: Enumerator Costs
    if (cycleSummaryData.enumeratorCosts.length > 0) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Enumerator & Transport Costs by Site', 14, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [['Enumerator', 'Site Name', 'Code', 'State', 'Locality', 'Enum. Fee', 'Transport', 'Total', 'Status', 'Ack.']],
        body: cycleSummaryData.enumeratorCosts.map(e => [
          e.enumeratorName,
          e.siteName.substring(0, 28),
          e.siteCode,
          e.state,
          e.locality,
          e.enumeratorFee.toLocaleString(),
          e.transportFee.toLocaleString(),
          e.totalCost.toLocaleString(),
          e.status.replace(/_/g, ' '),
          e.costAcknowledged ? '✓' : '—',
        ]),
        foot: [['TOTAL', '', '', '', '',
          cycleSummaryData.totalEnumeratorFee.toLocaleString(),
          cycleSummaryData.totalTransportFee.toLocaleString(),
          (cycleSummaryData.totalEnumeratorFee + cycleSummaryData.totalTransportFee).toLocaleString(),
          '', '']],
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], fontSize: 8, fontStyle: 'bold', textColor: 255 },
        footStyles: { fillColor: [209, 250, 229], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 32 }, 1: { cellWidth: 40 }, 2: { cellWidth: 15 },
          3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 22 },
          6: { cellWidth: 22 }, 7: { cellWidth: 22 }, 8: { cellWidth: 22 }, 9: { cellWidth: 10 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Section 2: Transport Advances per person
    if (cycleSummaryData.advanceDetails.length > 0) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Transport Advances (Down-Payments)', 14, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [['Recipient', 'Site', 'Type', 'Total Advanced', 'Paid', 'Remaining', 'Status']],
        body: cycleSummaryData.advanceDetails.map(a => [
          a.requesterName,
          a.siteName.substring(0, 30),
          a.paymentType === 'full_advance' ? 'Full' : 'Installments',
          `${a.requestedAmount.toLocaleString()} ${a.currency}`,
          a.paidAmount > 0 ? `${a.paidAmount.toLocaleString()} ${a.currency}` : '—',
          a.remainingAmount > 0 ? `${a.remainingAmount.toLocaleString()} ${a.currency}` : 'Settled',
          a.remainingAmount <= 0 ? 'Fully Paid' : a.paidAmount > 0 ? 'Partial' : a.status,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], fontSize: 9, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Section 3: Operational Cost Submissions
    if (cycleSummaryData.costSubs.length > 0) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Operational Cost Submissions', 14, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [['Category', 'Count', 'Approved (SDG)', 'Pending (SDG)', 'Total (SDG)']],
        body: cycleSummaryData.costSubs.map(r => [
          r.category, r.count,
          (r.approvedCents / 100).toLocaleString(),
          (r.pendingCents / 100).toLocaleString(),
          ((r.approvedCents + r.pendingCents) / 100).toLocaleString(),
        ]),
        foot: [['TOTAL', cycleSummaryData.costSubs.reduce((s, r) => s + r.count, 0),
          (cycleSummaryData.totalApprovedCents / 100).toLocaleString(),
          (cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0) / 100).toLocaleString(),
          ((cycleSummaryData.totalApprovedCents + cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0)) / 100).toLocaleString()]],
        theme: 'striped',
        headStyles: { fillColor: [124, 58, 237], fontSize: 9, fontStyle: 'bold', textColor: 255 },
        footStyles: { fillColor: [237, 233, 254], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Section 4: Withdrawal Requests
    if (cycleSummaryData.withdrawals.length > 0) {
      if (y > 160) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Cash Withdrawal Requests', 14, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [['Requested By', 'Amount (SDG)', 'Status', 'Reason']],
        body: cycleSummaryData.withdrawals.map(w => [w.userName, w.amount.toLocaleString(), w.status, w.reason.substring(0, 50)]),
        theme: 'striped',
        headStyles: { fillColor: [168, 85, 247], fontSize: 9, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 9 },
      });
    }

    // Footer on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`PACT Command Center — Confidential — Page ${i} of ${pageCount}`, 14, 200);
    }

    doc.save(`${mmpName}-cycle-financial-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [cycleSummaryData, checklistMmpId, mmpFiles]);

  const handleFinalizeCycleClose = async (mmpId: string) => {
    if (!canManageCycle) return;
    const unreasoned = uncoveredSites.filter(s => s.mmp_id === mmpId && !s.not_covered_reason);
    const submitCheck = canSubmitForApproval({
      allReadinessPassed: cycleReadiness.allPassed,
      feesLockedAt,
      paymentsConfirmedAt,
      unreasonedSiteCount: unreasoned.length,
    });
    if (!submitCheck.ok) {
      toast({
        title: 'Cannot Submit',
        description: submitCheck.blockers.join('\n'),
        variant: 'destructive',
      });
      return;
    }

    const { ok: financeOk, issues: financeIssues, pendingViaReport } = await checkFinanceReadinessForClose(mmpId);
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

    if (pendingViaReport > 0) {
      setPendingViaReportCount(pendingViaReport);
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

      // Save submission timestamp to payment_tracking so the timeline can display it
      const submittedNow = new Date().toISOString();
      const mmpForTracking = mmpFiles?.find(m => m.id === mmpId) as any;
      const existingTracking = mmpForTracking?.payment_tracking || {};
      await supabase.from('mmp_files').update({
        payment_tracking: { ...existingTracking, submitted_at: submittedNow, cycle_approval_note: null },
      } as any).eq('id', mmpId);
      setCycleSubmittedAt(submittedNow);

      // Notify FOM users that the cycle is ready for their approval confirmation
      const mmpForNotify = mmpFiles?.find(m => m.id === mmpId);
      const mmpNameForNotify = mmpForNotify?.name || 'MMP';
      const mmpHubForNotify = (mmpForNotify as any)?.hub || (mmpForNotify as any)?.region || '';
      let fomApprovalQuery = supabase
        .from('profiles')
        .select('id')
        .in('role', ['fom', 'Field Operation Manager (FOM)'])
        .eq('status', 'approved');
      if (mmpHubForNotify) {
        const { data: hubRows } = await supabase.from('hubs').select('id').ilike('name', `%${mmpHubForNotify}%`).limit(1);
        if (hubRows && hubRows.length > 0) fomApprovalQuery = fomApprovalQuery.eq('hub_id', hubRows[0].id);
      }
      const { data: fomApprovers } = await fomApprovalQuery;
      if (fomApprovers && fomApprovers.length > 0) {
        await Promise.allSettled(
          fomApprovers.map(fom =>
            NotificationTriggerService.send({
              userId: fom.id,
              title: `Action Required: Approve MMP Cycle Close`,
              message: `MMP "${mmpNameForNotify}" cycle close has been submitted and is awaiting your approval. Please review and confirm or reject.`,
              titleAr: `إجراء مطلوب: الموافقة على إغلاق دورة MMP`,
              messageAr: `تم تقديم إغلاق دورة MMP "${mmpNameForNotify}" وهو في انتظار موافقتك. يرجى المراجعة والتأكيد أو الرفض.`,
              type: 'warning',
              category: 'approvals',
              priority: 'urgent',
              link: '/mmp/cycle-close',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        ).catch(() => {});
      }

      setReconciliationAcknowledged(false);
      setPendingScopedClose(null);
      toast({ title: 'Submitted for Approval', description: 'The cycle has been submitted. FOM has been notified to review and confirm.' });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit for approval', variant: 'destructive' });
    } finally {
      setFinalizingCycle(false);
    }
  };

  const handleReopenCycle = async (mmpId: string, reason: string) => {
    if (!isSuperAdmin) {
      toast({ title: 'Access Denied', description: 'Only Super Admins can re-open a closed cycle.', variant: 'destructive' });
      return;
    }
    setReopeningCycle(true);
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({ cycle_status: 'active', cycle_closed_at: null, cycle_close_records: [] } as any)
        .eq('id', mmpId);
      if (error) throw error;
      await logMMPAudit({
        mmpId,
        mmpName: mmpFiles?.find(m => m.id === mmpId)?.name || 'MMP',
        action: 'cycle_reopened',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName || 'Unknown',
        reason,
        metadata: { reopenedAt: new Date().toISOString() },
      });
      setClosedCycles(prev => prev.filter(c => c.id !== mmpId));
      setReopenConfirmId(null);
      setReopenReason('');
      setExpandedCycle(null);
      await refreshMMPFiles();
      toast({ title: 'Cycle Re-opened', description: 'The cycle has been returned to Active status. You can now make corrections and re-close when ready.' });
    } catch (err: any) {
      toast({ title: 'Re-open Failed', description: err?.message || 'Could not re-open the cycle. Please try again.', variant: 'destructive' });
    } finally {
      setReopeningCycle(false);
    }
  };

  const handleAbortClose = async (mmpId: string) => {
    if (!canManageCycle) {
      toast({ title: 'Access Denied', description: 'Only Admins and Super Admins can abort a cycle close.', variant: 'destructive' });
      return;
    }
    setAbortingClose(true);
    try {
      const mmpName = mmpFiles?.find(m => m.id === mmpId)?.name || mmpId;
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'active',
          cycle_close_records: [],
          cycle_closing_started_at: null,
          cycle_closing_started_by: null,
          cycle_close_deadline: null,
        } as any)
        .eq('id', mmpId);
      if (error) throw error;

      // Clear not_covered_flag that was set on pending/active sites during
      // handleStartClosingCycle. Without this, aborted sites remain permanently
      // flagged as uncovered even though the cycle is back to active.
      // Guard against 42703 (column missing) — cycle_status is already fixed above.
      const { error: flagResetErr } = await supabase
        .from('mmp_site_entries')
        .update({
          not_covered_flag: false,
          not_covered_reason: null,
          not_covered_reason_other: null,
          not_covered_at: null,
          not_covered_by: null,
        } as any)
        .eq('mmp_file_id', mmpId)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);
      if (flagResetErr) {
        const isMissingCol = flagResetErr.message?.includes('column') || (flagResetErr as any).code === '42703';
        if (!isMissingCol) throw flagResetErr;
        console.warn('[handleAbortClose] not_covered_flag column missing — apply migration 20260727c. Flag reset skipped.');
      }
      // Deselect this MMP so the checklist panel closes now that status is back to active.
      if (checklistMmpId === mmpId) setChecklistMmpId(null);

      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName || 'Unknown',
        previousStatus: 'closing',
        newStatus: 'active',
        metadata: { cycleAction: 'abort_close', abortedAt: new Date().toISOString() },
      });
      await refreshMMPFiles();
      await fetchUncoveredSites();
      toast({ title: 'Close Aborted', description: `"${mmpName}" has been returned to Active status. You can restart closing at any time.` });
    } catch (err: any) {
      toast({ title: 'Abort Failed', description: err?.message || 'Could not abort the cycle close. Please try again.', variant: 'destructive' });
    } finally {
      setAbortingClose(false);
    }
  };

  const handleApproveCycle = async (mmpId: string, skipFinanceCheck = false, overrideJustification?: string) => {
    if (!isFOM && !isAdmin) {
      toast({ title: 'Access Denied', description: 'Only FOM, Admin, and Super Admin can approve a cycle.', variant: 'destructive' });
      return;
    }
    if (!skipFinanceCheck) {
      const { ok: financeOk, issues: financeIssues } = await checkFinanceReadinessForClose(mmpId).then(r => r);
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

    setFinalizingCycle(true);
    try {
      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const { error } = await approveCycleClose({
        mmpId,
        mmp: mmpData as any,
        userId: currentUser?.id || '',
        userName: currentUser?.fullName,
        skipFinanceCheck,
        overrideJustification,
      });

      if (error) throw error;

      // Note: not_covered site entry cancellation is now handled atomically inside
      // the cycle_approve_close RPC (Fix 3 — prevents race condition on disconnect).

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
    } finally {
      setFinalizingCycle(false);
    }
  };

  const handleRejectCycle = async (mmpId: string, note: string) => {
    if (!isFOM && !isAdmin) {
      toast({ title: 'Access Denied', description: 'Only FOM, Admin, and Super Admin can reject a cycle.', variant: 'destructive' });
      return;
    }
    setFinalizingCycle(true);
    try {
      const mmp = mmpFiles?.find(m => m.id === mmpId) as any;
      // Clear submitted_at so Step 8 doesn't show a stale timestamp when
      // the admin re-enters the wizard and resubmits after making corrections.
      const existingTracking = mmp?.payment_tracking || {};
      const { submitted_at: _dropped, cycle_approval_note: _note, ...trackingWithoutSubmit } = existingTracking;

      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_approval_note: note,
          // Clear stale records so re-submission starts clean and doesn't
          // accumulate a growing list of rejected close snapshots.
          cycle_close_records: [],
          payment_tracking: trackingWithoutSubmit,
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

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

      setCycleSubmittedAt(null);
      toast({ title: 'Cycle Rejected', description: 'Cycle has been returned to closing status.' });
      await refreshMMPFiles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to reject cycle', variant: 'destructive' });
    } finally {
      setFinalizingCycle(false);
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
        const submittedNow = new Date().toISOString();
        const mmpForTracking = mmpFiles?.find(m => m.id === mmpId) as any;
        const existingTracking = mmpForTracking?.payment_tracking || {};
        const { error } = await supabase
          .from('mmp_files')
          .update({
            cycle_status: 'pending_approval',
            payment_tracking: { ...existingTracking, submitted_at: submittedNow, cycle_approval_note: null },
          } as any)
          .eq('id', mmpId);
        if (error) throw error;
        setCycleSubmittedAt(submittedNow);
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
        // Notify FOM — same recipients as the non-override path
        const mmpHubForNotify = (mmp as any)?.hub || (mmp as any)?.region || '';
        const mmpNameForNotify = mmp?.name || 'MMP';
        let fomApprovalQuery = supabase
          .from('profiles')
          .select('id')
          .in('role', ['fom', 'Field Operation Manager (FOM)'])
          .eq('status', 'approved');
        if (mmpHubForNotify) {
          const { data: hubRows } = await supabase.from('hubs').select('id').ilike('name', `%${mmpHubForNotify}%`).limit(1);
          if (hubRows && hubRows.length > 0) fomApprovalQuery = fomApprovalQuery.eq('hub_id', hubRows[0].id);
        }
        const { data: fomApprovers } = await fomApprovalQuery;
        if (fomApprovers && fomApprovers.length > 0) {
          await Promise.allSettled(
            fomApprovers.map(fom =>
              NotificationTriggerService.send({
                userId: fom.id,
                title: `Action Required: Approve MMP Cycle Close`,
                message: `MMP "${mmpNameForNotify}" cycle close has been submitted (finance gate bypassed by Super Admin) and is awaiting your approval.`,
                titleAr: `إجراء مطلوب: الموافقة على إغلاق دورة MMP`,
                messageAr: `تم تقديم إغلاق دورة MMP "${mmpNameForNotify}" (تجاوز البوابة المالية بواسطة المسؤول) وهو في انتظار موافقتك.`,
                type: 'warning',
                category: 'approvals',
                priority: 'urgent',
                link: '/mmp/cycle-close',
                relatedEntityId: mmpId,
                relatedEntityType: 'mmpFile',
              })
            )
          ).catch(() => {});
        }
        setReconciliationAcknowledged(false);
        setPendingScopedClose(null);
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
    // Quote every field so values containing commas or quotes don't break the CSV.
    const q = (v: string | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Site Name', 'Site Code', 'State', 'Locality', 'Hub', 'Status', 'Reason', 'Other Details', 'Flagged At'].map(q).join(','),
      ...sites.map(s => [
        q(s.site_name),
        q(s.site_code),
        q(s.state),
        q(s.locality),
        q(s.hub),
        q(s.status),
        q(getReasonLabel(s.not_covered_reason)),
        q(s.not_covered_reason_other),
        q(s.not_covered_at),
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

      // Reminder recipients: FOM + Super Admin only — supervisors/coordinators not in cycle close flow
      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, role')
        .in('role', ['fom', 'Field Operation Manager (FOM)', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
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
            .in('role', ['fom', 'Field Operation Manager (FOM)'])
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
    const sites = mmpId ? uncoveredSites.filter(s => s.mmp_id === mmpId) : uncoveredSites;
    const excelData = sites.map(s => ({
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

    exportToExcel(
      excelData,
      'Uncovered Sites',
      `coverage-report-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
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
      totalSites += c.total ?? 0;
      completedSites += (c.statusCounts?.['completed'] ?? 0) + (c.statusCounts?.['wfp_confirmed'] ?? 0);
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
        const aCov = siteVisitCounts[a.id] ? (((siteVisitCounts[a.id].statusCounts?.['completed'] ?? 0) + (siteVisitCounts[a.id].statusCounts?.['wfp_confirmed'] ?? 0)) / (siteVisitCounts[a.id].total || 1)) : 0;
        const bCov = siteVisitCounts[b.id] ? (((siteVisitCounts[b.id].statusCounts?.['completed'] ?? 0) + (siteVisitCounts[b.id].statusCounts?.['wfp_confirmed'] ?? 0)) / (siteVisitCounts[b.id].total || 1)) : 0;
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
        hubMap[hub].completed += (counts.statusCounts?.['completed'] ?? 0) + (counts.statusCounts?.['wfp_confirmed'] ?? 0);
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

  // FOM can view the page only to action the approval step (Step 9).
  // All other roles without canManageCycle are blocked.
  if (!canManageCycle && !isFOM) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-card rounded-xl shadow text-center" data-testid="access-denied">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">Only Admins, Super Admins, and Field Operation Managers (FOM) can access this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full" data-testid="mmp-cycle-close-page">
      {/* ── Page Header — matches User Management style ── */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-background to-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight" data-testid="text-page-title">MMP Cycle Close</h1>
              {isSuperAdmin && <Badge variant="outline" className="border-purple-400 text-purple-700 dark:text-purple-300 text-[11px]"><Shield className="h-3 w-3 mr-1" /> Super Admin</Badge>}
              {!isSuperAdmin && isAdmin && <Badge variant="outline" className="text-[11px]"><Shield className="h-3 w-3 mr-1" /> Admin</Badge>}
              {!isAdmin && isFOM && <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300 text-[11px]"><Shield className="h-3 w-3 mr-1" /> FOM</Badge>}
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block mt-0.5">
              Manage MMP cycle lifecycle, track coverage gaps, and close monitoring periods
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => { fetchUncoveredSites(activeTab === 'uncovered'); fetchClosedCycles(); }} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-lg hidden sm:flex" onClick={() => exportCoverageReport()} data-testid="button-export">
            <Download className="h-4 w-4 mr-1.5" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-lg hidden sm:flex" onClick={() => exportCoverageReportExcel()} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export Excel
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg"
              onClick={() => navigate(checklistMmpId ? `/reconciliation-dashboard?mmpId=${checklistMmpId}` : '/reconciliation-dashboard')}
              data-testid="button-goto-reconciliation"
            >
              <BarChart3 className="h-4 w-4 mr-1.5" /> Reconciliation
            </Button>
          )}
        </div>
      </div>

      {/* ── Stats Cards — matches User Management style ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 sm:px-6 py-4">
        <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Cycles</p>
              <p className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">{activeMmps.length}</p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In Closing</p>
              <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{closingMmps.length}</p>
            </div>
            <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Approval</p>
              <p className="text-2xl font-bold mt-1 text-purple-600 dark:text-purple-400">{pendingApprovalMmps.length}</p>
            </div>
            <div className="p-2.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closed Cycles</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{closedCycles.length}</p>
            </div>
            <div className="p-2.5 rounded-full bg-green-100 dark:bg-green-900/30">
              <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
      </div>

      <div className="px-4 sm:px-6 pb-6 flex-1">

      {/* ── Persistent "Resume Closing" banner ── shown whenever at least one MMP is in closing state */}
      {closingMmps.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {closingMmps.map(mmp => (
            <div
              key={mmp.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 dark:border-amber-700 px-4 py-3 shadow-sm"
              data-testid={`banner-cycle-closing-${mmp.id}`}
            >
              {/* Pulsing dot */}
              <span className="relative flex h-3 w-3 shrink-0 mt-0.5 sm:mt-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate">
                  Cycle closing in progress: <span className="text-amber-700 dark:text-amber-300">{mmp.name}</span>
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  You have unfinished closing steps. Select this MMP below to see exactly what to do next.
                </p>
              </div>

              <Button
                size="sm"
                className={`shrink-0 text-white gap-1.5 text-xs font-semibold shadow ${checklistMmpId === mmp.id ? 'bg-primary hover:bg-primary/90' : 'bg-amber-600 hover:bg-amber-700'}`}
                onClick={() => setChecklistMmpId(checklistMmpId === mmp.id ? null : mmp.id)}
                data-testid={`button-resume-wizard-${mmp.id}`}
              >
                {checklistMmpId === mmp.id
                  ? <><CheckCircle2 className="h-3.5 w-3.5" />Checklist open — click to close</>
                  : <><PlayCircle className="h-3.5 w-3.5" />Resume — see what to do next</>
                }
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ── Purple "Awaiting Your Approval" banner — shown to FOM / Admin / Super Admin ── */}
      {(isFOM || isAdmin || isSuperAdmin) && pendingApprovalMmps.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {pendingApprovalMmps.map(mmp => (
            <div
              key={mmp.id}
              className="rounded-xl border border-purple-300 dark:border-purple-700 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/30 px-4 py-4 shadow-sm"
              data-testid={`banner-pending-approval-${mmp.id}`}
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <span className="relative flex h-3 w-3 shrink-0 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-purple-900 dark:text-purple-100">
                    ⏳ Awaiting Your Approval — <span className="text-purple-700 dark:text-purple-300">{mmp.name}</span>
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                    The admin has completed all closing steps and submitted this cycle for final approval. Review the summary below, then approve to close or reject to send back.
                  </p>
                </div>
              </div>

              {/* Quick stats row */}
              {siteVisitCounts[mmp.id] && (() => {
                const c = siteVisitCounts[mmp.id];
                const completed = (c.statusCounts?.['completed'] ?? 0) + (c.statusCounts?.['wfp_confirmed'] ?? 0);
                const notCovered = c.statusCounts?.['not_covered'] ?? 0;
                const pct = c.total > 0 ? Math.round((completed / c.total) * 100) : 0;
                return (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-3 gap-2 text-center bg-white/50 dark:bg-black/20 rounded-lg p-2">
                    <div>
                      <div className="text-base font-bold text-green-700">{completed}</div>
                      <div className="text-[10px] text-muted-foreground">Sites Completed</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-red-500">{notCovered}</div>
                      <div className="text-[10px] text-muted-foreground">Not Covered</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-purple-700">{pct}%</div>
                      <div className="text-[10px] text-muted-foreground">Coverage Rate</div>
                    </div>
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold shadow"
                  onClick={() => handleApproveCycle(mmp.id)}
                  data-testid={`button-banner-approve-${mmp.id}`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  ✓ Approve &amp; Close Cycle
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 font-semibold shadow"
                  onClick={() => { setBannerRejectMmpId(mmp.id); setBannerRejectNote(''); }}
                  data-testid={`button-banner-reject-${mmp.id}`}
                >
                  <XCircle className="h-4 w-4" />
                  Reject — Send Back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-purple-300 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900"
                  onClick={() => setChecklistMmpId(mmp.id)}
                  data-testid={`button-banner-review-${mmp.id}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Checklist &amp; Reports
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject dialog for banner */}
      <AlertDialog open={!!bannerRejectMmpId} onOpenChange={open => { if (!open) setBannerRejectMmpId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Cycle Close</AlertDialogTitle>
            <AlertDialogDescription>
              This will return the cycle to &quot;Closing&quot; status. The admin will need to resolve the issues and resubmit for approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <label className="text-sm font-medium mb-1.5 block">Reason for rejection <span className="text-muted-foreground font-normal">(required)</span></label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Explain what the team needs to fix before resubmitting..."
              value={bannerRejectNote}
              onChange={e => setBannerRejectNote(e.target.value)}
              data-testid="input-banner-reject-note"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBannerRejectMmpId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!bannerRejectNote.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (bannerRejectMmpId && bannerRejectNote.trim()) {
                  handleRejectCycle(bannerRejectMmpId, bannerRejectNote.trim());
                  setBannerRejectMmpId(null);
                  setBannerRejectNote('');
                }
              }}
              data-testid="button-confirm-banner-reject"
            >
              Reject &amp; Send Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageInfoBanner
        title="MMP Cycle Close - Coverage Management"
        description="This page manages the complete end-of-cycle process for Monthly Monitoring Plans (MMPs). After each monitoring month ends, teams use this page to account for every site — visited or not — resolve all finance obligations tied to that cycle, and formally archive the period. The six tabs guide you from reviewing live coverage stats → assigning reasons to missed sites → passing a readiness checklist → submitting for approval → and finally archiving with full reports. Closed cycles are permanently stored for trend analysis, scorecard benchmarking, and cross-cycle comparison."
        descriptionAr="تُدير هذه الصفحة عملية إغلاق دورة خطط المراقبة الشهرية (MMP) من البداية إلى النهاية. بعد انتهاء كل شهر مراقبة، تستخدم الفرق هذه الصفحة لمحاسبة كل موقع — سواء تمت زيارته أم لا — وحسم جميع الالتزامات المالية المرتبطة بالدورة، وأرشفة الفترة رسمياً. تقودك الأجزاء الستة من مراجعة إحصائيات التغطية المباشرة → تعيين أسباب المواقع التي لم تُزَر → اجتياز قائمة الجاهزية → تقديم الدورة للموافقة → وأخيراً الأرشفة مع التقارير الكاملة. تُحفظ الدورات المغلقة بشكل دائم لتحليل الاتجاهات والمقارنة عبر الدورات."
        workflowSteps={[
          { step: 1, role: 'Admin / Super Admin', action: 'Initiate cycle close', description: 'On the Active Cycles tab, find the MMP for the completed month. Click "Start Close". The system immediately auto-flags every site that was not completed or officially cancelled. FOM is notified automatically.' },
          { step: 2, role: 'Admin / Super Admin', action: 'Assign reasons to uncovered sites', description: 'Switch to the Uncovered Sites tab. Assign a reason to each flagged site (security incident, access denied, flooding, budget cut, data collector absent, etc.). Use Bulk Assign to apply one reason to many sites at once.' },
          { step: 3, role: 'Admin / Super Admin', action: 'Pass the readiness checklist', description: 'Click the MMP row to open the Cycle Close panel. The Readiness Checklist must show all green ticks: site visits resolved, no pending cost submissions, transport advances reconciled, withdrawal requests processed, cost recoveries addressed, and WFP file applied.' },
          { step: 4, role: 'Admin / Super Admin', action: 'Resolve finance blocks', description: 'If any finance gate is red: go to Finance → Cost Submissions to approve/reject pending items; go to Reconciliation to mark advances as reconciled. If a gate shows amber "(not configured)", see the guide below for what SQL migration to run.' },
          { step: 5, role: 'Admin / Super Admin', action: 'Submit for approval', description: 'Once the checklist score reaches 100%, click "Submit for Approval". FOM receives an urgent approval-request notification.' },
          { step: 6, role: 'FOM / Super Admin', action: 'Confirm — Approve or Reject', description: 'FOM (or Super Admin) reviews the final coverage report, quality scores, and finance summary. They click Approve & Close Cycle or Reject & Send Back with a written reason.' },
          { step: 7, role: 'System', action: 'Archive the cycle', description: 'On approval the cycle status becomes Closed. All stats (coverage %, COMPLETED, UNCOVERED, OVERDUE counts, reason breakdowns, quality scores) are permanently archived and appear in the Closed Cycles and Comparison tabs.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير / المدير العام', action: 'بدء إغلاق الدورة', description: 'في تبويب الدورات النشطة، ابحث عن خطة المراقبة الشهرية للشهر المكتمل. انقر "بدء الإغلاق". يقوم النظام فوراً بتحديد كل موقع لم يُكتمل أو يُلغَ رسمياً. يُرسَل إشعار تلقائي لمدير العمليات الميدانية.' },
          { step: 2, role: 'المدير / المدير العام', action: 'تعيين أسباب المواقع غير المغطاة', description: 'انتقل إلى تبويب المواقع غير المغطاة. عيّن سبباً لكل موقع (حادث أمني، رفض الوصول، فيضانات، تخفيضات الميزانية، غياب جامع البيانات، إلخ). استخدم "التعيين الجماعي" لتطبيق سبب واحد على مواقع متعددة دفعةً واحدة.' },
          { step: 3, role: 'المدير / المدير العام', action: 'اجتياز قائمة جاهزية الإغلاق', description: 'انقر على صف خطة المراقبة لفتح لوحة إغلاق الدورة. يجب أن تظهر قائمة الجاهزية بعلامات خضراء: المواقع محسومة، لا توجد تقديمات تكلفة معلقة، تسوية السلف المالية، معالجة طلبات السحب، معالجة استرداد التكاليف، وتطبيق ملف WFP.' },
          { step: 4, role: 'المدير / المدير العام', action: 'حسم إشكاليات المالية', description: 'إذا كان أي بند مالي أحمر: اذهب إلى المالية → تقديمات التكاليف لاعتماد أو رفض البنود المعلقة؛ اذهب إلى التسوية لتحديد السلف كمسوّاة.' },
          { step: 5, role: 'المدير / المدير العام', action: 'تقديم للموافقة', description: 'بمجرد وصول نسبة القائمة إلى 100%، انقر "تقديم للموافقة". يُرسَل إشعار عاجل لمدير العمليات الميدانية لطلب التأكيد.' },
          { step: 6, role: 'مدير العمليات / المدير العام', action: 'تأكيد — موافقة أو رفض', description: 'يراجع مدير العمليات الميدانية (أو المدير العام) تقرير التغطية النهائي ودرجات الجودة والملخص المالي. ينقر موافقة وإغلاق الدورة أو رفض مع سبب مكتوب لإعادتها.' },
          { step: 7, role: 'النظام', action: 'أرشفة الدورة', description: 'عند الموافقة، يصبح وضع الدورة "مغلقة". تُؤرشَف جميع الإحصائيات (نسبة التغطية، الأعداد، تفاصيل الأسباب، درجات الجودة) بشكل دائم وتظهر في تبويبي الدورات المغلقة والمقارنة.' },
        ]}
      />

      {/* ── 7-Step Workflow Strip + Summary Cards ── */}
      {(<>
      {/* ── Prominent 7-Step Workflow Strip ── always visible, no collapsible ── */}
      <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden" data-testid="cycle-close-steps-strip">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
          <Layers className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Cycle Close Workflow — 7 Steps</span>
          <span dir="rtl" className="text-xs text-slate-400 mr-1">خطوات إغلاق الدورة</span>
        </div>
        {/* Horizontal scrollable step list */}
        <div className="flex overflow-x-auto gap-0 divide-x divide-slate-100 dark:divide-slate-800">
          {([
            { n: 1, role: 'Admin', roleColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', action: 'Start Close', detail: 'Find the MMP on Active Cycles tab → click "Start Close"', icon: PlayCircle },
            { n: 2, role: 'Admin', roleColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', action: 'Assign Reasons', detail: 'Uncovered Sites tab → assign a reason to every flagged site', icon: MapPin },
            { n: 3, role: 'Admin', roleColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', action: 'Readiness Check', detail: 'Open the cycle panel → all 6 checklist gates must be green ✓', icon: CheckCircle2 },
            { n: 4, role: 'Admin', roleColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', action: 'Resolve Finance', detail: 'Fix any red gates: approve costs, reconcile advances', icon: DollarSign },
            { n: 5, role: 'Admin', roleColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', action: 'Submit for Approval', detail: 'Checklist = 100% → click Submit. FOM is notified instantly.', icon: ArrowRight },
            { n: 6, role: 'FOM', roleColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', action: 'Approve or Reject', detail: 'FOM reviews coverage & finance → Approve to close, or Reject to send back', icon: Shield },
            { n: 7, role: 'System', roleColor: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400', action: 'Cycle Archived', detail: 'Status → Closed. Stats permanently saved. PDF/Excel available.', icon: BookOpen },
          ] as const).map((s, idx) => {
            const Icon = s.icon;
            const isLast = idx === 6;
            return (
              <div key={s.n} className={`flex-none w-[160px] sm:w-[170px] p-3 flex flex-col gap-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isLast ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="flex-none inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-[10px] font-bold">{s.n}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.roleColor}`}>{s.role}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{s.action}</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{s.detail}</p>
                {!isLast && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
                    <span className="text-[9px] text-slate-300 italic">then →</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
      </>)}



      {/* ── Selected MMP banner: shown when a cycle is being prepared for close ── */}
      {checklistMmpId && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 mb-2" data-testid="banner-mmp-close-context">
          <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              Closing: <span className="font-bold">{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</span>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Use the Active Cycles tab — the checklist below the MMP cards enforces step order.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400" onClick={() => { setChecklistMmpId(null); setReconciliationAcknowledged(false); }} title="Deselect MMP" data-testid="button-deselect-mmp">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); }} className="space-y-4">
        <TabsList data-testid="tabs-cycle-close" className="h-auto flex flex-nowrap gap-1 p-1.5 overflow-x-auto w-full justify-start bg-muted/60 rounded-xl border border-border/60">
          <TabsTrigger value="active" data-testid="tab-active" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span className="font-medium">Active Cycles</span>
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Click "Close Full MMP" here</span>
          </TabsTrigger>
          <TabsTrigger value="uncovered" data-testid="tab-uncovered" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">Uncovered Sites</span>
              {cycleStats.uncoveredSites > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{cycleStats.uncoveredSites}</Badge>}
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Assign a reason to each site</span>
          </TabsTrigger>
          <TabsTrigger value="finance" data-testid="tab-finance" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">Pending Finance</span>
              {(financeCosts.length + financeAdvances.length) > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{financeCosts.length + financeAdvances.length}</Badge>
              )}
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Settle costs &amp; advances</span>
          </TabsTrigger>
          <TabsTrigger value="wfp" data-testid="tab-wfp" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-medium">WFP Confirmation</span>
              {wfpAppliedUpload && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700">Applied</Badge>}
              {!wfpAppliedUpload && wfpSummary && wfpSummary.pendingReview > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{wfpSummary.pendingReview}</Badge>
              )}
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Upload WFP payment proof</span>
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">Exceptions</span>
              {notCoveredAdvanceSites.filter(s => !s.recovery_decision).length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {notCoveredAdvanceSites.filter(s => !s.recovery_decision).length}
                </Badge>
              )}
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Handle advance recovery cases</span>
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="font-medium">Reports</span>
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Export cycle summary PDF/Excel</span>
          </TabsTrigger>
          <TabsTrigger value="adhoc" data-testid="tab-adhoc" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium">Ad-hoc Visits</span>
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Unplanned/extra site visits</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span className="font-medium">Comparison</span>
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Compare two MMP cycles</span>
          </TabsTrigger>
          <TabsTrigger value="scorecard" data-testid="tab-scorecard" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0 flex-col items-start py-2">
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              <span className="font-medium">Scorecard</span>
            </div>
            <span className="text-[10px] font-normal text-muted-foreground text-left">Cycle performance score</span>
          </TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm gap-1.5 shrink-0">
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
                        onScopeDropdownOpen={(mmpId) => {
                          if (!fetchedScopeIdsRef.current.has(mmpId)) {
                            fetchedScopeIdsRef.current.add(mmpId);
                            fetchMmpScopeOptions(mmpId);
                          }
                        }}
                        handleStartClosingCycle={(mmpId) => {
                          handleStartClosingCycle(mmpId);
                        }}
                        onOpenGuide={() => setChecklistMmpId(mmp.id)}
                        handleScopedClose={handleScopedClose}
                        handleFinalizeCycleClose={handleFinalizeCycleClose}
                        handleApproveCycle={handleApproveCycle}
                        handleRejectCycle={handleRejectCycle}
                        handleSendReminders={handleSendReminders}
                        handleAbortClose={handleAbortClose}
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
          {/* ── Close Readiness Panel — visible in-page when an MMP is selected ── */}
          {checklistMmpId && (
            <div className="space-y-4 pt-2 border-t border-border/40 mt-2" data-testid="section-close-readiness">
              <h3 className="text-sm font-semibold text-foreground mt-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Close Readiness: {mmpFiles?.find(m => m.id === checklistMmpId)?.name}
              </h3>

              {checklistMmpStatus === 'closed' && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30 px-4 py-3 mb-2">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-green-800 dark:text-green-200">Cycle Closed &amp; Archived</p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                      All steps are complete. This cycle is permanently archived.
                      {(() => {
                        const closedAt = mmpFiles?.find(m => m.id === checklistMmpId)?.cycle_closed_at;
                        return closedAt ? ` Closed on ${new Date(closedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.` : '';
                      })()} 
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <Button size="sm" variant="outline" className="ml-auto shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 gap-1.5 text-xs" onClick={() => { setChecklistMmpId(null); setReopenConfirmId(checklistMmpId!); setReopenReason(''); }} data-testid="button-reopen-from-guide">
                      <RefreshCw className="h-3 w-3" /> Re-open
                    </Button>
                  )}
                </div>
              )}

              {checklistMmpStatus === 'closing' && (() => {
                const rejNote = (mmpFiles?.find(m => m.id === checklistMmpId) as any)?.cycle_approval_note;
                if (!rejNote) return null;
                return (
                  <div className="flex items-start gap-3 rounded-xl border-2 border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-3 mb-2" data-testid="banner-cycle-rejected">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-red-800 dark:text-red-200">Cycle Returned for Corrections</p>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1"><span className="font-semibold">Reason:</span> {rejNote}</p>
                      <p className="text-[11px] text-red-500 dark:text-red-400 mt-1.5">Address the issues above, then re-submit for approval.</p>
                    </div>
                  </div>
                );
              })()} 

              <CycleCloseGuide
                mmpId={checklistMmpId}
                checklistItems={cycleReadiness.items}
                loading={cycleReadiness.loading}
                onTabChange={(tab) => {
                  setActiveTab(tab);
                  if (tab === 'finance' && checklistMmpId) setSelectedMmpId(checklistMmpId);
                }}
              />

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
                onResolveItem={handleChecklistResolveItem}
                overrideLabel="Override &amp; Start Closing"
              />
              <ReconciliationSummary
                mmpId={checklistMmpId ?? undefined}
                mmpContextLabel={mmpFiles?.find(m => m.id === checklistMmpId)?.name}
              />
              {cycleReadiness.allPassed && !cycleReadiness.loading && (
                <div className="space-y-3 pt-1">
                  <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20 p-3" data-testid="label-reconciliation-ack">
                    <input type="checkbox" checked={reconciliationAcknowledged} onChange={e => setReconciliationAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" data-testid="checkbox-reconciliation-ack" />
                    <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">
                      I have reviewed the reconciliation summary above and confirm that all financial obligations for this cycle are accounted for.
                    </span>
                  </label>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setChecklistMmpId(null); setPendingScopedClose(null); setReconciliationAcknowledged(false); }} data-testid="button-cancel-close-gate">Cancel</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { const mmpId = checklistMmpId!; const pending = pendingScopedClose; setPendingScopedClose(null); setReconciliationAcknowledged(false); if (pending) { executeScopedClose(mmpId, pending.scope, pending.scopeValue); } else { handleStartClosingCycle(mmpId); } }} disabled={closingCycle || !reconciliationAcknowledged} data-testid="button-proceed-close-cycle">
                      {pendingScopedClose ? `Proceed to Close (${pendingScopedClose.scope})` : 'Proceed to Close Cycle'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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

          {(filteredSites.length !== uncoveredSites.length || selectedMmpId !== 'all') && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
              <span data-testid="text-filter-count">
                Showing {filteredSites.length} of{' '}
                {selectedMmpId !== 'all'
                  ? (siteVisitCounts[selectedMmpId]?.total ?? uncoveredSites.filter(s => s.mmp_id === selectedMmpId).length)
                  : uncoveredSites.length}{' '}
                {selectedMmpId !== 'all' ? 'sites in this MMP' : 'uncovered sites'}
              </span>
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
                <div className="flex-1 grid grid-cols-6 gap-2">
                  <span className="col-span-2">Site</span>
                  <span>State</span>
                  <span>Hub</span>
                  <span>Status</span>
                  <span>Reason</span>
                </div>
                <div className="w-8 flex justify-center shrink-0">
                  <Checkbox
                    checked={filteredSites.length > 0 && filteredSites.every(s => selectedSites.has(s.id))}
                    onCheckedChange={toggleAllFiltered}
                    data-testid="checkbox-select-all"
                  />
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
          {checklistMmpId && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-300/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-xs" data-testid="banner-cycle-context-exceptions">
              <ArrowLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-blue-800 dark:text-blue-200">
                Closing: <strong>{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</strong> — reviewing cost-recovery exceptions for this cycle.
              </span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-700 dark:text-blue-300 ml-auto" onClick={() => setActiveTab('active')} data-testid="button-back-to-checklist-exceptions">
                ← Back to Active Cycles
              </Button>
            </div>
          )}
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

        {/* ── PENDING FINANCE TAB ── */}
        <TabsContent value="finance" className="space-y-4">
          {checklistMmpId && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-300/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-xs" data-testid="banner-cycle-context-finance">
              <ArrowLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-blue-800 dark:text-blue-200">
                Closing: <strong>{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</strong> — reviewing pending finance for this cycle.
              </span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-700 dark:text-blue-300 ml-auto" onClick={() => setActiveTab('active')} data-testid="button-back-to-checklist-finance">
                ← Back to Active Cycles
              </Button>
            </div>
          )}
          {/* MMP selector row — always visible at the top of the Finance tab */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">View MMP:</span>
                <Select value={selectedMmpId} onValueChange={setSelectedMmpId} data-testid="select-finance-mmp">
                  <SelectTrigger className="w-[260px] h-8 text-sm" data-testid="trigger-finance-mmp">
                    <SelectValue placeholder="Select an MMP…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">— Select an MMP —</SelectItem>
                    {activeMmps.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMmpId !== 'all' && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedMmpId('all')} data-testid="button-clear-finance-mmp">
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          {selectedMmpId === 'all' ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select an MMP above to view its pending finance items.
              </CardContent>
            </Card>
          ) : financeLoading ? (
            <Card>
              <CardContent className="py-10 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Amounts to Clear Banner */}
              {(financeCosts.length > 0 || financeAdvances.length > 0) && (
                <div className="rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3 space-y-2" data-testid="banner-amounts-to-clear">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <p className="text-sm font-bold text-red-800 dark:text-red-200">
                      {financeCosts.length + financeAdvances.length} item{financeCosts.length + financeAdvances.length !== 1 ? 's' : ''} must be cleared before this cycle can close
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 text-xs">
                    {financeCosts.length > 0 && (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 dark:bg-black/20 border border-red-200 dark:border-red-800 px-3 py-2">
                        <div>
                          <span className="font-semibold text-red-700 dark:text-red-300">
                            {financeCosts.length} pending cost submission{financeCosts.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-muted-foreground ml-1.5">
                            — {(financeCosts.reduce((s, c) => s + (c.amount_cents ?? 0), 0) / 100).toLocaleString()} {financeCosts[0]?.currency ?? 'SDG'} total
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 gap-1"
                          onClick={handleApproveAllCosts}
                          disabled={financeApprovingAll}
                          data-testid="button-banner-approve-all-costs"
                        >
                          {financeApprovingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve All
                        </Button>
                      </div>
                    )}
                    {financeAdvances.length > 0 && (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 dark:bg-black/20 border border-orange-200 dark:border-orange-800 px-3 py-2">
                        <div>
                          <span className="font-semibold text-orange-700 dark:text-orange-300">
                            {financeAdvances.length} transport advance{financeAdvances.length !== 1 ? 's' : ''} unpaid
                          </span>
                          <span className="text-muted-foreground ml-1.5">
                            — {(financeAdvances.reduce((s, a) => s + (a.amount_cents ?? 0), 0) / 100).toLocaleString()} {financeAdvances[0]?.currency ?? 'SDG'} total
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] shrink-0 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 gap-1"
                          onClick={() => navigate('/down-payment-approval?tab=tracker')}
                          data-testid="button-banner-open-advances"
                        >
                          Open Advances <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Pending Cost Submissions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ReceiptText className="h-4 w-4 text-amber-500" />
                    Pending Cost Submissions
                    {financeCosts.length > 0 && (
                      <Badge variant="destructive" className="ml-1">{financeCosts.length}</Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {financeCosts.length > 0 && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          onClick={handleApproveAllCosts}
                          disabled={financeApprovingAll}
                          data-testid="button-approve-all-costs"
                        >
                          {financeApprovingAll ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                          Approve All
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={refetchFinance}
                        disabled={financeLoading}
                        data-testid="button-refresh-finance-costs"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${financeLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {mmpFiles?.find(m => m.id === selectedMmpId)?.name ?? 'This MMP'} — cost submissions waiting for approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {financeCosts.length === 0 ? (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> All cost submissions are approved — no pending items.
                    </p>
                  ) : (
                    <div className="rounded-lg border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="px-3 py-2 text-left font-medium">Description / Vendor</th>
                            <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Category</th>
                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                            <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Date</th>
                            <th className="px-3 py-2 text-center font-medium">Stage</th>
                            <th className="px-3 py-2 text-center font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financeCosts.map(c => {
                            const pendingTier = getPendingCostTierLabel(c);
                            const isApproving = financeApproving.has(c.id);
                            return (
                              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2 max-w-[180px] truncate">{c.description || c.vendor || '—'}</td>
                                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{c.expense_category || '—'}</td>
                                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                  {c.amount_cents != null ? `${(c.amount_cents / 100).toLocaleString()} ${c.currency ?? 'SDG'}` : '—'}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{c.expense_date ?? '—'}</td>
                                <td className="px-3 py-2 text-center">
                                  {pendingTier && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">
                                      {pendingTier}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[11px] px-2 border-green-500 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/20"
                                      onClick={() => handleApproveCost(c.id)}
                                      disabled={isApproving || financeRejecting.has(c.id) || !pendingTier}
                                      data-testid={`button-approve-cost-${c.id}`}
                                    >
                                      {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[11px] px-2 border-red-400 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
                                      onClick={() => setFinanceRejectDialog({ open: true, costId: c.id, reason: '' })}
                                      disabled={isApproving || financeRejecting.has(c.id) || !pendingTier}
                                      data-testid={`button-reject-cost-${c.id}`}
                                    >
                                      {financeRejecting.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reject'}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rejection reason dialog */}
              <Dialog open={financeRejectDialog.open} onOpenChange={open => !open && setFinanceRejectDialog(d => ({ ...d, open: false }))}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" /> Reject Cost Submission
                    </DialogTitle>
                    <DialogDescription>Provide a rejection reason. The submitter will be notified.</DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="Reason for rejection (optional)..."
                    value={financeRejectDialog.reason}
                    onChange={e => setFinanceRejectDialog(d => ({ ...d, reason: e.target.value }))}
                    className="min-h-[80px] text-sm"
                    data-testid="textarea-reject-reason"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setFinanceRejectDialog(d => ({ ...d, open: false }))}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const { costId, reason } = financeRejectDialog;
                        if (!costId) return;
                        setFinanceRejectDialog(d => ({ ...d, open: false }));
                        await handleRejectCost(costId, reason);
                      }}
                      data-testid="button-confirm-reject-cost"
                    >
                      Confirm Reject
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* ── Enumerator Financial Reconciliation ── */}
              <EnumeratorReconciliation
                mmpId={selectedMmpId}
                mmpName={mmpFiles?.find(m => m.id === selectedMmpId)?.name}
                wfpApplied={Boolean(wfpAppliedUpload)}
              />

              {/* Stuck Transport Advances */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    Transport Advances Pending Payment
                    {financeAdvances.length > 0 && (
                      <Badge variant="destructive" className="ml-auto">{financeAdvances.length}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">Advances approved but not yet marked as paid</CardDescription>
                </CardHeader>
                <CardContent>
                  {financeAdvances.length === 0 ? (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> All transport advances are settled.
                    </p>
                  ) : (
                    <>
                      <div className="rounded-lg border overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="px-3 py-2 text-left font-medium">Advance ID</th>
                              <th className="px-3 py-2 text-right font-medium">Amount</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {financeAdvances.map(a => (
                              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[160px]">{a.id}</td>
                                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                  {a.amount_cents != null ? `${(a.amount_cents / 100).toLocaleString()} ${a.currency ?? 'SDG'}` : '—'}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-300">{a.status}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('/down-payment-approval?tab=tracker')}
                          data-testid="button-open-advances-from-finance-tab"
                        >
                          Mark Paid in Down-Payments
                          <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── WFP CONFIRMATION TAB (Phase C) ── */}
        <TabsContent value="wfp" className="space-y-4">
          {checklistMmpId && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-300/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-xs" data-testid="banner-cycle-context-wfp">
              <ArrowLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-blue-800 dark:text-blue-200">
                Closing: <strong>{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</strong> — upload WFP file for this cycle.
              </span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-700 dark:text-blue-300 ml-auto" onClick={() => setActiveTab('active')} data-testid="button-back-to-checklist-wfp">
                ← Back to Active Cycles
              </Button>
            </div>
          )}
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

                          const confirmed = wfpResults.filter(r => r.outcome === 'confirmed').length;
                          const rejected  = wfpResults.filter(r => r.outcome === 'rejected').length;
                          const none      = wfpResults.filter(r => r.match_tier === 'none').length;

                          const summaryRows = [
                            { 'Item': 'WFP Match Results Summary', 'Value': '' },
                            { 'Item': 'File', 'Value': wfpAppliedUpload.filename },
                            { 'Item': 'Applied', 'Value': format(new Date(wfpAppliedUpload.applied_at), 'MMM d, yyyy h:mm a') },
                            { 'Item': 'Total Rows', 'Value': wfpResults.length },
                            { 'Item': 'Confirmed', 'Value': confirmed },
                            { 'Item': 'Rejected', 'Value': rejected },
                            { 'Item': 'No Match (WFP rows)', 'Value': none },
                          ];

                          exportMultiSheetExcel([
                            { name: 'WFP Results', data: rows },
                            { name: 'Summary', data: summaryRows }
                          ], `wfp-results-${checklistMmpId?.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.xlsx`);
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
                      onFileParsed={(rows, filename, headers) => handleWFPFileParsed(rows, filename, checklistMmpId, headers)}
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

              {/* Column Mapper — shown when auto-detection fails */}
              {showColumnMapper && wfpRawRows && wfpRawHeaders.length > 0 && (
                <WFPColumnMapper
                  allHeaders={wfpRawHeaders}
                  autoDetected={wfpDetectedCols}
                  onConfirm={(mapping) => {
                    setShowColumnMapper(false);
                    runWFPMatching(wfpRawRows!, wfpFilename || 'wfp_file.xlsx', checklistMmpId, mapping);
                  }}
                  onCancel={() => setShowColumnMapper(false)}
                />
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
                        {wfpMatchedIncomplete.length > 0 && (
                          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-xs gap-1">
                            <Clock className="h-3 w-3" />
                            {wfpMatchedIncomplete.length} not yet complete
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
                      Strong matches are auto-confirmed. Review weak and fuzzy matches manually. Only sites that are <strong>completed</strong> in the system will be promoted to WFP Confirmed — matched-but-incomplete sites are held and shown below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WFPMatchReviewTable
                      results={wfpResults}
                      onChange={updated => {
                        setWfpResults(updated);
                        setWfpSummary(summarise(updated));
                        // Recompute incomplete list when user changes outcomes
                        const newIncomplete = updated.filter(r => {
                          const st = (r.site_status || '').toLowerCase();
                          return r.outcome === 'confirmed' && r.site_entry_id && !COMPLETE_STATUSES.has(st);
                        });
                        setWfpMatchedIncomplete(newIncomplete);
                      }}
                      disabled={wfpApplying}
                    />
                  </CardContent>
                </Card>
              )}

              {/* ── Matched-but-Incomplete panel ───────────────────────────── */}
              {wfpMatchedIncomplete.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-300">
                        <Clock className="h-4 w-4" />
                        Matched in WFP — Not Yet Complete in System
                        <span dir="rtl" className="text-xs font-normal text-muted-foreground">مطابق في WFP، غير مكتمل في النظام</span>
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                        onClick={() => {
                          const rows = wfpMatchedIncomplete.map(r => ({
                            'WFP Site': r.wfp_site_name || '',
                            'WFP State': r.wfp_state || '',
                            'WFP Locality': r.wfp_locality || '',
                            'WFP Partner': r.wfp_partner || '',
                            'System Site': r.matched_site?.site_name || '',
                            'System Status': r.site_status || '',
                            'Match Score': `${(r.match_score * 100).toFixed(0)}%`,
                          }));
                          exportToExcel(rows, `wfp_incomplete_${checklistMmpId}`);
                        }}
                        data-testid="button-wfp-incomplete-export"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export for Team
                      </Button>
                    </div>
                    <CardDescription className="text-xs text-amber-700 dark:text-amber-400">
                      These sites appear in the WFP file but the data collector hasn't submitted the visit yet.
                      They are <strong>not</strong> promoted to WFP Confirmed until the visit is complete.
                      Share this list with your field team, then re-upload the WFP file once visits are submitted.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-100 dark:bg-amber-900/40">
                          <tr>
                            {['WFP Site', 'State / Locality', 'System Site', 'Current Status', 'Match Score'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-amber-800 dark:text-amber-300">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wfpMatchedIncomplete.map((r, idx) => (
                            <tr key={r.wfp_row_number} className={idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-amber-50/60 dark:bg-amber-950/10'}>
                              <td className="px-3 py-2 font-medium">{r.wfp_site_name || '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground">{[r.wfp_state, r.wfp_locality].filter(Boolean).join(' / ') || '—'}</td>
                              <td className="px-3 py-2">{r.matched_site?.site_name || '—'}</td>
                              <td className="px-3 py-2">
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] capitalize">
                                  {r.site_status || 'unknown'}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{(r.match_score * 100).toFixed(0)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Not in WFP panel ──────────────────────────────────────── */}
              {wfpNotInWfpSites.length > 0 && (
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-slate-500" />
                        MMP Sites Not Found in WFP File
                        <span dir="rtl" className="text-xs font-normal text-muted-foreground">مواقع غير موجودة في ملف WFP</span>
                        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs">
                          {wfpNotInWfpSites.length}
                        </Badge>
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          const rows = wfpNotInWfpSites.map(s => ({
                            'Site Name': s.site_name,
                            'State': s.state || '',
                            'Locality': s.locality || '',
                            'System Status': s.status || '',
                            'Site Code': s.site_code || '',
                          }));
                          exportToExcel(rows, `wfp_not_in_wfp_${checklistMmpId}`);
                        }}
                        data-testid="button-wfp-notinwfp-export"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export List
                      </Button>
                    </div>
                    <CardDescription className="text-xs">
                      These MMP sites had no matching row in the WFP file. They will proceed to <strong>Step 4 — Mark Uncovered</strong>.
                      If these sites were visited, check with WFP to confirm the data is in their system.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            {['Site Name', 'State / Locality', 'System Status', 'Site Code'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wfpNotInWfpSites.map((s, idx) => (
                            <tr key={s.id} className={idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-muted/20'}>
                              <td className="px-3 py-2 font-medium">{s.site_name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{[s.state, s.locality].filter(Boolean).join(' / ') || '—'}</td>
                              <td className="px-3 py-2">
                                {s.status ? (
                                  <Badge className="text-[10px] capitalize bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {s.status}
                                  </Badge>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground font-mono">{s.site_code || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

                          {/* Financial Settlement Snapshot (frozen at close time) */}
                          {cycle.financialSnapshot ? (
                            (() => {
                              const snap = cycle.financialSnapshot!;
                              const net = snap.enumeratorFees + snap.transportFees + snap.opCosts - snap.advancesRecovered;
                              return (
                                <div className="space-y-2 border-t pt-3 mt-1" data-testid={`section-financial-snapshot-${cycle.id}`}>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <DollarSign className="h-3.5 w-3.5" /> Financial Settlement — Frozen at Close
                                  </h4>
                                  {liveExchangeRate && (
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                      <span>Rate: 1 USD = {liveExchangeRate.toLocaleString()} SDG</span>
                                    </p>
                                  )}
                                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                                    <div className="bg-muted/40 rounded-lg p-2.5">
                                      <div className="text-muted-foreground mb-0.5">Enumerator Fees</div>
                                      <div className="font-mono font-semibold" data-testid={`text-snap-enum-${cycle.id}`}>{snap.enumeratorFees.toLocaleString()} {snap.currency}</div>
                                      {liveExchangeRate && snap.enumeratorFees > 0 && (
                                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">≈ USD {(snap.enumeratorFees / liveExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                      )}
                                      <div className="text-muted-foreground text-[10px]">{snap.payableSiteCount} payable sites</div>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-2.5">
                                      <div className="text-muted-foreground mb-0.5">Transport Fees</div>
                                      <div className="font-mono font-semibold" data-testid={`text-snap-transport-${cycle.id}`}>{snap.transportFees.toLocaleString()} {snap.currency}</div>
                                      {liveExchangeRate && snap.transportFees > 0 && (
                                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">≈ USD {(snap.transportFees / liveExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                      )}
                                    </div>
                                    {snap.opCosts > 0 && (
                                      <div className="bg-muted/40 rounded-lg p-2.5">
                                        <div className="text-muted-foreground mb-0.5">Approved Op. Costs</div>
                                        <div className="font-mono font-semibold">{snap.opCosts.toLocaleString()} {snap.currency}</div>
                                        {liveExchangeRate && (
                                          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">≈ USD {(snap.opCosts / liveExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        )}
                                      </div>
                                    )}
                                    {snap.advancesRecovered > 0 && (
                                      <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2.5">
                                        <div className="text-muted-foreground mb-0.5">Advances Recovered</div>
                                        <div className="font-mono font-semibold text-orange-700 dark:text-orange-400">−{snap.advancesRecovered.toLocaleString()} {snap.currency}</div>
                                        {liveExchangeRate && (
                                          <div className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">≈ USD {(snap.advancesRecovered / liveExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        )}
                                      </div>
                                    )}
                                    <div className={`rounded-lg p-2.5 col-span-2 ${net >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                                      <div className="text-muted-foreground mb-0.5">{net >= 0 ? 'Net Paid to Field Staff' : 'Net Recovered from Field'}</div>
                                      <div className={`font-mono font-bold text-sm ${net >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`} data-testid={`text-snap-net-${cycle.id}`}>
                                        {Math.abs(net).toLocaleString()} {snap.currency}
                                      </div>
                                      {liveExchangeRate && (
                                        <div className={`text-[10px] font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          ≈ USD {(Math.abs(net) / liveExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="border-t pt-3 mt-1">
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <DollarSign className="h-3.5 w-3.5" />
                                Financial snapshot not available — cycle was closed before this feature was added.
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReport(cycle.id)} data-testid={`button-export-csv-${cycle.id}`}>
                              <Download className="h-3 w-3 mr-1" /> CSV
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReportExcel(cycle.id)} data-testid={`button-export-xlsx-${cycle.id}`}>
                              <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
                            </Button>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 gap-1.5"
                                onClick={() => { setReopenConfirmId(cycle.id); setReopenReason(''); }}
                                data-testid={`button-reopen-cycle-${cycle.id}`}
                              >
                                <RefreshCw className="h-3 w-3" /> Re-open Cycle
                              </Button>
                            )}
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
      </div>

      {/* Re-open Cycle Confirmation Dialog — Super Admin only */}
      <Dialog open={!!reopenConfirmId} onOpenChange={(open) => { if (!open) { setReopenConfirmId(null); setReopenReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" /> Re-open Closed Cycle
            </DialogTitle>
            <DialogDescription>
              This will return the cycle to <strong>Active</strong> status so corrections can be made. This action is logged and requires a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/30 px-3 py-2">
              <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <p className="text-xs font-semibold text-purple-800 dark:text-purple-200">Super Admin action — this is logged in the audit trail.</p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold">⚠️ Before re-opening, be aware:</p>
              <ul className="space-y-1 pl-3 list-disc">
                <li>All close progress (reasons, finance clearance) is preserved — nothing is lost.</li>
                <li>The cycle will reappear in the Active MMPs tab.</li>
                <li>You will need to re-run the close process and get approval again.</li>
                <li>Any archived financial records remain unchanged.</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Reason for re-opening <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Explain why this cycle needs to be re-opened (e.g. incorrect data, missed sites, finance correction needed…)"
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                className="text-xs min-h-[72px] resize-none"
                data-testid="textarea-reopen-reason"
              />
              {reopenReason.trim().length === 0 && (
                <p className="text-xs text-muted-foreground">A reason is required to proceed.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => { setReopenConfirmId(null); setReopenReason(''); }} disabled={reopeningCycle}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
              onClick={() => reopenConfirmId && handleReopenCycle(reopenConfirmId, reopenReason)}
              disabled={reopeningCycle || reopenReason.trim().length === 0}
              data-testid="button-confirm-reopen"
            >
              {reopeningCycle ? <><Loader2 className="h-4 w-4 animate-spin" /> Re-opening…</> : <><RefreshCw className="h-4 w-4" /> Yes, Re-open Cycle</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  const [open, setOpen] = useState(false);

  // keep local state in sync when parent refreshes site data
  useEffect(() => {
    setLocalReason(site.not_covered_reason || '');
    setLocalOther(site.not_covered_reason_other || '');
  }, [site.not_covered_reason, site.not_covered_reason_other]);

  const handleSaveReason = () => {
    if (!localReason) return;
    onAssignReason(site.id, localReason as NotCoveredReason, localReason === 'other' ? localOther : undefined);
    setOpen(false);
  };

  const reasonBadge = (
    <Badge
      variant={getReasonBadgeVariant(site.not_covered_reason)}
      className={canAssign ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
      data-testid={`badge-reason-${site.id}`}
    >
      {site.not_covered_reason ? (
        <span className="flex items-center gap-1">
          {getReasonLabel(site.not_covered_reason)}
          <span dir="rtl" className="text-muted-foreground/70 text-[10px] hidden sm:inline">{getReasonLabelAr(site.not_covered_reason)}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          No Reason
          {canAssign && <ChevronDown className="h-3 w-3" />}
        </span>
      )}
    </Badge>
  );

  return (
    <div className={`border rounded-lg px-3 py-2 ${selected ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : 'bg-card'}`} data-testid={`row-site-${site.id}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-6 gap-2 items-center text-sm">
          <div className="col-span-2">
            <div className="font-medium truncate">{site.site_name}</div>
            <div className="text-xs text-muted-foreground">{site.site_code}</div>
          </div>
          <div className="text-muted-foreground truncate text-xs">{site.state}</div>
          <div className="text-muted-foreground truncate text-xs">{site.hub || '—'}</div>
          <div>
            <Badge variant="outline" className="text-[11px]">{site.status}</Badge>
          </div>
          <div onClick={e => e.stopPropagation()}>
            {canAssign ? (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{reasonBadge}</PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-2" align="start" side="bottom">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reason for Not Covered</p>
                  <Select value={localReason} onValueChange={v => setLocalReason(v as NotCoveredReason)}>
                    <SelectTrigger className="w-full text-xs h-8" data-testid={`select-reason-${site.id}`}>
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {NOT_COVERED_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value} className="text-xs">
                          <span>{r.label}</span>
                          <span dir="rtl" className="text-muted-foreground/70 text-[10px] ml-1">{r.labelAr}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {localReason === 'other' && (
                    <Textarea
                      value={localOther}
                      onChange={e => setLocalOther(e.target.value)}
                      placeholder="Specify reason..."
                      className="min-h-[56px] text-xs"
                      data-testid={`input-other-reason-${site.id}`}
                    />
                  )}
                  {site.not_covered_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Last updated: {new Date(site.not_covered_at).toLocaleString()}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleSaveReason}
                      disabled={!localReason || saving || (localReason === 'other' && !localOther.trim())}
                      data-testid={`button-save-reason-${site.id}`}
                    >
                      Save
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : reasonBadge}
          </div>
        </div>
        <div className="w-8 flex justify-center shrink-0" onClick={e => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onToggle} data-testid={`checkbox-site-${site.id}`} />
        </div>
      </div>
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
