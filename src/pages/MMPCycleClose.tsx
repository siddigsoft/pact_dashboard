import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { RolledAllocationsPanel } from '@/components/cycle/RolledAllocationsPanel';
import { parseWFPRow, matchAll, summarise } from '@/utils/wfpMatcher';
import type { MatchResult, MatchSummary } from '@/utils/wfpMatcher';
import { logPaymentEvent } from '@/services/paymentEventLogger';
import { dispatchNotification } from '@/lib/notify';
import AdhocSiteVisitsTab from '@/components/mmp/AdhocSiteVisitsTab';
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
    // When arriving from the "Go to Cycle Close" banner in MMP Management,
    // ?wizardFor=X auto-opens the guided wizard for that specific MMP.
    const wizardForParam = searchParams.get('wizardFor');
    if (wizardForParam && mmpFiles && mmpFiles.length > 0) {
      setChecklistMmpId(wizardForParam);
    }
  }, [searchParams, mmpFiles]);
  const [closedCycles, setClosedCycles] = useState<ClosedCycleRecord[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [reopenConfirmId, setReopenConfirmId] = useState<string | null>(null);
  const [reopeningCycle, setReopeningCycle] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
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
        .select('expense_category, amount_cents, currency, tier1_status, tier2_status')
        .eq('mmp_id', mmpId);
      const catMap: Record<string, { count: number; approvedCents: number; pendingCents: number; currency: string }> = {};
      (costRows || []).forEach((r: any) => {
        const cat = r.expense_category || 'Other';
        if (!catMap[cat]) catMap[cat] = { count: 0, approvedCents: 0, pendingCents: 0, currency: r.currency || 'SDG' };
        catMap[cat].count++;
        const cents = r.amount_cents ?? 0;
        const fullyApproved = r.tier1_status === 'approved' && r.tier2_status === 'approved';
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

  const handleRequestPayments = useCallback(async (mmpId: string) => {
    setRequestingPayment(true);
    try {
      const now = new Date().toISOString();
      const mmp = (mmpFiles?.find(m => m.id === mmpId) as any);
      const existing = mmp?.payment_tracking || {};
      const { error } = await supabase.from('mmp_files').update({
        payment_tracking: { ...existing, payment_requested_at: now, payment_requested_by: currentUser?.id, payment_note: paymentRequestNote || null },
      } as any).eq('id', mmpId);
      setPaymentRequestedAt(now);
      if (!error) await refreshMMPFiles();
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
      setPaymentsConfirmedAt(now);
      if (!error) await refreshMMPFiles();
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

      // Bulk update mmp_site_entries fees to SDG equivalent
      for (const site of sitesToUpdate) {
        const newEnumFee = Math.round(site.enumeratorFee * rate);
        const newTransFee = Math.round(site.transportFee * rate);
        await supabase.from('mmp_site_entries').update({
          enumerator_fee: newEnumFee,
          transport_fee: newTransFee,
          cost: newEnumFee + newTransFee,
          currency: 'SDG',
        }).eq('id', site.id);
      }

      // Wallet updates — one transaction per site per enumerator
      let walletSuccess = 0;
      let walletFailed = 0;
      if (updateWallets) {
        for (const site of sitesToUpdate) {
          if (!site.enumeratorId) continue;
          const sdgTotal = Math.round((site.enumeratorFee + site.transportFee) * rate);
          if (sdgTotal <= 0) continue;
          try {
            const { error } = await supabase.from('wallet_transactions').upsert({
              user_id: site.enumeratorId,
              type: 'mmp_fee',
              amount: sdgTotal,
              currency: 'SDG',
              description: `MMP Cycle Fee — ${site.siteName} (1 USD = ${rate.toLocaleString()} SDG)`,
              reference_id: site.id,
              reference_type: 'mmp_site_entry',
              mmp_id: mmpId,
              created_at: new Date().toISOString(),
            } as any, { onConflict: 'reference_id' });
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
        ? walletSuccess > 0 ? ` Wallet updated for ${walletSuccess} enumerator${walletSuccess !== 1 ? 's' : ''}.` : ' Wallet update skipped (column may not exist).'
        : '';
      toast({
        title: `✅ Fees Locked at 1 USD = ${rate.toLocaleString()} SDG`,
        description: `${sitesToUpdate.length} site fees converted to SDG.${walletMsg}`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to lock fees', variant: 'destructive' });
    } finally {
      setLockingFees(false);
    }
  }, [allSiteReviewData, exchangeRateInput, updateWallets, mmpFiles, currentUser, refreshMMPFiles, fetchCycleSummary, fetchAllSiteDetails, toast]);

  const exportPaymentSheetExcel = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const XLSX = await import('xlsx');
    const mmpName = mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'Cycle';
    const wb = XLSX.utils.book_new();
    const advMap: Record<string, AdvanceDetail> = {};
    cycleSummaryData.advanceDetails.forEach(a => { if (a.siteEntryId) advMap[a.siteEntryId] = a; });
    const totalGross = cycleSummaryData.enumeratorCosts.reduce((s, e) => s + e.totalCost, 0);
    const totalAdvPaid = Object.values(advMap).reduce((s, a) => s + a.paidAmount, 0);
    const totalNet = Math.max(0, totalGross - totalAdvPaid);
    const payRows = cycleSummaryData.enumeratorCosts.map(e => {
      const adv = advMap[e.id];
      const advPaid = adv?.paidAmount ?? 0;
      return {
        'Enumerator': e.enumeratorName, 'Site Name': e.siteName, 'Site Code': e.siteCode,
        'State': e.state, 'Locality': e.locality, 'Visit Status': e.status.replace(/_/g, ' '),
        'Enum. Fee (SDG)': e.enumeratorFee, 'Transport Fee (SDG)': e.transportFee,
        'Gross Total (SDG)': e.totalCost,
        'Advance Paid (SDG)': advPaid > 0 ? advPaid : 0,
        'Advance Remaining (SDG)': adv && adv.remainingAmount > 0 ? adv.remainingAmount : 0,
        'NET TO PAY (SDG)': Math.max(0, e.totalCost - advPaid),
        'Cost Ack.': e.costAcknowledged ? 'Yes' : 'No',
      };
    });
    payRows.push({
      'Enumerator': 'TOTAL', 'Site Name': '', 'Site Code': '', 'State': '', 'Locality': '', 'Visit Status': '',
      'Enum. Fee (SDG)': cycleSummaryData.totalEnumeratorFee, 'Transport Fee (SDG)': cycleSummaryData.totalTransportFee,
      'Gross Total (SDG)': totalGross, 'Advance Paid (SDG)': totalAdvPaid,
      'Advance Remaining (SDG)': Object.values(advMap).reduce((s, a) => s + Math.max(0, a.remainingAmount), 0),
      'NET TO PAY (SDG)': totalNet, 'Cost Ack.': '',
    } as any);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payRows), 'Payment Sheet');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Item': 'MMP Cycle', 'Value': mmpName },
      { 'Item': 'Generated', 'Value': new Date().toLocaleDateString('en-GB') },
      { 'Item': 'Total Dispatched Sites', 'Value': cycleSummaryData.enumeratorCosts.length },
      { 'Item': 'Gross Fees (SDG)', 'Value': totalGross },
      { 'Item': 'Advances Already Paid (SDG)', 'Value': totalAdvPaid },
      { 'Item': 'NET AMOUNT TO PAY (SDG)', 'Value': totalNet },
      { 'Item': 'Approved Op. Costs (SDG)', 'Value': cycleSummaryData.totalApprovedCents / 100 },
      ...(feesLockedRate ? [
        { 'Item': '─── Exchange Rate ───', 'Value': '' },
        { 'Item': 'Rate Applied (1 USD → SDG)', 'Value': feesLockedRate },
        { 'Item': 'Rate Locked On', 'Value': feesLockedAt ? new Date(feesLockedAt).toLocaleDateString('en-GB') : '' },
        { 'Item': 'Note', 'Value': 'All fees above are in SDG at the locked rate' },
      ] : [{ 'Item': 'Exchange Rate', 'Value': 'Not locked — fees may still be in USD' }]),
    ]), 'Summary');
    XLSX.writeFile(wb, `${mmpName}-payment-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      { label: 'Prepared By', role: 'Coordinator / Field Operations' },
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
      const status = mmp?.cycle_status ?? 'active';
      const tracking = mmp?.payment_tracking || {};
      setPaymentRequestedAt(tracking.payment_requested_at || null);
      setPaymentsConfirmedAt(tracking.payments_confirmed_at || null);
      setPaymentRequestNote('');
      setFeesLockedAt(tracking.exchange_rate_applied_at || null);
      setFeesLockedRate(tracking.exchange_rate_applied ?? null);
      if (tracking.exchange_rate_applied) setExchangeRateInput(String(tracking.exchange_rate_applied));
      setWalletUpdateResults(null);
      setCycleSubmittedAt(tracking.submitted_at || null);
      if (status === 'closing' || status === 'pending_approval') {
        fetchCycleSummary(checklistMmpId);
        fetchAllSiteDetails(checklistMmpId);
      }
    } else {
      setCycleSummaryData(null);
      setAllSiteReviewData([]);
      setPaymentRequestedAt(null);
      setPaymentsConfirmedAt(null);
    }
  }, [checklistMmpId, mmpFiles, fetchCycleSummary, fetchAllSiteDetails]);

  const cycleReadiness = useCycleCloseReadiness(checklistMmpId);
  const [reconciliationAcknowledged, setReconciliationAcknowledged] = useState(false);

  // Inline fee editing inside closing summary
  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeEdits, setFeeEdits] = useState<Record<string, { enum: number; transport: number }>>({});
  const [savingFees, setSavingFees] = useState(false);

  // Step 2 — Site & Advance Review
  const [allSiteReviewData, setAllSiteReviewData] = useState<SiteReviewEntry[]>([]);
  const [loadingAllSites, setLoadingAllSites] = useState(false);
  const [siteReviewSearch, setSiteReviewSearch] = useState('');
  const [siteReviewStatusFilter, setSiteReviewStatusFilter] = useState('all');

  // Step 6 — Exchange Rate & Fee Lock
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [feesLockedAt, setFeesLockedAt] = useState<string | null>(null);
  const [feesLockedRate, setFeesLockedRate] = useState<number | null>(null);
  const [lockingFees, setLockingFees] = useState(false);
  const [updateWallets, setUpdateWallets] = useState(true);
  const [walletUpdateResults, setWalletUpdateResults] = useState<{ success: number; failed: number } | null>(null);

  // Step 7 — Payment Request
  const [cycleSubmittedAt, setCycleSubmittedAt] = useState<string | null>(null);
  const [paymentRequestedAt, setPaymentRequestedAt] = useState<string | null>(null);
  const [paymentsConfirmedAt, setPaymentsConfirmedAt] = useState<string | null>(null);
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [confirmingPayments, setConfirmingPayments] = useState(false);
  const [paymentRequestNote, setPaymentRequestNote] = useState('');

  // Scroll guard — only auto-scroll once per step change, not on every render
  const guideScrolledStepRef = useRef<string | null>(null);

  // Finance tab state
  type FinanceCost = { id: string; description: string | null; vendor: string | null; amount_cents: number; currency: string | null; expense_date: string | null; expense_category: string | null; tier1_status: string | null; tier2_status: string | null; tier3_status: string | null };
  type FinanceAdvance = { id: string; status: string; amount_cents: number | null; currency: string | null };
  const [financeCosts, setFinanceCosts] = useState<FinanceCost[]>([]);
  const [financeAdvances, setFinanceAdvances] = useState<FinanceAdvance[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeApproving, setFinanceApproving] = useState<Set<string>>(new Set());
  const [financeRejecting, setFinanceRejecting] = useState<Set<string>>(new Set());
  const [financeApprovingAll, setFinanceApprovingAll] = useState(false);
  const [financeRejectDialog, setFinanceRejectDialog] = useState<{ open: boolean; costId: string | null; reason: string }>({ open: false, costId: null, reason: '' });

  // Build correct update payload mirroring CostSubmission.tsx approval logic
  const buildCostApproveUpdate = (cost: FinanceCost, userId: string): Record<string, string | null> => {
    const now = new Date().toISOString();
    const hasThreeTiers = cost.tier3_status !== null;
    if (cost.tier1_status === 'pending') {
      return { tier1_status: 'approved', tier1_approved_by: userId, tier1_approved_at: now, status: 'under_review' };
    } else if (cost.tier2_status === 'pending') {
      if (hasThreeTiers) {
        return { tier2_status: 'approved', tier2_approved_by: userId, tier2_approved_at: now, status: 'under_review', tier3_status: 'pending' };
      }
      return { tier2_status: 'approved', tier2_approved_by: userId, tier2_approved_at: now, status: 'approved' };
    } else if (cost.tier3_status === 'pending') {
      return { tier3_status: 'approved', tier3_approved_by: userId, tier3_approved_at: now, status: 'approved' };
    }
    return {};
  };

  const buildCostRejectUpdate = (cost: FinanceCost, userId: string, reason: string): Record<string, string | null> => {
    const now = new Date().toISOString();
    const msg = reason || 'Rejected from MMP Cycle Close';
    if (cost.tier1_status === 'pending') {
      return { tier1_status: 'rejected', tier1_approved_by: userId, tier1_approved_at: now, tier1_notes: msg, status: 'rejected', rejection_reason: msg };
    } else if (cost.tier2_status === 'pending') {
      return { tier2_status: 'rejected', tier2_approved_by: userId, tier2_approved_at: now, tier2_notes: msg, status: 'rejected', rejection_reason: msg };
    } else if (cost.tier3_status === 'pending') {
      return { tier3_status: 'rejected', tier3_approved_by: userId, tier3_approved_at: now, tier3_notes: msg, status: 'rejected', rejection_reason: msg };
    }
    return {};
  };

  const handleApproveCost = useCallback(async (costId: string) => {
    const cost = financeCosts.find(c => c.id === costId);
    if (!cost || !currentUser?.id) return;
    const update = buildCostApproveUpdate(cost, currentUser.id);
    if (Object.keys(update).length === 0) return;
    setFinanceApproving(prev => new Set(prev).add(costId));
    try {
      const { error } = await supabase.from('operational_cost_submissions').update(update).eq('id', costId);
      if (error) throw error;
      setFinanceCosts(prev => prev.filter(c => c.id !== costId));
      toast({ title: 'Approved', description: 'Cost submission approved.' });
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
      const { error } = await supabase.from('operational_cost_submissions').update(update).eq('id', costId);
      if (error) throw error;
      setFinanceCosts(prev => prev.filter(c => c.id !== costId));
      toast({ title: 'Rejected', description: 'Cost submission rejected.' });
    } catch (e: any) {
      toast({ title: 'Rejection Failed', description: e.message || 'Could not update the record.', variant: 'destructive' });
    } finally {
      setFinanceRejecting(prev => { const s = new Set(prev); s.delete(costId); return s; });
    }
  }, [financeCosts, currentUser?.id, toast]);

  const handleApproveAllCosts = useCallback(async () => {
    if (!currentUser?.id || financeCosts.length === 0) return;
    setFinanceApprovingAll(true);
    try {
      await Promise.all(financeCosts.map(async cost => {
        const update = buildCostApproveUpdate(cost, currentUser.id!);
        if (Object.keys(update).length === 0) return;
        const { error } = await supabase.from('operational_cost_submissions').update(update).eq('id', cost.id);
        if (error) throw error;
      }));
      setFinanceCosts([]);
      toast({ title: 'All Approved', description: `${financeCosts.length} cost submissions approved.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'One or more approvals failed.', variant: 'destructive' });
    } finally {
      setFinanceApprovingAll(false);
    }
  }, [financeCosts, currentUser?.id, toast]);

  const refetchFinance = useCallback(async () => {
    if (!selectedMmpId || selectedMmpId === 'all') return;
    setFinanceLoading(true);
    try {
      const { data: costs } = await supabase
        .from('operational_cost_submissions')
        .select('id, description, vendor, amount_cents, currency, expense_date, expense_category, tier1_status, tier2_status, tier3_status')
        .eq('mmp_id', selectedMmpId)
        .or('tier1_status.eq.pending,tier2_status.eq.pending,tier3_status.eq.pending');
      setFinanceCosts((costs as FinanceCost[]) || []);
    } finally { setFinanceLoading(false); }
  }, [selectedMmpId]);

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
          .select('id, description, vendor, amount_cents, currency, expense_date, expense_category, tier1_status, tier2_status, tier3_status')
          .eq('mmp_id', selectedMmpId)
          .or('tier1_status.eq.pending,tier2_status.eq.pending,tier3_status.eq.pending');
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

  // Role flags — declared here (before guideSteps) to avoid temporal dead zone.
  // Previously declared after guideSteps which caused "Cannot access before initialization".
  const isSuperAdmin = isSuperAdminCheck();
  const isAdmin = isSuperAdmin || hasAnyRole(['admin']);
  const isSupervisor = hasAnyRole(['supervisor']);
  const isFOM = hasAnyRole(['fom']);
  const canManageCycle = isAdmin || isSuperAdmin;
  const canAssignReasons = isAdmin || isSupervisor || isFOM;

  // Five-step guided close flow derived from readiness items
  const guideSteps = useMemo(() => {
    const ri = cycleReadiness.items;
    const get = (id: string) => ri.find(i => i.id === id);
    const financeIds = ['cost_submissions', 'transport_advances', 'withdrawal_requests', 'cost_recovery'];
    const financePassed = financeIds.every(id => get(id)?.passed !== false || get(id) === undefined);
    const financeIssues = financeIds.map(id => get(id)).filter(i => i && !i.passed) as typeof ri;

    const svItem = get('site_visits');
    const svRemaining = svItem && !svItem.passed ? (svItem.total - svItem.count) : 0;
    const csItem = get('cost_submissions');
    const csRemaining = csItem && !csItem.passed ? csItem.total : 0;
    const wfpItem = get('wfp_confirmation');

    const paymentStepPassed = paymentsConfirmedAt !== null;
    const wfpPassed = wfpItem?.notConfigured ? true : (wfpItem?.passed ?? false);
    const reasonsPassed = svItem?.passed ?? false;
    const feesLocked = feesLockedAt !== null;
    const exchangeRateBlocked = !reasonsPassed || !financePassed || !wfpPassed;
    const paymentStepBlocked = exchangeRateBlocked || !feesLocked;

    return [
      {
        id: 'start', number: 1,
        title: 'Start Closing', titleAr: 'بدء الإغلاق',
        desc: 'Closing process initiated. The cycle is now locked for new visits — work through each step below in order to fully close and archive it.',
        passed: true, blocked: false,
        tab: null as string | null, actionLabel: null as string | null,
        sub: [] as typeof ri,
        remaining: 0,
        howTo: [
          'This step is automatically done when you start the close process.',
          'Work through Steps 2 → 7 in order. You can leave and come back any time — progress is saved.',
          'Use "Check again" after completing work in another tab to update the status here.',
        ] as string[],
      },
      {
        id: 'site_review', number: 2,
        title: 'Review All Sites & Advances', titleAr: 'مراجعة المواقع والسلف',
        desc: 'Review all MMP sites, their current visit status, and any transport advances paid per site. This is a read-only overview to help you understand the full financial picture before proceeding.',
        passed: true,
        blocked: false,
        tab: null, actionLabel: null,
        sub: [],
        remaining: 0,
        howTo: [
          'Review the full site list below — all sites assigned to this MMP are shown.',
          'The "Advance" column shows whether a transport advance was issued and how much was paid.',
          'Advance amounts already paid will be automatically deducted from the Payment Sheet in Step 7.',
          'Sites with 0 fees set will need fee entry before the payment sheet is generated.',
          'No action needed here — this step is informational and always marked Done.',
        ],
      },
      {
        id: 'reasons', number: 3,
        title: 'Assign Reasons — Uncovered Sites', titleAr: 'أسباب المواقع غير المغطاة',
        desc: svItem?.passed
          ? 'All unvisited sites have a documented reason — this gate is clear.'
          : svRemaining > 0
            ? `${svRemaining} site${svRemaining !== 1 ? 's' : ''} still need a reason recorded. Every unvisited site must have an explanation before the cycle can close.`
            : (svItem?.description || 'Every unvisited site needs a reason before the cycle can close.'),
        passed: reasonsPassed,
        blocked: false,
        tab: 'uncovered', actionLabel: 'Open Uncovered Sites tab →',
        sub: svItem ? [svItem] : [],
        remaining: svRemaining,
        howTo: [
          'Click "Open Uncovered Sites tab →" button below.',
          'In the list, find every site showing an orange "No Reason" badge.',
          'Click the orange badge to open a small popup.',
          'Pick the correct reason from the dropdown and press Save.',
          'Repeat for every site until no orange badges remain.',
          'Come back here and click "Check again" to confirm.',
        ],
      },
      {
        id: 'finance', number: 4,
        title: 'Clear Finance', titleAr: 'تسوية المالية',
        desc: financePassed
          ? 'All financial items are cleared — cost submissions, advances, withdrawals, and cost recovery are all settled.'
          : `${financeIssues.length} item${financeIssues.length !== 1 ? 's' : ''} blocking close: ${financeIssues.map(i => i.label).join(' • ')}. Review each section below and clear before proceeding.`,
        passed: financePassed,
        blocked: false,
        tab: 'finance', actionLabel: 'Open Pending Finance tab →',
        sub: financeIssues,
        remaining: csRemaining,
        howTo: [
          'Look at each ❌ item in the list below — these are the specific gates blocking close.',
          'Cost submissions: click "Open Pending Finance tab →" → approve or reject each pending submission.',
          'Transport advances: go to the Down Payment Approval page → find partially-paid advances → mark as Reconciled or Paid.',
          'Withdrawal requests: go to the Finance page → approve or reject each pending withdrawal.',
          'Cost recovery: check the Exceptions tab → log a recovery decision for each not-covered site that received an advance.',
          'Come back here and click "Check again" after each action to watch the gates turn green.',
        ],
      },
      {
        id: 'wfp', number: 5,
        title: 'WFP Confirmation', titleAr: 'تأكيد WFP',
        desc: wfpItem?.notConfigured
          ? 'WFP confirmation is not configured for this MMP — this step is optional and skipped.'
          : wfpItem?.passed
            ? 'WFP confirmation file has been uploaded and applied — matched sites promoted to WFP Confirmed status.'
            : (wfpItem?.description || 'Upload and apply the WFP monthly monitoring Excel file. Matched sites (any status) will be promoted to WFP Confirmed automatically.'),
        passed: wfpPassed,
        blocked: false,
        tab: 'wfp', actionLabel: 'Open WFP Confirmation tab →',
        sub: wfpItem ? [wfpItem] : [],
        remaining: 0,
        howTo: [
          'Click "Open WFP Confirmation tab →" button below.',
          'Upload the WFP cleaned Excel file for this month.',
          'Review the matching results — strong, fuzzy, and manual matches are shown.',
          'Review any weak/fuzzy matches and accept or reject them manually.',
          'Click "Apply" — all confirmed sites will be promoted to WFP Confirmed status (even if they were not yet marked completed).',
          'Come back here and click "Check again" to confirm the gate turns green.',
        ],
      },
      {
        id: 'exchange_rate', number: 6,
        title: 'Exchange Rate & Fee Lock', titleAr: 'سعر الصرف وتثبيت الأتعاب',
        desc: feesLockedAt
          ? `Fees locked at 1 USD = ${feesLockedRate?.toLocaleString()} SDG on ${new Date(feesLockedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}. All site fees and wallets updated.`
          : 'Enter today\'s official USD → SDG exchange rate. All dispatched site fees will be recalculated to the correct SDG amount and enumerator wallets updated.',
        passed: feesLocked,
        blocked: exchangeRateBlocked,
        tab: null, actionLabel: null,
        sub: [],
        remaining: 0,
        howTo: [
          'Check today\'s official exchange rate from your finance team or central bank.',
          'Enter "1 USD = X SDG" in the field below.',
          'Review the live preview table — it shows every dispatched site with the calculated SDG equivalent.',
          'Tick "Also update enumerator wallets" if you want the wallet balances updated immediately.',
          'Click "Lock Fees & Apply Rate" — this updates all site fees in the database to SDG amounts.',
          'Once locked, the payment sheet in Step 7 will reflect the correct final SDG amounts.',
          'You can re-apply a corrected rate if needed — it will overwrite the previous values.',
        ],
      },
      {
        id: 'payment_request', number: 7,
        title: 'Payment Sheet & Request', titleAr: 'ورقة الدفع وطلب السداد',
        desc: paymentsConfirmedAt
          ? `Payments confirmed on ${new Date(paymentsConfirmedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — this step is complete.`
          : paymentRequestedAt
            ? `Payment request sent on ${new Date(paymentRequestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}. Once finance processes all payments, return here to confirm.`
            : 'Review the per-site payment sheet (now in locked SDG amounts). Export PDF/Excel, request payments from finance, then confirm when all payments are done.',
        passed: paymentStepPassed,
        blocked: paymentStepBlocked,
        tab: null, actionLabel: null,
        sub: [],
        remaining: 0,
        howTo: [
          'Review the payment sheet below — each site shows locked SDG fees minus any advances already paid = Net to Pay.',
          'Export the Payment Sheet PDF and/or Excel file for finance processing.',
          'Click "Send Payment Request to Finance" to formally log the request.',
          'Once finance processes all payments, return here and click "Confirm All Payments Done".',
          'This step is complete once you confirm — you can then submit for final approval.',
        ],
      },
      {
        id: 'submit', number: 8,
        title: 'Submit for Approval', titleAr: 'تقديم للموافقة',
        desc: checklistMmpStatus === 'closed'
          ? 'Cycle was submitted and approved — it is permanently archived.'
          : checklistMmpStatus === 'pending_approval'
            ? 'Submitted — waiting for FOM / Director to approve or reject.'
            : cycleReadiness.allPassed && paymentStepPassed && feesLocked
              ? 'All gates are green and payments confirmed. Review the financial summary below, then tick the confirmation and submit.'
              : !feesLocked
                ? 'Complete Step 6 (lock exchange rate) first.'
                : !paymentStepPassed
                  ? 'Complete Step 7 (confirm payments done) before submitting.'
                  : 'Complete Steps 3–5 above first, then return here to submit.',
        passed: checklistMmpStatus === 'pending_approval' || checklistMmpStatus === 'closed',
        blocked: checklistMmpStatus !== 'pending_approval' && checklistMmpStatus !== 'closed' && (!cycleReadiness.allPassed || !paymentStepPassed || !feesLocked),
        tab: null, actionLabel: null,
        sub: [],
        remaining: 0,
        howTo: [
          'Ensure all previous steps are green — reasons, finance, WFP, fees locked, and payments confirmed.',
          'Tick the confirmation checkbox below.',
          'Click the green "Submit Cycle for Final Approval" button.',
          'The FOM and Country Director will be notified for review.',
        ],
      },
      {
        id: 'approval', number: 9,
        title: 'Final Approval & Archive', titleAr: 'في انتظار الموافقة',
        desc: checklistMmpStatus === 'closed'
          ? 'Cycle approved and archived. The financial settlement above is now frozen permanently.'
          : checklistMmpStatus === 'pending_approval'
            ? (isFOM || isAdmin || isSuperAdmin)
              ? 'Your approval is required. Scroll down to review the Cycle Financial Summary, then approve or reject below.'
              : 'Submitted and waiting for FOM / Admin to approve. You will receive a notification when a decision is made.'
            : 'This step unlocks once Step 7 is submitted. The FOM or Admin will review and approve or send back.',
        passed: checklistMmpStatus === 'closed',
        blocked: false,
        tab: null, actionLabel: null,
        sub: [],
        remaining: 0,
        howTo: (isFOM || isAdmin || isSuperAdmin) ? [
          'Scroll down and review the "💰 Cycle Financial Settlement" card — verify enumerator costs, transport, advances, and the net payable amount.',
          'If the figures look correct, click "Approve & Close Cycle" to permanently archive this cycle.',
          'If something is wrong, click "Reject & Send Back" and enter the specific reason so the admin knows what to correct.',
          'Once approved, the cycle status becomes Closed, the financial snapshot is frozen, and the MMP is unlocked for the next cycle.',
        ] : [
          'The cycle has been submitted and is now waiting for FOM, Admin, or Super Admin to review.',
          'You will receive an in-app notification when the cycle is approved or sent back for corrections.',
          'If approved → the cycle status becomes Closed and appears in the Archive tab.',
          'If rejected → the cycle returns to Closing state and you can correct the issues and re-submit.',
        ],
      },
    ];
  }, [cycleReadiness.items, cycleReadiness.allPassed, checklistMmpStatus, isFOM, isAdmin, isSuperAdmin, paymentsConfirmedAt, paymentRequestedAt, feesLockedAt, feesLockedRate]);

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

  const pendingApprovalMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => (m as any).cycle_status === 'pending_approval');
  }, [mmpFiles]);

  const [bannerRejectMmpId, setBannerRejectMmpId] = useState<string | null>(null);
  const [bannerRejectNote, setBannerRejectNote] = useState('');

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

      await refreshMMPFiles();
      await fetchUncoveredSites();
      // Immediately open the guided closing wizard so the user starts the process in one flow
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

  const checkFinanceReadinessForClose = async (mmpId: string): Promise<{ ok: boolean; issues: string[]; pendingViaReport: number }> => {
    let siteEntryIds: string[] = [];
    let advancesRes, withdrawalsRes, costSubsRes;
    try {
      // Step 1: fetch all site entry IDs for this MMP so advances are scoped
      // via mmp_site_entry_id — the same join used by the readiness checklist hook.
      // This prevents the count mismatch that occurs when advances carry mmp_id but
      // the hook sources them through site entries.
      const { data: entries, error: entriesErr } = await supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('mmp_file_id', mmpId);
      if (!entriesErr && entries) {
        siteEntryIds = entries.map((e: any) => e.id);
      }

      // Step 2: fetch advances, withdrawals, and cost submissions in parallel.
      // Cost submissions filter by mmp_id FK directly — avoids counting
      // submissions from other MMPs in the same calendar month.
      const costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status')
        .eq('mmp_id', mmpId)
        .or('tier1_status.eq.pending,tier2_status.eq.pending');

      const advancesQuery = siteEntryIds.length > 0
        ? supabase.from('down_payment_requests').select('id, status, metadata').in('mmp_site_entry_id', siteEntryIds)
        : supabase.from('down_payment_requests').select('id, status, metadata').eq('mmp_id', mmpId);

      [advancesRes, withdrawalsRes, costSubsRes] = await Promise.all([
        advancesQuery,
        supabase.from('withdrawal_requests').select('id, status').eq('mmp_id', mmpId),
        costSubsQuery,
      ]);
    } catch {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify finance readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'], pendingViaReport: 0 };
    }

    // Cost submissions error is blocking (required table).
    if (costSubsRes.error) {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify cost submission readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'], pendingViaReport: 0 };
    }

    // Advances gate logic (matches server RPC gate 2 after Fix 3 SQL):
    //   - fully_paid / paid / reconciled → cleared
    //   - partially_paid + unreconciled → BLOCKING
    //   - approved (zero disbursement) → "pending payment via report" — NOT blocking but counted
    const advances = (!advancesRes.error && advancesRes.data || []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
    const unreconciledAdvances = advances.filter(a => {
      const meta = a.metadata ?? {};
      const isCleared = a.status === 'fully_paid' || a.status === 'paid' || meta['reconciled'] === true || Boolean(meta['reconciled_at']);
      return a.status === 'partially_paid' && !isCleared;
    }).length;

    const pendingViaReport = advances.filter(a => {
      const meta = a.metadata ?? {};
      const isCleared = a.status === 'fully_paid' || a.status === 'paid' || meta['reconciled'] === true || Boolean(meta['reconciled_at']);
      return a.status === 'approved' && !isCleared;
    }).length;

    // Withdrawals: treat query error as empty
    const pendingWithdrawals = ((!withdrawalsRes.error && withdrawalsRes.data || []) as Array<{ id: string; status: string }>).filter(
      w => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? ''),
    ).length;

    const pendingCostSubs = (costSubsRes.data || []).length;

    const issues: string[] = [];
    if (unreconciledAdvances > 0) issues.push(`${unreconciledAdvances} partially-paid transport advance(s) not yet reconciled`);
    if (pendingWithdrawals > 0) issues.push(`${pendingWithdrawals} pending withdrawal request(s)`);
    if (pendingCostSubs > 0) issues.push(`${pendingCostSubs} pending cost submission(s) (tier 1 or tier 2 pending)`);

    return { ok: issues.length === 0, issues, pendingViaReport };
  };


  const exportCycleSummaryExcel = useCallback(async () => {
    if (!cycleSummaryData || !checklistMmpId) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const mmpName = mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'Cycle';
    const fmt = (cents: number, cur: string) => `${(cents / 100).toLocaleString()} ${cur}`;

    // Sheet 1: Cost Submissions
    const costRows = cycleSummaryData.costSubs.map(r => ({
      'Category': r.category,
      'Submissions': r.count,
      'Approved Amount': fmt(r.approvedCents, r.currency),
      'Pending Amount': fmt(r.pendingCents, r.currency),
      'Total Amount': fmt(r.approvedCents + r.pendingCents, r.currency),
    }));
    costRows.push({
      'Category': 'TOTAL',
      'Submissions': cycleSummaryData.costSubs.reduce((s, r) => s + r.count, 0),
      'Approved Amount': fmt(cycleSummaryData.totalApprovedCents, cycleSummaryData.currency),
      'Pending Amount': fmt(cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0), cycleSummaryData.currency),
      'Total Amount': fmt(cycleSummaryData.costSubs.reduce((s, r) => s + r.approvedCents + r.pendingCents, 0), cycleSummaryData.currency),
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costRows), 'Cost Submissions');

    // Sheet 2: Transport Advances (per person)
    const advRows = cycleSummaryData.advanceDetails.map(a => ({
      'Recipient': a.requesterName,
      'Site': a.siteName,
      'Type': a.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
      'Total Advanced': `${a.requestedAmount.toLocaleString()} ${a.currency}`,
      'Paid': a.paidAmount > 0 ? `${a.paidAmount.toLocaleString()} ${a.currency}` : '—',
      'Remaining': a.remainingAmount > 0 ? `${a.remainingAmount.toLocaleString()} ${a.currency}` : 'Settled',
      'Status': a.remainingAmount <= 0 ? 'Fully Paid' : a.paidAmount > 0 ? 'Partial' : a.status,
    }));
    if (advRows.length > 0) {
      const totalAdv = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.requestedAmount, 0);
      const totalPaidAdv = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.paidAmount, 0);
      const totalRem = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.remainingAmount, 0);
      advRows.push({ 'Recipient': 'TOTAL', 'Site': '', 'Type': '', 'Total Advanced': `${totalAdv.toLocaleString()} ${cycleSummaryData.currency}`, 'Paid': `${totalPaidAdv.toLocaleString()} ${cycleSummaryData.currency}`, 'Remaining': `${totalRem.toLocaleString()} ${cycleSummaryData.currency}`, 'Status': '' } as any);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advRows.length > 0 ? advRows : [{ 'Note': 'No transport advances found' }]), 'Transport Advances');

    // Sheet 3: Withdrawal Requests
    if (cycleSummaryData.withdrawals.length > 0) {
      const wdRows = cycleSummaryData.withdrawals.map(w => ({
        'Requested By': w.userName,
        'Amount': `${w.amount.toLocaleString()} ${w.currency}`,
        'Status': w.status,
        'Reason': w.reason,
      }));
      const activeTotal = cycleSummaryData.totalWithdrawalAmount;
      wdRows.push({ 'Requested By': 'TOTAL (active)', 'Amount': `${activeTotal.toLocaleString()} ${cycleSummaryData.currency}`, 'Status': '', 'Reason': '' } as any);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wdRows), 'Withdrawal Requests');
    }

    // Sheet: Enumerator Costs
    if (cycleSummaryData.enumeratorCosts.length > 0) {
      const enumRows = cycleSummaryData.enumeratorCosts.map(e => ({
        'Enumerator': e.enumeratorName,
        'Site Name': e.siteName,
        'Site Code': e.siteCode,
        'State': e.state,
        'Locality': e.locality,
        'Enumerator Fee (SDG)': e.enumeratorFee,
        'Transport Fee (SDG)': e.transportFee,
        'Total Cost (SDG)': e.totalCost,
        'Visit Status': e.status,
        'Cost Acknowledged': e.costAcknowledged ? 'Yes' : 'No',
      }));
      enumRows.push({
        'Enumerator': 'TOTAL',
        'Site Name': '',
        'Site Code': '',
        'State': '',
        'Locality': '',
        'Enumerator Fee (SDG)': cycleSummaryData.totalEnumeratorFee,
        'Transport Fee (SDG)': cycleSummaryData.totalTransportFee,
        'Total Cost (SDG)': cycleSummaryData.totalEnumeratorFee + cycleSummaryData.totalTransportFee,
        'Visit Status': '',
        'Cost Acknowledged': '',
      } as any);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(enumRows), 'Enumerator Costs');
    }

    // Sheet: Coverage snapshot from siteVisitCounts
    const counts = siteVisitCounts[checklistMmpId];
    if (counts) {
      const covRows = Object.entries(counts.statusCounts).map(([status, count]) => ({ 'Status': status, 'Count': count }));
      covRows.push({ 'Status': 'TOTAL SITES', 'Count': counts.total });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(covRows), 'Site Coverage');
    }

    XLSX.writeFile(wb, `${mmpName}-cycle-summary-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    if (unreasoned.length > 0) {
      toast({ title: 'Cannot Close', description: `${unreasoned.length} sites still need a reason. All uncovered sites must have reasons before closing.`, variant: 'destructive' });
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

      setReconciliationAcknowledged(false);
      setPendingScopedClose(null);
      toast({ title: 'Submitted for Approval', description: 'The cycle has been submitted for FOM/Director approval.' });
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
        action: 'cycle_reopened',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName || 'Unknown',
        details: { reason, reopenedAt: new Date().toISOString() },
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

  const handleApproveCycle = async (mmpId: string, skipFinanceCheck = false, overrideJustification?: string) => {
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

    try {
      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const existingRecords: CycleCloseRecord[] = (mmpData as any)?.cycle_close_records || [];
      const updatedRecords = existingRecords.map(r => ({
        ...r,
        status: 'closed' as const,
      }));

      // Build frozen financial snapshot at close time
      let financialSnapshot: ClosedCycleFinancialSnapshot | null = null;
      try {
        const PAYABLE_STATUSES = ['wfp_confirmed', 'verified', 'completed', 'approved'];
        const [siteRes, opRes] = await Promise.all([
          supabase.from('mmp_site_entries')
            .select('enumerator_fee, transport_fee, status')
            .eq('mmp_file_id', mmpId),
          supabase.from('operational_cost_submissions')
            .select('amount_cents, currency')
            .eq('mmp_file_id', mmpId)
            .eq('status', 'approved'),
        ]);
        const payable = (siteRes.data || []).filter((e: any) => PAYABLE_STATUSES.includes(e.status));
        const enumeratorFees = payable.reduce((s: number, e: any) => s + (e.enumerator_fee ?? 0), 0);
        const transportFees = payable.reduce((s: number, e: any) => s + (e.transport_fee ?? 0), 0);
        const opCosts = (opRes.data || []).reduce((s: number, c: any) => s + ((c.amount_cents ?? 0) / 100), 0);
        const currency = (opRes.data?.[0] as any)?.currency || 'SDG';
        // Outstanding advances: get site entry ids then query down_payment_requests
        const siteIds = (siteRes.data || []).map((e: any) => e.id).filter(Boolean);
        let advancesRecovered = 0;
        if (siteIds.length > 0) {
          const { data: advData } = await supabase
            .from('down_payment_requests')
            .select('remaining_amount, requested_amount, total_paid_amount')
            .in('mmp_site_entry_id', siteIds)
            .in('status', ['partially_paid', 'approved', 'pending_payment']);
          advancesRecovered = (advData || []).reduce((s: number, a: any) => {
            const rem = a.remaining_amount ?? Math.max(0, (a.requested_amount ?? 0) - (a.total_paid_amount ?? 0));
            return s + Math.max(0, rem);
          }, 0);
        }
        financialSnapshot = { enumeratorFees, transportFees, opCosts, advancesRecovered, currency, payableSiteCount: payable.length };
      } catch (snapErr) {
        console.warn('Could not build financial snapshot at close time', snapErr);
      }

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
        financialSnapshot,
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
    }
  };

  const handleRejectCycle = async (mmpId: string, note: string) => {
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_approval_note: note,
          // Clear stale records so re-submission starts clean and doesn't
          // accumulate a growing list of rejected close snapshots.
          cycle_close_records: [],
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
                  You have unfinished closing steps. Open the wizard to see exactly what to do next.
                </p>
              </div>

              <Button
                size="sm"
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs font-semibold shadow"
                onClick={() => setChecklistMmpId(mmp.id)}
                data-testid={`button-resume-wizard-${mmp.id}`}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Resume — see what to do next
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
                  View Full Wizard &amp; Reports
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
          <TabsTrigger value="finance" data-testid="tab-finance" className="gap-1.5 px-3 py-2">
            <DollarSign className="h-3.5 w-3.5 text-amber-500" />
            <span>Pending Finance</span>
            {(financeCosts.length + financeAdvances.length) > 0 && (
              <Badge variant="destructive" className="ml-0.5 text-[10px] px-1.5 py-0">{financeCosts.length + financeAdvances.length}</Badge>
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
                  <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
                    <div className="flex items-center justify-between gap-4">
                      <DialogTitle className="flex items-center gap-2 text-lg">
                        {checklistMmpStatus === 'active'
                          ? <><CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" /> Pre-Close Requirements</>
                          : <><ArrowRight className="h-5 w-5 text-amber-500 shrink-0" /> Cycle Close — Step by Step Guide</>
                        }
                      </DialogTitle>
                      <div className="text-sm font-semibold text-muted-foreground">{mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}</div>
                    </div>
                    <DialogDescription>
                      {checklistMmpStatus === 'active'
                        ? 'Review all requirements before starting the close process.'
                        : 'Follow each step in order. Your progress is saved automatically — you can close this and return any time.'}
                    </DialogDescription>
                  </DialogHeader>

                  {/* ── GUIDED WIZARD (cycle already in closing / pending_approval state) ── */}
                  {checklistMmpStatus !== 'active' ? (
                    <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
                      <div className="max-w-2xl mx-auto space-y-3">
                        {cycleReadiness.loading ? (
                          <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading progress…
                          </div>
                        ) : (
                          <>
                            {/* Cycle is Closed — top banner */}
                            {checklistMmpStatus === 'closed' && (
                              <div className="flex items-center gap-3 rounded-xl border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30 px-4 py-3 mb-2">
                                <div className="shrink-0 w-9 h-9 rounded-full bg-green-500 flex items-center justify-center">
                                  <CheckCircle2 className="h-5 w-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-green-800 dark:text-green-200">Cycle Closed &amp; Archived</p>
                                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                                    All steps are complete. The financial settlement has been frozen and this cycle is permanently archived.
                                    {mmpFiles?.find(m => m.id === checklistMmpId)?.cycle_closed_at
                                      ? ` Closed on ${new Date((mmpFiles.find(m => m.id === checklistMmpId) as any).cycle_closed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.`
                                      : ''}
                                  </p>
                                </div>
                                {isSuperAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-auto shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 gap-1.5 text-xs"
                                    onClick={() => { setChecklistMmpId(null); setReopenConfirmId(checklistMmpId!); setReopenReason(''); }}
                                    data-testid="button-reopen-from-guide"
                                  >
                                    <RefreshCw className="h-3 w-3" /> Re-open
                                  </Button>
                                )}
                              </div>
                            )}
                            {/* Rejection banner — shown when cycle was sent back by FOM/Admin */}
                            {checklistMmpStatus === 'closing' && (() => {
                              const rejNote = (mmpFiles?.find(m => m.id === checklistMmpId) as any)?.cycle_approval_note;
                              if (!rejNote) return null;
                              return (
                                <div className="flex items-start gap-3 rounded-xl border-2 border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-3 mb-2" data-testid="banner-cycle-rejected">
                                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-red-800 dark:text-red-200">Cycle Returned for Corrections</p>
                                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                      <span className="font-semibold">Reason:</span> {rejNote}
                                    </p>
                                    <p className="text-[11px] text-red-500 dark:text-red-400 mt-1.5">
                                      Address the issues above, then re-submit using Step 8 below.
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Progress bar + check-again */}
                            <div className="flex items-center gap-3 mb-4">
                              {(() => {
                                const actionable = guideSteps.filter(s => s.id !== 'approval');
                                const done = actionable.filter(s => s.passed).length;
                                const pct = actionable.length > 0 ? Math.round((done / actionable.length) * 100) : 0;
                                return (<>
                                  <Progress value={pct} className="h-2 flex-1" />
                                  <span className="text-xs text-muted-foreground shrink-0">{done} / {actionable.length} done</span>
                                </>);
                              })()}
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={() => cycleReadiness.refresh()} data-testid="button-guide-refresh">
                                <RefreshCw className="h-3 w-3" /> Check again
                              </Button>
                            </div>

                            {/* Step cards */}
                            {guideSteps.filter(s => s.id !== 'approval').map((step, idx) => {
                              const isCurrentStep = !step.passed && !step.blocked && guideSteps.slice(0, idx).every(s => s.passed);
                              const isLocked = step.blocked;
                              const isDone = step.passed;
                              return (
                                <div
                                  key={step.id}
                                  ref={isCurrentStep ? (el) => {
                                    if (el && guideScrolledStepRef.current !== step.id) {
                                      guideScrolledStepRef.current = step.id;
                                      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
                                    }
                                  } : undefined}
                                  className={`rounded-xl border transition-all ${
                                    isDone
                                      ? 'border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20 p-4'
                                      : isCurrentStep && step.id === 'approval'
                                        ? 'border-purple-400 bg-purple-50/60 dark:border-purple-600 dark:bg-purple-950/30 shadow-md p-4'
                                        : isCurrentStep
                                          ? 'border-amber-400 bg-amber-50/60 dark:border-amber-600 dark:bg-amber-950/30 shadow-md p-4'
                                          : isLocked
                                            ? 'border-muted bg-muted/20 opacity-60 p-4'
                                            : 'border-muted bg-card p-4'
                                  }`}
                                  data-testid={`guide-step-${step.id}`}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Step number / icon */}
                                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                      isDone ? 'bg-green-500 text-white'
                                        : isCurrentStep && step.id === 'approval' ? 'bg-purple-600 text-white animate-pulse'
                                        : isCurrentStep ? 'bg-amber-500 text-white animate-pulse'
                                        : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`font-semibold text-sm ${isDone ? 'text-green-700 dark:text-green-300' : isCurrentStep && step.id === 'approval' ? 'text-purple-800 dark:text-purple-200' : isCurrentStep ? 'text-amber-800 dark:text-amber-200' : 'text-foreground'}`}>
                                          {step.title}
                                        </span>
                                        <span dir="rtl" className="text-xs text-muted-foreground/70">{step.titleAr}</span>
                                        {isDone && <Badge className="text-[10px] px-1.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300">Done ✓</Badge>}
                                        {isCurrentStep && step.id !== 'approval' && <Badge className="text-[10px] px-1.5 bg-amber-500 text-white border-amber-500 animate-pulse">👉 Do this now</Badge>}
                                        {isCurrentStep && step.id === 'approval' && <Badge className="text-[10px] px-1.5 bg-purple-600 text-white border-purple-600 animate-pulse">⏳ Awaiting approval</Badge>}
                                        {!isDone && !isLocked && !isCurrentStep && step.id !== 'submit' && step.id !== 'approval' && <Badge variant="outline" className="text-[10px] px-1.5 text-orange-600 border-orange-300">Needs attention</Badge>}
                                        {isLocked && <Badge variant="outline" className="text-[10px] px-1.5">Complete steps above first</Badge>}
                                        {!isDone && step.remaining > 0 && (
                                          <Badge variant="destructive" className="text-[10px] px-1.5">{step.remaining} remaining</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>

                                      {/* Exact how-to instructions — shown for current step */}
                                      {isCurrentStep && step.howTo.length > 0 && (
                                        <div className="mt-3 rounded-lg bg-white dark:bg-amber-950/40 border border-amber-300/60 px-3 py-2.5">
                                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1.5">What to do:</p>
                                          <ol className="space-y-1">
                                            {step.howTo.map((instruction, i) => (
                                              <li key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                                                <span className="shrink-0 font-bold text-amber-600">{i + 1}.</span>
                                                <span>{instruction}</span>
                                              </li>
                                            ))}
                                          </ol>
                                        </div>
                                      )}

                                      {/* Sub-item detail for failed items */}
                                      {!isDone && step.sub.length > 0 && (
                                        <ul className="mt-2 space-y-0.5">
                                          {step.sub.map(s => (
                                            <li key={s.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                              <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                                              <span>{s.description}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {/* Action button — visible for current step and all unfinished steps */}
                                      {!isDone && !isLocked && step.tab && (
                                        <Button
                                          size="sm"
                                          className={`mt-3 gap-1.5 text-xs h-8 ${isCurrentStep ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                                          onClick={() => {
                                            setChecklistMmpId(null);
                                            setActiveTab(step.tab!);
                                            if (checklistMmpId) setSelectedMmpId(checklistMmpId);
                                          }}
                                          data-testid={`button-guide-go-${step.id}`}
                                        >
                                          <ArrowRight className="h-3.5 w-3.5" />
                                          {step.actionLabel}
                                        </Button>
                                      )}
                                      {/* ── Site & Advance Review (Step 2) ── */}
                                      {step.id === 'site_review' && (
                                        <div className="mt-3 space-y-2">
                                          {/* Search + filter bar */}
                                          <div className="flex gap-2 flex-wrap">
                                            <input
                                              type="text"
                                              placeholder="Search site or enumerator…"
                                              value={siteReviewSearch}
                                              onChange={e => setSiteReviewSearch(e.target.value)}
                                              className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                              data-testid="input-site-review-search"
                                            />
                                            <select
                                              value={siteReviewStatusFilter}
                                              onChange={e => setSiteReviewStatusFilter(e.target.value)}
                                              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                                              data-testid="select-site-review-status-filter"
                                            >
                                              <option value="all">All Statuses</option>
                                              <option value="wfp_confirmed">WFP Confirmed</option>
                                              <option value="completed">Completed</option>
                                              <option value="verified">Verified</option>
                                              <option value="submitted">Submitted</option>
                                              <option value="dispatched">Dispatched</option>
                                              <option value="not_covered">Not Covered</option>
                                              <option value="pending">Pending / Other</option>
                                            </select>
                                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 px-2" onClick={() => fetchAllSiteDetails(checklistMmpId!)} disabled={loadingAllSites} data-testid="button-site-review-refresh">
                                              {loadingAllSites ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                              Refresh
                                            </Button>
                                          </div>
                                          {loadingAllSites ? (
                                            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
                                              <Loader2 className="h-4 w-4 animate-spin" /> Loading all sites…
                                            </div>
                                          ) : (() => {
                                            const q = siteReviewSearch.toLowerCase();
                                            const filtered = allSiteReviewData.filter(s => {
                                              const matchQ = !q || s.siteName.toLowerCase().includes(q) || s.enumeratorName.toLowerCase().includes(q) || s.siteCode.toLowerCase().includes(q);
                                              if (!matchQ) return false;
                                              if (siteReviewStatusFilter === 'all') return true;
                                              if (siteReviewStatusFilter === 'pending') return !['wfp_confirmed','completed','verified','submitted','dispatched','not_covered'].includes(s.status);
                                              return s.status === siteReviewStatusFilter;
                                            });
                                            const totalSites = allSiteReviewData.length;
                                            const completedCount = allSiteReviewData.filter(s => ['wfp_confirmed','completed','verified'].includes(s.status)).length;
                                            const advancedCount = allSiteReviewData.filter(s => s.advanceId !== null).length;
                                            const totalAdvPaid = allSiteReviewData.reduce((s, e) => s + e.advancePaid, 0);
                                            const totalNet = allSiteReviewData.reduce((s, e) => s + e.netToPay, 0);
                                            const cur = allSiteReviewData[0]?.currency || 'SDG';
                                            const statusCls: Record<string, string> = {
                                              wfp_confirmed: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
                                              completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                                              verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
                                              submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                                              dispatched: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
                                              not_covered: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                                            };
                                            return (
                                              <div className="space-y-2">
                                                {/* KPI bar */}
                                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                                  {[
                                                    { label: 'Total Sites', val: totalSites, cls: 'bg-muted/50' },
                                                    { label: 'Completed / Confirmed', val: completedCount, cls: 'bg-green-50 dark:bg-green-950/30' },
                                                    { label: 'With Advance', val: advancedCount, cls: 'bg-amber-50 dark:bg-amber-950/30' },
                                                    { label: 'Total Advance Paid', val: `${totalAdvPaid.toLocaleString()} ${cur}`, cls: 'bg-blue-50 dark:bg-blue-950/30' },
                                                  ].map(k => (
                                                    <div key={k.label} className={`rounded-lg px-3 py-2 text-center ${k.cls}`}>
                                                      <div className="text-xs text-muted-foreground">{k.label}</div>
                                                      <div className="font-bold text-sm">{k.val}</div>
                                                    </div>
                                                  ))}
                                                </div>
                                                {totalNet > 0 && (
                                                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 flex items-center gap-2">
                                                    <span className="text-xs text-green-700 dark:text-green-300 font-medium">Estimated Net to Pay (Gross − Advances):</span>
                                                    <span className="font-bold text-green-800 dark:text-green-200">{totalNet.toLocaleString()} {cur}</span>
                                                  </div>
                                                )}
                                                {/* Table */}
                                                <div className="rounded-lg border overflow-hidden">
                                                  <div className="overflow-x-auto max-h-72">
                                                    <table className="w-full text-xs">
                                                      <thead className="sticky top-0 z-10">
                                                        <tr className="bg-muted/80 border-b">
                                                          <th className="px-3 py-1.5 text-left font-semibold min-w-[130px]">Site</th>
                                                          <th className="px-3 py-1.5 text-left font-semibold min-w-[100px]">Enumerator</th>
                                                          <th className="px-3 py-1.5 text-center font-semibold">Status</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold">Enum. Fee</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold">Transport</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold">Gross</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-amber-700">Adv. Paid</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-green-700">Net to Pay</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {filtered.length === 0 ? (
                                                          <tr><td colSpan={8} className="text-center py-4 text-muted-foreground">No sites match the current filter</td></tr>
                                                        ) : filtered.map(s => (
                                                          <tr key={s.id} className="border-b last:border-0 hover:bg-muted/10">
                                                            <td className="px-3 py-2">
                                                              <div className="font-medium truncate max-w-[150px]" title={s.siteName}>{s.siteName}</div>
                                                              <div className="text-[10px] text-muted-foreground">{s.siteCode} · {s.state}</div>
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[110px]">{s.enumeratorName}</td>
                                                            <td className="px-3 py-2 text-center">
                                                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls[s.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                                                                {s.status.replace(/_/g, ' ')}
                                                              </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-mono">{s.enumeratorFee > 0 ? s.enumeratorFee.toLocaleString() : '—'}</td>
                                                            <td className="px-3 py-2 text-right font-mono">{s.transportFee > 0 ? s.transportFee.toLocaleString() : '—'}</td>
                                                            <td className="px-3 py-2 text-right font-mono font-semibold">{s.totalFee > 0 ? s.totalFee.toLocaleString() : '—'}</td>
                                                            <td className="px-3 py-2 text-right font-mono text-amber-700">{s.advancePaid > 0 ? `−${s.advancePaid.toLocaleString()}` : '—'}</td>
                                                            <td className={`px-3 py-2 text-right font-mono font-bold ${s.netToPay > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                                              {s.netToPay > 0 ? s.netToPay.toLocaleString() : s.totalFee > 0 ? '0 (settled)' : '—'}
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                      <tfoot>
                                                        <tr className="bg-muted/30 font-semibold border-t">
                                                          <td className="px-3 py-1.5" colSpan={3}>Total ({filtered.length} shown)</td>
                                                          <td className="px-3 py-1.5 text-right font-mono">{filtered.reduce((s, e) => s + e.enumeratorFee, 0).toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono">{filtered.reduce((s, e) => s + e.transportFee, 0).toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono">{filtered.reduce((s, e) => s + e.totalFee, 0).toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-amber-700">−{filtered.reduce((s, e) => s + e.advancePaid, 0).toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-green-700">{filtered.reduce((s, e) => s + e.netToPay, 0).toLocaleString()}</td>
                                                        </tr>
                                                      </tfoot>
                                                    </table>
                                                  </div>
                                                </div>
                                                {filtered.length < allSiteReviewData.length && (
                                                  <p className="text-xs text-muted-foreground text-center">Showing {filtered.length} of {allSiteReviewData.length} sites — adjust filters to see more</p>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}

                                      {/* ── Exchange Rate & Fee Lock (Step 6) ── */}
                                      {step.id === 'exchange_rate' && !step.blocked && (
                                        <div className="mt-3 space-y-3">

                                          {/* Locked banner */}
                                          {feesLockedAt && (
                                            <div className="flex items-start gap-2.5 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 px-3 py-2.5">
                                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-green-800 dark:text-green-200">
                                                  Fees locked at 1 USD = {feesLockedRate?.toLocaleString()} SDG
                                                </p>
                                                <p className="text-[10px] text-green-700 dark:text-green-400 mt-0.5">
                                                  Applied {new Date(feesLockedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                  {walletUpdateResults && (
                                                    <span className="ml-2">· Wallet: {walletUpdateResults.success} updated{walletUpdateResults.failed > 0 ? `, ${walletUpdateResults.failed} skipped` : ''}</span>
                                                  )}
                                                </p>
                                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                                  ⚠ Re-applying the rate below will overwrite all site fees again.
                                                </p>
                                              </div>
                                            </div>
                                          )}

                                          {/* Rate input */}
                                          <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
                                            <p className="text-xs font-semibold text-foreground">Set Exchange Rate</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs text-muted-foreground shrink-0">1 USD =</span>
                                              <input
                                                type="number"
                                                min="1"
                                                step="0.01"
                                                placeholder="e.g. 580"
                                                value={exchangeRateInput}
                                                onChange={e => setExchangeRateInput(e.target.value)}
                                                className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                                data-testid="input-exchange-rate"
                                              />
                                              <span className="text-xs text-muted-foreground shrink-0">SDG</span>
                                              {parseFloat(exchangeRateInput) > 0 && (
                                                <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                                                  ✓ Preview updates below
                                                </span>
                                              )}
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer w-fit" data-testid="label-update-wallets">
                                              <input
                                                type="checkbox"
                                                checked={updateWallets}
                                                onChange={e => setUpdateWallets(e.target.checked)}
                                                className="rounded border-input"
                                                data-testid="checkbox-update-wallets"
                                              />
                                              <span className="text-xs text-muted-foreground">Also update enumerator wallet balances</span>
                                            </label>
                                          </div>

                                          {/* Live preview table */}
                                          {(() => {
                                            const rate = parseFloat(exchangeRateInput) || 0;
                                            const eligibleStatuses = ['dispatched', 'assigned', 'submitted', 'wfp_confirmed', 'completed', 'verified', 'approved'];
                                            const previewRows = allSiteReviewData.filter(s => eligibleStatuses.includes(s.status));
                                            if (previewRows.length === 0) return (
                                              <p className="text-xs text-muted-foreground text-center py-3">
                                                No dispatched or completed sites found. Sites will appear here once enumerators are assigned and dispatched.
                                              </p>
                                            );
                                            const totalBaseEnum = previewRows.reduce((s, e) => s + e.enumeratorFee, 0);
                                            const totalBaseTrans = previewRows.reduce((s, e) => s + e.transportFee, 0);
                                            const totalBaseAll = totalBaseEnum + totalBaseTrans;
                                            const totalSDGEnum = rate > 0 ? Math.round(totalBaseEnum * rate) : 0;
                                            const totalSDGTrans = rate > 0 ? Math.round(totalBaseTrans * rate) : 0;
                                            const totalSDGAll = totalSDGEnum + totalSDGTrans;
                                            return (
                                              <div className="space-y-2">
                                                {/* Summary KPIs */}
                                                {rate > 0 && (
                                                  <div className="grid grid-cols-3 gap-1.5">
                                                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                                                      <div className="text-[10px] text-muted-foreground">Total Base (USD)</div>
                                                      <div className="font-bold text-sm font-mono">${totalBaseAll.toLocaleString()}</div>
                                                    </div>
                                                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-center">
                                                      <div className="text-[10px] text-blue-700 dark:text-blue-300">Rate Applied</div>
                                                      <div className="font-bold text-sm">× {parseFloat(exchangeRateInput).toLocaleString()}</div>
                                                    </div>
                                                    <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-center">
                                                      <div className="text-[10px] text-green-700 dark:text-green-300 font-semibold">Total SDG to Pay</div>
                                                      <div className="font-bold text-base text-green-800 dark:text-green-200 font-mono">{totalSDGAll.toLocaleString()}</div>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Per-site preview table */}
                                                <div className="rounded-lg border overflow-hidden">
                                                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold flex items-center gap-2">
                                                    <span>💱 Fee Conversion Preview ({previewRows.length} eligible sites)</span>
                                                    {rate <= 0 && <span className="text-muted-foreground font-normal ml-auto">Enter a rate to see SDG amounts</span>}
                                                  </div>
                                                  <div className="overflow-x-auto max-h-60">
                                                    <table className="w-full text-xs">
                                                      <thead className="sticky top-0">
                                                        <tr className="bg-muted/60 border-b">
                                                          <th className="px-3 py-1.5 text-left font-semibold min-w-[110px]">Enumerator / Site</th>
                                                          <th className="px-3 py-1.5 text-center font-semibold">Status</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-blue-700">Enum (USD)</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-indigo-700">Transport (USD)</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-green-700">Enum (SDG)</th>
                                                          <th className="px-3 py-1.5 text-right font-semibold text-green-700">Transport (SDG)</th>
                                                          <th className="px-3 py-1.5 text-right font-bold text-green-700">Total SDG</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {previewRows.map(s => {
                                                          const sdgEnum = rate > 0 ? Math.round(s.enumeratorFee * rate) : 0;
                                                          const sdgTrans = rate > 0 ? Math.round(s.transportFee * rate) : 0;
                                                          const sdgTotal = sdgEnum + sdgTrans;
                                                          return (
                                                            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/10">
                                                              <td className="px-3 py-2">
                                                                <div className="font-medium truncate max-w-[130px]" title={s.enumeratorName}>{s.enumeratorName}</div>
                                                                <div className="text-[10px] text-muted-foreground truncate max-w-[130px]" title={s.siteName}>{s.siteName}</div>
                                                              </td>
                                                              <td className="px-3 py-2 text-center">
                                                                <span className="text-[10px] text-muted-foreground">{s.status.replace(/_/g, ' ')}</span>
                                                              </td>
                                                              <td className="px-3 py-2 text-right font-mono text-blue-700">{s.enumeratorFee > 0 ? s.enumeratorFee.toLocaleString() : '—'}</td>
                                                              <td className="px-3 py-2 text-right font-mono text-indigo-700">{s.transportFee > 0 ? s.transportFee.toLocaleString() : '—'}</td>
                                                              <td className={`px-3 py-2 text-right font-mono ${rate > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                                                {rate > 0 && sdgEnum > 0 ? sdgEnum.toLocaleString() : '—'}
                                                              </td>
                                                              <td className={`px-3 py-2 text-right font-mono ${rate > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                                                {rate > 0 && sdgTrans > 0 ? sdgTrans.toLocaleString() : '—'}
                                                              </td>
                                                              <td className={`px-3 py-2 text-right font-mono font-bold ${rate > 0 && sdgTotal > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                                                {rate > 0 && sdgTotal > 0 ? sdgTotal.toLocaleString() : '—'}
                                                              </td>
                                                            </tr>
                                                          );
                                                        })}
                                                      </tbody>
                                                      <tfoot>
                                                        <tr className="bg-muted/30 font-semibold border-t">
                                                          <td className="px-3 py-1.5" colSpan={2}>TOTAL ({previewRows.length} sites)</td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-blue-700">{totalBaseEnum.toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-indigo-700">{totalBaseTrans.toLocaleString()}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-green-700">{rate > 0 ? totalSDGEnum.toLocaleString() : '—'}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-green-700">{rate > 0 ? totalSDGTrans.toLocaleString() : '—'}</td>
                                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-green-700">{rate > 0 ? totalSDGAll.toLocaleString() : '—'} SDG</td>
                                                        </tr>
                                                      </tfoot>
                                                    </table>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {/* Zero-fee warning */}
                                          {(() => {
                                            const eligibleStatuses = ['dispatched', 'assigned', 'submitted', 'wfp_confirmed', 'completed', 'verified', 'approved'];
                                            const zeroFeeSites = allSiteReviewData.filter(s =>
                                              eligibleStatuses.includes(s.status) && s.enumeratorFee === 0 && s.transportFee === 0
                                            );
                                            if (zeroFeeSites.length === 0) return null;
                                            return (
                                              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                                    {zeroFeeSites.length} site{zeroFeeSites.length !== 1 ? 's' : ''} with 0 fees — applying the rate will keep them at 0 SDG
                                                  </p>
                                                </div>
                                                <div className="max-h-24 overflow-y-auto space-y-0.5">
                                                  {zeroFeeSites.map(s => (
                                                    <div key={s.id} className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                                                      <span className="font-medium truncate max-w-[140px]">{s.siteName}</span>
                                                      <span className="text-amber-500">·</span>
                                                      <span className="truncate">{s.enumeratorName}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                                  Set fees for these sites in the Payment Sheet tab before locking, or lock now and update them manually afterward.
                                                </p>
                                              </div>
                                            );
                                          })()}

                                          {/* Lock button */}
                                          <Button
                                            size="sm"
                                            className={`w-full gap-1.5 ${feesLockedAt ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
                                            onClick={() => handleLockFees(checklistMmpId!)}
                                            disabled={lockingFees || !parseFloat(exchangeRateInput)}
                                            data-testid="button-lock-fees"
                                          >
                                            {lockingFees
                                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating {allSiteReviewData.filter(s => ['dispatched','assigned','submitted','wfp_confirmed','completed','verified','approved'].includes(s.status)).length} sites…</>
                                              : feesLockedAt
                                                ? <><RefreshCw className="h-3.5 w-3.5" /> Re-apply Rate & Overwrite Fees</>
                                                : <><CheckCircle2 className="h-3.5 w-3.5" /> Lock Fees & Apply Rate ({parseFloat(exchangeRateInput) > 0 ? `1 USD = ${parseFloat(exchangeRateInput).toLocaleString()} SDG` : 'enter rate above'})</>
                                            }
                                          </Button>
                                          <p className="text-[10px] text-muted-foreground">This permanently updates <strong>enumerator_fee</strong> and <strong>transport_fee</strong> on all eligible site entries to SDG values. Wallet entries use <code>upsert</code> on the site entry ID — re-applying is safe.</p>
                                        </div>
                                      )}

                                      {/* ── Payment Sheet & Request (Step 7) ── */}
                                      {step.id === 'payment_request' && !step.blocked && (
                                        <div className="mt-3 space-y-3">
                                          {/* Payment status banner */}
                                          {paymentsConfirmedAt ? (
                                            <div className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 px-3 py-2.5">
                                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                              <div className="text-xs">
                                                <span className="font-semibold text-green-800 dark:text-green-200">Payments confirmed</span>
                                                <span className="text-green-700 dark:text-green-300"> · {new Date(paymentsConfirmedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                              </div>
                                            </div>
                                          ) : paymentRequestedAt ? (
                                            <div className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
                                              <Loader2 className="h-4 w-4 text-amber-600 shrink-0 animate-spin" />
                                              <div className="text-xs">
                                                <span className="font-semibold text-amber-800 dark:text-amber-200">Payment request sent</span>
                                                <span className="text-amber-700 dark:text-amber-300"> · {new Date(paymentRequestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                <span className="block text-amber-600 dark:text-amber-400 mt-0.5">Return here to confirm once finance processes all payments.</span>
                                              </div>
                                            </div>
                                          ) : null}

                                          {/* Per-site payment sheet */}
                                          {cycleSummaryData && (() => {
                                            const advMap: Record<string, AdvanceDetail> = {};
                                            cycleSummaryData.advanceDetails.forEach(a => { if (a.siteEntryId) advMap[a.siteEntryId] = a; });
                                            const totalGross = cycleSummaryData.enumeratorCosts.reduce((s, e) => s + e.totalCost, 0);
                                            const totalAdvPaid = Object.values(advMap).reduce((s, a) => s + a.paidAmount, 0);
                                            const totalNet = Math.max(0, totalGross - totalAdvPaid);
                                            const cur = cycleSummaryData.currency;
                                            return (
                                              <div className="space-y-2">
                                                {/* Summary KPIs */}
                                                <div className="grid grid-cols-3 gap-1.5">
                                                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                                                    <div className="text-xs text-muted-foreground">Gross Fees</div>
                                                    <div className="font-bold text-sm">{totalGross.toLocaleString()} {cur}</div>
                                                  </div>
                                                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-center">
                                                    <div className="text-xs text-amber-700 dark:text-amber-300">Advances Paid</div>
                                                    <div className="font-bold text-sm text-amber-800 dark:text-amber-200">−{totalAdvPaid.toLocaleString()} {cur}</div>
                                                  </div>
                                                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-center">
                                                    <div className="text-xs text-green-700 dark:text-green-300 font-semibold">NET TO PAY</div>
                                                    <div className="font-bold text-base text-green-800 dark:text-green-200">{totalNet.toLocaleString()} {cur}</div>
                                                  </div>
                                                </div>

                                                {/* Per-site payment table */}
                                                {cycleSummaryData.enumeratorCosts.length > 0 ? (
                                                  <div className="rounded-lg border overflow-hidden">
                                                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold flex items-center gap-2">
                                                      <span>💳 Payment Breakdown — Per Site</span>
                                                      <Badge variant="secondary" className="text-[10px]">{cycleSummaryData.enumeratorCosts.length} sites</Badge>
                                                    </div>
                                                    <div className="overflow-x-auto max-h-64">
                                                      <table className="w-full text-xs">
                                                        <thead className="sticky top-0">
                                                          <tr className="bg-muted/60 border-b">
                                                            <th className="px-3 py-1.5 text-left font-semibold min-w-[110px]">Enumerator / Site</th>
                                                            <th className="px-3 py-1.5 text-right font-semibold">Enum. Fee</th>
                                                            <th className="px-3 py-1.5 text-right font-semibold">Transport</th>
                                                            <th className="px-3 py-1.5 text-right font-semibold">Gross</th>
                                                            <th className="px-3 py-1.5 text-right font-semibold text-amber-700">Adv. Paid</th>
                                                            <th className="px-3 py-1.5 text-right font-semibold text-green-700">NET TO PAY</th>
                                                            <th className="px-3 py-1.5 text-center font-semibold">Status</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {cycleSummaryData.enumeratorCosts.map(e => {
                                                            const adv = advMap[e.id];
                                                            const advPaid = adv?.paidAmount ?? 0;
                                                            const net = Math.max(0, e.totalCost - advPaid);
                                                            return (
                                                              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/10">
                                                                <td className="px-3 py-2">
                                                                  <div className="font-medium truncate max-w-[140px]" title={e.enumeratorName}>{e.enumeratorName}</div>
                                                                  <div className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={e.siteName}>{e.siteName}</div>
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-mono">{e.enumeratorFee > 0 ? e.enumeratorFee.toLocaleString() : '—'}</td>
                                                                <td className="px-3 py-2 text-right font-mono">{e.transportFee > 0 ? e.transportFee.toLocaleString() : '—'}</td>
                                                                <td className="px-3 py-2 text-right font-mono font-semibold">{e.totalCost.toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-right font-mono text-amber-700">{advPaid > 0 ? `−${advPaid.toLocaleString()}` : '—'}</td>
                                                                <td className={`px-3 py-2 text-right font-mono font-bold ${net > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                                                  {net > 0 ? net.toLocaleString() : '0 (settled)'}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                  <span className="text-[10px] text-muted-foreground">{e.status.replace(/_/g, ' ')}</span>
                                                                </td>
                                                              </tr>
                                                            );
                                                          })}
                                                        </tbody>
                                                        <tfoot>
                                                          <tr className="bg-muted/30 font-semibold border-t">
                                                            <td className="px-3 py-1.5">TOTAL</td>
                                                            <td className="px-3 py-1.5 text-right font-mono">{cycleSummaryData.totalEnumeratorFee.toLocaleString()}</td>
                                                            <td className="px-3 py-1.5 text-right font-mono">{cycleSummaryData.totalTransportFee.toLocaleString()}</td>
                                                            <td className="px-3 py-1.5 text-right font-mono">{totalGross.toLocaleString()}</td>
                                                            <td className="px-3 py-1.5 text-right font-mono text-amber-700">{totalAdvPaid > 0 ? `−${totalAdvPaid.toLocaleString()}` : '—'}</td>
                                                            <td className="px-3 py-1.5 text-right font-mono font-bold text-green-700">{totalNet.toLocaleString()} {cur}</td>
                                                            <td />
                                                          </tr>
                                                        </tfoot>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <p className="text-xs text-muted-foreground text-center py-3">No dispatched sites with fees set — the payment sheet will populate once sites are dispatched and fees entered.</p>
                                                )}
                                              </div>
                                            );
                                          })()}

                                          {/* Export buttons */}
                                          <div className="flex gap-2">
                                            <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={exportPaymentSheetExcel} disabled={!cycleSummaryData} data-testid="button-export-payment-sheet-excel">
                                              <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                                            </Button>
                                            <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30" onClick={exportPaymentSheetPDF} disabled={!cycleSummaryData} data-testid="button-export-payment-sheet-pdf">
                                              <FileText className="h-3.5 w-3.5" /> Export PDF
                                            </Button>
                                          </div>

                                          {/* Payment note */}
                                          {!paymentsConfirmedAt && (
                                            <textarea
                                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                              rows={2}
                                              placeholder="Optional: add a note for finance (e.g. priority sites, special instructions)…"
                                              value={paymentRequestNote}
                                              onChange={e => setPaymentRequestNote(e.target.value)}
                                              data-testid="textarea-payment-request-note"
                                            />
                                          )}

                                          {/* Action buttons */}
                                          {!paymentsConfirmedAt && (
                                            <div className="flex gap-2">
                                              {!paymentRequestedAt ? (
                                                <Button
                                                  size="sm"
                                                  className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                                  onClick={() => handleRequestPayments(checklistMmpId!)}
                                                  disabled={requestingPayment}
                                                  data-testid="button-request-payments"
                                                >
                                                  {requestingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                                                  Send Payment Request to Finance
                                                </Button>
                                              ) : (
                                                <Button
                                                  size="sm"
                                                  className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                                  onClick={() => handleConfirmPaymentsDone(checklistMmpId!)}
                                                  disabled={confirmingPayments}
                                                  data-testid="button-confirm-payments-done"
                                                >
                                                  {confirmingPayments ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                  Confirm All Payments Done ✓
                                                </Button>
                                              )}
                                            </div>
                                          )}
                                          <p className="text-[10px] text-muted-foreground">Note: payment tracking is saved to the database. If the column doesn't exist yet, apply the migration in <code>supabase/mmp_payment_tracking_migration.sql</code>.</p>
                                        </div>
                                      )}

                                      {/* Submit button for step 7 */}
                                      {step.id === 'submit' && cycleReadiness.allPassed && !cycleReadiness.loading && (
                                        <div className="mt-3 space-y-3">
                                          {/* Pre-submit payment summary */}
                                          {cycleSummaryData && (() => {
                                            const cur = cycleSummaryData.currency;
                                            const PAYABLE = ['wfp_confirmed','verified','completed','approved'];
                                            const payableEntries = cycleSummaryData.enumeratorCosts.filter(e => PAYABLE.includes(e.status));
                                            const dispatchedTotal = cycleSummaryData.enumeratorCosts.length;
                                            const enumFee = payableEntries.reduce((s, e) => s + (e.enumeratorFee ?? 0), 0);
                                            const transport = payableEntries.reduce((s, e) => s + (e.transportFee ?? 0), 0);
                                            const opCosts = cycleSummaryData.totalApprovedCents / 100;
                                            const totalPay = enumFee + transport + opCosts;
                                            const totalRecover = cycleSummaryData.advanceDetails.reduce((s, a) => s + Math.max(0, a.remainingAmount ?? 0), 0);
                                            const net = totalPay - totalRecover;
                                            const { totalSites = 0, completedSites = 0, uncoveredSites = 0 } =
                                              siteVisitCounts[checklistMmpId!]
                                                ? (() => {
                                                    const c = siteVisitCounts[checklistMmpId!];
                                                    const wfpC = c.statusCounts?.['wfp_confirmed'] ?? 0;
                                                    return {
                                                      totalSites: c.total,
                                                      completedSites: (c.statusCounts?.['completed'] ?? 0) + wfpC,
                                                      uncoveredSites: c.statusCounts?.['not_covered'] ?? 0,
                                                    };
                                                  })()
                                                : {};
                                            const feeGap = completedSites > 0 && payableEntries.length < completedSites;
                                            const usdRate = liveExchangeRate;
                                            const usdLine = (sdg: number) => usdRate && sdg > 0
                                              ? <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium ml-1">≈ USD {(sdg / usdRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                              : null;
                                            return (
                                              <div className="rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 p-3 space-y-2">
                                                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-100">📋 Closing Summary — Review Before Submitting</p>
                                                {usdRate && (
                                                  <p className="text-[10px] text-blue-600 dark:text-blue-400">Rate: 1 USD = {usdRate.toLocaleString()} SDG</p>
                                                )}
                                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                  <div className="rounded bg-white/60 dark:bg-black/20 p-2">
                                                    <div className="text-sm font-bold text-green-700 dark:text-green-300">{completedSites}</div>
                                                    <div className="text-muted-foreground">Sites Covered</div>
                                                  </div>
                                                  <div className="rounded bg-white/60 dark:bg-black/20 p-2">
                                                    <div className="text-sm font-bold text-orange-600 dark:text-orange-400">{uncoveredSites}</div>
                                                    <div className="text-muted-foreground">Not Covered</div>
                                                  </div>
                                                  <div className="rounded bg-white/60 dark:bg-black/20 p-2">
                                                    <div className="text-sm font-bold">{totalSites}</div>
                                                    <div className="text-muted-foreground">Total Sites</div>
                                                  </div>
                                                </div>

                                                {/* Dispatch / fee gap warning */}
                                                {feeGap && (
                                                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-2.5 py-2 text-[11px]">
                                                    <span className="text-amber-600 mt-0.5 shrink-0">⚠️</span>
                                                    <span className="text-amber-800 dark:text-amber-200">
                                                      <strong>{completedSites} sites were visited</strong> but only <strong>{payableEntries.length} of {dispatchedTotal} dispatched site{dispatchedTotal !== 1 ? 's' : ''}</strong> have a payable status with fee records. {payableEntries.length === 0 ? 'No fees will be paid out.' : 'Only the dispatched sites are included in the payment total below.'}
                                                    </span>
                                                  </div>
                                                )}

                                                {/* Inline fee editor — always visible when there are payable sites */}
                                                {payableEntries.length > 0 && (() => {
                                                  const allFeesZero = payableEntries.every(e => (e.enumeratorFee ?? 0) === 0 && (e.transportFee ?? 0) === 0);
                                                  const editEntries = Object.keys(feeEdits).length > 0
                                                    ? feeEdits
                                                    : Object.fromEntries(payableEntries.map(e => [e.id, { enum: e.enumeratorFee ?? 0, transport: e.transportFee ?? 0 }]));
                                                  if (Object.keys(feeEdits).length === 0 && payableEntries.length > 0) {
                                                    // Initialise feeEdits on first render without triggering re-render loop
                                                    setTimeout(() => {
                                                      setFeeEdits(Object.fromEntries(payableEntries.map(e => [e.id, { enum: e.enumeratorFee ?? 0, transport: e.transportFee ?? 0 }])));
                                                    }, 0);
                                                  }
                                                  const liveEnumTotal = Object.values(editEntries).reduce((s, v) => s + (v.enum || 0), 0);
                                                  const liveTransTotal = Object.values(editEntries).reduce((s, v) => s + (v.transport || 0), 0);
                                                  const liveNet = liveEnumTotal + liveTransTotal + opCosts - totalRecover;
                                                  return (
                                                    <div className={`rounded-lg border-2 overflow-hidden ${allFeesZero ? 'border-red-300 dark:border-red-700' : 'border-green-300 dark:border-green-700'}`}>
                                                      <div className={`px-3 py-2 flex items-center justify-between ${allFeesZero ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                                                        <span className={`text-[11px] font-bold ${allFeesZero ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                                                          {allFeesZero ? '⚠️ Fees not set — enter amounts below before submitting' : '✅ Site Fees'}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          className="text-[10px] text-muted-foreground underline"
                                                          onClick={() => setFeeEditOpen(v => !v)}
                                                        >
                                                          {feeEditOpen ? 'Collapse' : 'Expand to edit'}
                                                        </button>
                                                      </div>
                                                      <div className="p-2 space-y-2 bg-white/90 dark:bg-black/20">
                                                        {payableEntries.map(e => (
                                                          <div key={e.id} className="rounded border border-gray-200 dark:border-gray-700 p-2 space-y-1.5">
                                                            <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                              {e.siteName} <span className="font-normal text-muted-foreground">— {e.enumeratorName}</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                              <div>
                                                                <label className="text-[10px] text-muted-foreground block mb-0.5">Enumerator Fee (SDG)</label>
                                                                <input
                                                                  type="number"
                                                                  min={0}
                                                                  className="w-full text-xs rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-900 px-2 py-1 font-mono focus:ring-2 focus:ring-indigo-400 outline-none"
                                                                  value={feeEdits[e.id]?.enum ?? e.enumeratorFee ?? 0}
                                                                  onChange={ev => setFeeEdits(prev => ({ ...prev, [e.id]: { ...(prev[e.id] ?? { enum: 0, transport: 0 }), enum: Number(ev.target.value) } }))}
                                                                />
                                                              </div>
                                                              <div>
                                                                <label className="text-[10px] text-muted-foreground block mb-0.5">Transport Fee (SDG)</label>
                                                                <input
                                                                  type="number"
                                                                  min={0}
                                                                  className="w-full text-xs rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-900 px-2 py-1 font-mono focus:ring-2 focus:ring-indigo-400 outline-none"
                                                                  value={feeEdits[e.id]?.transport ?? e.transportFee ?? 0}
                                                                  onChange={ev => setFeeEdits(prev => ({ ...prev, [e.id]: { ...(prev[e.id] ?? { enum: 0, transport: 0 }), transport: Number(ev.target.value) } }))}
                                                                />
                                                              </div>
                                                            </div>
                                                          </div>
                                                        ))}
                                                        {/* Live preview */}
                                                        <div className="rounded bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 text-[11px] space-y-0.5">
                                                          <div className="flex justify-between text-muted-foreground">
                                                            <span>Enumerator total</span><span className="font-mono font-semibold">{liveEnumTotal.toLocaleString()} {cur}</span>
                                                          </div>
                                                          <div className="flex justify-between text-muted-foreground">
                                                            <span>Transport total</span><span className="font-mono font-semibold">{liveTransTotal.toLocaleString()} {cur}</span>
                                                          </div>
                                                          <div className={`flex justify-between font-bold border-t border-indigo-200 dark:border-indigo-700 pt-1 mt-0.5 ${liveNet >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                                            <span>Net to Pay</span><span className="font-mono">{Math.abs(liveNet).toLocaleString()} {cur}</span>
                                                          </div>
                                                        </div>
                                                        <button
                                                          type="button"
                                                          disabled={savingFees}
                                                          className="w-full rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold py-2 flex items-center justify-center gap-1.5"
                                                          onClick={async () => {
                                                            setSavingFees(true);
                                                            try {
                                                              await Promise.all(
                                                                Object.entries(feeEdits).map(([id, v]) =>
                                                                  supabase.from('mmp_site_entries').update({
                                                                    enumerator_fee: v.enum,
                                                                    transport_fee: v.transport,
                                                                    cost: v.enum + v.transport,
                                                                  }).eq('id', id)
                                                                )
                                                              );
                                                              if (checklistMmpId) fetchCycleSummary(checklistMmpId);
                                                            } finally {
                                                              setSavingFees(false);
                                                            }
                                                          }}
                                                        >
                                                          {savingFees ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : '💾 Save Fees & Refresh Summary'}
                                                        </button>
                                                      </div>
                                                    </div>
                                                  );
                                                })()}

                                                <div className="space-y-1.5 text-xs border-t border-indigo-200 dark:border-indigo-800 pt-2">
                                                  <div className="flex justify-between items-baseline">
                                                    <span className="text-muted-foreground">
                                                      Enumerator fees
                                                      <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400">({payableEntries.length} dispatched site{payableEntries.length !== 1 ? 's' : ''} with payable status)</span>
                                                    </span>
                                                    <span className="font-mono font-semibold shrink-0 ml-2">
                                                      {enumFee.toLocaleString()} {cur}{usdLine(enumFee)}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between items-baseline">
                                                    <span className="text-muted-foreground flex items-center gap-1">
                                                      Transport fees
                                                      {transport === 0 && dispatchedTotal > 0 && (
                                                        <span className="text-[10px] text-amber-600 dark:text-amber-400">(not set in dispatch)</span>
                                                      )}
                                                    </span>
                                                    <span className="font-mono font-semibold shrink-0 ml-2">
                                                      {transport.toLocaleString()} {cur}{usdLine(transport)}
                                                    </span>
                                                  </div>
                                                  {opCosts > 0 && (
                                                    <div className="flex justify-between items-baseline">
                                                      <span className="text-muted-foreground">Approved op. costs</span>
                                                      <span className="font-mono font-semibold shrink-0 ml-2">{opCosts.toLocaleString()} {cur}{usdLine(opCosts)}</span>
                                                    </div>
                                                  )}
                                                  {totalRecover > 0 && (
                                                    <div className="flex justify-between items-baseline text-orange-700 dark:text-orange-400">
                                                      <span>Less: outstanding advances to recover</span>
                                                      <span className="font-mono font-semibold shrink-0 ml-2">−{totalRecover.toLocaleString()} {cur}{usdLine(totalRecover)}</span>
                                                    </div>
                                                  )}
                                                  <div className={`flex justify-between items-baseline border-t pt-1.5 mt-1 font-bold ${net >= 0 ? 'text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'}`}>
                                                    <span>{net >= 0 ? 'Net to Pay Field Staff' : 'Net to Recover from Field'}</span>
                                                    <span className="font-mono shrink-0 ml-2">
                                                      {Math.abs(net).toLocaleString()} {cur}{usdLine(Math.abs(net))}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                          <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20 p-3" data-testid="label-reconciliation-ack-guide">
                                            <input
                                              type="checkbox"
                                              checked={reconciliationAcknowledged}
                                              onChange={e => setReconciliationAcknowledged(e.target.checked)}
                                              className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0"
                                              data-testid="checkbox-reconciliation-ack-guide"
                                            />
                                            <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">
                                              I confirm all financial obligations for this cycle are accounted for.
                                            </span>
                                          </label>
                                          <Button
                                            size="sm"
                                            className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5"
                                            onClick={() => handleFinalizeCycleClose(checklistMmpId!)}
                                            disabled={finalizingCycle || !reconciliationAcknowledged}
                                            data-testid="button-proceed-close-cycle-guide"
                                          >
                                            {finalizingCycle
                                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                                              : (mmpFiles?.find(m => m.id === checklistMmpId) as any)?.cycle_approval_note
                                                ? <><RefreshCw className="h-4 w-4" /> Re-submit for Approval</>
                                                : <><CheckCircle2 className="h-4 w-4" /> Submit Cycle for Final Approval</>
                                            }
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* ── Cycle Financial Summary (collapsible) ── */}
                            <Collapsible defaultOpen={true}>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-foreground w-full px-3 py-2 border rounded-lg bg-muted/30 hover:bg-muted/50" data-testid="button-toggle-cycle-summary">
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                <span>📊 Cycle Financial Summary &amp; Export</span>
                                {cycleSummaryData && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">
                                    {(cycleSummaryData.totalApprovedCents / 100).toLocaleString()} {cycleSummaryData.currency} approved
                                  </Badge>
                                )}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-3 space-y-3">
                                {loadingCycleSummary ? (
                                  <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading financial data…
                                  </div>
                                ) : !cycleSummaryData ? (
                                  <p className="text-xs text-muted-foreground text-center py-2">No financial data found for this cycle.</p>
                                ) : (
                                  <>
                                    {/* ── Settlement Card — accounting obligations at a glance ── */}
                                    {(() => {
                                      const cur = cycleSummaryData.currency;
                                      // ALL payable statuses — fees are owed once a visit is done,
                                      // regardless of whether WFP confirmation has been applied yet
                                      const PAYABLE = ['wfp_confirmed','verified','completed','approved'];
                                      const payableEntries  = cycleSummaryData.enumeratorCosts.filter(e => PAYABLE.includes(e.status));
                                      const payableEnumFee  = payableEntries.reduce((s, e) => s + (e.enumeratorFee  ?? 0), 0);
                                      const payableTransport= payableEntries.reduce((s, e) => s + (e.transportFee   ?? 0), 0);
                                      // WFP-confirmed subset — for the impact line only
                                      const wfpEntries   = cycleSummaryData.enumeratorCosts.filter(e => e.status === 'wfp_confirmed');
                                      const wfpEnumFee   = wfpEntries.reduce((s, e) => s + (e.enumeratorFee  ?? 0), 0);
                                      const wfpTransport = wfpEntries.reduce((s, e) => s + (e.transportFee   ?? 0), 0);
                                      const wfpSiteCount = wfpEntries.length;
                                      // How many payable sites are still awaiting WFP confirmation
                                      const awaitingWfpFees = payableEntries
                                        .filter(e => ['completed','approved'].includes(e.status))
                                        .reduce((s, e) => s + (e.totalCost ?? 0), 0);
                                      // Approved operational costs
                                      const approvedOp = cycleSummaryData.totalApprovedCents / 100;
                                      // Total to pay out = all payable site fees + approved op costs
                                      const totalPayOut = payableEnumFee + payableTransport + approvedOp;
                                      // Outstanding advances to recover
                                      const totalRecover = cycleSummaryData.advanceDetails.reduce((s, a) => s + Math.max(0, a.remainingAmount ?? 0), 0);
                                      // Net
                                      const net = totalPayOut - totalRecover;
                                      const isNetPositive = net >= 0;
                                      return (
                                        <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3">
                                          <p className="text-xs font-bold text-blue-900 dark:text-blue-100">💰 Cycle Financial Settlement</p>

                                          {/* WFP confirmation impact line */}
                                          {wfpSiteCount > 0 && (
                                            <div className="flex items-center gap-2 rounded-lg bg-white/70 dark:bg-black/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                                              <span className="text-sm">🛡️</span>
                                              <div className="text-xs text-blue-800 dark:text-blue-200">
                                                <span className="font-semibold">WFP confirmed {wfpSiteCount} site{wfpSiteCount !== 1 ? 's' : ''}</span>
                                                {' — '}{(wfpEnumFee + wfpTransport).toLocaleString()} {cur} payable to enumerators
                                                <span className="text-muted-foreground ml-1">({wfpEnumFee.toLocaleString()} fees + {wfpTransport.toLocaleString()} transport)</span>
                                              </div>
                                            </div>
                                          )}

                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {/* Pay Out column */}
                                            <div className="rounded-lg border border-green-300 dark:border-green-700 bg-white/60 dark:bg-black/20 p-3 space-y-1.5">
                                              <p className="text-[11px] font-bold text-green-800 dark:text-green-300 uppercase tracking-wide">➕ Pay to Field Staff</p>
                                              <div className="space-y-1 text-xs">
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">Enumerator fees (visited sites)</span>
                                                  <span className="font-mono font-semibold">{payableEnumFee.toLocaleString()} {cur}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">Transport (visited sites)</span>
                                                  <span className="font-mono font-semibold">{payableTransport.toLocaleString()} {cur}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">Approved op. costs</span>
                                                  <span className="font-mono font-semibold">{approvedOp.toLocaleString()} {cur}</span>
                                                </div>
                                                {awaitingWfpFees > 0 && (
                                                  <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                                    <span className="italic">↳ incl. awaiting WFP confirm</span>
                                                    <span className="font-mono">{awaitingWfpFees.toLocaleString()} {cur}</span>
                                                  </div>
                                                )}
                                                <div className="flex justify-between border-t border-green-200 dark:border-green-800 pt-1 mt-1 font-semibold text-green-800 dark:text-green-300">
                                                  <span>Subtotal to Pay</span>
                                                  <span className="font-mono">{totalPayOut.toLocaleString()} {cur}</span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Recover column */}
                                            <div className={`rounded-lg border p-3 space-y-1.5 ${totalRecover > 0 ? 'border-orange-300 dark:border-orange-700 bg-white/60 dark:bg-black/20' : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'}`}>
                                              <p className={`text-[11px] font-bold uppercase tracking-wide ${totalRecover > 0 ? 'text-orange-800 dark:text-orange-300' : 'text-green-700 dark:text-green-400'}`}>➖ Recover from Field</p>
                                              <div className="space-y-1 text-xs">
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">Outstanding advances</span>
                                                  <span className={`font-mono font-semibold ${totalRecover > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-green-700'}`}>
                                                    {totalRecover > 0 ? `${totalRecover.toLocaleString()} ${cur}` : '✓ None'}
                                                  </span>
                                                </div>
                                                <div className={`flex justify-between border-t pt-1 mt-1 font-semibold ${totalRecover > 0 ? 'border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300' : 'border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'}`}>
                                                  <span>Subtotal to Recover</span>
                                                  <span className="font-mono">{totalRecover.toLocaleString()} {cur}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Net line */}
                                          <div className={`flex items-center justify-between rounded-lg px-4 py-3 border-2 ${isNetPositive ? 'border-green-400 dark:border-green-600 bg-green-100 dark:bg-green-950/50' : 'border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/30'}`}>
                                            <div>
                                              <p className="text-xs font-bold text-foreground">
                                                {isNetPositive ? '✅ Net Payable to Field Staff' : '🔴 Net Recovery from Field Staff'}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                                {isNetPositive
                                                  ? 'Organisation owes this amount to field staff after all deductions'
                                                  : 'Field staff owe this amount back to the organisation'}
                                              </p>
                                            </div>
                                            <span className={`font-mono text-lg font-bold ${isNetPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                              {Math.abs(net).toLocaleString()} {cur}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Coverage snapshot */}
                                    {siteVisitCounts[checklistMmpId!] && (() => {
                                      const c = siteVisitCounts[checklistMmpId!];
                                      const wfpConfirmedCount = c.statusCounts?.['wfp_confirmed'] ?? 0;
                                      const completed = (c.statusCounts?.['completed'] ?? 0) + wfpConfirmedCount;
                                      const notCovered = c.statusCounts?.['not_covered'] ?? 0;
                                      return (
                                        <div className="rounded-lg border bg-muted/30 p-3">
                                          <p className="text-xs font-semibold mb-2">Site Coverage Snapshot</p>
                                          <div className="grid grid-cols-4 gap-2 text-center">
                                            <div><div className="text-lg font-bold text-green-600">{completed}</div><div className="text-[10px] text-muted-foreground">Completed</div></div>
                                            <div><div className="text-lg font-bold text-blue-600">{wfpConfirmedCount}</div><div className="text-[10px] text-muted-foreground">WFP Confirmed</div></div>
                                            <div><div className="text-lg font-bold text-red-500">{notCovered}</div><div className="text-[10px] text-muted-foreground">Not Covered</div></div>
                                            <div><div className="text-lg font-bold">{c.total}</div><div className="text-[10px] text-muted-foreground">Total Sites</div></div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Cost Submissions */}
                                    {cycleSummaryData.costSubs.length > 0 && (
                                      <div className="rounded-lg border overflow-hidden">
                                        <div className="px-3 py-2 bg-muted/40 text-xs font-semibold">Operational Cost Submissions</div>
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b bg-muted/20">
                                              <th className="px-3 py-1.5 text-left font-medium">Category</th>
                                              <th className="px-3 py-1.5 text-right font-medium">Count</th>
                                              <th className="px-3 py-1.5 text-right font-medium text-green-700">Approved</th>
                                              <th className="px-3 py-1.5 text-right font-medium text-orange-600">Pending</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cycleSummaryData.costSubs.map(r => (
                                              <tr key={r.category} className="border-b last:border-0 hover:bg-muted/10">
                                                <td className="px-3 py-1.5 font-medium">{r.category}</td>
                                                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.count}</td>
                                                <td className="px-3 py-1.5 text-right text-green-700 font-mono">{r.approvedCents > 0 ? `${(r.approvedCents / 100).toLocaleString()} ${r.currency}` : '—'}</td>
                                                <td className="px-3 py-1.5 text-right text-orange-600 font-mono">{r.pendingCents > 0 ? `${(r.pendingCents / 100).toLocaleString()} ${r.currency}` : '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-muted/30 font-semibold">
                                              <td className="px-3 py-1.5">Total</td>
                                              <td className="px-3 py-1.5 text-right">{cycleSummaryData.costSubs.reduce((s, r) => s + r.count, 0)}</td>
                                              <td className="px-3 py-1.5 text-right text-green-700 font-mono">{(cycleSummaryData.totalApprovedCents / 100).toLocaleString()} {cycleSummaryData.currency}</td>
                                              <td className="px-3 py-1.5 text-right text-orange-600 font-mono">{(cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0) / 100).toLocaleString()} {cycleSummaryData.currency}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}

                                    {/* Transport Advances — per person */}
                                    {cycleSummaryData.advanceDetails.length > 0 && (() => {
                                      const totalAdv = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.requestedAmount, 0);
                                      const totalPaid = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.paidAmount, 0);
                                      const totalRem = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.remainingAmount, 0);
                                      const fullyPaidCount = cycleSummaryData.advanceDetails.filter(a => a.remainingAmount <= 0).length;
                                      const unpaidCount = cycleSummaryData.advanceDetails.length - fullyPaidCount;
                                      const allSettled = totalRem <= 0;
                                      return (
                                        <>
                                          {/* Advance Payment Status Summary Card */}
                                          <div className={`rounded-lg border-2 p-3 ${allSettled ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30' : 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-sm font-bold">{allSettled ? '✅' : '⚠️'} Transport Advance Payment Status</span>
                                              <Badge className={`ml-auto text-xs ${allSettled ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200'}`}>
                                                {allSettled ? 'All Settled' : `${unpaidCount} Outstanding`}
                                              </Badge>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                              <div className="rounded bg-white/60 dark:bg-black/20 p-2">
                                                <div className="text-base font-bold text-blue-700 dark:text-blue-300">{totalAdv.toLocaleString()}</div>
                                                <div className="text-muted-foreground mt-0.5">Total Issued ({cycleSummaryData.currency})</div>
                                              </div>
                                              <div className="rounded bg-white/60 dark:bg-black/20 p-2">
                                                <div className="text-base font-bold text-green-700 dark:text-green-300">{totalPaid.toLocaleString()}</div>
                                                <div className="text-muted-foreground mt-0.5">Paid Back ({cycleSummaryData.currency})</div>
                                              </div>
                                              <div className={`rounded p-2 ${totalRem > 0 ? 'bg-orange-100/80 dark:bg-orange-900/30' : 'bg-green-100/80 dark:bg-green-900/30'}`}>
                                                <div className={`text-base font-bold ${totalRem > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-green-700 dark:text-green-300'}`}>{totalRem > 0 ? totalRem.toLocaleString() : '✓ 0'}</div>
                                                <div className="text-muted-foreground mt-0.5">Remaining ({cycleSummaryData.currency})</div>
                                              </div>
                                            </div>
                                            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                                              <span className="text-green-700 dark:text-green-400 font-medium">✓ {fullyPaidCount} fully paid</span>
                                              {unpaidCount > 0 && <span className="text-orange-700 dark:text-orange-400 font-medium">⚠ {unpaidCount} still outstanding — must settle before cycle closes</span>}
                                            </div>
                                          </div>

                                          {/* Advance detail table */}
                                          <div className="rounded-lg border overflow-hidden">
                                            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/40 text-xs font-semibold flex items-center gap-2">
                                              <span>🚗 Transport Advances — Per Person Breakdown</span>
                                              <Badge variant="secondary" className="ml-auto text-[10px]">
                                                {cycleSummaryData.advanceDetails.length} advance{cycleSummaryData.advanceDetails.length !== 1 ? 's' : ''}
                                              </Badge>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b bg-muted/20">
                                                <th className="px-3 py-1.5 text-left font-medium">Recipient</th>
                                                <th className="px-3 py-1.5 text-left font-medium">Site</th>
                                                <th className="px-3 py-1.5 text-left font-medium">Type</th>
                                                <th className="px-3 py-1.5 text-right font-medium">Total Advanced</th>
                                                <th className="px-3 py-1.5 text-right font-medium text-green-700">Paid</th>
                                                <th className="px-3 py-1.5 text-right font-medium text-orange-600">Remaining</th>
                                                <th className="px-3 py-1.5 text-center font-medium">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {cycleSummaryData.advanceDetails.map(a => {
                                                const isFullyPaid = a.remainingAmount <= 0;
                                                const isPartial = a.paidAmount > 0 && !isFullyPaid;
                                                return (
                                                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/10">
                                                    <td className="px-3 py-1.5 font-medium">{a.requesterName}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">{a.siteName}</td>
                                                    <td className="px-3 py-1.5">
                                                      <Badge variant="outline" className="text-[10px]">
                                                        {a.paymentType === 'full_advance' ? 'Full' : 'Installments'}
                                                      </Badge>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">{a.requestedAmount.toLocaleString()} {a.currency}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono text-green-700">{a.paidAmount > 0 ? `${a.paidAmount.toLocaleString()} ${a.currency}` : '—'}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono text-orange-600">{a.remainingAmount > 0 ? `${a.remainingAmount.toLocaleString()} ${a.currency}` : <span className="text-green-600">✓ Settled</span>}</td>
                                                    <td className="px-3 py-1.5 text-center">
                                                      <Badge className={`text-[10px] ${isFullyPaid ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : isPartial ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                                                        {isFullyPaid ? 'Fully Paid' : isPartial ? 'Partial' : a.status}
                                                      </Badge>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                            <tfoot>
                                              <tr className="bg-muted/30 font-semibold">
                                                <td className="px-3 py-1.5" colSpan={3}>Total</td>
                                                <td className="px-3 py-1.5 text-right font-mono">{cycleSummaryData.advanceDetails.reduce((s, a) => s + a.requestedAmount, 0).toLocaleString()} {cycleSummaryData.currency}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-green-700">{cycleSummaryData.advanceDetails.reduce((s, a) => s + a.paidAmount, 0).toLocaleString()} {cycleSummaryData.currency}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-orange-600">{cycleSummaryData.advanceDetails.reduce((s, a) => s + a.remainingAmount, 0).toLocaleString()} {cycleSummaryData.currency}</td>
                                                <td />
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}

                                    {/* Withdrawal Requests */}
                                    {cycleSummaryData.withdrawals.length > 0 && (
                                      <div className="rounded-lg border overflow-hidden">
                                        <div className="px-3 py-2 bg-purple-50 dark:bg-purple-950/40 text-xs font-semibold flex items-center gap-2">
                                          <span>💸 Cash Withdrawal Requests</span>
                                          <Badge variant="secondary" className="ml-auto text-[10px]">
                                            {cycleSummaryData.withdrawals.filter(w => !['rejected','cancelled'].includes(w.status)).length} active
                                          </Badge>
                                        </div>
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b bg-muted/20">
                                              <th className="px-3 py-1.5 text-left font-medium">Requested By</th>
                                              <th className="px-3 py-1.5 text-left font-medium">Reason</th>
                                              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cycleSummaryData.withdrawals.map(w => (
                                              <tr key={w.id} className="border-b last:border-0 hover:bg-muted/10">
                                                <td className="px-3 py-1.5 font-medium">{w.userName}</td>
                                                <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">{w.reason}</td>
                                                <td className="px-3 py-1.5 text-right font-mono">{w.amount.toLocaleString()} {w.currency}</td>
                                                <td className="px-3 py-1.5 text-center">
                                                  <Badge className={`text-[10px] ${w.status === 'paid' || w.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : w.status === 'rejected' || w.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'}`}>
                                                    {w.status}
                                                  </Badge>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-muted/30 font-semibold">
                                              <td className="px-3 py-1.5" colSpan={2}>Total (active)</td>
                                              <td className="px-3 py-1.5 text-right font-mono">{cycleSummaryData.totalWithdrawalAmount.toLocaleString()} {cycleSummaryData.currency}</td>
                                              <td />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}

                                    {/* Outstanding Obligations Summary */}
                                    {(cycleSummaryData.advanceDetails.length > 0 || cycleSummaryData.withdrawals.length > 0) && (() => {
                                      const totalRemaining = cycleSummaryData.advanceDetails.reduce((s, a) => s + a.remainingAmount, 0);
                                      const totalPending = cycleSummaryData.costSubs.reduce((s, r) => s + r.pendingCents, 0) / 100;
                                      const totalOutstanding = totalRemaining + totalPending + cycleSummaryData.totalWithdrawalAmount;
                                      return (
                                        <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3">
                                          <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-2">📋 Financial Obligations After WFP Confirmation</p>
                                          <div className="space-y-1.5 text-xs">
                                            {totalRemaining > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Advance balances still to settle</span>
                                                <span className="font-mono font-semibold text-orange-700 dark:text-orange-300">{totalRemaining.toLocaleString()} {cycleSummaryData.currency}</span>
                                              </div>
                                            )}
                                            {totalPending > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Pending cost submissions (fees)</span>
                                                <span className="font-mono font-semibold text-orange-700 dark:text-orange-300">{totalPending.toLocaleString()} {cycleSummaryData.currency}</span>
                                              </div>
                                            )}
                                            {cycleSummaryData.totalWithdrawalAmount > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Cash withdrawal requests</span>
                                                <span className="font-mono font-semibold text-orange-700 dark:text-orange-300">{cycleSummaryData.totalWithdrawalAmount.toLocaleString()} {cycleSummaryData.currency}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between border-t border-orange-200 dark:border-orange-700 pt-1.5 mt-1">
                                              <span className="font-semibold">Total Outstanding</span>
                                              <span className="font-mono font-bold text-orange-800 dark:text-orange-200">{totalOutstanding.toLocaleString()} {cycleSummaryData.currency}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Enumerator Costs */}
                                    {cycleSummaryData.enumeratorCosts.length > 0 && (() => {
                                      type StatusEntry = { label: string; cls: string; isTerminal: boolean; actionFn: (ack: boolean) => string };
                                      const SM: Record<string, StatusEntry> = {
                                        // Terminal / done
                                        wfp_confirmed:           { label: 'WFP Confirmed',    cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',      isTerminal: true,  actionFn: (ack) => ack ? '✓ Ready — no action needed' : 'Ask enumerator to acknowledge cost in the app' },
                                        cancelled:               { label: 'Cancelled',        cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',              isTerminal: true,  actionFn: () => 'Visit cancelled — no further action' },
                                        verified:                { label: 'Verified',         cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',      isTerminal: true,  actionFn: (ack) => ack ? '✓ Ready — no action needed' : 'Ask enumerator to acknowledge cost in the app' },
                                        not_covered:             { label: 'Not Covered',      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',  isTerminal: true,  actionFn: () => 'Flagged as not covered — reason required if not provided' },
                                        // Near-done — needs one more step
                                        completed:               { label: 'Completed',        cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',          isTerminal: false, actionFn: (ack) => ack ? 'Cost acknowledged — supervisor/FOM must submit WFP confirmation' : 'Supervisor/FOM must submit WFP confirmation, enumerator must acknowledge cost' },
                                        approved:                { label: 'Approved',         cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',          isTerminal: false, actionFn: (ack) => ack ? 'Approved — supervisor/FOM must submit WFP confirmation' : 'Supervisor/FOM must submit WFP confirmation' },
                                        // Mid-flow — active
                                        accepted:                { label: 'Accepted',         cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',      isTerminal: false, actionFn: () => 'Enumerator accepted — wait for field visit to be completed' },
                                        in_progress:             { label: 'In Progress',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',      isTerminal: false, actionFn: () => 'Visit in progress — wait for enumerator to mark complete' },
                                        inprogress:              { label: 'In Progress',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',      isTerminal: false, actionFn: () => 'Visit in progress — wait for enumerator to mark complete' },
                                        dispatched:              { label: 'Dispatched',       cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',  isTerminal: false, actionFn: () => 'Waiting for enumerator to accept in the mobile app' },
                                        forwarded:               { label: 'Forwarded',        cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',  isTerminal: false, actionFn: () => 'Forwarded to coordinator — awaiting acceptance' },
                                        forwarded_to_fom:        { label: 'With FOM',         cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',  isTerminal: false, actionFn: () => 'Waiting for FOM to review and dispatch' },
                                        forwarded_to_coordinator:{ label: 'With Coordinator', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',  isTerminal: false, actionFn: () => 'Waiting for coordinator to dispatch to enumerator' },
                                        permits_attached:        { label: 'Permits Attached', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',          isTerminal: false, actionFn: () => 'Permits ready — coordinator must dispatch enumerator' },
                                        assigned:                { label: 'Assigned',         cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',          isTerminal: false, actionFn: () => 'Assigned to enumerator — coordinator must dispatch' },
                                        submitted:               { label: 'Submitted',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',          isTerminal: false, actionFn: () => 'Submitted — awaiting supervisor review' },
                                        // Not started
                                        pending:                 { label: 'Pending',          cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',          isTerminal: false, actionFn: () => 'Not yet assigned — assign an enumerator to proceed' },
                                      };
                                      const getStatusEntry = (status: string) => SM[status] || SM[status?.toLowerCase()] || null;
                                      const getAction = (e: EnumeratorCostDetail): { text: string; isBlocking: boolean } => {
                                        const entry = getStatusEntry(e.status);
                                        if (entry) return { text: entry.actionFn(e.costAcknowledged), isBlocking: !entry.isTerminal };
                                        // Null/unknown status — use cost_acknowledged as signal
                                        if (e.costAcknowledged) return { text: '✓ Cost acknowledged — verify visit status in MMP', isBlocking: false };
                                        return { text: 'Open the MMP and check this site entry\'s status', isBlocking: true };
                                      };
                                      const ackCount  = cycleSummaryData.enumeratorCosts.filter(e => e.costAcknowledged).length;
                                      const doneCount = cycleSummaryData.enumeratorCosts.filter(e => getStatusEntry(e.status)?.isTerminal).length;
                                      const blockCount = cycleSummaryData.enumeratorCosts.filter(e => getAction(e).isBlocking).length;
                                      return (
                                        <div className="rounded-lg border overflow-hidden">
                                          <div className="px-3 py-2 bg-green-50 dark:bg-green-950/40 text-xs font-semibold flex items-center gap-2 flex-wrap">
                                            <span>👤 Enumerator & Transport Costs (Site Visits)</span>
                                            <Badge variant="secondary" className="text-[10px]">{cycleSummaryData.enumeratorCosts.length} sites</Badge>
                                            <span className="ml-auto flex gap-1.5 flex-wrap">
                                              <span className="rounded-full px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px] font-medium">{doneCount} Complete</span>
                                              <span className="rounded-full px-2 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 text-[10px] font-medium">{ackCount} Cost Ack.</span>
                                              {blockCount > 0 && <span className="rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px] font-medium">{blockCount} Need Action</span>}
                                            </span>
                                          </div>
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="border-b bg-muted/20">
                                                  <th className="px-3 py-1.5 text-left font-medium min-w-[120px]">Enumerator / Site</th>
                                                  <th className="px-3 py-1.5 text-right font-medium text-blue-700">Enum. Fee</th>
                                                  <th className="px-3 py-1.5 text-right font-medium text-indigo-700">Transport</th>
                                                  <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                                                  <th className="px-3 py-1.5 text-center font-medium min-w-[100px]">Status</th>
                                                  <th className="px-3 py-1.5 text-left font-medium min-w-[200px]">What to do next</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {cycleSummaryData.enumeratorCosts.map(e => {
                                                  const entry = getStatusEntry(e.status);
                                                  const { text: actionText, isBlocking } = getAction(e);
                                                  const isDone = entry?.isTerminal && e.costAcknowledged;
                                                  const rawStatus = e.status && e.status !== 'unknown' ? e.status : null;
                                                  return (
                                                    <tr key={e.id} className={`border-b last:border-0 ${isBlocking ? 'bg-amber-50/40 dark:bg-amber-950/15' : 'hover:bg-muted/10'}`}>
                                                      <td className="px-3 py-2">
                                                        <div className="font-medium text-foreground">
                                                          {e.enumeratorName === 'Unassigned'
                                                            ? <span className="text-muted-foreground italic">Unassigned</span>
                                                            : e.enumeratorName}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground truncate max-w-[160px]" title={e.siteName}>{e.siteName}</div>
                                                        <div className="text-[10px] text-muted-foreground/70">{e.state}{e.locality && e.locality !== '—' ? ` / ${e.locality}` : ''}</div>
                                                      </td>
                                                      <td className="px-3 py-2 text-right font-mono text-blue-700">{e.enumeratorFee > 0 ? `${e.enumeratorFee.toLocaleString()} ${e.currency}` : '—'}</td>
                                                      <td className="px-3 py-2 text-right font-mono text-indigo-700">{e.transportFee > 0 ? `${e.transportFee.toLocaleString()} ${e.currency}` : '—'}</td>
                                                      <td className="px-3 py-2 text-right font-mono font-semibold">{e.totalCost.toLocaleString()} {e.currency}</td>
                                                      <td className="px-3 py-2 text-center">
                                                        {entry ? (
                                                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${entry.cls}`}>{entry.label}</span>
                                                        ) : (
                                                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                                            {rawStatus ? rawStatus.replace(/_/g, ' ') : 'Not set'}
                                                          </span>
                                                        )}
                                                        {e.costAcknowledged && (
                                                          <div className="text-[10px] text-green-600 mt-0.5">Cost ✓</div>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-2 text-[11px]">
                                                        {isDone
                                                          ? <span className="text-green-600 font-medium">✓ Ready — no action needed</span>
                                                          : <span className={isBlocking ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted-foreground'}>{actionText}</span>
                                                        }
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                              <tfoot>
                                                <tr className="bg-muted/30 font-semibold">
                                                  <td className="px-3 py-1.5">Total</td>
                                                  <td className="px-3 py-1.5 text-right font-mono text-blue-700">{cycleSummaryData.totalEnumeratorFee.toLocaleString()} {cycleSummaryData.currency}</td>
                                                  <td className="px-3 py-1.5 text-right font-mono text-indigo-700">{cycleSummaryData.totalTransportFee.toLocaleString()} {cycleSummaryData.currency}</td>
                                                  <td className="px-3 py-1.5 text-right font-mono">{(cycleSummaryData.totalEnumeratorFee + cycleSummaryData.totalTransportFee).toLocaleString()} {cycleSummaryData.currency}</td>
                                                  <td colSpan={2} />
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {cycleSummaryData.costSubs.length === 0 && cycleSummaryData.advances.length === 0 && cycleSummaryData.withdrawals.length === 0 && cycleSummaryData.enumeratorCosts.length === 0 && (
                                      <p className="text-xs text-muted-foreground text-center py-2">No cost submissions, advances, withdrawal requests, or enumerator costs found for this cycle.</p>
                                    )}

                                    {/* Export buttons */}
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 gap-1.5"
                                        onClick={exportCycleSummaryExcel}
                                        data-testid="button-export-cycle-summary-excel"
                                      >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        Export to Excel
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                                        onClick={exportCycleSummaryPDF}
                                        data-testid="button-export-cycle-summary-pdf"
                                      >
                                        <FileText className="h-4 w-4" />
                                        Export Full PDF Report
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </CollapsibleContent>
                            </Collapsible>

                            {/* ── Step 9: Final Approval (rendered after financial panels) ── */}
                            {(() => {
                              const approvalIdx = guideSteps.findIndex(s => s.id === 'approval');
                              const step = guideSteps[approvalIdx];
                              if (!step) return null;
                              const isCurrentStep = !step.passed && !step.blocked && guideSteps.slice(0, approvalIdx).every(s => s.passed);
                              const isDone = step.passed;
                              return (
                                <div
                                  ref={isCurrentStep ? (el) => {
                                    if (el && guideScrolledStepRef.current !== 'approval') {
                                      guideScrolledStepRef.current = 'approval';
                                      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
                                    }
                                  } : undefined}
                                  className={`rounded-xl border transition-all ${
                                    isDone
                                      ? 'border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20 p-4'
                                      : isCurrentStep
                                        ? 'border-purple-400 bg-purple-50/60 dark:border-purple-600 dark:bg-purple-950/30 shadow-md p-4'
                                        : 'border-muted bg-card p-4'
                                  }`}
                                  data-testid={`guide-step-${step.id}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                      isDone ? 'bg-green-500 text-white'
                                        : isCurrentStep ? 'bg-purple-600 text-white animate-pulse'
                                        : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`font-semibold text-sm ${isDone ? 'text-green-700 dark:text-green-300' : isCurrentStep ? 'text-purple-800 dark:text-purple-200' : 'text-foreground'}`}>
                                          {step.title}
                                        </span>
                                        <span dir="rtl" className="text-xs text-muted-foreground/70">{step.titleAr}</span>
                                        {isDone && <Badge className="text-[10px] px-1.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300">Done ✓</Badge>}
                                        {isCurrentStep && <Badge className="text-[10px] px-1.5 bg-purple-600 text-white border-purple-600 animate-pulse">⏳ Awaiting approval</Badge>}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                                      {isCurrentStep && step.howTo.length > 0 && (
                                        <div className={`mt-3 rounded-lg border px-3 py-2.5 ${
                                          step.id === 'approval'
                                            ? 'bg-white dark:bg-purple-950/40 border-purple-300/70 dark:border-purple-700/60'
                                            : 'bg-white dark:bg-amber-950/40 border-amber-300/60'
                                        }`}>
                                          <p className={`text-xs font-semibold mb-1.5 ${step.id === 'approval' ? 'text-purple-900 dark:text-purple-100' : 'text-amber-900 dark:text-amber-100'}`}>What to do:</p>
                                          <ol className="space-y-1">
                                            {step.howTo.map((instruction, i) => (
                                              <li key={i} className={`flex items-start gap-2 text-xs ${step.id === 'approval' ? 'text-purple-800 dark:text-purple-200' : 'text-amber-800 dark:text-amber-200'}`}>
                                                <span className={`shrink-0 font-bold ${step.id === 'approval' ? 'text-purple-600' : 'text-amber-600'}`}>{i + 1}.</span>
                                                <span>{instruction}</span>
                                              </li>
                                            ))}
                                          </ol>
                                        </div>
                                      )}
                                      {/* ── Cycle Close Gate Timeline (Step 9 — always visible when in approval step) ── */}
                                      {(() => {
                                        const mmpSnap = mmpFiles?.find(m => m.id === checklistMmpId) as any;
                                        const fmt = (ts: string | null | undefined) =>
                                          ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
                                        const closedAt = mmpSnap?.cycle_closed_at;
                                        const timeline: { label: string; labelAr: string; ts: string | null; icon: string }[] = [
                                          { label: 'Fees Locked', labelAr: 'تثبيت الأتعاب', ts: fmt(feesLockedAt), icon: '🔒' },
                                          { label: 'Payment Requested', labelAr: 'طلب الدفع', ts: fmt(paymentRequestedAt), icon: '📤' },
                                          { label: 'Payments Confirmed', labelAr: 'تأكيد المدفوعات', ts: fmt(paymentsConfirmedAt), icon: '✅' },
                                          { label: 'Submitted for Approval', labelAr: 'تقديم للموافقة', ts: fmt(cycleSubmittedAt), icon: '📋' },
                                          ...(closedAt ? [{ label: 'Approved & Archived', labelAr: 'موافقة وأرشفة', ts: fmt(closedAt), icon: '🏛️' }] : []),
                                        ];
                                        const anyTs = timeline.some(t => t.ts);
                                        if (!anyTs) return null;
                                        return (
                                          <div className="mt-3 rounded-lg border bg-muted/20 overflow-hidden">
                                            <div className="px-3 py-2 bg-muted/40 text-xs font-semibold text-foreground flex items-center gap-1.5">
                                              <Clock className="h-3.5 w-3.5" /> Cycle Close Timeline
                                            </div>
                                            <div className="divide-y">
                                              {timeline.filter(t => t.ts).map((t, i) => (
                                                <div key={i} className="flex items-center gap-3 px-3 py-2">
                                                  <span className="text-sm shrink-0">{t.icon}</span>
                                                  <div className="flex-1 min-w-0">
                                                    <span className="text-xs font-medium text-foreground">{t.label}</span>
                                                    <span className="text-[10px] text-muted-foreground/70 ml-1.5" dir="rtl">{t.labelAr}</span>
                                                  </div>
                                                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{t.ts}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Approve / Reject panel for step 9 — shown for FOM, Admin, Super Admin */}
                                      {checklistMmpStatus === 'pending_approval' && (isFOM || isAdmin || isSuperAdmin) && (
                                        <div className="mt-4 rounded-xl border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/40 p-4 space-y-3">
                                          <div className="flex items-center gap-2">
                                            <span className="text-lg">👉</span>
                                            <div>
                                              <p className="text-sm font-bold text-green-900 dark:text-green-100">Your action is required</p>
                                              <p className="text-xs text-green-700 dark:text-green-300">You have approval authority for this cycle. Choose one action below.</p>
                                            </div>
                                          </div>
                                          {pendingViaReportCount > 0 && (
                                            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2">
                                              <span className="text-amber-600 text-sm mt-0.5">⚠️</span>
                                              <div className="text-xs text-amber-800 dark:text-amber-200">
                                                <span className="font-semibold">{pendingViaReportCount} advance(s) pending payment via report.</span>{' '}
                                                These zero-disbursement approved advances are <span className="font-semibold">non-blocking</span> — you can close now. They must be settled in the next payment report after close.
                                              </div>
                                            </div>
                                          )}
                                          <ol className="space-y-1 pl-1">
                                            <li className="flex gap-2 text-xs text-green-800 dark:text-green-200">
                                              <span className="font-bold shrink-0">1.</span>
                                              Review the <span className="font-semibold">Cycle Financial Summary</span> above — check enumerator costs, advances, and any outstanding items.
                                            </li>
                                            <li className="flex gap-2 text-xs text-green-800 dark:text-green-200">
                                              <span className="font-bold shrink-0">2.</span>
                                              Click <span className="font-semibold text-green-700 dark:text-green-300">"Approve &amp; Close Cycle"</span> to permanently archive this cycle, or <span className="font-semibold text-red-700 dark:text-red-400">"Reject &amp; Send Back"</span> to return it for corrections.
                                            </li>
                                          </ol>
                                          <Button
                                            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-11 text-sm font-semibold shadow-md"
                                            onClick={() => handleApproveCycle(checklistMmpId!)}
                                            disabled={closingCycle}
                                            data-testid="button-approve-cycle-wizard"
                                          >
                                            {closingCycle
                                              ? <><Loader2 className="h-5 w-5 animate-spin" /> Approving &amp; Closing…</>
                                              : <><CheckCircle2 className="h-5 w-5" /> Approve &amp; Close Cycle</>
                                            }
                                          </Button>
                                          <Button
                                            variant="outline"
                                            className="w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 gap-2 h-9 text-xs"
                                            onClick={() => setBannerRejectMmpId(checklistMmpId!)}
                                            data-testid="button-reject-cycle-wizard"
                                          >
                                            <XCircle className="h-4 w-4" />
                                            Reject &amp; Send Back (requires a reason)
                                          </Button>
                                        </div>
                                      )}
                                      {/* Waiting state — for non-approvers when pending_approval */}
                                      {checklistMmpStatus === 'pending_approval' && !(isFOM || isAdmin || isSuperAdmin) && (
                                        <div className="mt-3 rounded-lg border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 px-3 py-2.5 space-y-1">
                                          <p className="text-xs font-semibold text-purple-800 dark:text-purple-200">⏳ Waiting for FOM / Admin approval</p>
                                          <p className="text-xs text-purple-700 dark:text-purple-300">You will be notified once the cycle is approved or sent back for corrections.</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Collapsible technical checklist */}
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full pt-2" data-testid="button-toggle-technical-checklist">
                                <ChevronDown className="h-3.5 w-3.5" />
                                Technical Checklist Details
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-3">
                                <CloseReadinessChecklist
                                  title="Cycle Close Readiness"
                                  items={cycleReadiness.items}
                                  score={cycleReadiness.score}
                                  allPassed={cycleReadiness.allPassed}
                                  loading={cycleReadiness.loading}
                                  isSuperAdmin={isSuperAdmin}
                                  onOverride={(justification) => handleCycleCloseOverride(checklistMmpId, justification)}
                                  onResolveItem={handleChecklistResolveItem}
                                  overrideLabel="Override & Force Close"
                                />
                                <ReconciliationSummary
                                  mmpId={checklistMmpId ?? undefined}
                                  mmpContextLabel={mmpFiles?.find(m => m.id === checklistMmpId)?.name}
                                />
                              </CollapsibleContent>
                            </Collapsible>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                  /* ── PRE-CLOSE CHECKLIST (cycle still active, user about to start) ── */
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
                      onResolveItem={handleChecklistResolveItem}
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
                  )}
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
                        onOpenGuide={() => setChecklistMmpId(mmp.id)}
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
                            const pendingTier = c.tier1_status === 'pending' ? 'Tier 1' : c.tier2_status === 'pending' ? 'Tier 2' : c.tier3_status === 'pending' ? 'Tier 3' : null;
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
