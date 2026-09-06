/**
 * Field Payments Centre
 * Route: /field-payments
 *
 * Unified Finance page for all field-level payment flows:
 *   Tab 1 – Enumerator Fees   : mark paid + receipt upload + GL auto-post
 *   Tab 2 – Transport Advances: read-only lifecycle view (links to /down-payment-approval)
 *   Tab 3 – Exception Actions : execute Roll/Hold/Return/Writeoff/Redirect + receipts
 *   Tab 4 – Recovery          : outstanding advances + overdue tracker
 *
 * Design principles:
 *  • No payment data is duplicated — each tab reads from its canonical source table
 *  • Read-only when cycle_status = 'closed' (enforced per-row)
 *  • GL entries fire automatically on payment (via DB trigger for fees,
 *    via post_exception_recovery_to_gl RPC for exception actions)
 *  • Receipt upload mandatory before marking paid (same pattern as down payments)
 *  • Super Admin sees all; Finance roles see their hub scope
 */

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInDays } from 'date-fns';
import { exportFieldPaymentsExcel } from '@/utils/fieldPaymentsExcel';
import {
  getFieldPaymentEnumeratorReference,
  isProfileUuid,
  resolveFieldPaymentEnumeratorName,
} from '@/utils/fieldPaymentsEnumerator';
import { resolveFeeAdvanceDeduction } from '@/components/cycle/redirectSettlement';
import { isSoftDeletedDownPayment } from '@/utils/downPaymentVoid';
import { cancelPaidDownPaymentRequest } from '@/utils/preFundLinkage';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Receipt, Truck, AlertTriangle, TrendingDown,
  Search, Download, RefreshCw, Upload, CheckCircle2,
  Clock, XCircle, RotateCcw, ArrowRightLeft, Banknote,
  ExternalLink, Info, Building2, User, Calendar,
  ChevronDown, ChevronRight, Lock, Filter, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FeeAllocationTrace {
  id: string;
  actionId: string;
  sourceAdvanceId: string;
  sourceSiteId: string;
  targetSiteId: string;
  targetSiteName: string;
  amount: number;
  feeGrossAmount: number;
  feePriorSettledAmount: number;
  feeRemainingAmount: number;
  feeStatus: 'partially_paid' | 'paid';
  sourceEnumeratorId: string | null;
  targetEnumeratorId: string | null;
  crossEnumerator: boolean;
  journalEntryId: string | null;
  sourcePaymentReferences: string[];
  justification: string;
}

interface FeeRow {
  id: string;
  siteName: string;
  siteCode: string | null;
  state: string;
  locality: string;
  enumeratorName: string;
  enumeratorId: string | null;
  enumeratorFee: number;
  transportFee: number;
  totalFee: number;
  advancePaid: number;
  netPayable: number;
  feePaidStatus: 'unpaid' | 'partially_paid' | 'paid';
  feePaidAmount: number | null;
  feeCashPaidAmount: number;
  feeAdvanceOffsetAmount: number;
  feeUnallocatedAmount: number;
  feePaidAt: string | null;
  feePaymentMethod: string | null;
  feePaymentNotes: string | null;
  feePaymentReference: string | null;
  feeFundingSource: string | null;
  feeReceiptUrl: string | null;
  redirectAllocations: FeeAllocationTrace[];
  mmpId: string;
  mmpName: string;
  mmpHub: string;
  cycleStatus: string;
  siteStatus: string;
}

interface AdvanceSummaryRow {
  id: string;
  enumeratorName: string;
  siteName: string;
  state: string;
  hub: string;
  requestedAmount: number;
  paidAmount: number;
  status: string;
  mmpId: string;
  mmpName: string;
  cycleStatus: string;
  glBridgeStatus: 'posted' | 'error' | 'pending' | 'none';
  paidAt: string | null;
}

interface ExceptionActionRow {
  id: string;
  mmpFileId: string;
  mmpName: string;
  hub: string;
  mmpSiteEntryId: string | null;
  advanceId: string | null;
  enumeratorName: string | null;
  siteName: string | null;
  state: string | null;
  advanceAmount: number;
  advanceStatus: string | null;
  decision: string;
  justification: string | null;
  executed: boolean;
  glPosted: boolean;
  receiptUrl: string | null;
  recoveryAmount: number | null;
  recoveryDate: string | null;
  createdAt: string;
  executedAt: string | null;
  approvedByName: string | null;
  correctionStatus: string | null;
  correctedAt: string | null;
  correctedByName: string | null;
  correctionReason: string | null;
  originalJournalEntryId: string | null;
  reversalJournalEntryId: string | null;
  reopenedFromActionId: string | null;
}

interface RecoveryRow {
  id: string;
  enumeratorName: string;
  siteName: string;
  state: string;
  hub: string;
  mmpId: string;
  mmpName: string;
  disbursedAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  disbursedAt: string | null;
  daysOutstanding: number;
  status: string;
  advanceId: string;
}

type PayDialog = {
  open: boolean;
  rows: FeeRow[];
  amount: number;
  method: string;
  date: string;
  notes: string;
  reference: string;
  preFundId: string;
  preFunds: Array<{ id: string; name: string; available_balance: number; currency: string }>;
  loadingPreFunds: boolean;
  receiptFile: File | null;
  receiptUrl: string | null;
  uploading: boolean;
  saving: boolean;
};

type ExceptionDialog = {
  open: boolean;
  action: ExceptionActionRow | null;
  receiptFile: File | null;
  receiptUrl: string | null;
  recoveryAmount: string;
  recoveryDate: string;
  redirectHub: string;
  notes: string;
  uploading: boolean;
  saving: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Bankak', 'Mobile Money', 'Other'];
const STORAGE_BUCKET = 'mmp-files';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString();
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}
function titleCaseLabel(value?: string | null) {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

/** Human-readable label for a correction status, distinguishing all completed correction paths. */
function correctionStatusLabel(status?: string | null): string {
  switch (status) {
    case 'historically_reconciled':
      return 'Historical Redirect reversed';
    case 'reprocessed_payment_reversed':
      return 'Reprocessed payment reversed';
    case 'reopened_for_correction':
    default:
      return 'Reopened for correction';
  }
}

function getFeeAdvanceDeduction(row: FeeRow) {
  return resolveFeeAdvanceDeduction({
    grossFee: row.totalFee,
    activeTargetAdvance: row.advancePaid,
    recordedAdvanceOffset: row.feeAdvanceOffsetAmount,
    hasRedirectAllocation: row.redirectAllocations.length > 0,
  });
}
function ageBadge(days: number) {
  if (days <= 30) return <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">{days}d</Badge>;
  if (days <= 60) return <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">{days}d</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">⚠ {days}d</Badge>;
}

/**
 * Supabase applies a 1,000-row response limit unless the query is paged.
 * Fetch successive ranges so payment tabs show the complete dataset.
 */
async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}

function decisionBadge(d: string) {
  const map: Record<string, string> = {
    roll:     'bg-blue-100 text-blue-700 border-blue-300',
    hold:     'bg-slate-100 text-slate-700 border-slate-300',
    return:   'bg-amber-100 text-amber-700 border-amber-300',
    writeoff: 'bg-red-100 text-red-700 border-red-300',
    redirect: 'bg-purple-100 text-purple-700 border-purple-300',
    cancel:   'bg-gray-100 text-gray-600 border-gray-300',
    reassign: 'bg-teal-100 text-teal-700 border-teal-300',
    reduce:   'bg-orange-100 text-orange-700 border-orange-300',
  };
  const label: Record<string, string> = {
    roll: 'Roll to Next MMP', hold: 'Hold', return: 'Return Required',
    writeoff: 'Write-Off', redirect: 'Redirect to Fees', cancel: 'Cancelled',
    reassign: 'Reassigned', reduce: 'Reduced',
  };
  return (
    <Badge className={`text-[10px] ${map[d] ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}>
      {label[d] ?? d}
    </Badge>
  );
}

function DataLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
      <AlertTriangle className="h-4 w-4 text-red-600" />
      <AlertDescription className="flex items-center justify-between gap-3 text-red-800 dark:text-red-200">
        <span>Unable to load this report: {message}</span>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FieldPaymentsCentre() {
  const { currentUser } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') ?? 'fees';
  const mmpFilter = searchParams.get('mmp') ?? '';

  const userRole = currentUser?.role?.toLowerCase() ?? '';
  const isFinance = isSuperAdmin || ['admin', 'financialadmin', 'superadmin', 'accountant'].includes(userRole);
  const financeScopeIdentity = JSON.stringify({
    role: currentUser?.role ?? '',
    roles: [...(currentUser?.roles ?? [])].sort(),
    additionalRoles: (currentUser?.additionalRoles ?? [])
      .map(role => `${role.role}:${role.hub_id ?? ''}`)
      .sort(),
    hubId: currentUser?.hubId ?? '',
    secondaryHubId: currentUser?.secondaryHubId ?? '',
    stateId: currentUser?.stateId ?? '',
    localityId: currentUser?.localityId ?? '',
    countryId: currentUser?.countryId ?? '',
    classificationScope: currentUser?.classification?.roleScope ?? '',
  });

  // ── Shared cross-tab filters ────────────────────────────────────────────────
  const [filterHub, setFilterHub]   = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterMmp, setFilterMmp]   = useState(mmpFilter); // pre-seed from URL ?mmp=
  const [filterEnumerator, setFilterEnumerator] = useState('');
  const [mmps, setMmps] = useState<{ id: string; name: string; hub: string }[]>([]);
  const [exportingTab, setExportingTab] = useState<string | null>(null);
  const dataLoadGeneration = useRef(0);

  // ── Tab 1: Fees state ──────────────────────────────────────────────────────
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesLoaded, setFeesLoaded] = useState(false);
  const [feesLoadError, setFeesLoadError] = useState<string | null>(null);
  const [feeSearch, setFeeSearch] = useState('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<'all' | 'unpaid' | 'partially_paid' | 'paid'>('all');
  const [feeSelected, setFeeSelected] = useState<Set<string>>(new Set());
  const [feeTraceRow, setFeeTraceRow] = useState<FeeRow | null>(null);
  const [payDialog, setPayDialog] = useState<PayDialog>({
    open: false, rows: [], amount: 0, method: 'Cash',
    date: new Date().toISOString().slice(0, 10),
    notes: '', reference: '', preFundId: '', preFunds: [], loadingPreFunds: false,
    receiptFile: null, receiptUrl: null,
    uploading: false, saving: false,
  });

  // ── Tab 2: Advances state ──────────────────────────────────────────────────
  const [advances, setAdvances] = useState<AdvanceSummaryRow[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesLoaded, setAdvancesLoaded] = useState(false);
  const [advancesLoadError, setAdvancesLoadError] = useState<string | null>(null);
  const [advSearch, setAdvSearch] = useState('');
  const [advStatusFilter, setAdvStatusFilter] = useState('all');

  // ── Tab 3: Exceptions state ────────────────────────────────────────────────
  const [exceptions, setExceptions] = useState<ExceptionActionRow[]>([]);
  const [excLoading, setExcLoading] = useState(false);
  const [exceptionsLoaded, setExceptionsLoaded] = useState(false);
  const [exceptionsLoadError, setExceptionsLoadError] = useState<string | null>(null);
  const [excSearch, setExcSearch] = useState('');
  const [excDecisionFilter, setExcDecisionFilter] = useState('all');
  const [excStatusFilter, setExcStatusFilter] = useState<'pending' | 'done' | 'all'>('pending');
  const [excDialog, setExcDialog] = useState<ExceptionDialog>({
    open: false, action: null, receiptFile: null, receiptUrl: null,
    recoveryAmount: '', recoveryDate: new Date().toISOString().slice(0, 10),
    redirectHub: '', notes: '', uploading: false, saving: false,
  });

  // ── Tab 4: Recovery state ──────────────────────────────────────────────────
  const [recovery, setRecovery] = useState<RecoveryRow[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [recoveryLoadError, setRecoveryLoadError] = useState<string | null>(null);
  const [recSearch, setRecSearch] = useState('');

  // Load all datasets once so shared summaries and filters never show false
  // zeroes simply because a tab has not been visited yet.
  useEffect(() => {
    const requestGeneration = ++dataLoadGeneration.current;

    setMmps([]);
    setFees([]);
    setAdvances([]);
    setExceptions([]);
    setRecovery([]);
    setFeesLoading(false);
    setAdvancesLoading(false);
    setExcLoading(false);
    setRecoveryLoading(false);
    setFeesLoaded(false);
    setAdvancesLoaded(false);
    setExceptionsLoaded(false);
    setRecoveryLoaded(false);
    setFeesLoadError(null);
    setAdvancesLoadError(null);
    setExceptionsLoadError(null);
    setRecoveryLoadError(null);

    if (!currentUser?.id || !isFinance) {
      return;
    }

    void fetchAllRows<{ id: string; name: string; hub: string }>((from, to) =>
      supabase
        .from('mmp_files')
        .select('id, name, hub')
        .order('created_at', { ascending: false })
        .range(from, to)
    ).then(({ data, error }) => {
      if (requestGeneration !== dataLoadGeneration.current) return;
      if (error) {
        toast({ title: 'Error loading MMP filters', description: error.message, variant: 'destructive' });
        return;
      }
      setMmps(data);
    });

    void Promise.all([
      loadFees(),
      loadAdvances(),
      loadExceptions(),
      loadRecovery(),
    ]);

    return () => {
      if (requestGeneration === dataLoadGeneration.current) {
        dataLoadGeneration.current += 1;
      }
    };
  }, [currentUser?.id, isFinance, financeScopeIdentity]);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 1: Load enumerator fees
  // ─────────────────────────────────────────────────────────────────────────
  const loadFees = useCallback(async () => {
    const requestGeneration = dataLoadGeneration.current;
    setFeesLoading(true);
    setFeesLoaded(false);
    setFeesLoadError(null);
    try {
      const { data: sites, error } = await fetchAllRows<any>((from, to) =>
        supabase
          .from('mmp_site_entries')
          .select(`
          id, site_name, site_code, state, locality, status,
           not_covered_flag, attribution_collector_id, attribution_status, enumerator_fee, transport_fee,
          fee_paid_status, fee_paid_amount, fee_cash_paid_amount, fee_advance_offset_amount, fee_unallocated_amount,
          fee_paid_at, fee_payment_method, fee_payment_notes,
           fee_payment_reference, fee_pre_fund_id, fee_receipt_url,
          mmp_file_id,
          mmp_files!mmp_file_id(id, name, hub, cycle_status)
          `)
          .eq('status', 'wfp_confirmed')
          .or('not_covered_flag.is.null,not_covered_flag.eq.false')
          .not('attribution_collector_id', 'is', null)
          .order('state')
          .range(from, to)
      );

      if (error) throw error;

      const preFundNameMap: Record<string, string> = {};
      const preFundIds = [...new Set((sites ?? []).map((site: any) => site.fee_pre_fund_id).filter(Boolean))];
      if (preFundIds.length) {
        const { data: preFunds, error: preFundError } = await (supabase as any)
          .from('pre_fund_requests')
          .select('id, name')
          .in('id', preFundIds);
        if (preFundError) throw preFundError;
        for (const fund of preFunds ?? []) preFundNameMap[fund.id] = fund.name;
      }

      // Resolve enumerator names
      const enumIds = [...new Set((sites ?? []).map((s: any) => s.attribution_collector_id).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (enumIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name').in('id', enumIds);
        for (const p of profiles ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
      }

      // Resolve advance amounts per site
      const siteIds = (sites ?? []).map((s: any) => s.id);
      const advMap: Record<string, number> = {};
      if (siteIds.length) {
        const { data: advs } = await supabase
          .from('down_payment_requests')
          .select('mmp_site_entry_id, total_paid_amount, metadata')
          .in('mmp_site_entry_id', siteIds)
          .in('status', ['paid', 'fully_paid', 'partially_paid']);
        for (const a of (advs ?? []).filter(a => !isSoftDeletedDownPayment(a))) {
          const prev = advMap[a.mmp_site_entry_id] ?? 0;
          advMap[a.mmp_site_entry_id] = Math.max(prev, a.total_paid_amount ?? 0);
        }
      }

      // Load normalized Cycle Close redirect allocations separately. A target
      // can receive more than one historical allocation, and every row carries
      // the original source advance/payment references needed by Finance.
      const allocationMap: Record<string, FeeAllocationTrace[]> = {};
      const allocationResult = await fetchAllRows<any>((from, to) =>
        (supabase as any)
          .from('cycle_exception_action_allocations')
          .select(`
            id, action_id, source_advance_id, source_site_id, target_site_id,
            target_site_name, amount, fee_gross_amount,
            fee_prior_settled_amount, fee_remaining_amount, fee_status,
            source_enumerator_id, target_enumerator_id, cross_enumerator,
            gl_journal_entry_id, source_payment_references, justification
          `)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      if (allocationResult.error) {
        const missingLedger = allocationResult.error.code === '42P01'
          || allocationResult.error.code === 'PGRST205'
          || allocationResult.error.message?.includes('cycle_exception_action_allocations');
        if (!missingLedger) throw allocationResult.error;
      } else {
        const visibleSiteIds = new Set(siteIds);
        for (const allocation of allocationResult.data ?? []) {
          if (!visibleSiteIds.has(allocation.target_site_id)) continue;
          const sourcePaymentReferences = Array.isArray(allocation.source_payment_references)
            ? allocation.source_payment_references.flat().filter(Boolean).map(String)
            : [];
          const trace: FeeAllocationTrace = {
            id: allocation.id,
            actionId: allocation.action_id,
            sourceAdvanceId: allocation.source_advance_id,
            sourceSiteId: allocation.source_site_id,
            targetSiteId: allocation.target_site_id,
            targetSiteName: allocation.target_site_name,
            amount: Number(allocation.amount ?? 0),
            feeGrossAmount: Number(allocation.fee_gross_amount ?? 0),
            feePriorSettledAmount: Number(allocation.fee_prior_settled_amount ?? 0),
            feeRemainingAmount: Number(allocation.fee_remaining_amount ?? 0),
            feeStatus: allocation.fee_status,
            sourceEnumeratorId: allocation.source_enumerator_id,
            targetEnumeratorId: allocation.target_enumerator_id,
            crossEnumerator: allocation.cross_enumerator ?? false,
            journalEntryId: allocation.gl_journal_entry_id,
            sourcePaymentReferences,
            justification: allocation.justification ?? '',
          };
          allocationMap[trace.targetSiteId] = [
            ...(allocationMap[trace.targetSiteId] ?? []),
            trace,
          ];
        }
      }

      const rows: FeeRow[] = (sites ?? []).map((s: any) => {
        const mmp = s.mmp_files ?? {};
        const ef = s.enumerator_fee ?? 0;
        const tf = s.transport_fee ?? 0;
        const total = ef + tf;
        const adv = advMap[s.id] ?? 0;
        const redirectAllocations = allocationMap[s.id] ?? [];
        const activeAdvanceOffset = Math.min(adv, total);
        const staleAdvanceOnlySettlement = redirectAllocations.length === 0
          && activeAdvanceOffset === 0
          && Number(s.fee_cash_paid_amount ?? 0) === 0
          && s.fee_payment_method === 'advance_offset';
        const recordedSettlement = staleAdvanceOnlySettlement ? 0 : (s.fee_paid_amount ?? 0);
        const effectiveAdvanceOffset = staleAdvanceOnlySettlement
          ? 0
          : redirectAllocations.length > 0
          ? Math.min(s.fee_advance_offset_amount ?? 0, total)
          : Math.max(s.fee_advance_offset_amount ?? 0, activeAdvanceOffset);
        return {
          id: s.id,
          siteName: s.site_name ?? '—',
          siteCode: s.site_code ?? null,
          state: s.state ?? '—',
          locality: s.locality ?? '—',
          enumeratorId: s.attribution_collector_id,
          enumeratorName: nameMap[s.attribution_collector_id] ?? 'Unknown',
          enumeratorFee: ef,
          transportFee: tf,
          totalFee: total,
          advancePaid: adv,
          netPayable: Math.max(total - Math.max(recordedSettlement, effectiveAdvanceOffset), 0),
          feePaidStatus: (staleAdvanceOnlySettlement ? 'unpaid' : (s.fee_paid_status ?? 'unpaid')) as FeeRow['feePaidStatus'],
          feePaidAmount: staleAdvanceOnlySettlement ? 0 : s.fee_paid_amount,
          feeCashPaidAmount: s.fee_cash_paid_amount ?? 0,
          feeAdvanceOffsetAmount: staleAdvanceOnlySettlement ? 0 : (s.fee_advance_offset_amount ?? 0),
          feeUnallocatedAmount: s.fee_unallocated_amount ?? 0,
          feePaidAt: s.fee_paid_at,
          feePaymentMethod: s.fee_payment_method,
          feePaymentNotes: s.fee_payment_notes ?? null,
          feePaymentReference: s.fee_payment_reference ?? null,
          feeFundingSource: s.fee_pre_fund_id ? (preFundNameMap[s.fee_pre_fund_id] ?? 'Pre-fund') : null,
          feeReceiptUrl: s.fee_receipt_url ?? null,
          redirectAllocations,
          mmpId: mmp.id ?? s.mmp_file_id,
          mmpName: mmp.name ?? '—',
          mmpHub: mmp.hub ?? '—',
          cycleStatus: mmp.cycle_status ?? '—',
          siteStatus: s.status ?? '—',
        };
      }).filter(r => r.totalFee > 0);

      if (requestGeneration !== dataLoadGeneration.current) return;
      setFees(rows);
      setFeesLoaded(true);
    } catch (e: any) {
      if (requestGeneration !== dataLoadGeneration.current) return;
      setFees([]);
      setFeesLoadError(e.message ?? 'Unknown error');
      toast({ title: 'Error loading fees', description: e.message, variant: 'destructive' });
    } finally {
      if (requestGeneration === dataLoadGeneration.current) setFeesLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 2: Load advance summaries
  // ─────────────────────────────────────────────────────────────────────────
  const loadAdvances = useCallback(async () => {
    const requestGeneration = dataLoadGeneration.current;
    setAdvancesLoading(true);
    setAdvancesLoaded(false);
    setAdvancesLoadError(null);
    try {
      // Step 1: fetch advances (no join — FK to mmp_site_entries is not declared)
      const { data, error } = await fetchAllRows<any>((from, to) =>
        supabase
          .from('down_payment_requests')
          .select('id, status, requested_amount, total_paid_amount, updated_at, site_name, hub_name, mmp_site_entry_id, requested_by, metadata')
          .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid', 'cancelled'])
          .order('updated_at', { ascending: false })
          .range(from, to)
      );
      if (error) throw error;
      const visibleAdvances = (data ?? []).filter((record: any) => !isSoftDeletedDownPayment(record));

      // Step 2: resolve mmp_site_entries → mmp_files in two separate queries
      const siteEntryIds = [...new Set(visibleAdvances.map((r: any) => r.mmp_site_entry_id).filter(Boolean))];
      const entryMap: Record<string, {
        accepted_by: string | null;
        claimed_by: string | null;
        visit_started_by: string | null;
        additional_data: Record<string, unknown> | null;
        mmp_file_id: string | null;
        state: string | null;
      }> = {};
      if (siteEntryIds.length) {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, accepted_by, claimed_by, visit_started_by, additional_data, mmp_file_id, state')
          .in('id', siteEntryIds);
        for (const e of entries ?? []) {
          entryMap[e.id] = {
            accepted_by: e.accepted_by,
            claimed_by: e.claimed_by,
            visit_started_by: e.visit_started_by,
            additional_data: e.additional_data ?? null,
            mmp_file_id: e.mmp_file_id,
            state: e.state ?? null,
          };
        }
      }

      const mmpFileIds = [...new Set(Object.values(entryMap).map(e => e.mmp_file_id).filter(Boolean))] as string[];
      const mmpMap: Record<string, { id: string; name: string; cycle_status: string }> = {};
      if (mmpFileIds.length) {
        const { data: mmpFiles } = await supabase
          .from('mmp_files')
          .select('id, name, cycle_status')
          .in('id', mmpFileIds);
        for (const m of mmpFiles ?? []) mmpMap[m.id] = m;
      }

      // Step 3: resolve enumerator names + GL bridge in parallel
      const enumIds = [...new Set(visibleAdvances
        .map((r: any) => getFieldPaymentEnumeratorReference(entryMap[r.mmp_site_entry_id], r.requested_by))
        .filter(isProfileUuid))];
      const advIds  = visibleAdvances.map((r: any) => r.id as string);
      const nameMap: Record<string, string> = {};
      const glMap:   Record<string, 'posted' | 'error' | 'pending'> = {};

      await Promise.all([
        enumIds.length ? supabase.from('profiles').select('id, full_name').in('id', enumIds).then(({ data: prs }) => {
          for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
        }) : Promise.resolve(),
        advIds.length ? supabase.from('acct_gl_bridge_log').select('source_id, status')
          .eq('source_table', 'down_payment_requests').in('source_id', advIds).then(({ data: logs }) => {
            for (const l of logs ?? []) {
              glMap[l.source_id] = l.status === 'success' ? 'posted' : l.status === 'error' ? 'error' : 'pending';
            }
          }) : Promise.resolve(),
      ]);

      const rows: AdvanceSummaryRow[] = visibleAdvances.map((r: any) => {
        const entry  = entryMap[r.mmp_site_entry_id] ?? {};
        const mmpFid = entry.mmp_file_id ?? '';
        const mmp    = mmpMap[mmpFid] ?? {};
        return {
          id: r.id,
          enumeratorName: resolveFieldPaymentEnumeratorName(entry, r.requested_by, nameMap),
          siteName: r.site_name ?? '—',
          state: entry.state ?? '—',
          hub: r.hub_name ?? '—',
          requestedAmount: r.requested_amount ?? 0,
          paidAmount: r.total_paid_amount ?? 0,
          status: r.status,
          mmpId: mmp.id ?? '',
          mmpName: (mmp as any).name ?? '—',
          cycleStatus: (mmp as any).cycle_status ?? '—',
          glBridgeStatus: glMap[r.id] ?? 'none',
          paidAt: r.updated_at,
        };
      });

      if (requestGeneration !== dataLoadGeneration.current) return;
      setAdvances(rows);
      setAdvancesLoaded(true);
    } catch (e: any) {
      if (requestGeneration !== dataLoadGeneration.current) return;
      setAdvances([]);
      setAdvancesLoadError(e.message ?? 'Unknown error');
      toast({ title: 'Error loading advances', description: e.message, variant: 'destructive' });
    } finally {
      if (requestGeneration === dataLoadGeneration.current) setAdvancesLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 3: Load exception actions
  // ─────────────────────────────────────────────────────────────────────────
  const loadExceptions = useCallback(async () => {
    const requestGeneration = dataLoadGeneration.current;
    setExcLoading(true);
    setExceptionsLoaded(false);
    setExceptionsLoadError(null);
    try {
      const { data, error } = await fetchAllRows<any>((from, to) =>
        supabase
          .from('cycle_exception_actions')
          .select('*, mmp_files!mmp_file_id(name, hub)')
          .order('created_at', { ascending: false })
          .range(from, to)
      );

      if (error) throw error;

      // Resolve approver names
      const approverIds = [...new Set(
        (data ?? []).map((r: any) => r.executed_by).filter(Boolean)
      )];
      const nameMap: Record<string, string> = {};
      if (approverIds.length) {
        const { data: prs } = await supabase.from('profiles').select('id, full_name').in('id', approverIds);
        for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
      }

      const rows: ExceptionActionRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        mmpFileId: r.mmp_file_id,
        mmpName: r.mmp_files?.name ?? '—',
        hub: r.mmp_files?.hub ?? '—',
        mmpSiteEntryId: r.mmp_site_entry_id,
        advanceId: r.advance_id,
        enumeratorName: r.enumerator_name ?? '—',
        siteName: r.site_name ?? '—',
        state: r.state ?? null,
        advanceAmount: r.advance_amount ?? 0,
        advanceStatus: r.advance_status,
        decision: r.decision,
        justification: r.justification,
        executed: r.executed ?? false,
        glPosted: r.gl_posted ?? false,
        receiptUrl: r.receipt_url ?? null,
        recoveryAmount: r.recovery_amount ?? null,
        recoveryDate: r.recovery_date ?? null,
        createdAt: r.created_at,
        executedAt: r.executed_at ?? null,
        approvedByName: nameMap[r.executed_by] ?? null,
        correctionStatus: r.correction_status ?? null,
        correctedAt: r.corrected_at ?? null,
        correctedByName: r.corrected_by_name ?? null,
        correctionReason: r.correction_reason ?? null,
        originalJournalEntryId: r.gl_journal_entry_id ?? null,
        reversalJournalEntryId: r.correction_reversal_journal_id ?? null,
        reopenedFromActionId: r.action_payload?.reopened_from_action_id ?? null,
      }));

      if (requestGeneration !== dataLoadGeneration.current) return;
      setExceptions(rows);
      setExceptionsLoaded(true);
    } catch (e: any) {
      if (requestGeneration !== dataLoadGeneration.current) return;
      setExceptions([]);
      setExceptionsLoadError(e.message ?? 'Unknown error');
      toast({ title: 'Error loading exceptions', description: e.message, variant: 'destructive' });
    } finally {
      if (requestGeneration === dataLoadGeneration.current) setExcLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 4: Load recovery / outstanding
  // ─────────────────────────────────────────────────────────────────────────
  const loadRecovery = useCallback(async () => {
    const requestGeneration = dataLoadGeneration.current;
    setRecoveryLoading(true);
    setRecoveryLoaded(false);
    setRecoveryLoadError(null);
    try {
      // Step 1: fetch advances (no join — FK to mmp_site_entries is not declared)
      const { data, error } = await fetchAllRows<any>((from, to) =>
        supabase
          .from('down_payment_requests')
          .select('id, requested_amount, total_paid_amount, status, updated_at, hub_name, site_name, mmp_site_entry_id, requested_by, metadata')
          .in('status', ['paid', 'partially_paid', 'fully_paid'])
          .order('updated_at')
          .range(from, to)
      );
      if (error) throw error;
      const visibleAdvances = (data ?? []).filter((record: any) => !isSoftDeletedDownPayment(record));

      // Step 2: resolve mmp_site_entries → mmp_files
      const siteEntryIds = [...new Set(visibleAdvances.map((r: any) => r.mmp_site_entry_id).filter(Boolean))];
      const entryMap: Record<string, {
        id: string;
        accepted_by: string | null;
        claimed_by: string | null;
        visit_started_by: string | null;
        additional_data: Record<string, unknown> | null;
        mmp_file_id: string | null;
        state: string | null;
      }> = {};
      if (siteEntryIds.length) {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, accepted_by, claimed_by, visit_started_by, additional_data, mmp_file_id, state')
          .in('id', siteEntryIds);
        for (const e of entries ?? []) {
          entryMap[e.id] = {
            id: e.id,
            accepted_by: e.accepted_by,
            claimed_by: e.claimed_by,
            visit_started_by: e.visit_started_by,
            additional_data: e.additional_data ?? null,
            mmp_file_id: e.mmp_file_id,
            state: e.state ?? null,
          };
        }
      }

      const mmpFileIds = [...new Set(Object.values(entryMap).map(e => e.mmp_file_id).filter(Boolean))] as string[];
      const mmpMap: Record<string, { id: string; name: string }> = {};
      if (mmpFileIds.length) {
        const { data: mmpFiles } = await supabase.from('mmp_files').select('id, name').in('id', mmpFileIds);
        for (const m of mmpFiles ?? []) mmpMap[m.id] = m;
      }

      // Step 3: enumerator names + fee-offset check in parallel
      const enumIds = [...new Set(visibleAdvances
        .map((r: any) => getFieldPaymentEnumeratorReference(entryMap[r.mmp_site_entry_id], r.requested_by))
        .filter(isProfileUuid))];
      const siteIdList = Object.values(entryMap).map(e => e.id).filter(Boolean);
      const nameMap:  Record<string, string>  = {};
      const offsetMap: Record<string, number> = {};

      await Promise.all([
        enumIds.length ? supabase.from('profiles').select('id, full_name').in('id', enumIds).then(({ data: prs }) => {
          for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
        }) : Promise.resolve(),
        siteIdList.length ? supabase.from('mmp_site_entries')
          .select('id, fee_paid_status').in('id', siteIdList).eq('fee_paid_status', 'paid')
          .then(({ data: feeSites }) => {
            const paidSiteIds = new Set((feeSites ?? []).map((s: any) => s.id));
            for (const r of visibleAdvances as any[]) {
              const entry = entryMap[r.mmp_site_entry_id];
              if (entry?.id && paidSiteIds.has(entry.id)) {
                offsetMap[r.id] = r.total_paid_amount ?? 0;
              }
            }
          }) : Promise.resolve(),
      ]);

      const rows: RecoveryRow[] = visibleAdvances
        .map((r: any): RecoveryRow => {
          const entry     = entryMap[r.mmp_site_entry_id] ?? {};
          const mmpFid    = (entry as any).mmp_file_id ?? '';
          const mmp       = mmpMap[mmpFid] ?? {};
          const disbursed  = r.total_paid_amount ?? 0;
          const recovered  = offsetMap[r.id] ?? 0;
          const outstanding = Math.max(disbursed - recovered, 0);
          const daysOut = differenceInDays(new Date(), new Date(r.updated_at ?? Date.now()));
          return {
            id: r.id,
            advanceId: r.id,
            enumeratorName: resolveFieldPaymentEnumeratorName(entry, r.requested_by, nameMap),
            siteName: r.site_name ?? '—',
            state: (entry as any).state ?? '—',
            hub: r.hub_name ?? '—',
            mmpId: (mmp as any).id ?? '',
            mmpName: (mmp as any).name ?? '—',
            disbursedAmount: disbursed,
            recoveredAmount: recovered,
            outstandingAmount: outstanding,
            disbursedAt: r.updated_at,
            daysOutstanding: daysOut,
            status: r.status,
          };
        })
        .filter(r => r.outstandingAmount > 0);

      if (requestGeneration !== dataLoadGeneration.current) return;
      setRecovery(rows);
      setRecoveryLoaded(true);
    } catch (e: any) {
      if (requestGeneration !== dataLoadGeneration.current) return;
      setRecovery([]);
      setRecoveryLoadError(e.message ?? 'Unknown error');
      toast({ title: 'Error loading recovery data', description: e.message, variant: 'destructive' });
    } finally {
      if (requestGeneration === dataLoadGeneration.current) setRecoveryLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 1 actions: receipt upload + mark paid
  // ─────────────────────────────────────────────────────────────────────────
  const uploadReceipt = async (file: File, folder: string): Promise<string> => {
    const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return publicUrl;
  };

  const openPayDialog = (rows: FeeRow[]) => {
    const totalNet = rows.reduce((s, r) => s + r.netPayable, 0);
    setPayDialog(d => ({
      ...d, open: true, rows,
      amount: totalNet,
      method: 'Cash',
      date: new Date().toISOString().slice(0, 10),
      notes: '', reference: '', preFundId: '', preFunds: [], loadingPreFunds: true,
      receiptFile: null, receiptUrl: null,
      uploading: false, saving: false,
    }));
    void (async () => {
      const { data, error } = await (supabase as any)
        .from('pre_fund_requests')
        .select('id, name, available_balance, currency')
        .in('status', ['active', 'low_balance'])
        .eq('currency', 'SDG')
        .lte('start_date', new Date().toISOString().slice(0, 10))
        .gte('end_date', new Date().toISOString().slice(0, 10))
        .order('name');
      if (error) {
        toast({ title: 'Pre-fund list unavailable', description: error.message, variant: 'destructive' });
      }
      setPayDialog(d => ({ ...d, preFunds: data ?? [], loadingPreFunds: false }));
    })();
  };

  const handleFeeReceiptUpload = async (file: File) => {
    setPayDialog(d => ({ ...d, uploading: true, receiptFile: file }));
    try {
      const url = await uploadReceipt(file, 'field-payments/fees');
      setPayDialog(d => ({ ...d, receiptUrl: url, uploading: false }));
      toast({ title: 'Receipt uploaded' });
    } catch (e: any) {
      setPayDialog(d => ({ ...d, uploading: false }));
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    }
  };

  const submitFeePay = async () => {
    if (!payDialog.receiptUrl) {
      toast({ title: 'Receipt required', description: 'Upload a payment receipt before marking as paid.', variant: 'destructive' });
      return;
    }
    setPayDialog(d => ({ ...d, saving: true }));
    try {
      const { data, error } = await (supabase as any).rpc(
        'record_covered_enumerator_fee_payments',
        {
          p_items: payDialog.rows.map(row => ({ site_id: row.id, amount: row.netPayable })),
          p_payment_method: payDialog.method,
          p_payment_date: payDialog.date,
          p_receipt_url: payDialog.receiptUrl,
          p_payment_reference: payDialog.reference.trim() || null,
          p_notes: payDialog.notes.trim() || null,
          p_pre_fund_id: payDialog.preFundId || null,
        },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'The fee payment batch could not be recorded.');

      toast({
        title: `${payDialog.rows.length} covered fee${payDialog.rows.length !== 1 ? 's' : ''} recorded`,
        description: 'The full batch was saved with its receipt and accounting evidence.',
      });
      setPayDialog(d => ({ ...d, open: false, saving: false }));
      setFeeSelected(new Set());
      loadFees();
    } catch (e: any) {
      setPayDialog(d => ({ ...d, saving: false }));
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 3 actions: execute exception + receipt + GL
  // ─────────────────────────────────────────────────────────────────────────
  const openExcDialog = (action: ExceptionActionRow) => {
    setExcDialog(d => ({
      ...d, open: true, action,
      receiptFile: null, receiptUrl: null,
      recoveryAmount: String(action.advanceAmount),
      recoveryDate: new Date().toISOString().slice(0, 10),
      redirectHub: '', notes: '', uploading: false, saving: false,
    }));
  };

  const handleExcReceiptUpload = async (file: File) => {
    setExcDialog(d => ({ ...d, uploading: true, receiptFile: file }));
    try {
      const url = await uploadReceipt(file, 'field-payments/exceptions');
      setExcDialog(d => ({ ...d, receiptUrl: url, uploading: false }));
      toast({ title: 'Receipt uploaded' });
    } catch (e: any) {
      setExcDialog(d => ({ ...d, uploading: false }));
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    }
  };

  const submitException = async () => {
    const { action, receiptUrl, recoveryAmount, recoveryDate, redirectHub, notes } = excDialog;
    if (!action) return;

    const needsReceipt = ['writeoff', 'return', 'redirect'].includes(action.decision);
    if (needsReceipt && !receiptUrl) {
      toast({ title: 'Receipt required', description: 'Upload a receipt or approval document first.', variant: 'destructive' });
      return;
    }

    setExcDialog(d => ({ ...d, saving: true }));
    try {
      const now = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        executed:          true,
        executed_at:       now,
        executed_by:       currentUser?.id,
        executed_by_name:  currentUser?.fullName ?? currentUser?.email,
        execution_note:    notes || null,
        receipt_url:       receiptUrl ?? null,
        receipt_uploaded_at: receiptUrl ? now : null,
        receipt_uploaded_by: receiptUrl ? currentUser?.id : null,
      };

      if (action.decision === 'return') {
        updatePayload.recovery_amount       = parseFloat(recoveryAmount) || action.advanceAmount;
        updatePayload.recovery_date         = recoveryDate || null;
        updatePayload.recovery_collected_by = currentUser?.id;
        updatePayload.recovery_collected_by_name = currentUser?.fullName ?? null;
        // Flag the advance for return tracking
        if (action.advanceId) {
          await supabase.from('down_payment_requests').update({
            metadata: { return_requested: true, return_requested_at: now, return_requested_by: currentUser?.id, return_collection_note: notes },
          }).eq('id', action.advanceId);
        }
      }

      if (action.decision === 'redirect' && redirectHub) {
        updatePayload.execution_note = `Redirected to: ${redirectHub}${notes ? ' — ' + notes : ''}`;
        if (action.advanceId) {
          await supabase.from('down_payment_requests').update({
            hub_name: redirectHub,
            metadata: { redirect_to_fees: true, redirect_hub: redirectHub, redirect_at: now },
          }).eq('id', action.advanceId);
        }
      }

      if (action.decision === 'writeoff' && action.advanceId) {
        const { data: advance, error: advanceError } = await supabase
          .from('down_payment_requests')
          .select('status, total_paid_amount')
          .eq('id', action.advanceId)
          .single();
        if (advanceError) throw advanceError;

        const isPaidAdvance = ['partially_paid', 'fully_paid', 'paid', 'reconciled'].includes(advance.status)
          || Number(advance.total_paid_amount ?? 0) > 0;
        if (isPaidAdvance) {
          await cancelPaidDownPaymentRequest(action.advanceId);
        } else {
          const { error: cancelError } = await supabase
            .from('down_payment_requests')
            .update({ status: 'cancelled' })
            .eq('id', action.advanceId);
          if (cancelError) throw cancelError;
        }
      }

      const { error: updErr } = await supabase
        .from('cycle_exception_actions')
        .update(updatePayload)
        .eq('id', action.id);

      if (updErr) throw updErr;

      // Fire GL entry via RPC
      if (['return', 'writeoff', 'redirect'].includes(action.decision)) {
        const { data: glResult } = await supabase.rpc('post_exception_recovery_to_gl', { p_action_id: action.id });
        if (glResult?.error) {
          toast({
            title: 'GL posting queued',
            description: 'Payment recorded. GL entry will be retried automatically.',
            variant: 'default',
          });
        }
      }

      toast({ title: 'Exception executed', description: `${action.decision} action completed successfully.` });
      setExcDialog(d => ({ ...d, open: false, saving: false }));
      loadExceptions();
    } catch (e: any) {
      setExcDialog(d => ({ ...d, saving: false }));
      toast({ title: 'Execution failed', description: e.message, variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Shared filter option lists (derived from loaded data + MMP list)
  // ─────────────────────────────────────────────────────────────────────────
  const uniqueHubs = useMemo(() =>
    [...new Set(mmps.map(m => m.hub).filter(Boolean))].sort() as string[],
  [mmps]);

  // Cascade: state options come from whichever tabs have been loaded
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    fees.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    advances.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    exceptions.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    recovery.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    return [...states].sort();
  }, [fees, advances, exceptions, recovery]);

  const uniqueEnumerators = useMemo(() => {
    const names = new Set<string>();
    const addName = (name: string | null | undefined) => {
      if (name && name !== '—' && name !== 'Unknown') names.add(name);
    };
    fees.forEach(r => addName(r.enumeratorName));
    advances.forEach(r => addName(r.enumeratorName));
    exceptions.forEach(r => addName(r.enumeratorName));
    recovery.forEach(r => addName(r.enumeratorName));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [fees, advances, exceptions, recovery]);

  // MMP options cascade by hub
  const uniqueMmpOptions = useMemo(() =>
    filterHub ? mmps.filter(m => m.hub === filterHub) : mmps,
  [mmps, filterHub]);

  const activeFilterCount = [filterHub, filterState, filterMmp, filterEnumerator].filter(Boolean).length;

  const clearFilters = () => {
    setFilterHub('');
    setFilterState('');
    setFilterMmp('');
    setFilterEnumerator('');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered data
  // ─────────────────────────────────────────────────────────────────────────
  const sharedFilteredFees = useMemo(() => {
    let rows = fees;
    if (filterHub)    rows = rows.filter(r => r.mmpHub === filterHub);
    if (filterState)  rows = rows.filter(r => r.state === filterState);
    if (filterMmp)    rows = rows.filter(r => r.mmpId === filterMmp);
    if (filterEnumerator) rows = rows.filter(r => r.enumeratorName === filterEnumerator);
    return rows;
  }, [fees, filterHub, filterState, filterMmp, filterEnumerator]);

  const filteredFees = useMemo(() => {
    let rows = sharedFilteredFees;
    if (feeStatusFilter !== 'all') rows = rows.filter(r => r.feePaidStatus === feeStatusFilter);
    if (feeSearch) {
      const q = feeSearch.toLowerCase();
      rows = rows.filter(r =>
        r.siteName.toLowerCase().includes(q) ||
        r.enumeratorName.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sharedFilteredFees, feeStatusFilter, feeSearch]);

  const sharedFilteredAdvances = useMemo(() => {
    let rows = advances;
    if (filterHub)   rows = rows.filter(r => r.hub === filterHub);
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpId === filterMmp);
    if (filterEnumerator) rows = rows.filter(r => r.enumeratorName === filterEnumerator);
    return rows;
  }, [advances, filterHub, filterState, filterMmp, filterEnumerator]);

  const filteredAdvances = useMemo(() => {
    let rows = sharedFilteredAdvances;
    if (advStatusFilter !== 'all') rows = rows.filter(r => r.status === advStatusFilter);
    if (advSearch) {
      const q = advSearch.toLowerCase();
      rows = rows.filter(r =>
        r.enumeratorName.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sharedFilteredAdvances, advStatusFilter, advSearch]);

  const sharedFilteredExceptions = useMemo(() => {
    let rows = exceptions;
    if (filterHub) rows = rows.filter(r => r.hub === filterHub);
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpFileId === filterMmp);
    if (filterEnumerator) rows = rows.filter(r => r.enumeratorName === filterEnumerator);
    return rows;
  }, [exceptions, filterHub, filterState, filterMmp, filterEnumerator]);

  const filteredExceptions = useMemo(() => {
    let rows = sharedFilteredExceptions;
    if (excDecisionFilter !== 'all') rows = rows.filter(r => r.decision === excDecisionFilter);
    if (excStatusFilter === 'pending') rows = rows.filter(r => !r.executed);
    if (excStatusFilter === 'done')    rows = rows.filter(r => r.executed);
    if (excSearch) {
      const q = excSearch.toLowerCase();
      rows = rows.filter(r =>
        (r.siteName ?? '').toLowerCase().includes(q) ||
        (r.enumeratorName ?? '').toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sharedFilteredExceptions, excDecisionFilter, excStatusFilter, excSearch]);

  const sharedFilteredRecovery = useMemo(() => {
    let rows = recovery;
    if (filterHub)   rows = rows.filter(r => r.hub === filterHub);
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpId === filterMmp);
    if (filterEnumerator) rows = rows.filter(r => r.enumeratorName === filterEnumerator);
    return rows;
  }, [recovery, filterHub, filterState, filterMmp, filterEnumerator]);

  const filteredRecovery = useMemo(() => {
    let rows = sharedFilteredRecovery;
    if (recSearch) {
      const q = recSearch.toLowerCase();
      rows = rows.filter(r =>
        r.enumeratorName.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sharedFilteredRecovery, recSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Summary cards
  // ─────────────────────────────────────────────────────────────────────────
  const feeStats = useMemo(() => {
    const unpaid = sharedFilteredFees.filter(r => r.feePaidStatus !== 'paid');
    const paid   = sharedFilteredFees.filter(r => r.feePaidStatus === 'paid');
    return {
      totalUnpaid: unpaid.length,
      totalUnpaidAmt: unpaid.reduce((s, r) => s + r.netPayable, 0),
      totalPaid: paid.length,
      totalPaidAmt: paid.reduce((s, r) => s + (r.feePaidAmount ?? r.netPayable), 0),
    };
  }, [sharedFilteredFees]);

  const excStats = useMemo(() => ({
    pending: sharedFilteredExceptions.filter(r => !r.executed).length,
    done:    sharedFilteredExceptions.filter(r => r.executed).length,
    noGl:    sharedFilteredExceptions.filter(r => r.executed && !r.glPosted && ['return','writeoff','redirect'].includes(r.decision)).length,
  }), [sharedFilteredExceptions]);

  const recStats = useMemo(() => ({
    total: sharedFilteredRecovery.length,
    totalAmt: sharedFilteredRecovery.reduce((s, r) => s + r.outstandingAmount, 0),
    overdue: sharedFilteredRecovery.filter(r => r.daysOutstanding > 30).length,
  }), [sharedFilteredRecovery]);

  const handleExcelExport = async (reportTab: 'fees' | 'advances' | 'exceptions' | 'recovery') => {
    const readyByTab = {
      fees: feesLoaded && !feesLoading,
      advances: advancesLoaded && !advancesLoading,
      exceptions: exceptionsLoaded && !excLoading,
      recovery: recoveryLoaded && !recoveryLoading,
    };
    if (!readyByTab[reportTab]) {
      toast({
        title: 'Report is still loading',
        description: 'Wait for the current dataset to finish loading, then export again.',
      });
      return;
    }

    const selectedMmpName = mmps.find(mmp => mmp.id === filterMmp)?.name;
    const sharedFilters = [
      filterHub ? `Hub: ${filterHub}` : '',
      filterState ? `State: ${filterState}` : '',
      filterMmp ? `MMP: ${selectedMmpName ?? filterMmp}` : '',
      filterEnumerator ? `Enumerator: ${filterEnumerator}` : '',
    ].filter(Boolean);

    setExportingTab(reportTab);
    try {
      if (reportTab === 'fees') {
        const totalFees = filteredFees.reduce((sum, row) => sum + row.totalFee, 0);
        const totalAdvances = filteredFees.reduce((sum, row) => sum + row.advancePaid, 0);
        const totalNet = filteredFees.reduce((sum, row) => sum + row.netPayable, 0);

        await exportFieldPaymentsExcel({
          title: 'Enumerator Fees Report',
          sheetName: 'Enumerator Fees',
          filenamePrefix: 'field-payments-enumerator-fees',
          filters: [
            ...sharedFilters,
            feeStatusFilter !== 'all' ? `Payment status: ${titleCaseLabel(feeStatusFilter)}` : '',
            feeSearch ? `Search: ${feeSearch}` : '',
          ].filter(Boolean),
          summary: [
            { label: 'Records', value: filteredFees.length },
            { label: 'Total fees', value: `SDG ${fmt(totalFees)}` },
            { label: 'Advance deductions', value: `SDG ${fmt(totalAdvances)}` },
            { label: 'Net payable', value: `SDG ${fmt(totalNet)}` },
          ],
          columns: [
            { key: 'number', header: '#', width: 7, format: 'integer' },
            { key: 'siteName', header: 'Site', width: 25 },
            { key: 'siteCode', header: 'Site Code', width: 15 },
            { key: 'state', header: 'State', width: 18 },
            { key: 'locality', header: 'Locality', width: 20 },
            { key: 'enumerator', header: 'Enumerator', width: 28 },
            { key: 'mmp', header: 'MMP', width: 24 },
            { key: 'hub', header: 'Hub', width: 18 },
            { key: 'enumeratorFee', header: 'Enumerator Fee', width: 18, format: 'currency', total: true },
            { key: 'transportFee', header: 'Transport Fee', width: 18, format: 'currency', total: true },
            { key: 'totalFee', header: 'Total Fee', width: 18, format: 'currency', total: true },
            { key: 'advance', header: 'Advance Deduction', width: 20, format: 'currency', total: true },
            { key: 'netPayable', header: 'Net Payable', width: 18, format: 'currency', total: true },
            { key: 'paymentStatus', header: 'Payment Status', width: 16, format: 'status' },
            { key: 'paidAmount', header: 'Paid Amount', width: 18, format: 'currency', total: true },
            { key: 'paidDate', header: 'Paid Date', width: 16, format: 'date' },
            { key: 'paymentMethod', header: 'Payment Method', width: 18 },
            { key: 'cycleStatus', header: 'Cycle Status', width: 15, format: 'status' },
          ],
          rows: filteredFees.map((row, index) => ({
            number: index + 1,
            siteName: row.siteName,
            siteCode: row.siteCode,
            state: row.state,
            locality: row.locality,
            enumerator: row.enumeratorName,
            mmp: row.mmpName,
            hub: row.mmpHub,
            enumeratorFee: row.enumeratorFee,
            transportFee: row.transportFee,
            totalFee: row.totalFee,
            advance: row.advancePaid,
            netPayable: row.netPayable,
            paymentStatus: titleCaseLabel(row.feePaidStatus),
            paidAmount: row.feePaidAmount,
            paidDate: row.feePaidAt,
            paymentMethod: row.feePaymentMethod,
            cycleStatus: titleCaseLabel(row.cycleStatus),
          })),
        });
      }

      if (reportTab === 'advances') {
        const requested = filteredAdvances.reduce((sum, row) => sum + row.requestedAmount, 0);
        const paid = filteredAdvances.reduce((sum, row) => sum + row.paidAmount, 0);

        await exportFieldPaymentsExcel({
          title: 'Transport Advances Report',
          sheetName: 'Transport Advances',
          filenamePrefix: 'field-payments-transport-advances',
          filters: [
            ...sharedFilters,
            advStatusFilter !== 'all' ? `Advance status: ${titleCaseLabel(advStatusFilter)}` : '',
            advSearch ? `Search: ${advSearch}` : '',
          ].filter(Boolean),
          summary: [
            { label: 'Records', value: filteredAdvances.length },
            { label: 'Requested', value: `SDG ${fmt(requested)}` },
            { label: 'Paid', value: `SDG ${fmt(paid)}` },
            { label: 'Outstanding', value: `SDG ${fmt(Math.max(requested - paid, 0))}` },
          ],
          columns: [
            { key: 'number', header: '#', width: 7, format: 'integer' },
            { key: 'enumerator', header: 'Enumerator', width: 28 },
            { key: 'siteName', header: 'Site', width: 25 },
            { key: 'state', header: 'State', width: 18 },
            { key: 'hub', header: 'Hub', width: 18 },
            { key: 'mmp', header: 'MMP', width: 24 },
            { key: 'requested', header: 'Requested Amount', width: 20, format: 'currency', total: true },
            { key: 'paid', header: 'Paid Amount', width: 18, format: 'currency', total: true },
            { key: 'outstanding', header: 'Outstanding', width: 18, format: 'currency', total: true },
            { key: 'status', header: 'Advance Status', width: 18, format: 'status' },
            { key: 'glStatus', header: 'GL Status', width: 16, format: 'status' },
            { key: 'updatedDate', header: 'Paid / Updated Date', width: 20, format: 'date' },
            { key: 'cycleStatus', header: 'Cycle Status', width: 15, format: 'status' },
          ],
          rows: filteredAdvances.map((row, index) => ({
            number: index + 1,
            enumerator: row.enumeratorName,
            siteName: row.siteName,
            state: row.state,
            hub: row.hub,
            mmp: row.mmpName,
            requested: row.requestedAmount,
            paid: row.paidAmount,
            outstanding: Math.max(row.requestedAmount - row.paidAmount, 0),
            status: titleCaseLabel(row.status),
            glStatus: titleCaseLabel(row.glBridgeStatus),
            updatedDate: row.paidAt,
            cycleStatus: titleCaseLabel(row.cycleStatus),
          })),
        });
      }

      if (reportTab === 'exceptions') {
        const advanceTotal = filteredExceptions.reduce((sum, row) => sum + row.advanceAmount, 0);
        const recoveredTotal = filteredExceptions.reduce((sum, row) => sum + (row.recoveryAmount ?? 0), 0);

        await exportFieldPaymentsExcel({
          title: 'Cycle Exception Actions Report',
          sheetName: 'Exception Actions',
          filenamePrefix: 'field-payments-exception-actions',
          filters: [
            ...sharedFilters,
            excDecisionFilter !== 'all' ? `Decision: ${titleCaseLabel(excDecisionFilter)}` : '',
            `Execution: ${titleCaseLabel(excStatusFilter)}`,
            excSearch ? `Search: ${excSearch}` : '',
          ].filter(Boolean),
          summary: [
            { label: 'Records', value: filteredExceptions.length },
            { label: 'Advance amount', value: `SDG ${fmt(advanceTotal)}` },
            { label: 'Recovered amount', value: `SDG ${fmt(recoveredTotal)}` },
            { label: 'Executed', value: filteredExceptions.filter(row => row.executed).length },
            { label: 'Corrected actions', value: filteredExceptions.filter(row => !!row.correctionStatus).length },
          ],
          columns: [
            { key: 'number', header: '#', width: 7, format: 'integer' },
            { key: 'siteName', header: 'Site', width: 25 },
            { key: 'state', header: 'State', width: 18 },
            { key: 'hub', header: 'Hub', width: 18 },
            { key: 'enumerator', header: 'Enumerator', width: 28 },
            { key: 'mmp', header: 'MMP', width: 24 },
            { key: 'advanceAmount', header: 'Advance Amount', width: 19, format: 'currency', total: true },
            { key: 'decision', header: 'Decision', width: 20, format: 'status' },
            { key: 'executionStatus', header: 'Execution Status', width: 18, format: 'status' },
            { key: 'glStatus', header: 'GL Status', width: 16, format: 'status' },
            { key: 'recoveryAmount', header: 'Recovery Amount', width: 19, format: 'currency', total: true },
            { key: 'recoveryDate', header: 'Recovery Date', width: 17, format: 'date' },
            { key: 'executedDate', header: 'Executed Date', width: 17, format: 'date' },
            { key: 'approvedBy', header: 'Executed By', width: 25 },
            { key: 'correctedDate', header: 'Corrected Date', width: 17, format: 'date' },
            { key: 'correctedBy', header: 'Corrected By', width: 25 },
            { key: 'correctionReason', header: 'Correction Reason', width: 42, format: 'text' },
            { key: 'originalJournal', header: 'Original Journal', width: 38 },
            { key: 'reversalJournal', header: 'Reversal Journal', width: 38 },
            { key: 'justification', header: 'Justification', width: 42, format: 'text' },
          ],
          rows: filteredExceptions.map((row, index) => ({
            number: index + 1,
            siteName: row.siteName,
            state: row.state,
            hub: row.hub,
            enumerator: row.enumeratorName,
            mmp: row.mmpName,
            advanceAmount: row.advanceAmount,
            decision: titleCaseLabel(row.decision),
            executionStatus: row.correctionStatus
              ? correctionStatusLabel(row.correctionStatus)
              : row.executed ? 'Executed' : 'Pending',
            glStatus: row.correctionStatus
              ? 'Reversed'
              : row.glPosted ? 'Posted' : row.executed ? 'Pending' : 'Not posted',
            recoveryAmount: row.recoveryAmount,
            recoveryDate: row.recoveryDate,
            executedDate: row.executedAt,
            approvedBy: row.approvedByName,
            correctedDate: row.correctedAt,
            correctedBy: row.correctedByName,
            correctionReason: row.correctionReason,
            originalJournal: row.originalJournalEntryId,
            reversalJournal: row.reversalJournalEntryId,
            justification: row.justification,
          })),
        });
      }

      if (reportTab === 'recovery') {
        const disbursed = filteredRecovery.reduce((sum, row) => sum + row.disbursedAmount, 0);
        const recovered = filteredRecovery.reduce((sum, row) => sum + row.recoveredAmount, 0);
        const outstanding = filteredRecovery.reduce((sum, row) => sum + row.outstandingAmount, 0);

        await exportFieldPaymentsExcel({
          title: 'Advance Recovery and Outstanding Report',
          sheetName: 'Recovery',
          filenamePrefix: 'field-payments-recovery',
          filters: [
            ...sharedFilters,
            recSearch ? `Search: ${recSearch}` : '',
          ].filter(Boolean),
          summary: [
            { label: 'Records', value: filteredRecovery.length },
            { label: 'Disbursed', value: `SDG ${fmt(disbursed)}` },
            { label: 'Recovered', value: `SDG ${fmt(recovered)}` },
            { label: 'Outstanding', value: `SDG ${fmt(outstanding)}` },
            { label: 'Overdue >30 days', value: filteredRecovery.filter(row => row.daysOutstanding > 30).length },
          ],
          columns: [
            { key: 'number', header: '#', width: 7, format: 'integer' },
            { key: 'enumerator', header: 'Enumerator', width: 28 },
            { key: 'siteName', header: 'Site', width: 25 },
            { key: 'state', header: 'State', width: 18 },
            { key: 'hub', header: 'Hub', width: 18 },
            { key: 'mmp', header: 'MMP', width: 24 },
            { key: 'disbursed', header: 'Disbursed Amount', width: 20, format: 'currency', total: true },
            { key: 'recovered', header: 'Recovered Amount', width: 20, format: 'currency', total: true },
            { key: 'outstanding', header: 'Outstanding Amount', width: 20, format: 'currency', total: true },
            { key: 'age', header: 'Age (Days)', width: 13, format: 'integer' },
            { key: 'agingStatus', header: 'Aging Status', width: 16, format: 'status' },
            { key: 'advanceStatus', header: 'Advance Status', width: 17, format: 'status' },
            { key: 'disbursedDate', header: 'Disbursed / Updated Date', width: 22, format: 'date' },
          ],
          rows: filteredRecovery.map((row, index) => ({
            number: index + 1,
            enumerator: row.enumeratorName,
            siteName: row.siteName,
            state: row.state,
            hub: row.hub,
            mmp: row.mmpName,
            disbursed: row.disbursedAmount,
            recovered: row.recoveredAmount,
            outstanding: row.outstandingAmount,
            age: row.daysOutstanding,
            agingStatus: row.daysOutstanding > 30 ? 'Overdue' : 'Current',
            advanceStatus: titleCaseLabel(row.status),
            disbursedDate: row.disbursedAt,
          })),
        });
      }

      const rowCounts = {
        fees: filteredFees.length,
        advances: filteredAdvances.length,
        exceptions: filteredExceptions.length,
        recovery: filteredRecovery.length,
      };
      toast({
        title: 'Excel report exported',
        description: `${rowCounts[reportTab]} filtered record${rowCounts[reportTab] === 1 ? '' : 's'} exported.`,
      });
    } catch (error: any) {
      toast({
        title: 'Excel export failed',
        description: error?.message ?? 'Unable to generate the report.',
        variant: 'destructive',
      });
    } finally {
      setExportingTab(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!isFinance) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <Alert className="max-w-md border-red-200 bg-red-50">
          <Lock className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Access restricted. Finance roles only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Field Payments Centre
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Enumerator fees · Transport advances · Exception recovery · Outstanding tracker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/down-payment-approval')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Advance Approval
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Cost Submission
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Fees Unpaid</p>
          <p className="text-xl font-bold text-amber-600">{feesLoadError ? '!' : feesLoaded ? feeStats.totalUnpaid : '…'}</p>
          <p className={`text-xs ${feesLoadError ? 'text-red-500' : 'text-muted-foreground'}`}>
            {feesLoadError ? 'Unavailable — retry below' : feesLoaded ? `SDG ${fmt(feeStats.totalUnpaidAmt)}` : 'Loading…'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Fees Paid</p>
          <p className="text-xl font-bold text-green-600">{feesLoadError ? '!' : feesLoaded ? feeStats.totalPaid : '…'}</p>
          <p className={`text-xs ${feesLoadError ? 'text-red-500' : 'text-muted-foreground'}`}>
            {feesLoadError ? 'Unavailable — retry below' : feesLoaded ? `SDG ${fmt(feeStats.totalPaidAmt)}` : 'Loading…'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Exceptions Pending</p>
          <p className={`text-xl font-bold ${exceptionsLoaded && excStats.pending > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {exceptionsLoadError ? '!' : exceptionsLoaded ? excStats.pending : '…'}
          </p>
          {exceptionsLoadError
            ? <p className="text-xs text-red-500">Unavailable — retry below</p>
            : !exceptionsLoaded && <p className="text-xs text-muted-foreground">Loading…</p>}
          {exceptionsLoaded && excStats.noGl > 0 && <p className="text-xs text-red-500">{excStats.noGl} GL not posted</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Outstanding Advances</p>
          <p className={`text-xl font-bold ${recoveryLoaded && recStats.total > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {recoveryLoadError ? '!' : recoveryLoaded ? recStats.total : '…'}
          </p>
          {recoveryLoadError
            ? <p className="text-xs text-red-500">Unavailable — retry below</p>
            : !recoveryLoaded && <p className="text-xs text-muted-foreground">Loading…</p>}
          {recoveryLoaded && recStats.overdue > 0 && <p className="text-xs text-red-500">{recStats.overdue} overdue &gt;30d</p>}
        </Card>
      </div>

      {/* ── Shared cross-tab filters ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-900/50 border rounded-lg px-3 py-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Filter all tabs:</span>

        {/* Hub */}
        <Select value={filterHub || '__all__'} onValueChange={v => {
          setFilterHub(v === '__all__' ? '' : v);
          setFilterState('');
          setFilterMmp('');
          setFilterEnumerator('');
        }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All Hubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Hubs</SelectItem>
            {uniqueHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* State */}
        <Select value={filterState || '__all__'} onValueChange={v => setFilterState(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All States</SelectItem>
            {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* MMP */}
        <Select value={filterMmp || '__all__'} onValueChange={v => setFilterMmp(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-52">
            <SelectValue placeholder="All MMPs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All MMPs</SelectItem>
            {uniqueMmpOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Enumerator */}
        <Select value={filterEnumerator || '__all__'} onValueChange={v => setFilterEnumerator(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-52">
            <SelectValue placeholder="All Enumerators" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Enumerators</SelectItem>
            {uniqueEnumerators.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
              {activeFilterCount} active
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear
            </Button>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t })}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="fees" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Enumerator Fees
            {feeStats.totalUnpaid > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] ml-1">{feeStats.totalUnpaid}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="advances" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Transport Advances
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Exception Actions
            {excStats.pending > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] ml-1">{excStats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recovery" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />
            Recovery
            {recStats.overdue > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] ml-1">⚠ {recStats.overdue}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1 — ENUMERATOR FEES
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="fees" className="space-y-4 mt-4">
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
              This queue contains WFP-confirmed covered sites only. Mark fees as paid after cash / bank transfer is made to enumerators. A receipt must be uploaded.
              GL entries (DR 5200 Enumerator Fees / CR 1010 Cash or 1020 Bank) are posted automatically.
              Advance offsets are deducted from the net payable shown below; claimed, rejected, submitted, and not-covered sites cannot be paid here.
            </AlertDescription>
          </Alert>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search site, enumerator, state…" value={feeSearch} onChange={e => setFeeSearch(e.target.value)} />
            </div>
            <Select value={feeStatusFilter} onValueChange={v => setFeeStatusFilter(v as any)}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                 <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadFees}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleExcelExport('fees')}
              disabled={exportingTab === 'fees' || feesLoading || !feesLoaded}
            >
              <Download className="h-3 w-3 mr-1" />
              {exportingTab === 'fees' ? 'Exporting…' : 'Export Excel'}
            </Button>
            {feeSelected.size > 0 && (
              <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => openPayDialog(filteredFees.filter(r => feeSelected.has(r.id)))}>
                <Banknote className="h-3 w-3 mr-1" /> Pay {feeSelected.size} selected
              </Button>
            )}
          </div>

          {feesLoadError ? (
            <DataLoadError message={feesLoadError} onRetry={loadFees} />
          ) : feesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="w-8">
                      <Checkbox
                        checked={feeSelected.size === filteredFees.filter(r => r.feePaidStatus !== 'paid' && r.netPayable > 0).length && filteredFees.filter(r => r.feePaidStatus !== 'paid' && r.netPayable > 0).length > 0}
                        onCheckedChange={checked => {
                          if (checked) setFeeSelected(new Set(filteredFees.filter(r => r.feePaidStatus !== 'paid' && r.netPayable > 0).map(r => r.id)));
                          else setFeeSelected(new Set());
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Fee</TableHead>
                    <TableHead className="text-xs text-right">Advance Offset</TableHead>
                    <TableHead className="text-xs text-right font-semibold">Net Payable</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Evidence</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFees.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No records found</TableCell></TableRow>
                  ) : filteredFees.map(row => (
                    <TableRow key={row.id} className={row.feePaidStatus === 'paid' ? 'opacity-60' : ''}>
                      <TableCell>
                        {row.feePaidStatus !== 'paid' && row.netPayable > 0 && (
                          <Checkbox
                            checked={feeSelected.has(row.id)}
                            onCheckedChange={c => {
                              const s = new Set(feeSelected);
                              if (c) s.add(row.id); else s.delete(row.id);
                              setFeeSelected(s);
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} / {row.locality}</p>
                      </TableCell>
                      <TableCell className="text-xs">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.mmpName}</p>
                        {row.cycleStatus === 'closed' && <Badge className="bg-slate-100 text-slate-600 text-[10px] mt-0.5">Closed</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.totalFee)}</TableCell>
                      <TableCell className="text-xs text-right">
                        <span className="text-amber-600">
                          {getFeeAdvanceDeduction(row) > 0
                            ? `− SDG ${fmt(getFeeAdvanceDeduction(row))}`
                            : '—'}
                        </span>
                        {row.redirectAllocations.length > 0 && (
                          <button
                            type="button"
                            className="mt-1 ml-auto flex items-center gap-1 text-[10px] text-purple-700 hover:underline"
                            onClick={() => setFeeTraceRow(row)}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            {row.redirectAllocations.length} redirect trace{row.redirectAllocations.length === 1 ? '' : 's'}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">{row.netPayable > 0 ? `SDG ${fmt(row.netPayable)}` : <span className="text-green-600 text-[10px]">Covered by advance</span>}</TableCell>
                      <TableCell>
                        {row.feePaidStatus === 'paid' ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">✓ Paid</Badge>
                        ) : row.feePaidStatus === 'partially_paid' ? (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px]">Partially Paid</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Unpaid</Badge>
                        )}
                        {row.feePaidAt && <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(row.feePaidAt)}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {row.feeReceiptUrl
                            ? <a href={row.feeReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-[10px] flex items-center gap-1 hover:underline"><ExternalLink className="h-3 w-3" /> Receipt</a>
                            : <span className="text-[10px] text-muted-foreground">—</span>
                          }
                          {row.feeFundingSource && <p className="text-[10px] text-muted-foreground">Fund: {row.feeFundingSource}</p>}
                          {row.feePaymentReference && <p className="text-[10px] text-muted-foreground">Ref: {row.feePaymentReference}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.feePaidStatus !== 'paid' && row.netPayable > 0 && row.cycleStatus !== 'closed' && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openPayDialog([row])}>
                            <Banknote className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        {row.cycleStatus === 'closed' && row.feePaidStatus !== 'paid' && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Cycle closed</span>
                        )}
                        {row.netPayable <= 0 && row.feePaidStatus !== 'paid' && (
                          <span className="text-[10px] text-green-700">No cash due</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2 — TRANSPORT ADVANCES (read-only summary)
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="advances" className="space-y-4 mt-4">
          <Alert className="border-slate-200 bg-slate-50 dark:bg-slate-900/30">
            <Info className="h-4 w-4 text-slate-600" />
            <AlertDescription className="text-slate-700 dark:text-slate-300 text-sm">
              Read-only summary of transport advances and their lifecycle. To approve, disburse, or manage individual advances go to{' '}
              <button className="text-blue-600 hover:underline font-medium" onClick={() => navigate('/down-payment-approval')}>
                Down Payment Approval →
              </button>
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search enumerator, site, MMP…" value={advSearch} onChange={e => setAdvSearch(e.target.value)} />
            </div>
            <Select value={advStatusFilter} onValueChange={setAdvStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="fully_paid">Fully Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadAdvances}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleExcelExport('advances')}
              disabled={exportingTab === 'advances' || advancesLoading || !advancesLoaded}
            >
              <Download className="h-3 w-3 mr-1" />
              {exportingTab === 'advances' ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>

          {advancesLoadError ? (
            <DataLoadError message={advancesLoadError} onRetry={loadAdvances} />
          ) : advancesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Requested</TableHead>
                    <TableHead className="text-xs text-right">Paid</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">GL</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdvances.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No advances found</TableCell></TableRow>
                  ) : filteredAdvances.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-medium">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} · {row.hub}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>{row.mmpName}</p>
                        {row.cycleStatus === 'closed' && <Badge className="bg-slate-100 text-slate-600 text-[10px]">Closed</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.requestedAmount)}</TableCell>
                      <TableCell className="text-xs text-right">{row.paidAmount > 0 ? `SDG ${fmt(row.paidAmount)}` : '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          row.status === 'fully_paid' ? 'bg-green-100 text-green-700 border-green-300' :
                          row.status === 'paid'       ? 'bg-green-100 text-green-700 border-green-300' :
                          row.status === 'approved'   ? 'bg-amber-100 text-amber-700 border-amber-300' :
                          row.status === 'cancelled'  ? 'bg-red-100 text-red-700 border-red-300' :
                          'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          row.glBridgeStatus === 'posted' ? 'bg-green-100 text-green-700 border-green-300' :
                          row.glBridgeStatus === 'error'  ? 'bg-red-100 text-red-700 border-red-300' :
                          'bg-slate-100 text-slate-500 border-slate-300'
                        }`}>
                          {row.glBridgeStatus === 'posted' ? '✓ GL' : row.glBridgeStatus === 'error' ? '✗ GL Error' : 'Not posted'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => navigate('/down-payment-approval')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3 — EXCEPTION ACTIONS
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="exceptions" className="space-y-4 mt-4">
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
              These are exception decisions made during cycle close. Execute each pending action — upload receipts for Return/Writeoff/Redirect decisions.
              GL entries post automatically on execution.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search site, enumerator, MMP…" value={excSearch} onChange={e => setExcSearch(e.target.value)} />
            </div>
            <Select value={excDecisionFilter} onValueChange={setExcDecisionFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="roll">Roll to Next MMP</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="return">Return Required</SelectItem>
                <SelectItem value="writeoff">Write-Off</SelectItem>
                <SelectItem value="redirect">Redirect to Fees</SelectItem>
                <SelectItem value="cancel">Cancel & Void</SelectItem>
                <SelectItem value="reassign">Reassign</SelectItem>
                <SelectItem value="reduce">Reduce</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden">
              {(['pending', 'all', 'done'] as const).map(s => (
                <button key={s} type="button"
                  onClick={() => setExcStatusFilter(s)}
                  className={`px-3 h-8 text-xs transition-colors ${excStatusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {s === 'pending' ? `Pending (${excStats.pending})` : s === 'done' ? `Done (${excStats.done})` : 'All'}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadExceptions}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleExcelExport('exceptions')}
              disabled={exportingTab === 'exceptions' || excLoading || !exceptionsLoaded}
            >
              <Download className="h-3 w-3 mr-1" />
              {exportingTab === 'exceptions' ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>

          {exceptionsLoadError ? (
            <DataLoadError message={exceptionsLoadError} onRetry={loadExceptions} />
          ) : excLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="space-y-3">
              {filteredExceptions.length === 0 ? (
                <div className="border rounded-lg py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  {excStatusFilter === 'pending' ? 'No pending exception actions — all done!' : 'No exception actions found.'}
                </div>
              ) : filteredExceptions.map(action => (
                <div key={action.id} className={`border rounded-lg p-4 space-y-2 ${
                  action.correctionStatus
                    ? 'border-amber-300 bg-amber-50/30 dark:bg-amber-950/10'
                    : action.executed
                    ? 'border-green-200 bg-green-50/20 dark:bg-green-950/10'
                    : action.decision === 'return' || action.decision === 'writeoff'
                      ? 'border-red-200 bg-red-50/10'
                      : 'border-amber-200 bg-amber-50/10'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{action.siteName}</p>
                        {decisionBadge(action.decision)}
                        {action.correctionStatus
                          ? <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">↺ {correctionStatusLabel(action.correctionStatus)}</Badge>
                          : action.executed
                          ? <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">✓ Executed</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Pending</Badge>
                        }
                        {action.executed && !action.correctionStatus && !action.glPosted && ['return','writeoff','redirect'].includes(action.decision) && (
                          <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">GL pending</Badge>
                        )}
                        {action.correctionStatus
                          ? <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">↺ GL reversed</Badge>
                          : action.glPosted && <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">✓ GL posted</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {action.enumeratorName} · {action.mmpName} · SDG {fmt(action.advanceAmount)}
                      </p>
                      {action.justification && <p className="text-xs text-muted-foreground italic">"{action.justification}"</p>}
                      {action.correctionStatus && (
                        <div className="rounded border border-amber-200 bg-white/70 px-2 py-1.5 text-xs space-y-1">
                          <p className="font-medium text-amber-900">
                            Corrected {fmtDate(action.correctedAt)}
                            {action.correctedByName && ` by ${action.correctedByName}`}
                          </p>
                          {action.correctionReason && <p className="text-amber-800">Reason: {action.correctionReason}</p>}
                          {action.originalJournalEntryId && (
                            <p className="font-mono text-[10px] text-amber-800 break-all">
                              Original journal: {action.originalJournalEntryId}
                            </p>
                          )}
                          {action.reversalJournalEntryId && (
                            <p className="font-mono text-[10px] text-amber-800 break-all">
                              Reversal journal: {action.reversalJournalEntryId}
                            </p>
                          )}
                        </div>
                      )}
                      {action.executed && (
                        <p className="text-xs text-muted-foreground">
                          Executed {fmtDate(action.executedAt)}
                          {action.approvedByName && ` by ${action.approvedByName}`}
                          {action.recoveryAmount && ` · SDG ${fmt(action.recoveryAmount)} collected`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {action.receiptUrl && (
                        <a href={action.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 text-[10px] flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Receipt
                        </a>
                      )}
                      {!action.executed && !action.reopenedFromActionId && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => openExcDialog(action)}>
                          Execute →
                        </Button>
                      )}
                      {!action.executed && action.reopenedFromActionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-300 text-amber-800"
                          onClick={() => navigate(`/mmp/cycle-close?mmpId=${action.mmpFileId}`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Resolve in Cycle Close
                        </Button>
                      )}
                      {/* Roll/Hold actions link to rollover tracker */}
                      {!action.executed && (action.decision === 'roll' || action.decision === 'hold') && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/cycle-exceptions/rollover')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Rollover Tracker
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 4 — RECOVERY & OUTSTANDING
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="recovery" className="space-y-4 mt-4">
          <Alert className="border-slate-200 bg-slate-50 dark:bg-slate-900/30">
            <TrendingDown className="h-4 w-4 text-slate-600" />
            <AlertDescription className="text-slate-700 text-sm">
              Advances that have been disbursed but not yet fully recovered through fee payments or cash returns.
              Overdue items (&gt;30 days) are highlighted. Use this view to chase outstanding balances.
            </AlertDescription>
          </Alert>

          {recStats.total > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 border-amber-200 bg-amber-50/30">
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
                <p className="text-lg font-bold text-amber-700">SDG {fmt(recStats.totalAmt)}</p>
                <p className="text-xs text-muted-foreground">{recStats.total} advance{recStats.total !== 1 ? 's' : ''}</p>
              </Card>
              <Card className="p-3 border-red-200 bg-red-50/30">
                <p className="text-xs text-muted-foreground">Overdue &gt;30 days</p>
                <p className="text-lg font-bold text-red-700">{recStats.overdue}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Current ≤30 days</p>
                <p className="text-lg font-bold">{recStats.total - recStats.overdue}</p>
              </Card>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search enumerator, site, MMP…" value={recSearch} onChange={e => setRecSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadRecovery}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleExcelExport('recovery')}
              disabled={exportingTab === 'recovery' || recoveryLoading || !recoveryLoaded}
            >
              <Download className="h-3 w-3 mr-1" />
              {exportingTab === 'recovery' ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>

          {recoveryLoadError ? (
            <DataLoadError message={recoveryLoadError} onRetry={loadRecovery} />
          ) : recoveryLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Disbursed</TableHead>
                    <TableHead className="text-xs text-right">Recovered</TableHead>
                    <TableHead className="text-xs text-right font-semibold">Outstanding</TableHead>
                    <TableHead className="text-xs">Age</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecovery.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-500" />
                        No outstanding advances — all clear!
                      </TableCell>
                    </TableRow>
                  ) : filteredRecovery.map(row => (
                    <TableRow key={row.id} className={row.daysOutstanding > 30 ? 'bg-red-50/20 dark:bg-red-950/10' : ''}>
                      <TableCell className="text-xs font-medium">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} · {row.hub}</p>
                      </TableCell>
                      <TableCell className="text-xs">{row.mmpName}</TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.disbursedAmount)}</TableCell>
                      <TableCell className="text-xs text-right text-green-600">
                        {row.recoveredAmount > 0 ? `SDG ${fmt(row.recoveredAmount)}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold text-amber-700">
                        SDG {fmt(row.outstandingAmount)}
                      </TableCell>
                      <TableCell>{ageBadge(row.daysOutstanding)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/down-payment-approval')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG: Redirect allocation trace
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={feeTraceRow !== null} onOpenChange={open => !open && setFeeTraceRow(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-purple-600" />
              Advance Offset Trace
            </DialogTitle>
            <DialogDescription>
              {feeTraceRow?.siteName} — persisted Cycle Close allocations and source payment references
            </DialogDescription>
          </DialogHeader>

          {feeTraceRow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  ['Gross Fee', feeTraceRow.totalFee],
                  ['Cash Paid', feeTraceRow.feeCashPaidAmount],
                  ['Advance Offset', feeTraceRow.feeAdvanceOffsetAmount],
                  ['Total Settled', feeTraceRow.feePaidAmount ?? 0],
                  ['Remaining Fee', Math.max(feeTraceRow.totalFee - (feeTraceRow.feePaidAmount ?? 0), 0)],
                  ['Unallocated', feeTraceRow.feeUnallocatedAmount],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-sm font-semibold">SDG {fmt(Number(value))}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {feeTraceRow.redirectAllocations.map((allocation, index) => (
                  <div key={allocation.id} className="rounded-lg border border-purple-200 bg-purple-50/30 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold">
                          Allocation {index + 1}: SDG {fmt(allocation.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Target: {allocation.targetSiteName}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={`text-[10px] ${
                          allocation.feeStatus === 'paid'
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : 'bg-purple-100 text-purple-700 border-purple-300'
                        }`}>
                          {allocation.feeStatus === 'paid' ? 'Fully Paid' : 'Partially Paid'}
                        </Badge>
                        {allocation.crossEnumerator && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                            Manager-authorized cross-enumerator
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Fee Gross</p>
                        <p className="font-medium">SDG {fmt(allocation.feeGrossAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Previously Settled</p>
                        <p className="font-medium">SDG {fmt(allocation.feePriorSettledAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Advance Allocation</p>
                        <p className="font-medium">SDG {fmt(allocation.amount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining After</p>
                        <p className="font-medium">SDG {fmt(allocation.feeRemainingAmount)}</p>
                      </div>
                    </div>

                    <div className="space-y-1 text-[10px]">
                      <p>
                        <span className="text-muted-foreground">Source advance: </span>
                        <span className="font-mono break-all">{allocation.sourceAdvanceId}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Source site: </span>
                        <span className="font-mono break-all">{allocation.sourceSiteId}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Enumerators: </span>
                        <span className="font-mono break-all">
                          {allocation.sourceEnumeratorId ?? '—'} → {allocation.targetEnumeratorId ?? '—'}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">GL journal: </span>
                        <span className="font-mono break-all">{allocation.journalEntryId ?? '—'}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Action: </span>
                        <span className="font-mono break-all">{allocation.actionId}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Original payment references: </span>
                        <span className="font-mono break-all">
                          {allocation.sourcePaymentReferences.length
                            ? allocation.sourcePaymentReferences.join(', ')
                            : 'None recorded'}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Justification: </span>
                        {allocation.justification || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeTraceRow(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG: Mark Fee Paid
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={payDialog.open} onOpenChange={open => !payDialog.saving && setPayDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {payDialog.rows.length > 1 ? `${payDialog.rows.length} Fees` : 'Fee'} as Paid</DialogTitle>
            <DialogDescription>
              {payDialog.rows.length === 1
                ? `${payDialog.rows[0]?.siteName} — ${payDialog.rows[0]?.enumeratorName}`
                : `${payDialog.rows.length} sites selected`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Summary */}
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Fees</span>
                <span>SDG {fmt(payDialog.rows.reduce((s, r) => s + r.totalFee, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Advance Deductions</span>
                <span className="text-amber-600">
                  − SDG {fmt(payDialog.rows.reduce((sum, row) => sum + getFeeAdvanceDeduction(row), 0))}
                </span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold">
                <span>Net Payable</span>
                <span className="text-green-700">SDG {fmt(payDialog.rows.reduce((s, r) => s + r.netPayable, 0))}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Payment Method *</Label>
                <Select value={payDialog.method} onValueChange={v => setPayDialog(d => ({ ...d, method: v }))}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Payment Date *</Label>
                <Input type="date" className="h-9 text-sm mt-1" value={payDialog.date}
                  onChange={e => setPayDialog(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Pre-funding source (optional)</Label>
                <Select value={payDialog.preFundId || '__none__'} onValueChange={v => setPayDialog(d => ({ ...d, preFundId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue placeholder={payDialog.loadingPreFunds ? 'Loading eligible pre-funds…' : 'Pay outside pre-funding'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Pay outside pre-funding</SelectItem>
                    {payDialog.preFunds.map(fund => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name} — SDG {fmt(Number(fund.available_balance ?? 0))} available
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {payDialog.preFundId && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The protected payment transaction will verify the live balance before it saves the batch.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Receipt / Proof of Payment *</Label>
                <div className="mt-1 border-2 border-dashed rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                  <input type="file" accept="image/*,.pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => e.target.files?.[0] && handleFeeReceiptUpload(e.target.files[0])} />
                  {payDialog.uploading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Uploading…
                    </div>
                  ) : payDialog.receiptUrl ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <a href={payDialog.receiptUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                        Receipt uploaded — click to view
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Click to upload (JPG, PNG, PDF)</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">Payment reference (optional)</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Transfer ID, voucher, or cashbook reference"
                  value={payDialog.reference} onChange={e => setPayDialog(d => ({ ...d, reference: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea className="mt-1 text-sm" rows={2} placeholder="Any additional notes…"
                  value={payDialog.notes} onChange={e => setPayDialog(d => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>

            <Alert className="border-blue-200 bg-blue-50 py-2">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              <AlertDescription className="text-blue-700 text-xs">
                A GL entry (DR 5200 / CR {payDialog.method === 'Bank Transfer' ? '1020 Bank' : '1010 Cash'}) will post automatically on save.
                {payDialog.rows.some(row => row.redirectAllocations.length > 0)
                  ? ' Existing advance offsets were already posted and will not be posted again.'
                  : ''}
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(d => ({ ...d, open: false }))} disabled={payDialog.saving}>
              Cancel
            </Button>
            <Button onClick={submitFeePay} disabled={payDialog.saving || payDialog.uploading || !payDialog.receiptUrl}
              className="bg-green-600 hover:bg-green-700 text-white">
              {payDialog.saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : '✓ Mark Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG: Execute Exception Action
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={excDialog.open} onOpenChange={open => !excDialog.saving && setExcDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execute: {excDialog.action && decisionBadge(excDialog.action.decision)}
            </DialogTitle>
            <DialogDescription>
              {excDialog.action?.siteName} — {excDialog.action?.enumeratorName}
              <br />SDG {fmt(excDialog.action?.advanceAmount)} · {excDialog.action?.mmpName}
            </DialogDescription>
          </DialogHeader>

          {excDialog.action && (
            <div className="space-y-4 py-2">
              {/* Return-specific fields */}
              {excDialog.action.decision === 'return' && (
                <>
                  <div>
                    <Label className="text-xs">Amount Collected (SDG) *</Label>
                    <Input type="number" className="h-9 mt-1 text-sm"
                      value={excDialog.recoveryAmount}
                      onChange={e => setExcDialog(d => ({ ...d, recoveryAmount: e.target.value }))}
                      placeholder={`Max: ${excDialog.action.advanceAmount}`} />
                  </div>
                  <div>
                    <Label className="text-xs">Date Collected *</Label>
                    <Input type="date" className="h-9 mt-1 text-sm"
                      value={excDialog.recoveryDate}
                      onChange={e => setExcDialog(d => ({ ...d, recoveryDate: e.target.value }))} />
                  </div>
                </>
              )}

              {/* Redirect-specific fields */}
              {excDialog.action.decision === 'redirect' && (
                <div>
                  <Label className="text-xs">Redirect to Hub / Project *</Label>
                  <Input className="h-9 mt-1 text-sm"
                    value={excDialog.redirectHub}
                    onChange={e => setExcDialog(d => ({ ...d, redirectHub: e.target.value }))}
                    placeholder="Hub or project name…" />
                </div>
              )}

              {/* Receipt upload (required for return, writeoff, redirect) */}
              {['return', 'writeoff', 'redirect'].includes(excDialog.action.decision) && (
                <div>
                  <Label className="text-xs">
                    {excDialog.action.decision === 'writeoff' ? 'Write-Off Approval Document *' :
                     excDialog.action.decision === 'return'   ? 'Collection Receipt *' :
                     'Supporting Document *'}
                  </Label>
                  <div className="mt-1 border-2 border-dashed rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                    <input type="file" accept="image/*,.pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => e.target.files?.[0] && handleExcReceiptUpload(e.target.files[0])} />
                    {excDialog.uploading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Uploading…
                      </div>
                    ) : excDialog.receiptUrl ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <a href={excDialog.receiptUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                          Document uploaded — click to view
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="h-5 w-5" />
                        <span className="text-xs">Click to upload (JPG, PNG, PDF)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Execution Notes</Label>
                <Textarea className="mt-1 text-sm" rows={2} placeholder="Optional notes…"
                  value={excDialog.notes} onChange={e => setExcDialog(d => ({ ...d, notes: e.target.value }))} />
              </div>

              {/* GL preview */}
              {['return', 'writeoff', 'redirect'].includes(excDialog.action.decision) && (
                <Alert className="border-blue-200 bg-blue-50 py-2">
                  <Info className="h-3.5 w-3.5 text-blue-600" />
                  <AlertDescription className="text-blue-700 text-xs">
                    GL entry on execution:{' '}
                    {excDialog.action.decision === 'return'   ? 'DR 1010 Cash / CR 1510 Travel Advances' :
                     excDialog.action.decision === 'writeoff' ? 'DR 5900 Bad Debt / CR 1510 Travel Advances' :
                     'DR 5200 Enumerator Fees / CR 1510 Travel Advances'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setExcDialog(d => ({ ...d, open: false }))} disabled={excDialog.saving}>Cancel</Button>
            <Button onClick={submitException}
              disabled={excDialog.saving || excDialog.uploading ||
                (['return','writeoff','redirect'].includes(excDialog.action?.decision ?? '') && !excDialog.receiptUrl)}
              className="bg-primary">
              {excDialog.saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Executing…</> : 'Confirm & Execute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
