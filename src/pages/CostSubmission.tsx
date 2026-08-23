import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusHistoryPanel } from "@/components/audit/StatusHistoryPanel";
import { REJECTION_REASONS, APPROVAL_REASONS, groupReasonOptions } from "@/config/rejectionReasons";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronDown, ChevronRight, Clock, Check, CheckCircle, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, ThumbsUp, ThumbsDown, ArrowRight, Calendar, MapPin, Building2, FolderOpen, Hash, Paperclip, Download, Pencil, PencilLine, Trash2, RotateCcw, SendHorizonal, FileSpreadsheet, FileDown, Info, RefreshCw, CircleDollarSign, ClipboardCheck, HelpCircle, Wallet, Ticket, Gift, Wifi, GraduationCap, Car, Package, Printer, Coffee, MoreHorizontal, Briefcase, Mail, Upload, Eye, ImageIcon, ShieldCheck, MessageSquare, CornerUpLeft, Layers, Send, Bell, ExternalLink, X, Search, Zap, ChevronsUpDown, User, History, SlidersHorizontal, BookmarkPlus, BarChart3, Filter, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserCostSubmissions, useCostSubmissions, useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { usePreFundPaymentGate } from "@/hooks/usePreFundPaymentGate";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { useAppContext } from "@/context/AppContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { useRestrictedAction } from "@/hooks/useRestrictedAction";
import { PageAccessDenied } from "@/components/access/PageAccessDenied";
import { useUser } from "@/context/user/UserContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUserProjects } from "@/hooks/useUserProjects";
import { useMMP } from "@/context/mmp/MMPContext";
import CostSubmissionHistory from "@/components/cost-submission/CostSubmissionHistory";
import UnifiedCostRequestForm from "@/components/cost-submission/UnifiedCostRequestForm";
import CostReconciliationForm from "@/components/cost-submission/CostReconciliationForm";
import CostDocumentUpload from "@/components/cost-submission/CostDocumentUpload";
import OutstandingAdvances from "@/components/cost-submission/OutstandingAdvances";
import type { SupportingDocument } from "@/types/cost-submission";
import { ExpenseTypeSelector, type ExpenseMode } from "@/components/cost-submission/ExpenseTypeSelector";
import { PersonalExpenseFlow, type PersonalExpenseFlowHandle } from "@/components/cost-submission/PersonalExpenseFlow";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { SignatureConfirmationModal } from "@/components/signatures/SignatureConfirmationModal";
import type { SignatureMethod } from "@/types/signature";
import { generateApprovalCertificatePdf, generateApprovalCertificateBase64 } from "@/utils/approvalCertificatePdf";
import {
  exportSubmissionsToExcel,
  exportSubmissionsToPDF,
  exportOutstandingToExcel,
  exportOutstandingToPDF,
  exportReconciledToExcel,
  exportReconciledToPDF,
} from "@/utils/costSubmissionExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { EmailNotificationService } from '@/services/email-notification.service';
import { EmailCCInput } from '@/components/EmailCCInput';
import { generateFinancialStatementPdf, type StatementRow, type StatementConfig } from '@/utils/financialStatementPdf';
import { generateFinancialStatementExcel } from '@/utils/financialStatementExcel';
import { generateBulkCostPDFBase64, generateBulkCostExcelBase64, type BulkSubmission, type BulkUserMap, type BulkProjectMap } from '@/utils/bulkCostEmailAttachments';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { dispatchNotification } from '@/lib/notify';
import { getStatesInHub, normalizeHubId, hubs, getStateName } from '@/data/sudanStates';
import { getHubAccessInfo, isStateInAnyHub, getAdditionalSupervisorHubIds } from '@/utils/hubAccessControl';

const MGMT_ROLES = [
  'fom', 'field_operation_manager', 'Field Operation Manager (FOM)',
  'countryDirector', 'country_director', 'CountryDirector',
  'superAdmin', 'super_admin', 'SuperAdmin',
  'admin', 'Admin',
  'financial_admin', 'finance',
];

async function notifyMgmtOfCostEvent(
  eventTitle: string,
  eventMessage: string,
  submissionId: string,
  excludeUserId?: string,
  emailDetails?: Array<{ label: string; value: string }>,
  titleAr?: string,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('role', MGMT_ROLES)
      .eq('status', 'approved');
    (data || []).filter(u => u.id !== excludeUserId).forEach(u => {
      NotificationTriggerService.send({
        userId: u.id,
        title: eventTitle,
        titleAr: titleAr || eventTitle,
        message: eventMessage,
        type: 'success',
        category: 'financial',
        priority: 'high',
        link: `/cost-submission?open=${submissionId}`,
        relatedEntityType: 'costSubmission',
        relatedEntityId: submissionId,
        sendEmail: true,
        emailActionLabel: 'View Submission | عرض المطالبة',
        emailDetails,
      } as any).catch(console.warn);
    });
  } catch (e) {
    console.warn('[CostSubmission] notifyMgmtOfCostEvent failed:', e);
  }
}

const COST_CATEGORY_LABELS: Record<string, string> = {
  permits: 'Permits & Licenses', incentives: 'Incentives & Allowances',
  communications: 'Internet & Comms', training: 'Training',
  transport: 'Transportation', general_transport: 'Transportation',
  equipment: 'Equipment & Supplies', printing: 'Printing & Stationery',
  meetings: 'Meetings', office_admin: 'Office Admin', other: 'Other',
};

const PROJECT_PALETTE = [
  { bg: 'rgba(59,130,246,0.25)',  border: '#3B82F6', text: '#93C5FD' },  // blue
  { bg: 'rgba(16,185,129,0.25)', border: '#10B981', text: '#6EE7B7' },  // emerald
  { bg: 'rgba(245,158,11,0.25)', border: '#F59E0B', text: '#FCD34D' },  // amber
  { bg: 'rgba(139,92,246,0.25)', border: '#8B5CF6', text: '#C4B5FD' },  // violet
  { bg: 'rgba(244,63,94,0.25)',  border: '#F43F5E', text: '#FCA5A5' },  // rose
  { bg: 'rgba(6,182,212,0.25)',  border: '#06B6D4', text: '#67E8F9' },  // cyan
  { bg: 'rgba(249,115,22,0.25)', border: '#F97316', text: '#FED7AA' },  // orange
  { bg: 'rgba(20,184,166,0.25)', border: '#14B8A6', text: '#99F6E4' },  // teal
  { bg: 'rgba(236,72,153,0.25)', border: '#EC4899', text: '#F9A8D4' },  // pink
  { bg: 'rgba(99,102,241,0.25)', border: '#6366F1', text: '#A5B4FC' },  // indigo
];

function getProjectPalette(projectId: string | null | undefined) {
  if (!projectId) return PROJECT_PALETTE[0];
  const hash = projectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PROJECT_PALETTE[hash % PROJECT_PALETTE.length];
}

const EXPENSE_CATEGORY_MAP: Record<string, { label: string; icon: any }> = {
  permits: { label: 'Permits & Licenses', icon: Ticket },
  incentives: { label: 'Incentives & Allowances', icon: Gift },
  communications: { label: 'Internet & Comms', icon: Wifi },
  training: { label: 'Training', icon: GraduationCap },
  transport: { label: 'Transportation', icon: Car },
  general_transport: { label: 'Transportation', icon: Car },
  equipment: { label: 'Equipment & Supplies', icon: Package },
  printing: { label: 'Printing & Stationery', icon: Printer },
  meetings: { label: 'Meetings', icon: Coffee },
  office_admin: { label: 'Office Admin', icon: Building2 },
  other: { label: 'Other', icon: MoreHorizontal },
  __multi__: { label: 'Multi-Category', icon: Layers },
};

interface OperationalCostSubmission {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  reference_number: string | null;
   hub_id: string | null;
   project_id: string | null;
   mmp_file_id: string | null;
   submitted_by: string;
  submitted_at: string | null;
  submitter_role: string | null;
  supporting_documents: any;
  status: string;
  tier1_status: string | null;
  tier1_approved_by: string | null;
  tier1_approved_at: string | null;
  tier1_notes: string | null;
  tier2_status: string | null;
  tier2_approved_by: string | null;
  tier2_approved_at: string | null;
  tier2_notes: string | null;
  tier3_status: string | null;
  tier3_approved_by: string | null;
  tier3_approved_at: string | null;
  tier3_notes: string | null;
  tier4_status: string | null;
  tier4_approved_by: string | null;
  tier4_approved_at: string | null;
  tier4_notes: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  paid_by: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciled_amount_cents: number | null;
  reconciliation_notes: string | null;
  created_at: string;
  updated_at: string;
  fund_receipt_confirmed?: boolean | null;
  fund_receipt_confirmed_at?: string | null;
  fund_receipt_signature_url?: string | null;
  fund_receipt_notes?: string | null;
  payment_proof_url?: string | null;
  payment_proof_notes?: string | null;
  payment_proof_uploaded_at?: string | null;
  request_group_id?: string | null;
  request_title?: string | null;
  amount_paid_cents?: number | null;
  delete_requested_at?: string | null;
  delete_requested_by?: string | null;
  delete_request_reason?: string | null;
  delete_request_status?: 'pending' | 'approved' | 'rejected' | null;
  delete_request_notes?: string | null;
  delete_request_reviewed_by?: string | null;
  delete_request_reviewed_at?: string | null;
  // CD Exception Transfer
  transferred_to_cd?: boolean | null;
  transferred_by?: string | null;
  transferred_at?: string | null;
  transfer_note?: string | null;
  cd_exception_status?: 'pending' | 'approved' | 'rejected' | null;
  cd_exception_note?: string | null;
  cd_exception_reviewed_by?: string | null;
  cd_exception_reviewed_at?: string | null;
}

const CostSubmission = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Cycle-close context: when arriving from the readiness checklist "Resolve" button
  const cycleContextMmpId   = searchParams.get('mmpId')   || null;
  const cycleContextMmpName = searchParams.get('mmpName') || null;
  // Deep-link: ?open=<submissionId> auto-opens a specific submission detail sheet
  const openSubmissionId = searchParams.get('open') || null;
  const { currentUser } = useAppContext();
  const isColVisible = useColumnVisibility('cost-submission');
  const { users } = useUser();
  const { projects: allProjects } = useProjectContext();
   const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
   const { mmpFiles } = useMMP();
   const { toast } = useToast();

   // Build MMP lookup map: mmp_file_id -> mmp name
   const mmpNameMap = useMemo(() => {
     const map = new Map<string, string>();
     mmpFiles?.forEach(mmp => {
       if (mmp.id) {
         map.set(mmp.id, mmp.name || 'Unnamed MMP');
       }
     });
     return map;
   }, [mmpFiles]);
  
  // Role checks — canonical camelCase codes via useAuthorization hook
  const { hasAnyRole, isSuperAdmin: isSuperAdminFn, checkPermission } = useAuthorization();
  const isAdmin           = hasAnyRole(['admin']);
  const isSupervisor      = hasAnyRole(['supervisor']);
  const isFOM             = hasAnyRole(['fom']);
  // Primary-role-only supervisor check — excludes additional_roles so a FOM with an
  // additional Supervisor role for hub-scoping is NOT treated as a T1 approver for
  // coordinator submissions.
  const primaryRole = (currentUser?.role || '').toLowerCase().replace(/[\s_()-]/g, '');
  const isPrimaryRoleSupervisor = primaryRole.includes('supervisor') || primaryRole === 'hubsupervisor';
  const isCoordinator     = hasAnyRole(['coordinator']);
  const isCountryDirector = hasAnyRole(['countryDirector']);
  const isDataCollector   = hasAnyRole(['dataCollector']);
  const isSuperAdmin      = isAdminOrSuperUser || isSuperAdminFn();
  const isStrictCostSubmissionAdmin = isAdmin || isSuperAdminFn();
  const isFinanceAdmin    = hasAnyRole(['financialAdmin']);
  const isDataTeam        = hasAnyRole(['dataTeam']);
  const canManagePreFundFilters = isAdmin || isSuperAdminFn();

  const canSubmitOperationalCosts = isFOM || isCoordinator || isCountryDirector || isAdmin || isSupervisor || isAdminOrSuperUser || isDataTeam || isDataCollector;
  const canReconcileAdvances = isCountryDirector || isAdmin || isAdminOrSuperUser;
  // Reconciliation tab: Finance Admin, Admin, Super Admin only (+ role-management overrides)
  const canViewReconciliationTab = isFinanceAdmin || isAdmin || isSuperAdmin;
  const { perms: costSubmitPerms } = useRestrictedAction('cost-submission');

  // Pre-Fund gate — provides allocation context for auto-linking; does NOT block submission
  const { status: gateStatus, allocatedFunds } = usePreFundPaymentGate();
  
  const canViewTeamSubmissions = isAdmin || isSupervisor || isSuperAdmin || isFinanceAdmin || isAdminOrSuperUser || isFOM || isCountryDirector;

  // FOM, Admin, SuperAdmin, CountryDirector default to "All Submissions"; submitters default to Submit Request
  const [activeTab, setActiveTab] = useState<"submit" | "reconciliation" | "outstanding" | "history" | "payment_audit" | "reports" | "delete_requests">(
    (isFOM || isSuperAdmin || isAdmin || isCountryDirector || canViewTeamSubmissions) ? "history" : "submit"
  );
  // Task #56 — top-of-page expense-type selector (operational vs personal reimbursement)
  const [expenseMode, setExpenseMode] = useState<ExpenseMode>("operational");
  const [pendingMode, setPendingMode] = useState<ExpenseMode | null>(null);
  const [personalDirty, setPersonalDirty] = useState(false);
  const personalFlowRef = useRef<PersonalExpenseFlowHandle>(null);
  const handleSwitchMode = (next: ExpenseMode) => {
    if (next === expenseMode) return;
    // Discard guard: only fires if leaving an in-progress personal claim. We
    // don't instrument UnifiedCostRequestForm so switching from operational
    // to personal does not gate (operational form keeps its own state).
    if (expenseMode === 'personal' && personalDirty) {
      setPendingMode(next);
      return;
    }
    setExpenseMode(next);
  };
  const confirmSwitchMode = () => {
    if (pendingMode) {
      personalFlowRef.current?.reset();
      setPersonalDirty(false);
      setExpenseMode(pendingMode);
      setPendingMode(null);
    }
  };
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "under_review" | "approved" | "rejected" | "partially_paid" | "paid" | "reconciled">(() => {
    const t = searchParams.get('tab');
    const valid = ["all", "pending", "under_review", "approved", "rejected", "partially_paid", "paid", "reconciled"] as const;
    return (valid as readonly string[]).includes(t ?? '') ? (t as "all" | "pending" | "under_review" | "approved" | "rejected" | "partially_paid" | "paid" | "reconciled") : "all";
  });
  const [showGuide, setShowGuide] = useState(false);
  // ----- Operational Costs (cached via TanStack Query) -----
  const queryClient = useQueryClient();
  const _opsQueryKey = useMemo(
    () => ['operationalCosts', currentUser?.id, currentUser?.role, canViewTeamSubmissions, isSuperAdmin, isAdminOrSuperUser] as const,
    [currentUser?.id, currentUser?.role, canViewTeamSubmissions, isSuperAdmin, isAdminOrSuperUser]
  );
  const {
    data: operationalCosts = [],
    isLoading: operationalCostsLoading,
    isFetching: operationalCostsFetching,
    error: operationalCostsError,
    refetch: fetchOperationalCosts,
  } = useQuery({
    queryKey: _opsQueryKey,
    enabled: !!currentUser?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<OperationalCostSubmission[]> => {
      if (!currentUser?.id) return [];
      const userRole = (currentUser.role || '').toLowerCase().replace(/[\s_-]/g, '');
      const isSuperAdminDirect = userRole === 'superadmin' || userRole === 'superadministrator';
      const isAdminDirect = userRole === 'admin' || userRole === 'administrator' || userRole === 'ict';
      const shouldFetchAll = canViewTeamSubmissions || isSuperAdmin || isSuperAdminDirect || isAdminDirect || isAdminOrSuperUser;

      // Reconciliation can resolve an Operational Cost Submission by a linked
      // Pre-Fund payment even when the main list RPC omitted the source row.
      // The supplemental RPC is restricted to Admins/Super Admins and performs
      // the active-payment lookup in the database, rather than scanning ledger
      // rows in the browser.
      const includePaymentLinkedSources = async (baseRows: OperationalCostSubmission[]) => {
        if (!isStrictCostSubmissionAdmin) return baseRows;

        const { data, error } = await supabase.rpc('get_admin_payment_linked_operational_cost_submissions');
        if (error) {
          const missingRpc = error.code === 'PGRST202'
            || (error.code === '42883' && /function .*does not exist/i.test(error.message));
          if (missingRpc) {
            console.warn('[CostSubmission] Payment-linked visibility migration is not applied yet:', error.message);
            return baseRows;
          }
          throw new Error(`Failed to load payment-linked submissions: ${error.message}`);
        }

        const knownIds = new Set(baseRows.map(submission => submission.id));
        const linkedRows = ((data ?? []) as OperationalCostSubmission[])
          .filter(submission => !knownIds.has(submission.id));

        if (linkedRows.length > 0) {
          console.info(`[CostSubmission] Added ${linkedRows.length} payment-linked submission(s) missing from the standard list.`);
        }
        return [...baseRows, ...linkedRows].sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      };

      if (shouldFetchAll) {
        // Try SECURITY DEFINER RPC first — bypasses RLS
        const rpcResult = await supabase.rpc('get_all_operational_cost_submissions');
        console.log(`[CostSubmission] RPC: ${(rpcResult.data as any[] | null)?.length ?? 'null'} rows, error: ${rpcResult.error?.message ?? 'none'} (role: ${currentUser.role})`);
        if (!rpcResult.error && Array.isArray(rpcResult.data)) {
          return includePaymentLinkedSources(rpcResult.data as OperationalCostSubmission[]);
        }
        console.warn('[CostSubmission] RPC failed, direct query fallback:', rpcResult.error?.message);
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5000);
        console.log(`[CostSubmission] Direct: ${data?.length ?? 'null'} rows, error: ${error?.message ?? 'none'}`);
        if (error) throw new Error(`Failed to load submissions: ${error.message}`);
        return includePaymentLinkedSources((data || []) as OperationalCostSubmission[]);
      } else {
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('*')
          .eq('submitted_by', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (error) throw new Error(`Failed to load your submissions: ${error.message}`);
        return (data || []) as OperationalCostSubmission[];
      }
    },
  });
  // ----------------------------------------------------------

  useEffect(() => {
    if (!isStrictCostSubmissionAdmin) return;

    const channel = supabase
      .channel('cost-submission-payment-link-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pre_fund_transactions',
          filter: 'source_table=eq.operational_cost_submissions',
        },
        () => queryClient.invalidateQueries({ queryKey: _opsQueryKey })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isStrictCostSubmissionAdmin, queryClient, _opsQueryKey]);

  const [opsGlLogMap, setOpsGlLogMap] = useState<Map<string, string>>(new Map());
  const [mmpFilter, setMmpFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [costPreFundFilter, setCostPreFundFilter] = useState<string>('all');
  type PaymentEvidence = { id: string; name: string; amount?: number; currency?: string; paymentEventId: string; isCorrectable: boolean };
  const [costPreFundLinks, setCostPreFundLinks] = useState<Map<string, PaymentEvidence[]>>(new Map());
  const [costPreFundLinkError, setCostPreFundLinkError] = useState<string | null>(null);
  const [costPreFundOptions, setCostPreFundOptions] = useState<Array<{ id: string; name: string; currency: string; status: string | null }>>([]);
  const [costPreFundEvidenceRefresh, setCostPreFundEvidenceRefresh] = useState(0);
  // Super-admin only: filter by the current approval tier a submission is waiting at
  const [tierFilter, setTierFilter] = useState<'all' | 't1' | 't2' | 't3' | 't4'>('all');
  const [addToGroupContext, setAddToGroupContext] = useState<{ id: string; title: string } | null>(null);

  // Reports tab: which cards are collapsed (card IDs), and which role rows are expanded in the timeline
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const toggleReportCard = (id: string) => setCollapsedCards(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const toggleRole = (role: string) => setExpandedRoles(prev => { const n = new Set(prev); n.has(role) ? n.delete(role) : n.add(role); return n; });

  // Maps pre_fund_transaction_id → fund name for the reports tab (lazy — only when Reports is open)
  const [txnToFundMap, setTxnToFundMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setCostPreFundLinkError(null);
        const { fetchPreFundSourcePaymentLinks } = await import('@/utils/preFundLinkage');
        const links = await fetchPreFundSourcePaymentLinks('operational_cost_submissions', operationalCosts.map(o => o.id));
        if (!active) return;
        const next = new Map<string, PaymentEvidence[]>();
        links.forEach(link => next.set(link.sourceId, [...(next.get(link.sourceId) ?? []), {
          id: link.fundId,
          name: link.fundName,
          amount: link.paymentAmount,
          currency: link.currency,
          paymentEventId: link.paymentEventId,
          isCorrectable: link.isCorrectable,
        }]));
        setCostPreFundLinks(next);
      } catch (error: any) {
        console.error('[CostSubmission] Failed to load Pre-Fund payment links:', error);
        if (active) {
          setCostPreFundLinks(new Map());
          setCostPreFundLinkError(error?.message ?? 'The payment-link evidence could not be loaded.');
        }
      }
    })();
    return () => { active = false; };
  }, [operationalCosts, costPreFundEvidenceRefresh]);
  useEffect(() => {
    let active = true;
    if (!canManagePreFundFilters) {
      setCostPreFundOptions([]);
      setCostPreFundFilter('all');
      return () => { active = false; };
    }
    (async () => {
      const { data, error } = await (supabase as any)
        .from('pre_fund_requests')
        .select('id, name, currency, status')
        .order('name', { ascending: true });
      if (!active) return;
      if (error) {
        console.error('[CostSubmission] Failed to load Pre-Fund sources:', error);
        setCostPreFundOptions([]);
        return;
      }
      setCostPreFundOptions((data ?? []).map((fund: any) => ({
        id: fund.id,
        name: fund.name || fund.id,
        currency: fund.currency || '—',
        status: fund.status ?? null,
      })));
    })();
    return () => { active = false; };
  }, [canManagePreFundFilters]);
  useEffect(() => {
    if (activeTab !== 'reports') return;
    const txnIds = [...new Set(
      operationalCosts.map(o => (o as any).pre_fund_transaction_id).filter(Boolean)
    )] as string[];
    if (txnIds.length === 0) { setTxnToFundMap(new Map()); return; }
    (supabase as any)
      .from('pre_fund_transactions')
      .select('id, pre_fund_request_id')
      .in('id', txnIds)
      .then(({ data: txns }: { data: any[] | null }) => {
        if (!txns?.length) return;
        const fundIds = [...new Set(txns.map((t: any) => t.pre_fund_request_id).filter(Boolean))] as string[];
        (supabase as any)
          .from('pre_fund_requests')
          .select('id, name')
          .in('id', fundIds)
          .then(({ data: funds }: { data: any[] | null }) => {
            const fundById = new Map((funds ?? []).map((f: any) => [f.id, f.name as string]));
            const map = new Map<string, string>();
            txns.forEach((t: any) => {
              if (t.id && t.pre_fund_request_id) map.set(t.id, fundById.get(t.pre_fund_request_id) ?? 'Unknown Fund');
            });
            setTxnToFundMap(map);
          });
      });
  }, [operationalCosts]);

  // Derive MMP filter options from already-loaded mmpNameMap — no extra query needed
  const mmpOptions = useMemo(() => {
    const ids = [...new Set(operationalCosts.map(o => o.mmp_file_id).filter(Boolean))] as string[];
    return ids.map(id => ({ id, name: mmpNameMap.get(id) || 'MMP' }));
  }, [operationalCosts, mmpNameMap]);

  // Derived submitter options (from role-filtered pool, before user/state filter so the list stays full)
  const userOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const o of operationalCosts) {
      if (seen.has(o.submitted_by)) continue;
      seen.add(o.submitted_by);
      const u = users.find(u => u.id === o.submitted_by);
      const name = u?.name || u?.email || `User ${o.submitted_by.slice(0, 8)}`;
      opts.push({ id: o.submitted_by, name });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [operationalCosts, users]);

  // Derived state options from submitters visible in the current pool
  const stateOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; label: string }[] = [];
    for (const o of operationalCosts) {
      const u = users.find(u => u.id === o.submitted_by);
      const stateId = u?.stateId || (u as any)?.state;
      if (!stateId || seen.has(stateId)) continue;
      seen.add(stateId);
      opts.push({ id: stateId, label: getStateName(stateId) });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [operationalCosts, users]);

  // Auto-open a specific submission when ?open=<id> is in the URL (deep-link from notifications)
  useEffect(() => {
    if (!openSubmissionId || operationalCosts.length === 0) return;
    const found = operationalCosts.find(o => o.id === openSubmissionId);
    if (found) {
      setViewingSubmission(found);
      // Remove the ?open param so refreshing doesn't re-trigger
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
    }
  }, [openSubmissionId, operationalCosts]);

  // Fetch GL bridge log for paid/reconciled operational cost submissions — lazy on Reports tab
  // Load deletion audit log whenever the Delete Requests tab is opened
  useEffect(() => {
    if (activeTab !== 'delete_requests' || !isSuperAdmin) return;
    supabase
      .from('deletion_audit_log')
      .select('*')
      .eq('table_name', 'operational_cost_submissions')
      .order('deleted_at', { ascending: false })
      .limit(300)
      .then(({ data }) => setDeletionLog(data || []));
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    const paidIds = operationalCosts
      .filter(o => o.status === 'paid' || o.status === 'reconciled')
      .map(o => o.id);
    if (paidIds.length === 0) { setOpsGlLogMap(new Map()); return; }
    supabase
      .from('acct_gl_bridge_log' as any)
      .select('source_id, status')
      .eq('source_table', 'operational_cost_submissions')
      .in('source_id', paidIds.slice(0, 500))
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const map = new Map<string, string>();
        for (const row of (data ?? []) as { source_id: string; status: string }[]) {
          if (!map.has(row.source_id)) map.set(row.source_id, row.status);
        }
        setOpsGlLogMap(map);
      });
  }, [operationalCosts]);

  // ── Receipt Confirmation Gate ──────────────────────────────────────────────
  // When the current user has paid submissions where they haven't confirmed
  // receiving the funds, show a blocking confirmation dialog.
  const [receiptConfirmDialog, setReceiptConfirmDialog] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
  }>({ open: false, submission: null });
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);
  // Track IDs the user has already confirmed this session so the useEffect
  // doesn't re-open the dialog before the DB refresh propagates back.
  const confirmedReceiptIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser?.id || operationalCosts.length === 0) return;
    // Only show for the requester — skip any already confirmed this session
    const pending = operationalCosts.find(
      o =>
        o.status === 'paid' &&
        !o.fund_receipt_confirmed &&
        o.submitted_by === currentUser.id &&
        !confirmedReceiptIds.current.has(o.id)
    );
    if (pending) {
      setReceiptConfirmDialog({ open: true, submission: pending });
    }
  }, [operationalCosts, currentUser?.id]);

  const handleConfirmReceipt = async () => {
    const sub = receiptConfirmDialog.submission;
    if (!sub) return;
    setConfirmingReceipt(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('operational_cost_submissions' as any)
        .update({ fund_receipt_confirmed: true, fund_receipt_confirmed_at: now })
        .eq('id', sub.id);
      if (error) throw error;

      // 1. Track confirmed ID in ref so the useEffect filter skips it instantly.
      confirmedReceiptIds.current.add(sub.id);

      // 2. Optimistically patch the React Query cache so any re-render or
      //    background refetch within the stale window sees the confirmed flag
      //    and never reopens this dialog for the same submission.
      queryClient.setQueryData(_opsQueryKey, (old: OperationalCostSubmission[] | undefined) =>
        (old ?? []).map(o =>
          o.id === sub.id
            ? { ...o, fund_receipt_confirmed: true, fund_receipt_confirmed_at: now }
            : o
        )
      );

      toast({ title: 'Receipt confirmed', description: 'Thank you for confirming you received the payment.' });
      setReceiptConfirmDialog({ open: false, submission: null });
    } catch (e: any) {
      toast({ title: 'Confirmation failed', description: e.message, variant: 'destructive' });
    } finally {
      setConfirmingReceipt(false);
    }
  };

  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2 | 3 | 4;
    submission: OperationalCostSubmission | null;
  }>({ open: false, action: 'approve', tier: 1, submission: null });
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  const [approvalAttachments, setApprovalAttachments] = useState<File[]>([]);
  const pendingApprovalDocsRef = useRef<Array<{ url: string; filename: string }>>([]);

  const [groupApprovalDialog, setGroupApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2 | 3 | 4;
    groupId: string;
    groupTitle: string;
    submissions: OperationalCostSubmission[];
  }>({ open: false, action: 'approve', tier: 1, groupId: '', groupTitle: '', submissions: [] });
  const [groupApprovalNotes, setGroupApprovalNotes] = useState('');
  const [groupApprovalReason, setGroupApprovalReason] = useState('');
  const [groupApprovalProcessing, setGroupApprovalProcessing] = useState(false);
  const [groupApprovalAttachments, setGroupApprovalAttachments] = useState<File[]>([]);

  const [viewingSubmission, setViewingSubmission] = useState<OperationalCostSubmission | null>(null);
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, { name: string; email: string }>>({});
  // Ref tracks in-flight profile fetches so we never fire duplicate Supabase queries
  const fetchingProfileIdsRef = useRef<Set<string>>(new Set());

  // Resolve any submitted_by IDs that aren't in the cached `users` array
  // (happens when RLS hides certain profiles from the current viewer's role)
  // NOTE: resolvedProfiles is intentionally NOT in the dep array — including it
  // causes an update loop (set state → dep changes → effect re-runs).
  // The fetchingProfileIdsRef deduplicates in-flight requests instead.
  useEffect(() => {
    const id = viewingSubmission?.submitted_by;
    if (!id) return;
    if (users.find(u => u.id === id)) return;
    if (resolvedProfiles[id]) return;
    if (fetchingProfileIdsRef.current.has(id)) return;
    fetchingProfileIdsRef.current.add(id);
    supabase
      .from('profiles')
      .select('id, full_name, username, email')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        fetchingProfileIdsRef.current.delete(id);
        if (data) {
          const p = data as any;
          setResolvedProfiles(prev => ({
            ...prev,
            [id]: {
              name: p.full_name || p.username || (p.email ? p.email.split('@')[0] : '') || `User ${id.slice(0, 8)}`,
              email: p.email || '',
            },
          }));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingSubmission?.submitted_by, users]);

  const [signatureModal, setSignatureModal] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    tier: 1 | 2 | 3 | 4;
    notes: string;
  }>({ open: false, submission: null, tier: 2, notes: '' });

  const [paymentRequestDialog, setPaymentRequestDialog] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    availableRecipients: Array<{ id: string; email: string; name: string; role: string }>;
    selectedRecipientIds: string[];
    ccEmails: string[];
    loading: boolean;
    sending: boolean;
  }>({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });

  const [bulkCostEmailDialog, setBulkCostEmailDialog] = useState<{
    step: 'rate' | 'recipients';
    open: boolean;
    usdRate: string;
    totalSdg: number;
    count: number;
    approvedSubmissions: OperationalCostSubmission[];
    availableRecipients: Array<{ id: string; email: string; name: string; role: string }>;
    selectedRecipientIds: string[];
    ccEmails: string[];
    loading: boolean;
    sending: boolean;
  }>({ step: 'rate', open: false, usdRate: '', totalSdg: 0, count: 0, approvedSubmissions: [], availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });

  const [editingSubmission, setEditingSubmission] = useState<OperationalCostSubmission | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OperationalCostSubmission | null>(null);
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState<{ groupId: string; items: OperationalCostSubmission[]; title: string } | null>(null);
  const [deleteRequestDialog, setDeleteRequestDialog] = useState<{ open: boolean; submission: OperationalCostSubmission | null; reason: string }>({ open: false, submission: null, reason: '' });
  const [deleteReviewDialog, setDeleteReviewDialog] = useState<{ open: boolean; submission: OperationalCostSubmission | null; notes: string; action: 'approve' | 'reject' }>({ open: false, submission: null, notes: '', action: 'approve' });
  const [transferToCDDialog, setTransferToCDDialog] = useState<{ open: boolean; submission: OperationalCostSubmission | null; note: string }>({ open: false, submission: null, note: '' });
  const [cdExceptionReviewDialog, setCDExceptionReviewDialog] = useState<{ open: boolean; submission: OperationalCostSubmission | null; note: string; action: 'approved' | 'rejected' }>({ open: false, submission: null, note: '', action: 'approved' });
  // Deletion audit log — what has actually been permanently deleted
  const [deletionLog, setDeletionLog] = useState<any[]>([]);
  const [restoreLogEntry, setRestoreLogEntry] = useState<any | null>(null);
  const [recallConfirm, setRecallConfirm] = useState<OperationalCostSubmission | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<OperationalCostSubmission | null>(null);
  const [revertPaidConfirm, setRevertPaidConfirm] = useState<OperationalCostSubmission | null>(null);
  const [groupRevertPaidItems, setGroupRevertPaidItems] = useState<OperationalCostSubmission[]>([]);
  const [groupRevertPaidTitle, setGroupRevertPaidTitle] = useState('');
  const [groupRevertTierConfirm, setGroupRevertTierConfirm] = useState<{ items: OperationalCostSubmission[]; tier: string; title: string } | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [markAsPaidDialog, setMarkAsPaidDialog] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    proofFiles: File[];
    proofPreviews: Array<{ url: string | null; name: string }>;
    notes: string;
    uploading: boolean;
    preFundId: string | null;
    preFunds: Array<{
      id: string;
      name: string;
      currency: string;
      available_balance: number;
    }>;
    preFundsLoading: boolean;
    preFundsError: string | null;
    payAmountStr: string;
    paymentEventKey?: string;
  }>({ open: false, submission: null, proofFiles: [], proofPreviews: [], notes: '', uploading: false, preFundId: null, preFunds: [], preFundsLoading: false, preFundsError: null, payAmountStr: '' });

  const [selectedCostIds, setSelectedCostIds] = useState<Set<string>>(new Set());
  const [batchCostPayDialog, setBatchCostPayDialog] = useState<{
    open: boolean;
    submissions: OperationalCostSubmission[];
    proofFiles: File[];
    proofPreviewUrls: string[];
    notes: string;
    uploading: boolean;
    preFundId: string | null;
    preFunds: Array<{ id: string; name: string; currency: string; available_balance: number }>;
    payMode: 'full' | 'percent' | 'custom';
    payPercent: string;
    customInputType: 'pct' | 'amount';
    payCustomAmountStr: string;
  }>({ open: false, submissions: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, preFundId: null, preFunds: [], payMode: 'full', payPercent: '100', customInputType: 'pct', payCustomAmountStr: '' });
  const [preFundCorrectionDialog, setPreFundCorrectionDialog] = useState<{
    open: boolean;
    evidence: PaymentEvidence | null;
    replacementFundId: string;
    reason: string;
    funds: Array<{ id: string; name: string; currency: string; available_balance: number }>;
    loadingFunds: boolean;
    saving: boolean;
  }>({ open: false, evidence: null, replacementFundId: '', reason: '', funds: [], loadingFunds: false, saving: false });

  const openPreFundCorrectionDialog = async (evidence: PaymentEvidence) => {
    if (!isFinanceAdmin || !evidence.isCorrectable) return;
    setPreFundCorrectionDialog({
      open: true, evidence, replacementFundId: '', reason: '', funds: [], loadingFunds: true, saving: false,
    });
    const { data, error } = await (supabase as any)
      .from('pre_fund_requests')
      .select('id, name, currency, available_balance')
      .eq('status', 'active')
      .order('name', { ascending: true });
    if (error) {
      toast({ title: 'Could not load Pre-Funds', description: error.message, variant: 'destructive' });
    }
    setPreFundCorrectionDialog(current => current.evidence?.paymentEventId === evidence.paymentEventId
      ? {
          ...current,
          funds: error ? [] : (data ?? []).map((fund: any) => ({
            id: fund.id,
            name: fund.name || fund.id,
            currency: fund.currency || evidence.currency || 'SDG',
            available_balance: Number(fund.available_balance ?? 0),
          })),
          loadingFunds: false,
        }
      : current);
  };

  const submitPreFundCorrection = async () => {
    const { evidence, replacementFundId, reason } = preFundCorrectionDialog;
    if (!evidence || !replacementFundId || !reason.trim()) return;
    setPreFundCorrectionDialog(current => ({ ...current, saving: true }));
    try {
      const { correctRequiredPreFundPaymentLink } = await import('@/utils/preFundLinkage');
      await correctRequiredPreFundPaymentLink({
        originalPaymentEventId: evidence.paymentEventId,
        replacementFundId,
        reason: reason.trim(),
      });
      toast({
        title: 'Pre-Fund corrected',
        description: 'The original payment remains in history as a reversal and a replacement payment was recorded.',
      });
      setPreFundCorrectionDialog({ open: false, evidence: null, replacementFundId: '', reason: '', funds: [], loadingFunds: false, saving: false });
      setCostPreFundEvidenceRefresh(version => version + 1);
      await fetchOperationalCosts();
    } catch (error: any) {
      toast({ title: 'Pre-Fund correction failed', description: error?.message ?? 'The payment link could not be corrected.', variant: 'destructive' });
      setPreFundCorrectionDialog(current => ({ ...current, saving: false }));
    }
  };

  // In-page attachment/receipt viewer — supports multi-receipt navigation
  const [attachViewer, setAttachViewer] = useState<{ open: boolean; urls: string[]; index: number; name: string }>({ open: false, urls: [], index: 0, name: '' });
  const openAttach = (urlOrUrls: string | string[], name: string, index = 0) => {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
    setAttachViewer({ open: true, urls, index: Math.max(0, Math.min(index, urls.length - 1)), name });
  };
  const closeAttach = () => setAttachViewer({ open: false, urls: [], index: 0, name: '' });
  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
  const isPdf   = (url: string) => /\.pdf(\?|$)/i.test(url);

  const [viewAdvanceDetails, setViewAdvanceDetails] = useState<OperationalCostSubmission | null>(null);
  // Tracks which groups are EXPANDED. Empty = all collapsed (default).
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const toggleGroup = (groupId: string) => setExpandedGroupIds(prev => {
    const next = new Set(prev);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return next;
  });
  const [costSearch, setCostSearch] = useState('');
  // Inverted logic: stores which categories are COLLAPSED. Empty set = all expanded.
  // This correctly handles any category key, including custom/unknown ones.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // In-card status chips: empty = show all; values are 'pending'|'approved'|'paid'|'rejected'
  const [ocStatusFilter, setOcStatusFilter] = useState<Set<string>>(new Set());
  // Approval flow expand/collapse — keyed by oc.id; empty = all collapsed (default)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => setExpandedCards(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const toggleFlow = (id: string) => setExpandedFlows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [showMyActionOnly, setShowMyActionOnly] = useState(false);
  const toggleOcStatus = (s: string) => setOcStatusFilter(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  // Advanced filters + sort
  const [ocDateFrom, setOcDateFrom] = useState('');
  const [ocDateTo, setOcDateTo] = useState('');
  const [ocAmtMin, setOcAmtMin] = useState('');
  const [ocAmtMax, setOcAmtMax] = useState('');
  const [ocSortBy, setOcSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [showSpendChart, setShowSpendChart] = useState(false);
  const [remindAllProcessing, setRemindAllProcessing] = useState(false);
  const [lastRemindedMap, setLastRemindedMap] = useState<Record<string, string>>({});
  const [auditDrawerItem, setAuditDrawerItem] = useState<OperationalCostSubmission | null>(null);
  const [savedFilters, setSavedFilters] = useState<Array<{ label: string; search: string; dateFrom: string; dateTo: string; amtMin: string; amtMax: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('oc_saved_filters') || '[]'); } catch { return []; }
  });
  const toggleCategory = (cat: string) => setCollapsedCategories(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });
  const [editingItem, setEditingItem] = useState<OperationalCostSubmission | null>(null);
  const [editItemFields, setEditItemFields] = useState({ expense_category: '', amount_str: '', description: '', expense_date: '', vendor: '', reference_number: '', reason: '' });
  const [itemEditSubmitting, setItemEditSubmitting] = useState(false);
  const [sendBackDialog, setSendBackDialog] = useState<{ open: boolean; item: OperationalCostSubmission | null }>({ open: false, item: null });
  const [sendBackComment, setSendBackComment] = useState('');
  const [sendBackSubmitting, setSendBackSubmitting] = useState(false);
  const [reminderPreviewDialog, setReminderPreviewDialog] = useState<{
    open: boolean;
    stepLabel: string;
    recipients: Array<{ id: string; name?: string; email?: string; role?: string }>;
    refNum: string;
    description: string;
    amtStr: string;
    submitterName: string;
    ocId: string;
    tab: 'notification' | 'email' | 'whatsapp';
  } | null>(null);
  const [reminderSending, setReminderSending] = useState(false);
  const [activeReconciliation, setActiveReconciliation] = useState<OperationalCostSubmission | null>(null);
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [reconcileActualAmount, setReconcileActualAmount] = useState('');
  const [reconcileProcessing, setReconcileProcessing] = useState(false);
  const [reconcileReceipts, setReconcileReceipts] = useState<SupportingDocument[]>([]);
  const [reconcileReceiptAmounts, setReconcileReceiptAmounts] = useState<Record<string, string>>({});
  const [signatureImages, setSignatureImages] = useState<Record<string, string | null>>({});
  const sigCacheRef = useRef<Record<string, boolean>>({});

  const fetchSignatureForSubmission = useCallback(async (oc: OperationalCostSubmission) => {
    if (!oc.tier2_notes?.includes('[Signed:')) return;
    if (sigCacheRef.current[oc.id]) return;
    sigCacheRef.current[oc.id] = true;

    let sigImage: string | null = null;
    let signerUserId: string | null = null;

    const sigMatch = oc.tier2_notes.match(/ID:\s*(\S+?)(?:\s*\||$)/);
    if (sigMatch?.[1]) {
      try {
        const { data: sigRow } = await supabase
          .from('document_signatures')
          .select('signature_data, signer_id')
          .eq('id', sigMatch[1])
          .single();
        if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) {
          sigImage = sigRow.signature_data;
        }
        if (sigRow?.signer_id) {
          signerUserId = sigRow.signer_id;
        }
      } catch { /* continue */ }
    }

    const lookupUserId = signerUserId || oc.tier2_approved_by;
    if (!sigImage && lookupUserId) {
      try {
        const { data: savedSigs } = await supabase
          .from('handwriting_signatures')
          .select('signature_image')
          .eq('user_id', lookupUserId)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
          sigImage = savedSigs[0].signature_image;
        }
      } catch { /* continue */ }
    }

    setSignatureImages(prev => ({ ...prev, [oc.id]: sigImage }));
  }, []);

  useEffect(() => {
    if (viewAdvanceDetails && viewAdvanceDetails.tier2_notes?.includes('[Signed:')) {
      fetchSignatureForSubmission(viewAdvanceDetails);
    }
  }, [viewAdvanceDetails, fetchSignatureForSubmission]);

  // Batch-load ALL signatures in 2 queries instead of 2-per-submission N+1 queries
  useEffect(() => {
    const signedOps = operationalCosts.filter(oc =>
      oc.tier2_notes?.includes('[Signed:') && !sigCacheRef.current[oc.id]
    );
    if (signedOps.length === 0) return;

    // Mark all as being fetched so re-renders don't double-fire
    signedOps.forEach(oc => { sigCacheRef.current[oc.id] = true; });

    const run = async () => {
      // Extract document_signature IDs from notes
      const sigIdMap = new Map<string, string>(); // sigId → oc.id
      const fallbackUserMap = new Map<string, string>(); // userId → oc.id (for handwriting fallback)

      for (const oc of signedOps) {
        const match = oc.tier2_notes?.match(/ID:\s*(\S+?)(?:\s*\||$)/);
        if (match?.[1]) sigIdMap.set(match[1], oc.id);
        else if (oc.tier2_approved_by) fallbackUserMap.set(oc.tier2_approved_by, oc.id);
      }

      const newImages: Record<string, string | null> = {};
      signedOps.forEach(oc => { newImages[oc.id] = null; });

      // 1 query: fetch all document_signatures by ID
      if (sigIdMap.size > 0) {
        try {
          const { data: rows } = await supabase
            .from('document_signatures')
            .select('id, signature_data, signer_id')
            .in('id', Array.from(sigIdMap.keys()));
          for (const row of rows || []) {
            const ocId = sigIdMap.get(row.id);
            if (!ocId) continue;
            if (row.signature_data?.startsWith?.('data:')) {
              newImages[ocId] = row.signature_data;
            } else if (row.signer_id) {
              // Need handwriting fallback — track the user
              fallbackUserMap.set(row.signer_id, ocId);
            }
          }
        } catch { /* continue */ }
      }

      // 1 query: fetch handwriting signatures for all users that still need one
      const needFallback = Array.from(fallbackUserMap.keys()).filter(uid => {
        const ocId = fallbackUserMap.get(uid)!;
        return !newImages[ocId]; // only if doc_sig didn't resolve it
      });
      if (needFallback.length > 0) {
        try {
          const { data: hwRows } = await supabase
            .from('handwriting_signatures')
            .select('user_id, signature_image')
            .in('user_id', needFallback)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });
          const seen = new Set<string>();
          for (const row of hwRows || []) {
            if (seen.has(row.user_id)) continue; // keep first (default) per user
            seen.add(row.user_id);
            const ocId = fallbackUserMap.get(row.user_id);
            if (ocId && row.signature_image?.startsWith?.('data:')) {
              newImages[ocId] = row.signature_image;
            }
          }
        } catch { /* continue */ }
      }

      setSignatureImages(prev => ({ ...prev, ...newImages }));
    };

    run();
  }, [operationalCosts]);

  // Clear cost search and in-card status chips whenever the global status
  // filter tab changes so stale filters don't hide results in a new bucket
  useEffect(() => {
    setCostSearch('');
    setOcStatusFilter(new Set());
  }, [statusFilter]);

  // Conditionally fetch based on role to prevent unnecessary API calls and data exposure
  // - Admins/Supervisors: Fetch all submissions (enabled), skip user-specific query (empty userId)
  // - Data collectors: Skip all submissions query (disabled), fetch only their submissions
  // Note: RLS policies at database level provide additional security layer
  const allSubmissionsQuery = useCostSubmissions(canViewTeamSubmissions);
  const userSubmissionsQuery = useUserCostSubmissions(canViewTeamSubmissions ? '' : (currentUser?.id || ''));
  
  // Get team members for hub supervisors to filter submissions
  const getTeamMemberIds = (): string[] => {
    if (isAdmin) return []; // Admins see all, no filtering needed
    if (isSupervisor && currentUser) {
      const hubAccessInfo = getHubAccessInfo(currentUser as any);
      if (hubAccessInfo.isHubSupervisor && hubAccessInfo.hubIds.length > 0) {
        const normalizedHubIds = hubAccessInfo.hubIds;
        return users
          .filter(u => {
            if (u.id === currentUser.id) return false;
            // Match by hub_id (normalized)
            const uHubNorm = normalizeHubId(u.hubId);
            if (uHubNorm && normalizedHubIds.includes(uHubNorm)) return true;
            // Match by state (state-based is reliable when hub_id not set/normalised)
            const uState = u.stateId || (u as any).state;
            if (uState && isStateInAnyHub(uState, normalizedHubIds)) return true;
            return false;
          })
          .map(u => u.id);
      }
      // Fallback: match by state only
      if (currentUser.stateId) {
        return users
          .filter(u => u.stateId === currentUser.stateId && u.id !== currentUser.id)
          .map(u => u.id);
      }
    }
    return [];
  };
  
  const teamMemberIds = getTeamMemberIds();
  
  // Filter submissions for supervisors to show only their team's submissions.
  // FOM and CountryDirector bypass this filter — their visibility scope covers
  // all hubs/states and is handled by the role-specific filter in filteredOperationalCosts.
  // A FOM who also holds a Supervisor role must NOT be pre-filtered by the supervisor's
  // hub/state team list, or they would silently lose cross-state submissions.
  const filterSubmissionsForSupervisor = (allSubs: typeof allSubmissionsQuery.submissions) => {
    if (isAdmin || isSuperAdmin || isAdminOrSuperUser) return allSubs;
    if (isFOM || isCountryDirector) return allSubs; // approval-chain roles: no pre-filter
    if (isSupervisor && teamMemberIds.length > 0) {
      return allSubs?.filter(s => teamMemberIds.includes(s.submittedBy)) || [];
    }
    return allSubs || [];
  };
  
  const { submissions: rawSubmissions, isLoading } = canViewTeamSubmissions ? 
    { submissions: allSubmissionsQuery.submissions || [], isLoading: allSubmissionsQuery.isLoading } :
    { submissions: userSubmissionsQuery.submissions || [], isLoading: userSubmissionsQuery.isLoading };
  
  // Apply supervisor filtering
  const supervisorFilteredSubmissions = canViewTeamSubmissions 
    ? filterSubmissionsForSupervisor(rawSubmissions)
    : rawSubmissions;

  // PROJECT TEAM MEMBERSHIP FILTER
  // Filter submissions to only show those from projects the user belongs to.
  // Approval-chain roles (FOM, Supervisor, CountryDirector, FinanceAdmin) bypass this filter
  // because their visibility is governed by the role-based filter in filteredOperationalCosts,
  // not by project membership. Only lower-tier submitters (Coordinators, DataCollectors) need
  // the project-scoping restriction.
  const submissions = useMemo(() => {
    if (isAdminOrSuperUser || isSuperAdmin) return supervisorFilteredSubmissions;
    if (isFOM || isSupervisor || isCountryDirector || isFinanceAdmin) return supervisorFilteredSubmissions;
    if (userProjectIds.length === 0) return []; // No project memberships = no data
    return supervisorFilteredSubmissions.filter(s => 
      !s.projectId || userProjectIds.includes(s.projectId)
    );
  }, [supervisorFilteredSubmissions, userProjectIds, isAdminOrSuperUser, isSuperAdmin, isFOM, isSupervisor, isCountryDirector, isFinanceAdmin]);

  /**
   * Returns true if the given hub has at least one active supervisor assigned
   * (either as their primary role or via additionalRoles).
   * Used so FOM can act as T1 for coordinator submissions from unsupervised hubs.
   */
  const hubHasSupervisor = useCallback((hubId: string | null | undefined): boolean => {
    if (!hubId) return false;
    const normHub = normalizeHubId(hubId);
    return users.some(u => {
      const role = (u.role || '').toLowerCase().replace(/[\s_-]/g, '');
      const isPrimary = role === 'supervisor' || role === 'hubsupervisor';
      if (isPrimary) {
        const uNorm = normalizeHubId((u as any).hubId);
        if (uNorm && normHub && uNorm === normHub) return true;
      }
      const addRoles = Array.isArray((u as any).additionalRoles) ? (u as any).additionalRoles : [];
      return addRoles.some((r: any) => {
        const rNorm = (r?.role || '').toLowerCase().replace(/[\s_-]/g, '');
        const isSupRole = rNorm === 'supervisor' || rNorm === 'hubsupervisor';
        if (!isSupRole) return false;
        const rHub = normalizeHubId(r?.hub_id);
        return rHub && normHub && rHub === normHub;
      });
    });
  }, [users]);

  /**
   * Resolve the request's effective hub from the stored request value first,
   * then the submitter's hub or state. Older requests can hold labels such as
   * "PACT Central Darfur" instead of the canonical forchana-hub ID.
   */
  const getEffectiveSubmissionHubId = useCallback((submission: OperationalCostSubmission): string | null => {
    const submitter = users.find(user => user.id === submission.submitted_by);
    const candidates = [
      submission.hub_id,
      (submission as any).hubId,
      submitter?.hubId,
      submitter?.stateId,
      (submitter as any)?.state,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeHubId(candidate);
      if (normalized) return normalized;
    }
    return null;
  }, [users]);

  const filteredOperationalCosts = useMemo(() => {
    let filtered = operationalCosts;
    // Admins and Super Admins see everything unfiltered
    if (!isAdminOrSuperUser && !isSuperAdmin) {
      if (isCountryDirector) {
        // Country Directors only see submissions where they have an approval role,
        // and only AFTER the preceding tier has approved (FOM must act first).
        //
        // Approval chain position for CD:
        //   • FOM submissions       → CD is T1 (first approver) — visible immediately
        //   • Supervisor submissions → CD is T2 — visible only after FOM (T1) approves
        //   • Coordinator submissions → CD is T3 — visible only after FOM (T2) approves
        //   • Own submissions / already actioned — always visible (read-only status)
        //   • Any other type (e.g., CD or Admin submissions) — NOT visible
        filtered = filtered.filter(o => {
          if (o.submitted_by === currentUser?.id) return true;
          // Already actioned by this CD (approved or rejected at any tier)
          if (o.tier1_approved_by === currentUser?.id) return true;
          if (o.tier2_approved_by === currentUser?.id) return true;
          if (o.tier3_approved_by === currentUser?.id) return true;
          const submitterRole = (o.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
          const isFomSub = submitterRole === 'fom' || submitterRole.includes('fieldoperationmanager');
          const isSupervisorSub = submitterRole.includes('supervisor') || submitterRole.includes('hubsupervisor');
          const isCoordSub = submitterRole.includes('coordinator') || submitterRole.includes('enumerator')
            || submitterRole.includes('datacollector') || submitterRole.includes('fieldstaff')
            || submitterRole.includes('fieldworker') || submitterRole.includes('fieldagent');
          // FOM submission: CD is T1 — visible immediately (regardless of status)
          if (isFomSub) return true;
          // Supervisor submission: CD is T2 — visible only AFTER FOM (T1) has approved
          if (isSupervisorSub) return o.tier1_status === 'approved';
          // Coordinator submission: CD is T3 — visible only AFTER FOM (T2) has approved
          if (isCoordSub) return o.tier2_status === 'approved';
          // CD's own submissions and anything else they have no role in: hidden
          return false;
        });
        // Project scoping: hide submissions for projects the CD is not a member of
        if (userProjectIds.length > 0) {
          filtered = filtered.filter(o => !o.project_id || userProjectIds.includes(o.project_id));
        }
      } else if (isFOM) {
        // If this FOM is hub-scoped via additional supervisor roles, restrict to those hubs only.
        // An unrestricted FOM (no additional supervisor roles) sees all supervisor/coordinator submissions.
        const fomAdditionalHubIds = getAdditionalSupervisorHubIds(currentUser as any);
        const isScopedFOM = fomAdditionalHubIds.length > 0;

        // FOM sees only submissions in their approval chain:
        //   • Their own submissions (any status)
        //   • Supervisor submissions (FOM is T1 approver in 3-tier flow)
        //     → hub-scoped to assigned supervisor hub(s) if FOM has additional roles
        //   • Coordinator/DataCollector submissions (FOM is T2 approver in 4-tier flow)
        //     → ALWAYS visible regardless of hub (FOM-level responsibility, not supervisor-level)
        //   • Any submission FOM has already actioned (T1 or T2 approved_by)
        filtered = filtered.filter(o => {
          if (o.submitted_by === currentUser?.id) return true;
          const submitterRole = (o.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
          const isSupervisorSub = submitterRole.includes('supervisor') || submitterRole.includes('hubsupervisor');
          const isCoordSub = submitterRole.includes('coordinator') || submitterRole.includes('enumerator')
            || submitterRole.includes('datacollector') || submitterRole.includes('fieldstaff')
            || submitterRole.includes('fieldworker') || submitterRole.includes('fieldagent');
          if (isSupervisorSub) {
            // FOM is T1 for ALL supervisor submissions regardless of hub assignment.
            // (The isScopedFOM concept was incorrectly restricting this — removed.)
            return true;
          }
          if (isCoordSub) {
            // Resolve the coordinator's effective hub
            const submitterUser = users.find(u => u.id === o.submitted_by);
            const effectiveHubId = o.hub_id || (submitterUser as any)?.hubId || null;

            // If the coordinator's hub has NO supervisor assigned, FOM acts as T1
            // directly (there is nobody else to do the first approval).
            if (!hubHasSupervisor(effectiveHubId)) return true;

            // FOM who also holds a Supervisor role for a hub sees coordinator submissions
            // from that hub at T1 (before Supervisor approval) so they can act as T1.
            if (isSupervisor && fomAdditionalHubIds.length > 0) {
              const submissionHub = effectiveHubId ? (normalizeHubId(effectiveHubId) || effectiveHubId) : null;
              const inSupervisedHub = submissionHub
                ? fomAdditionalHubIds.some(h => (normalizeHubId(h) || h) === submissionHub)
                : teamMemberIds.includes(o.submitted_by);
              if (inSupervisedHub) return true;
            }
            // Standard case: FOM is T2 — visible AFTER Supervisor (T1) approves, or already actioned.
            return o.tier1_status === 'approved' || o.tier2_approved_by === currentUser?.id;
          }
          // Fallback: any submission this FOM has already actioned at any tier
          if (o.tier1_approved_by === currentUser?.id) return true;
          if (o.tier2_approved_by === currentUser?.id) return true;
          return false;
        });
      } else if (isSupervisor) {
        // Build the full set of hub IDs this supervisor is responsible for
        // (primary hub + secondary hub from profile + any additional_roles hub assignments).
        const supervisorHubAccess = getHubAccessInfo(currentUser as any);
        const myHubIds = supervisorHubAccess.hubIds; // normalized list

        filtered = filtered.filter(o => {
          if (o.submitted_by === currentUser?.id) return true;
          // Already actioned by this Supervisor (T1 approved or rejected)
          if (o.tier1_approved_by === currentUser?.id) return true;
          const submitterRole = (o.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
          // Never show other Supervisors' submissions — each Supervisor only sees their own hub's Coordinators
          const isOtherSupervisorSub = submitterRole.includes('supervisor') || submitterRole.includes('hubsupervisor');
          if (isOtherSupervisorSub) return false;
          // Coordinator/DataCollector submissions: match against ALL supervised hubs
          const isCoordEnumSub = submitterRole.includes('coordinator') || submitterRole.includes('enumerator')
            || submitterRole.includes('datacollector') || submitterRole.includes('fieldstaff')
            || submitterRole.includes('fieldworker') || submitterRole.includes('fieldagent');
          if (isCoordEnumSub) {
            if (myHubIds.length === 0) return false; // Supervisor with no hub assigned cannot see coordinator submissions
            const submissionHubId = getEffectiveSubmissionHubId(o);
            if (submissionHubId) return myHubIds.includes(submissionHubId);
            return teamMemberIds.includes(o.submitted_by); // Legacy fallback when no hub/state is available
          }
          return false;
        });
      } else if (!canViewTeamSubmissions) {
        filtered = filtered.filter(o => o.submitted_by === currentUser?.id);
      }
      // Project scoping: only restrict submitter-level roles (Coordinators, DataCollectors).
      // Approval-chain roles (FOM, Supervisor, CountryDirector, FinanceAdmin) must NOT be
      // project-scoped here — their visibility is already governed by the role filter above
      // and covers team submissions across all projects they oversee.
      if (userProjectIds.length > 0 && !isFOM && !isSupervisor && !isCountryDirector && !isFinanceAdmin) {
        filtered = filtered.filter(o => !o.project_id || userProjectIds.includes(o.project_id));
      }
    }
     // Cycle-close context: narrow to only this MMP's submissions
     if (cycleContextMmpId) {
       filtered = filtered.filter(o => o.mmp_file_id === cycleContextMmpId || (o as any).mmpFileId === cycleContextMmpId);
     }
     // Manual MMP filter
     if (mmpFilter !== 'all') {
       filtered = filtered.filter(o => o.mmp_file_id === mmpFilter);
     }
     // Submitter (user) filter
     if (userFilter !== 'all') {
       filtered = filtered.filter(o => o.submitted_by === userFilter);
     }
     // State filter — match via the submitter's stateId in the users array
     if (stateFilter !== 'all') {
       filtered = filtered.filter(o => {
         const u = users.find(u => u.id === o.submitted_by);
         return (u?.stateId || (u as any)?.state) === stateFilter;
       });
     }
     // Approval-tier filter (Super Admin only) — keep submissions currently awaiting that tier
     if (tierFilter !== 'all') {
       filtered = filtered.filter(o => {
         const t1 = (o.tier1_status || '').toLowerCase();
         const t2 = (o.tier2_status || '').toLowerCase();
         const t3 = (o.tier3_status || '').toLowerCase();
         const t4 = (o.tier4_status || '').toLowerCase();
         const pending = (s: string) => !s || s === 'pending';
         const approved = (s: string) => s === 'approved';
         if (tierFilter === 't1') return pending(t1);
         if (tierFilter === 't2') return approved(t1) && pending(t2);
         if (tierFilter === 't3') return approved(t2) && pending(t3);
         if (tierFilter === 't4') return approved(t3) && pending(t4);
         return true;
       });
     }
    return filtered;
  }, [operationalCosts, isAdminOrSuperUser, isSuperAdmin, isFOM, isCountryDirector, isSupervisor, teamMemberIds, canViewTeamSubmissions, currentUser?.id, userProjectIds, cycleContextMmpId, mmpFilter, userFilter, stateFilter, tierFilter, users, getEffectiveSubmissionHubId]);

  const isCoordinatorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
    // Coordinator-level roles: coordinator, enumerator, data collector, field staff, field worker
    return role.includes('coordinator')
      || role.includes('enumerator')
      || role.includes('datacollector')
      || role.includes('fieldstaff')
      || role.includes('fieldworker')
      || role.includes('fieldagent');
  };

  const isSupervisorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase();
    return role.includes('supervisor') || role.includes('hubsupervisor');
  };

  // FOM submissions: 2-tier — T1=Country Director, T2=Admin/SuperAdmin
  // Role can be stored as 'fom', 'fieldoperationmanager', or 'Field Operation Manager (FOM)'
  const isFomSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
    return role === 'fom' || role.includes('fieldoperationmanager');
  };

  // Country Director submissions: single-tier — T1=Admin/SuperAdmin only
  const isCDSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
    return role === 'countrydirector' || role === 'country_director';
  };

  // Supervisor submissions: 3-tier — T1=FOM, T2=Country Director, T3=Admin/SuperAdmin
  // FOM and CD submissions must never be treated as 3-tier even if tier3_status was set accidentally.
  const hasThreeTiers = (oc: OperationalCostSubmission): boolean => {
    if (isFomSubmission(oc) || isCDSubmission(oc)) return false;
    return isSupervisorSubmission(oc);
  };

  // Coordinator submissions: 4-tier — T1=Supervisor, T2=FOM, T3=Country Director, T4=Admin/SuperAdmin
  // FOM and CD submissions must never be treated as 4-tier even if tier4_status was set accidentally.
  // NOTE: Do NOT use oc.tier4_status != null as a signal — the 20260607 migration set DEFAULT 'pending'
  // on all existing rows, so Supervisor and FOM submissions also have tier4_status='pending'.
  // Always use submitter_role for tier classification.
  const hasFourTiers = (oc: OperationalCostSubmission): boolean => {
    if (isFomSubmission(oc) || isCDSubmission(oc)) return false;
    return isCoordinatorSubmission(oc);
  };

  const getOperationalDerivedStatus = (oc: OperationalCostSubmission): string => {
    if (oc.status === 'reconciled') return 'reconciled';
    if (oc.status === 'paid') return 'paid';
    if (oc.status === 'partially_paid') return 'partially_paid';
    // Derive partial payment from amount fields (DB constraint may not allow 'partially_paid' status)
    if ((oc.amount_paid_cents ?? 0) > 0 && (oc.amount_paid_cents ?? 0) < oc.amount_cents) return 'partially_paid';
    // If proof uploaded AND amount_paid_cents covers the full cost, treat as paid.
    // Handles edge-cases where the Mark Paid flow saved proof but failed to set status='paid'.
    if (oc.status === 'approved' && oc.payment_proof_url &&
        (oc.amount_paid_cents ?? 0) > 0 &&
        (oc.amount_cents ?? 0) > 0 &&
        (oc.amount_paid_cents ?? 0) >= (oc.amount_cents ?? 0)) return 'paid';
    if (oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.tier3_status === 'rejected' || oc.tier4_status === 'rejected' || oc.status === 'rejected') return 'rejected';
    if (oc.status === 'approved') return 'approved';

    // Country Director submission: single-tier — T1=Admin is final
    if (isCDSubmission(oc)) {
      if (oc.tier1_status === 'approved') return 'approved';
      return 'pending';
    }
    // FOM submission: 2-tier — T1=CD, T2=Admin
    if (isFomSubmission(oc)) {
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved') return 'approved';
      if (oc.tier1_status === 'approved') return 'under_review';
      return 'pending';
    }
    // Coordinator submission: 4-tier
    if (hasFourTiers(oc)) {
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && oc.tier3_status === 'approved' && oc.tier4_status === 'approved') return 'approved';
      if (oc.tier1_status === 'approved') return 'under_review';
      return 'pending';
    }
    // Supervisor submission: 3-tier
    if (hasThreeTiers(oc)) {
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && oc.tier3_status === 'approved') return 'approved';
      if (oc.tier1_status === 'approved') return 'under_review';
      return 'pending';
    }
    // Fallback: 2-tier
    if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved') return 'approved';
    if (oc.tier1_status === 'approved') return 'under_review';
    if (oc.status === 'under_review') return 'under_review';
    return 'pending';
  };

  const canTier1Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'pending') return false;
    if (oc.submitted_by === currentUser?.id) return false;   // never approve own request
    if (isSuperAdmin || isAdmin) return true;
    // Coordinator: T1 = Hub Supervisor (or FOM when the hub has no supervisor).
    if (hasFourTiers(oc)) {
      // Resolve effective hub (submission hub_id, or fall back to submitter's hubId)
      const effectiveHubId = getEffectiveSubmissionHubId(oc);

      // If this hub has NO supervisor at all, FOM steps in as T1 approver.
      if (isFOM && !hubHasSupervisor(effectiveHubId)) return true;

      // Primary-role Supervisor: approve submissions from any of their supervised hubs
      // (primary hub + secondary hub from profile + additional_roles hub assignments).
      if (isPrimaryRoleSupervisor) {
        const supervisorHubAccess = getHubAccessInfo(currentUser as any);
        const myHubIds = supervisorHubAccess.hubIds;
        if (myHubIds.length === 0) return false;
        if (!effectiveHubId) return teamMemberIds.includes(oc.submitted_by);
        return myHubIds.includes(effectiveHubId);
      }
      // FOM who also holds a Supervisor role via additional_roles — hub-scoped T1 approval.
      if (isFOM && isSupervisor) {
        const supervisedHubIds = getAdditionalSupervisorHubIds(currentUser as any);
        if (supervisedHubIds.length === 0) return false;
        if (!effectiveHubId) return teamMemberIds.includes(oc.submitted_by);
        return supervisedHubIds.some(h => normalizeHubId(h) === effectiveHubId);
      }
      return false;
    }
    // Supervisor: T1 = FOM — unrestricted; FOM approves ALL supervisor submissions.
    if (hasThreeTiers(oc)) {
      return isFOM;
    }
    // FOM submission: T1 = Country Director
    if (isFomSubmission(oc)) return isCountryDirector;
    // Country Director submission: T1 = Admin/SuperAdmin (handled above)
    return false;
  };

  const canTier2Approve = (oc: OperationalCostSubmission): boolean => {
    // CD submissions are single-tier — no T2
    if (isCDSubmission(oc)) return false;
    if (oc.tier1_status !== 'approved' || oc.tier2_status !== 'pending') return false;
    if (oc.submitted_by === currentUser?.id) return false;   // never approve own request
    if (isSuperAdmin || isAdmin) return true;
    // Coordinator: T2 = FOM
    if (hasFourTiers(oc)) return isFOM;
    // Supervisor: T2 = Country Director
    if (hasThreeTiers(oc)) return isCountryDirector;
    // FOM submission: T2 = Admin/SuperAdmin (handled by isSuperAdmin || isAdmin above)
    return false;
  };

  const canTier3Approve = (oc: OperationalCostSubmission): boolean => {
    const hasT3 = hasThreeTiers(oc) || hasFourTiers(oc);
    if (!hasT3) return false;
    if (oc.tier2_status !== 'approved') return false;
    if (oc.tier3_status !== 'pending' && oc.tier3_status !== null) return false;
    if (oc.submitted_by === currentUser?.id) return false;   // never approve own request
    if (isSuperAdmin || isAdmin) return true;
    // Coordinator: T3 = Country Director
    if (hasFourTiers(oc)) return isCountryDirector;
    // Supervisor: T3 = Admin/SuperAdmin (handled above)
    return false;
  };

  const canTier4Approve = (oc: OperationalCostSubmission): boolean => {
    if (!hasFourTiers(oc)) return false;
    if (oc.tier3_status !== 'approved') return false;
    if (oc.tier4_status !== 'pending' && oc.tier4_status !== null) return false;
    if (oc.submitted_by === currentUser?.id) return false;   // never approve own request
    if (isSuperAdmin) return true;
    return isAdmin;
  };

  const openApprovalDialog = (oc: OperationalCostSubmission, action: 'approve' | 'reject', tier: 1 | 2 | 3 | 4) => {
    setApprovalDialog({ open: true, action, tier, submission: oc });
    setApprovalNotes('');
    setApprovalReason('');
  };

  const openGroupApprovalDialog = (
    groupId: string,
    groupTitle: string,
    submissions: OperationalCostSubmission[],
    action: 'approve' | 'reject',
    tier: 1 | 2 | 3 | 4
  ) => {
    setGroupApprovalDialog({ open: true, action, tier, groupId, groupTitle, submissions });
    setGroupApprovalNotes('');
    setGroupApprovalReason('');
  };

  const uploadApprovalFiles = async (files: File[], prefix: string): Promise<Array<{ url: string; filename: string }>> => {
    const uploaded: Array<{ url: string; filename: string }> = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'bin';
      const filePath = `approval-attachments/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('mmp-files').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (!error) {
        const url = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
        uploaded.push({ url, filename: file.name });
      }
    }
    return uploaded;
  };

  const handleGroupApproval = async () => {
    const { action, tier, groupId, groupTitle, submissions } = groupApprovalDialog;
    if (!submissions.length || !currentUser?.id || !groupId) return;
    setGroupApprovalProcessing(true);
    try {
      const now = new Date().toISOString();

      /* upload any approval attachments first */
      const newDocs = groupApprovalAttachments.length > 0
        ? await uploadApprovalFiles(groupApprovalAttachments, `group-${groupId.slice(0, 8)}`)
        : [];

      const updates: Record<string, any> = {};

      const combinedReason = [groupApprovalReason ? `Reason: ${groupApprovalReason}` : '', groupApprovalNotes].filter(Boolean).join(' | ');
      if (tier === 1) {
        updates.tier1_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier1_approved_by = currentUser.id;
        updates.tier1_approved_at = now;
        updates.tier1_notes = combinedReason || null;
        // CD submissions are single-tier — T1 approval is final
        const allCDSubs = submissions.every(s => isCDSubmission(s));
        updates.status = action === 'approve' ? (allCDSubs ? 'approved' : 'under_review') : 'rejected';
        if (action === 'reject') updates.rejection_reason = combinedReason || 'Rejected at Tier 1';
      } else if (tier === 2) {
        updates.tier2_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier2_approved_by = currentUser.id;
        updates.tier2_approved_at = now;
        updates.tier2_notes = combinedReason || null;
        // T2 is final only for FOM submissions (2-tier); supervisor & coordinator still have more tiers
        const isFinal = !submissions.some(s => hasThreeTiers(s) || hasFourTiers(s));
        updates.status = action === 'approve' ? (isFinal ? 'approved' : 'under_review') : 'rejected';
        if (action === 'reject') updates.rejection_reason = combinedReason || 'Rejected at Tier 2';
        else if (action === 'approve' && !isFinal) { updates.tier3_status = 'pending'; }
      } else if (tier === 3) {
        updates.tier3_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier3_approved_by = currentUser.id;
        updates.tier3_approved_at = now;
        updates.tier3_notes = combinedReason || null;
        if (action === 'reject') {
          updates.status = 'rejected';
          updates.rejection_reason = combinedReason || 'Rejected at Tier 3';
        } else {
          // T3 is final for supervisor (3-tier); coordinator still has T4=Admin ahead
          const hasT4 = submissions.some(s => hasFourTiers(s));
          if (hasT4) {
            updates.status = 'under_review';
            updates.tier4_status = 'pending';
          } else {
            updates.status = 'approved';
          }
        }
      } else if (tier === 4) {
        updates.tier4_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier4_approved_by = currentUser.id;
        updates.tier4_approved_at = now;
        updates.tier4_notes = combinedReason || null;
        updates.status = action === 'approve' ? 'approved' : 'rejected';
        if (action === 'reject') updates.rejection_reason = combinedReason || 'Rejected at Tier 4';
      }

      const tierStatusKey = `tier${tier}_status` as const;
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('request_group_id', groupId)
        .eq(tierStatusKey, 'pending')
        .neq('submitted_by', currentUser.id);  // never approve own submissions, even in a batch

      /* append new docs to each submission's supporting_documents */
      if (!error && newDocs.length > 0) {
        await Promise.all(submissions.map(async s => {
          const existing = Array.isArray(s.supporting_documents) ? s.supporting_documents : [];
          await supabase
            .from('operational_cost_submissions')
            .update({ supporting_documents: [...existing, ...newDocs] })
            .eq('id', s.id);
        }));
      }

      if (error) {
        toast({ title: 'Group Approval Failed', description: error.message, variant: 'destructive', duration: 8000 });
      } else {
        const count = submissions.length;
        toast({
          title: action === 'approve'
            ? `Group Approved (${count} items) / تمت الموافقة على المجموعة`
            : `Group Rejected (${count} items) / تم رفض المجموعة`,
          description: action === 'approve'
            ? `All ${count} expense items have been approved at Tier ${tier}.${newDocs.length > 0 ? ` ${newDocs.length} attachment(s) added.` : ''}`
            : `All ${count} expense items have been rejected.${newDocs.length > 0 ? ` ${newDocs.length} attachment(s) added.` : ''}`,
          duration: 6000,
        });

        // 3️⃣ Group approval notifications — notify submitter(s) + next-tier approvers
        {
          const approverName = (currentUser as any)?.name || (currentUser as any)?.fullName || 'Reviewer';
          const tierArMapG: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
          const repSub = submissions[0];
          const repRef = groupTitle || repSub?.reference_number || repSub?.id?.slice(0, 8)?.toUpperCase() || groupId.slice(0, 8).toUpperCase();
          const totalAmtG = submissions.reduce((s, x) => s + (x.amount_cents || 0), 0);
          const amtStrG = `${repSub?.currency || 'SDG'} ${(totalAmtG / 100).toLocaleString()}`;
          // isFinalTier check: all submissions in group share the same role → use first as representative
          const isFinalG = isFinalTier(repSub, tier);

          // Notify all distinct submitters
          const distinctSubmitters = [...new Set(submissions.map(s => s.submitted_by).filter(Boolean))];
          distinctSubmitters.forEach(uid => {
            dispatchNotification({
              event: action === 'approve' ? 'cost_approved' : 'cost_rejected',
              recipientIds: [uid],
              titleEn: action === 'approve'
                ? isFinalG ? `Group Request Fully Approved ✅ — ${count} items` : `Group Request: Tier ${tier} Approved — Advancing`
                : `Group Request Rejected at Tier ${tier}`,
              titleAr: action === 'approve'
                ? isFinalG ? `تمت الموافقة الكاملة على الطلب الجماعي` : `تمت الموافقة على المرحلة ${tierArMapG[tier]}`
                : `تم رفض الطلب الجماعي في المرحلة ${tierArMapG[tier]}`,
              messageEn: action === 'approve'
                ? isFinalG
                  ? `Your group request "${repRef}" (${amtStrG}, ${count} items) has been fully approved by ${approverName} and cleared for payment.`
                  : `Your group request "${repRef}" (${amtStrG}, ${count} items) passed Tier ${tier} review by ${approverName}. Forwarded to Tier ${tier + 1}.`
                : `Your group request "${repRef}" (${amtStrG}, ${count} items) was rejected at Tier ${tier} by ${approverName}. Reason: ${combinedReason || 'Not specified'}. Please edit and resubmit.`,
              messageAr: action === 'approve'
                ? isFinalG
                  ? `تمت الموافقة الكاملة على طلبك الجماعي "${repRef}" (${amtStrG}، ${count} بنود) من قِبل ${approverName} وتم تصفيته للدفع.`
                  : `طلبك الجماعي "${repRef}" (${amtStrG}، ${count} بنود) اجتاز مراجعة المرحلة ${tierArMapG[tier]} من قِبل ${approverName}. تم إحالته إلى المرحلة ${tier + 1}.`
                : `تم رفض طلبك الجماعي "${repRef}" (${amtStrG}، ${count} بنود) في المرحلة ${tierArMapG[tier]} من قِبل ${approverName}. السبب: ${combinedReason || 'غير محدد'}. يرجى التعديل وإعادة التقديم.`,
              priority: 'high',
              entityType: 'costSubmission',
              entityId: repSub?.id,
              actionUrl: '/cost-submission',
              sendEmail: true,
              sendWhatsApp: true,
              metadata: { ref_number: repRef, amount: amtStrG, item_count: count, approver_name: approverName },
            }).catch(console.warn);
          });

          // Notify next-tier approvers if not final
          if (action === 'approve' && !isFinalG) {
            const nextTierNumG = tier + 1;
            let nextRolesG: string[] = [];
            if (hasFourTiers(repSub)) {
              if (tier === 1) nextRolesG = ['fom', 'Field Operation Manager (FOM)'];
              if (tier === 2) nextRolesG = ['countryDirector', 'CountryDirector', 'country_director'];
              if (tier === 3) nextRolesG = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
            } else if (hasThreeTiers(repSub)) {
              if (tier === 1) nextRolesG = ['fom', 'Field Operation Manager (FOM)'];
              if (tier === 2) nextRolesG = ['countryDirector', 'CountryDirector', 'country_director'];
            } else if (isFomSubmission(repSub)) {
              if (tier === 1) nextRolesG = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
            } else {
              nextRolesG = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
            }
            if (nextRolesG.length > 0) {
              supabase.from('profiles').select('id').in('role', nextRolesG).eq('status', 'approved')
                .then(({ data }) => {
                  const ids = (data || []).map(r => r.id);
                  if (!ids.length) return;
                  const totalTiersG = hasFourTiers(repSub) ? 4 : hasThreeTiers(repSub) ? 3 : 2;
                  const flowPartsG: string[] = [];
                  for (let t = 1; t <= tier; t++) flowPartsG.push(`Tier ${t}: ✓ Approved`);
                  flowPartsG.push(`Tier ${nextTierNumG}: ⏳ Your Review`);
                  for (let t = nextTierNumG + 1; t <= totalTiersG; t++) flowPartsG.push(`Tier ${t}: Pending`);
                  const isLastTierG = nextTierNumG === totalTiersG;
                  dispatchNotification({
                    event: 'cost_action_required',
                    recipientIds: ids,
                    titleEn: `Action Required: Group Request — Tier ${nextTierNumG} Review`,
                    titleAr: `مطلوب إجراء: مراجعة المرحلة ${nextTierNumG} للطلب الجماعي`,
                    messageEn: `Group request "${repRef}" (${amtStrG}, ${count} items) has passed Tier ${tier} and is waiting for your Tier ${nextTierNumG} review.`,
                    messageAr: `الطلب الجماعي "${repRef}" (${amtStrG}) اجتاز المرحلة ${tier} وينتظر مراجعتك في المرحلة ${nextTierNumG}.`,
                    priority: 'high',
                    entityType: 'costSubmission',
                    entityId: repSub?.id,
                    actionUrl: repSub?.id ? `/cost-submission?open=${repSub.id}` : '/cost-submission',
                    sendEmail: true,
                    sendWhatsApp: true,
                    metadata: {
                      ref_number: repRef,
                      submission_title: repSub?.request_title || repSub?.expense_category || `Group Request (${count} items)`,
                      amount: amtStrG,
                      submitter_name: repSub ? `${submitterName} (Group — ${count} items)` : submitterName,
                      approval_flow: flowPartsG.join(' → '),
                      current_step: `Tier ${nextTierNumG} Review — Approve or Reject`,
                      next_step: isLastTierG ? 'Final approval — cleared for payment' : `Tier ${nextTierNumG + 1} approval`,
                      item_count: count,
                      tier: String(nextTierNumG),
                    },
                  }).catch(console.warn);
                }).catch(console.warn);
            }
          }
        }

        setGroupApprovalDialog(prev => ({ ...prev, open: false }));
        setGroupApprovalNotes('');
        setGroupApprovalReason('');
        setGroupApprovalAttachments([]);
        await fetchOperationalCosts();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setGroupApprovalProcessing(false);
    }
  };

  const isFinalTier = (oc: OperationalCostSubmission, tier: 1 | 2 | 3 | 4): boolean => {
    if (isCDSubmission(oc))  return tier === 1; // CD: 1-tier
    if (isFomSubmission(oc)) return tier === 2; // FOM: 2-tier (T1=CD, T2=Admin)
    if (hasFourTiers(oc))    return tier === 4; // Coordinator: 4-tier
    if (hasThreeTiers(oc))   return tier === 3; // Supervisor: 3-tier
    return tier === 2;                          // fallback
  };

  const shouldRequireSignature = (_oc: OperationalCostSubmission, _tier: 1 | 2 | 3 | 4): boolean => {
    if (isSuperAdmin || isAdmin) return true;
    return isFinalTier(_oc, _tier);
  };

  const handleApprovalAction = async () => {
    const { action, tier, submission } = approvalDialog;
    if (!submission || !currentUser?.id) return;

    const combinedNotes = [
      approvalReason ? `Reason: ${approvalReason}` : '',
      approvalNotes,
    ].filter(Boolean).join(' | ') || approvalNotes;

    /* upload any approval-stage attachments first */
    setApprovalProcessing(true);
    const uploadedDocs = approvalAttachments.length > 0
      ? await uploadApprovalFiles(approvalAttachments, submission.id.slice(0, 8))
      : [];
    pendingApprovalDocsRef.current = uploadedDocs;

    if (shouldRequireSignature(submission, tier) && action === 'approve') {
      setSignatureModal({
        open: true,
        submission,
        tier,
        notes: combinedNotes,
      });
      setApprovalDialog({ open: false, action: 'approve', tier, submission: null });
      setApprovalProcessing(false);
      return;
    }

    await processApproval(action, tier, submission, combinedNotes, undefined, uploadedDocs);
    setApprovalAttachments([]);
    pendingApprovalDocsRef.current = [];
    setApprovalReason('');
  };

  const processApproval = async (
    action: 'approve' | 'reject',
    tier: 1 | 2 | 3 | 4,
    submission: OperationalCostSubmission,
    notes: string,
    signatureData?: { signatureId: string; signatureHash: string; method: SignatureMethod; signedAt: string },
    extraDocs: Array<{ url: string; filename: string }> = []
  ) => {
    if (!currentUser?.id) return;
    
    setApprovalProcessing(true);
    try {
      const updates: Record<string, any> = {};
      const isFinal = isFinalTier(submission, tier);
      
      const sigSuffix = signatureData
        ? `\n[Signed: ${signatureData.method.toUpperCase()} | Hash: ${signatureData.signatureHash.substring(0, 12)}... | ID: ${signatureData.signatureId} | ${signatureData.signedAt}]`
        : '';

      if (tier === 1) {
        updates.tier1_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier1_approved_by = currentUser.id;
        updates.tier1_approved_at = new Date().toISOString();
        updates.tier1_notes = (notes || '') + sigSuffix || null;
        if (action === 'approve') {
          // Country Director submission: single-tier — T1 is final
          if (isCDSubmission(submission)) {
            updates.status = 'approved';
          } else {
            updates.status = 'under_review';
          }
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 1 / تم الرفض في المرحلة الأولى';
        }
      } else if (tier === 2) {
        updates.tier2_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier2_approved_by = currentUser.id;
        updates.tier2_approved_at = new Date().toISOString();
        updates.tier2_notes = (notes || '') + sigSuffix || null;
        if (action === 'approve') {
          if (isFinal) {
            // FOM submission T2=Admin: final
            updates.status = 'approved';
          } else {
            // Coordinator T2=FOM or Supervisor T2=CD: more tiers ahead
            updates.status = 'under_review';
            updates.tier3_status = 'pending';
          }
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 2 / تم الرفض في المرحلة الثانية';
        }
      } else if (tier === 3) {
        updates.tier3_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier3_approved_by = currentUser.id;
        updates.tier3_approved_at = new Date().toISOString();
        updates.tier3_notes = (notes || '') + sigSuffix || null;
        if (action === 'approve') {
          if (isFinal) {
            // Supervisor T3=Admin: final
            updates.status = 'approved';
          } else {
            // Coordinator T3=Country Director: T4=Admin still ahead
            updates.status = 'under_review';
            updates.tier4_status = 'pending';
          }
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 3 / تم الرفض في المرحلة الثالثة';
        }
      } else if (tier === 4) {
        updates.tier4_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier4_approved_by = currentUser.id;
        updates.tier4_approved_at = new Date().toISOString();
        updates.tier4_notes = (notes || '') + sigSuffix || null;
        if (action === 'approve') {
          // Coordinator T4=Admin: always final
          updates.status = 'approved';
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 4 / تم الرفض في المرحلة الرابعة';
        }
      }

      /* merge any approval-stage attachments into supporting_documents */
      if (extraDocs.length > 0) {
        const existing = Array.isArray(submission.supporting_documents) ? submission.supporting_documents : [];
        updates.supporting_documents = [...existing, ...extraDocs];
      }

      console.log('[CostApproval] Processing:', {
        action, tier, submissionId: submission.id,
        currentStatus: submission.status,
        currentTier1: submission.tier1_status,
        currentTier2: submission.tier2_status,
        userId: currentUser.id,
        userRole: currentUser.role,
        updates,
      });

      const { data: updatedRows, error } = await supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('id', submission.id)
        .select('id');

      if (error) {
        console.error('[CostApproval] DB error:', error);
        toast({
          title: "Action Failed / فشل الإجراء",
          description: error.message || "Could not process the approval action. Please try again. / تعذرت معالجة إجراء الموافقة. يرجى المحاولة مرة أخرى.",
          variant: "destructive",
          duration: 8000,
        });
        return; // exit — do not run post-success code
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error('[CostApproval] Update matched 0 rows — likely RLS.', {
          submissionId: submission.id,
          userRole: currentUser.role,
          tier,
          action,
        });
        toast({
          title: "Update Blocked / تم حظر التحديث",
          description: "Database security policy may be blocking this update. Please run the latest migration (20260206_fix_admin_update_rls.sql) in your Supabase SQL editor, then refresh and try again. / قد تحظر سياسة أمان قاعدة البيانات هذا التحديث. يرجى تشغيل أحدث ملف ترحيل في محرر SQL الخاص بـ Supabase.",
          variant: "destructive",
          duration: 12000,
        });
        fetchOperationalCosts();
        return; // exit — do not run post-success code
      }

      // ── DB update confirmed successful ──────────────────────────────────────
      // Run all post-success side-effects in a separate try/catch so that any
      // unexpected error here does NOT show a misleading "Action Failed" toast
      // (the approval is already committed to the database).
      try {
        const tierArMap: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
        const tierAr = tierArMap[tier] || '';
        const submitterName = users.find(u => u.id === submission.submitted_by)?.name || 'the submitter';
        const refNum = submission.reference_number || submission.id.substring(0, 8).toUpperCase();
        const amountCentsNum = typeof submission.amount_cents === 'string'
          ? parseInt(submission.amount_cents, 10)
          : (submission.amount_cents as number);
        const amountStr = `${submission.currency} ${(amountCentsNum / 100).toLocaleString()}`;
        const isFinal = isFinalTier(submission, tier);

        if (action === 'reject') {
          toast({
            title: `Rejected (Tier ${tier}) / تم الرفض (المرحلة ${tierAr})`,
            description: tier === 1
              ? `Submission "${refNum}" (${amountStr}) by ${submitterName} has been rejected and returned to the submitter. Reason: "${notes}". They can edit and resubmit. / تم رفض الطلب "${refNum}" (${amountStr}) من ${submitterName} وإعادته إلى مقدم الطلب. السبب: "${notes}". يمكنه التعديل وإعادة التقديم.`
              : `Submission "${refNum}" (${amountStr}) by ${submitterName} has been rejected at Tier ${tier} review. Reason: "${notes}". / تم رفض الطلب "${refNum}" (${amountStr}) من ${submitterName} في المرحلة ${tierAr}. السبب: "${notes}".`,
            variant: "destructive",
            duration: 10000,
          });
        } else if (isFinal && signatureData) {
          toast({
            title: "Approved & Signed / تمت الموافقة والتوقيع",
            description: `Final approval completed for "${refNum}" (${amountStr}) by ${submitterName} with digital signature (${signatureData.method}). Cleared for payment. / تمت الموافقة النهائية على "${refNum}" (${amountStr}) من ${submitterName} بالتوقيع الرقمي. تمت الموافقة للدفع.`,
            duration: 8000,
          });
        } else {
          const nextTier = tier + 1;
          toast({
            title: `Approved (Tier ${tier}) / تمت الموافقة (المرحلة ${tierAr})`,
            description: isFinal
              ? `Submission "${refNum}" (${amountStr}) by ${submitterName} fully approved and cleared for payment. / تمت الموافقة الكاملة على طلب "${refNum}" (${amountStr}) من ${submitterName} وتمت الموافقة للدفع.`
              : `Submission "${refNum}" (${amountStr}) by ${submitterName} approved. Moves to Tier ${nextTier} for next review. / تمت الموافقة على طلب "${refNum}" (${amountStr}) من ${submitterName}. ينتقل إلى المرحلة ${tierArMap[nextTier] || nextTier} للمراجعة.`,
            duration: 8000,
          });
        }

        // 1️⃣ Notify the submitter on EVERY tier action (email + WhatsApp always)
        if (submission.submitted_by) {
          const approverName = (currentUser as any)?.name || (currentUser as any)?.fullName || 'Reviewer';
          const tierArMap2: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
          const submitterTitleEn = action === 'approve'
            ? isFinal
              ? 'Cost Submission Fully Approved ✅'
              : `Cost Submission: Tier ${tier} Approved — Advancing`
            : `Cost Submission Rejected at Tier ${tier}`;
          const submitterTitleAr = action === 'approve'
            ? isFinal ? 'تمت الموافقة الكاملة على المطالبة' : `تمت الموافقة على المرحلة ${tierArMap2[tier]} وجارٍ رفعه`
            : `تم رفض الطلب في المرحلة ${tierArMap2[tier]}`;
          const submitterMsgEn = action === 'approve'
            ? isFinal
              ? `Your cost submission "${refNum}" (${amountStr}) has been fully approved by ${approverName} and cleared for payment. You will receive the funds shortly.`
              : `Your cost submission "${refNum}" (${amountStr}) passed Tier ${tier} review by ${approverName}. It has been forwarded to the next approver (Tier ${tier + 1}).`
            : `Your cost submission "${refNum}" (${amountStr}) was rejected at Tier ${tier} by ${approverName}. Reason: ${notes || 'Not specified'}. Please edit and resubmit.`;
          dispatchNotification({
            event: action === 'approve' ? 'cost_approved' : 'cost_rejected',
            recipientIds: [submission.submitted_by],
            titleEn: submitterTitleEn,
            titleAr: submitterTitleAr,
            messageEn: submitterMsgEn,
            messageAr: action === 'approve'
              ? isFinal
                ? `تمت الموافقة الكاملة على مطالبتك "${refNum}" (${amountStr}) من قِبل ${approverName} وتم تصفيتها للدفع. ستصلك الأموال قريباً.`
                : `مطالبتك "${refNum}" (${amountStr}) اجتازت مراجعة المرحلة ${tier} من قِبل ${approverName}. تم إحالتها إلى المعتمد التالي (المرحلة ${tier + 1}).`
              : `تم رفض مطالبتك "${refNum}" (${amountStr}) في المرحلة ${tier} من قِبل ${approverName}. السبب: ${notes || 'غير محدد'}. يرجى التعديل وإعادة التقديم.`,
            priority: 'high',
            entityType: 'costSubmission',
            entityId: submission.id,
            actionUrl: '/cost-submission',
            sendEmail: true,
            sendWhatsApp: true,
            metadata: { ref_number: refNum, amount: amountStr, approver_name: approverName },
          }).catch(console.warn);
        }

        // 2️⃣ When a tier is approved and more remain, notify the next-tier approvers
        if (action === 'approve' && !isFinal) {
          let nextRoles: string[] = [];
          const nextTierNum = tier + 1;

          if (hasFourTiers(submission)) {
            if (tier === 1) nextRoles = ['fom', 'Field Operation Manager (FOM)'];
            if (tier === 2) nextRoles = ['countryDirector', 'CountryDirector', 'country_director'];
            if (tier === 3) nextRoles = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
          } else if (hasThreeTiers(submission)) {
            if (tier === 1) nextRoles = ['fom', 'Field Operation Manager (FOM)'];
            if (tier === 2) nextRoles = ['countryDirector', 'CountryDirector', 'country_director'];
          } else if (isFomSubmission(submission)) {
            if (tier === 1) nextRoles = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
          } else {
            if (tier === 1) nextRoles = ['Admin', 'admin', 'SuperAdmin', 'super_admin'];
          }

          if (nextRoles.length > 0) {
            supabase
              .from('profiles')
              .select('id')
              .in('role', nextRoles)
              .eq('status', 'approved')
              .then(({ data: nextApprovers }) => {
                const ids = (nextApprovers || []).map(a => a.id);
                if (ids.length === 0) return;
                // Build approval flow string: "T1: ✓ Approved → T2: ✓ Approved → T3: ⏳ Your Review → T4: Pending"
                const totalTiersInd = hasFourTiers(submission) ? 4 : hasThreeTiers(submission) ? 3 : isFomSubmission(submission) ? 2 : 2;
                const flowPartsInd: string[] = [];
                for (let t = 1; t <= tier; t++) flowPartsInd.push(`Tier ${t}: ✓ Approved`);
                flowPartsInd.push(`Tier ${nextTierNum}: ⏳ Your Review`);
                for (let t = nextTierNum + 1; t <= totalTiersInd; t++) flowPartsInd.push(`Tier ${t}: Pending`);
                const approvalFlowInd = flowPartsInd.join(' → ');
                const submissionTitle = submission.request_title || submission.expense_category || 'Cost Submission';
                const isLastTierInd = nextTierNum === totalTiersInd;
                dispatchNotification({
                  event: 'cost_action_required',
                  recipientIds: ids,
                  titleEn: `Action Required: Cost Submission — Tier ${nextTierNum} Review`,
                  titleAr: `مطلوب إجراء: مراجعة المرحلة ${nextTierNum} لطلب التكلفة`,
                  messageEn: `Submission "${refNum}" (${amountStr}) by ${submitterName} has passed Tier ${tier} and is now waiting for your Tier ${nextTierNum} review. Please approve or reject.`,
                  messageAr: `طلب "${refNum}" (${amountStr}) من ${submitterName} اجتاز المرحلة ${tier} وينتظر الآن مراجعتك في المرحلة ${nextTierNum}. يرجى الموافقة أو الرفض.`,
                  priority: 'high',
                  entityType: 'costSubmission',
                  entityId: submission.id,
                  actionUrl: `/cost-submission?open=${submission.id}`,
                  sendEmail: true,
                  sendWhatsApp: true,
                  metadata: {
                    ref_number: refNum,
                    submission_title: submissionTitle,
                    amount: amountStr,
                    submitter_name: submitterName,
                    approval_flow: approvalFlowInd,
                    current_step: `Tier ${nextTierNum} Review — Approve or Reject`,
                    next_step: isLastTierInd ? 'Final approval — cleared for payment' : `Tier ${nextTierNum + 1} approval`,
                    tier: String(nextTierNum),
                  },
                }).catch(console.warn);
              }).catch(console.warn);
          }
        }

        // Optimistically update local state
        setOperationalCosts(prev =>
          prev.map(oc =>
            oc.id === submission.id ? { ...oc, ...updates } : oc
          )
        );
      } catch (sideEffectErr) {
        // The DB update succeeded — do NOT show "Action Failed".
        // Log silently and refresh to sync the latest state from the DB.
        console.error('[CostApproval] Post-success side-effect error (approval already saved):', sideEffectErr);
        fetchOperationalCosts();
      }
    } catch (err) {
      console.error('[CostApproval] Unexpected error:', err);
      toast({
        title: "Action Failed / فشل الإجراء",
        description: "An unexpected error occurred. Please try again. / حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setApprovalProcessing(false);
      setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null });
      setApprovalNotes('');
      setApprovalReason('');
      setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
    }
  };

  const signatureCompletedRef = useRef(false);

  const handleSignatureComplete = (signatureData: {
    signatureId: string;
    signatureHash: string;
    method: SignatureMethod;
    signedAt: string;
  }) => {
    const { submission, notes, tier } = signatureModal;
    if (!submission) return;
    signatureCompletedRef.current = true;
    const pendingDocs = pendingApprovalDocsRef.current;
    pendingApprovalDocsRef.current = [];
    setApprovalAttachments([]);
    processApproval('approve', tier, submission, notes, signatureData, pendingDocs);
    setTimeout(() => {
      setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
    }, 100);
  };

  const handleDownloadCertificate = async (oc: OperationalCostSubmission) => {
    const submitter = users.find(u => u.id === oc.submitted_by);
    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
    const tier3Approver = oc.tier3_approved_by ? users.find(u => u.id === oc.tier3_approved_by) : null;
    const tier4Approver = oc.tier4_approved_by ? users.find(u => u.id === oc.tier4_approved_by) : null;
    const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;

    // Fetch the signature from the final tier's notes, cascading T4→T3→T2
    const finalNotes = oc.tier4_notes || oc.tier3_notes || oc.tier2_notes;
    const finalApprovedBy = oc.tier4_approved_by || oc.tier3_approved_by || oc.tier2_approved_by;
    let signatureImageData: string | null = null;
    if (finalNotes) {
      const sigMatch = finalNotes.match(/ID:\s*(\S+?)(?:\s*\||$)/);
      if (sigMatch?.[1]) {
        try {
          const { data: sigRow } = await supabase
            .from('document_signatures')
            .select('signature_data, signature_method, signer_id')
            .eq('id', sigMatch[1])
            .single();
          if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) {
            signatureImageData = sigRow.signature_data;
          }
          if (!signatureImageData && sigRow?.signer_id) {
            try {
              const { data: savedSigs } = await supabase
                .from('handwriting_signatures')
                .select('signature_image')
                .eq('user_id', sigRow.signer_id)
                .eq('is_active', true)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1);
              if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
                signatureImageData = savedSigs[0].signature_image;
              }
            } catch { /* continue */ }
          }
        } catch { /* signature fetch failed, continue without */ }
      }
    }

    if (!signatureImageData && finalApprovedBy) {
      try {
        const { data: savedSigs } = await supabase
          .from('handwriting_signatures')
          .select('signature_image')
          .eq('user_id', finalApprovedBy)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
          signatureImageData = savedSigs[0].signature_image;
        }
      } catch { /* no saved signature, continue without */ }
    }

    // Determine which tier gets the signature (the final approved tier)
    const finalTierSig = oc.tier4_status === 'approved' ? 4 : oc.tier3_status === 'approved' ? 3 : 2;

    await generateApprovalCertificatePdf({
      submission: {
        id: oc.id,
        expense_category: oc.expense_category,
        amount_cents: oc.amount_cents,
        currency: oc.currency,
        description: oc.description,
        expense_date: oc.expense_date,
        vendor: oc.vendor,
        reference_number: oc.reference_number,
        submitted_at: oc.submitted_at,
        created_at: oc.created_at,
        supporting_documents: oc.supporting_documents,
      },
      submitter: {
        name: submitter?.name || submitter?.email || 'Unknown',
        email: submitter?.email || '',
        role: oc.submitter_role,
      },
      project: project ? { name: project.name } : null,
      tier1: {
        approverName: tier1Approver?.name || tier1Approver?.email || 'Unknown',
        approverEmail: tier1Approver?.email,
        status: oc.tier1_status || 'approved',
        approvedAt: oc.tier1_approved_at || '',
        notes: oc.tier1_notes,
      },
      tier2: {
        approverName: tier2Approver?.name || tier2Approver?.email || 'Unknown',
        approverEmail: tier2Approver?.email,
        status: oc.tier2_status || 'approved',
        approvedAt: oc.tier2_approved_at || '',
        notes: oc.tier2_notes,
        signatureImageData: finalTierSig === 2 ? signatureImageData : null,
      },
      ...(oc.tier3_approved_by || oc.tier3_status === 'approved' ? {
        tier3: {
          approverName: tier3Approver?.name || tier3Approver?.email || 'Unknown',
          approverEmail: tier3Approver?.email,
          status: oc.tier3_status || 'approved',
          approvedAt: oc.tier3_approved_at || '',
          notes: oc.tier3_notes,
          signatureImageData: finalTierSig === 3 ? signatureImageData : null,
        },
      } : {}),
      ...(oc.tier4_approved_by || oc.tier4_status === 'approved' ? {
        tier4: {
          approverName: tier4Approver?.name || tier4Approver?.email || 'Unknown',
          approverEmail: tier4Approver?.email,
          status: oc.tier4_status || 'approved',
          approvedAt: oc.tier4_approved_at || '',
          notes: oc.tier4_notes,
          signatureImageData: finalTierSig === 4 ? signatureImageData : null,
        },
      } : {}),
    });

    toast({
      title: 'Confirmation Downloaded / تم تحميل التأكيد',
      description: 'The approval confirmation PDF has been saved to your device. / تم حفظ تأكيد الموافقة بصيغة PDF على جهازك.',
    });
  };

  const canEditSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    // SuperAdmin can edit at any tier (T1→T4) — only block once paid or reconciled
    if (isSuperAdmin) return derivedStatus !== 'paid' && derivedStatus !== 'reconciled';
    // Per-user override: edit any non-paid/reconciled submission
    if (hasEditOverride && derivedStatus !== 'paid' && derivedStatus !== 'reconciled') return true;
    if (derivedStatus !== 'pending') return false;
    if (isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canDeleteSubmission = (oc: OperationalCostSubmission): boolean => {
    // Direct delete: SuperAdmin only. Admins use the delete-request workflow.
    if (!isSuperAdmin) return false;
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus === 'reconciled') return false;
    return true;
  };

  // Any user who can see a submission can request its deletion (with a reason).
  // Admins who can directly delete don't need this — they already have the Delete button.
  const canRequestDeletion = (oc: OperationalCostSubmission): boolean => {
    if (canDeleteSubmission(oc)) return false; // Admins just delete directly
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus === 'reconciled') return false;
    // Already has a pending request from this user — show status instead
    if (oc.delete_request_status === 'pending') return false;
    return true;
  };

  // Destructive deletion is enforced by the atomic server RPC for Super Admins only.
  const canApproveDeleteRequest = (oc: OperationalCostSubmission): boolean => {
    return oc.delete_request_status === 'pending' && isSuperAdmin;
  };

  const openEditItem = (item: OperationalCostSubmission) => {
    setEditingItem(item);
    setEditItemFields({
      expense_category: item.expense_category,
      amount_str: (item.amount_cents / 100).toString(),
      description: item.description || '',
      expense_date: item.expense_date ? item.expense_date.slice(0, 10) : '',
      vendor: item.vendor || '',
      reference_number: item.reference_number || '',
      reason: '',
    });
  };

  const handleSaveItemEdit = async () => {
    if (!editingItem || !editItemFields.reason.trim()) return;
    setItemEditSubmitting(true);
    try {
      const amountCents = Math.round(parseFloat(editItemFields.amount_str.replace(/,/g, '')) * 100);
      if (isNaN(amountCents) || amountCents <= 0) {
        toast({ title: 'Invalid amount', variant: 'destructive' }); return;
      }
       const changeNote = `[Admin edit by ${currentUser?.fullName || currentUser?.email || 'Admin'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}: ${editItemFields.reason}]`;
      const prevNotes = editingItem.tier1_notes || '';
      const { error } = await supabase.from('operational_cost_submissions').update({
        expense_category: editItemFields.expense_category,
        amount_cents: amountCents,
        description: editItemFields.description || null,
        expense_date: editItemFields.expense_date || null,
        vendor: editItemFields.vendor || null,
        reference_number: editItemFields.reference_number || null,
        tier1_notes: prevNotes ? prevNotes + '\n' + changeNote : changeNote,
      }).eq('id', editingItem.id);
      if (error) throw error;
      toast({ title: 'Item updated', description: 'The line item has been saved.' });
      setEditingItem(null);
      await fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setItemEditSubmitting(false);
    }
  };

  const executeReminder = async () => {
    if (!reminderPreviewDialog) return;
    const { stepLabel, recipients, refNum, description, amtStr, submitterName: sName, ocId } = reminderPreviewDialog;
    setReminderSending(true);
    const descSnippet = description ? ` — ${description.length > 80 ? description.substring(0, 80) + '…' : description}` : '';
    const msgEn = `This is a reminder that cost submission "${refNum}${descSnippet}" (${amtStr}) submitted by ${sName} is waiting for your review at ${stepLabel}. Please log in and take action.`;
    try {
      await dispatchNotification({
        event: 'cost_reminder',
        recipientIds: recipients.map(r => r.id),
        titleEn: `⏰ Reminder: Action Required — Cost Submission`,
        titleAr: `⏰ تذكير: مطلوب إجراء على طلب التكلفة`,
        messageEn: msgEn,
        messageAr: `تذكير: طلب التكلفة "${refNum}${descSnippet}" (${amtStr}) المقدَّم من ${sName} بانتظار مراجعتك في مرحلة ${stepLabel}. يرجى تسجيل الدخول واتخاذ الإجراء اللازم.`,
        priority: 'high',
        entityType: 'costSubmission',
        entityId: ocId,
        actionUrl: '/cost-submission',
        sendEmail: true,
        sendWhatsApp: true,
        metadata: { ref_number: refNum, amount: amtStr, submitter_name: sName, step_label: stepLabel },
      });
      const names = recipients.map(r => r.name || r.email || 'approver').join(', ');
      toast({ title: 'Reminder Sent ✓', description: `Reminder sent via in-app, email & WhatsApp to: ${names}`, duration: 5000 });
      setReminderPreviewDialog(null);
    } finally {
      setReminderSending(false);
    }
  };

  const handleSendBack = async () => {
    if (!sendBackDialog.item || !sendBackComment.trim()) return;
    setSendBackSubmitting(true);
    try {
      const oc = sendBackDialog.item;
       const commentNote = `[Sent back by ${currentUser?.fullName || currentUser?.email || 'Approver'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}: ${sendBackComment}]`;
      const allGroupIds = oc.request_group_id
        ? operationalCosts.filter(o => o.request_group_id === oc.request_group_id).map(o => o.id)
        : [oc.id];
      const { error } = await supabase.from('operational_cost_submissions').update({
        status: 'pending',
        tier1_status: 'pending',
        tier1_approved_by: null,
        tier1_approved_at: null,
        tier1_notes: commentNote,
        tier2_status: 'pending',
        tier2_approved_by: null,
        tier2_approved_at: null,
        tier2_notes: null,
        tier3_status: null,
        tier3_approved_by: null,
        tier3_approved_at: null,
        tier3_notes: null,
        tier4_status: null,
        tier4_approved_by: null,
        tier4_approved_at: null,
        tier4_notes: null,
        rejection_reason: null,
      }).in('id', allGroupIds);
      if (error) throw error;
      toast({ title: 'Sent back for revision', description: `${allGroupIds.length > 1 ? `${allGroupIds.length} items` : 'Request'} returned to the submitter.` });

      if (oc.submitted_by) {
        const sbRef = oc.reference_number || oc.id.slice(0, 8).toUpperCase();
        const sbAmt = `${oc.currency} ${(oc.amount_cents / 100).toLocaleString()}`;
        const sbApproverName = (currentUser as any)?.fullName || (currentUser as any)?.name || 'Approver';
        dispatchNotification({
          event: 'cost_rejected',
          recipientIds: [oc.submitted_by],
          titleEn: `Cost Submission Returned for Revision — ${sbRef}`,
          titleAr: `إعادة الطلب للمراجعة — ${sbRef}`,
          messageEn: `Your cost submission "${sbRef}" (${sbAmt}) has been returned for revision by ${sbApproverName}. Please review the comments and resubmit. Comment: ${sendBackComment}`,
          messageAr: `تم إعادة طلبك "${sbRef}" (${sbAmt}) للمراجعة من قِبل ${sbApproverName}. يرجى الاطلاع على التعليقات وإعادة التقديم.`,
          priority: 'high',
          entityType: 'costSubmission',
          entityId: oc.id,
          actionUrl: '/cost-submission',
          sendEmail: true,
          sendWhatsApp: true,
          metadata: { ref_number: sbRef, amount: sbAmt, approver_name: sbApproverName, comment: sendBackComment },
        }).catch(console.warn);
      }

      setSendBackDialog({ open: false, item: null });
      setSendBackComment('');
      setViewingSubmission(null);
      await fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Send back failed', description: err.message, variant: 'destructive' });
    } finally {
      setSendBackSubmitting(false);
    }
  };

  const canResubmitSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'rejected') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canRecallSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus === 'paid' || derivedStatus === 'reconciled') return false;
    if (derivedStatus !== 'under_review' && derivedStatus !== 'approved') return false;
    return isSuperAdmin || isAdmin || hasRecallOverride;
  };

  /** Returns the tier label (T1/T2/T3/T4) that would be reverted, or null if no revert is possible */
  const getRevertTierLabel = (oc: OperationalCostSubmission): string | null => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus === 'paid' || derivedStatus === 'reconciled' || derivedStatus === 'rejected' || derivedStatus === 'pending') return null;
    if (hasFourTiers(oc) && oc.tier4_status === 'approved') return 'T4';
    if ((hasThreeTiers(oc) || hasFourTiers(oc)) && oc.tier3_status === 'approved') return 'T3';
    if (oc.tier2_status === 'approved') return 'T2';
    if (oc.tier1_status === 'approved') return 'T1';
    return null;
  };

  const canRevertSubmission = (oc: OperationalCostSubmission): boolean => {
    if (!isSuperAdmin && !isAdmin) return false;
    return getRevertTierLabel(oc) !== null;
  };

  const handleRevertSubmission = async () => {
    if (!revertConfirm) return;
    setActionProcessing(true);
    try {
      const tier = getRevertTierLabel(revertConfirm);
      if (!tier) throw new Error('This submission no longer has an approval tier that can be reverted.');
      const { revertOperationalCostTierAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostTierAtomically([revertConfirm.id], tier as 'T1' | 'T2' | 'T3' | 'T4');
      if (!result.success) throw new Error(result.message);
      toast({
        title: 'Reverted / تم الإرجاع',
        description: `Submission reverted (${tier} undone).${result.reversedPaymentSourceCount > 0 ? ' Linked Pre-Fund payment reversed and removed from active Reconciliation.' : ''}`,
      });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Revert Failed / فشل الإرجاع', description: err.message || 'Failed to revert submission.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setRevertConfirm(null);
    }
  };

  /** Batch-revert all revertable items in a group by one tier */
  const handleGroupRevertTier = async () => {
    if (!groupRevertTierConfirm || groupRevertTierConfirm.items.length === 0) return;
    setActionProcessing(true);
    try {
      const { revertOperationalCostTierAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostTierAtomically(
        groupRevertTierConfirm.items.map(oc => oc.id),
        groupRevertTierConfirm.tier as 'T1' | 'T2' | 'T3' | 'T4',
      );
      if (!result.success) throw new Error(result.message);
      toast({
        title: 'Group Reverted / تم إرجاع المجموعة',
        description: `${groupRevertTierConfirm.items.length} item${groupRevertTierConfirm.items.length !== 1 ? 's' : ''} reverted (${groupRevertTierConfirm.tier} undone).${result.reversedPaymentSourceCount > 0 ? ` ${result.reversedPaymentSourceCount} linked payment source${result.reversedPaymentSourceCount !== 1 ? 's were' : ' was'} reversed first.` : ''}`,
      });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Group Revert Failed / فشل إرجاع المجموعة', description: err.message || 'Group tier revert failed.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setGroupRevertTierConfirm(null);
    }
  };

  const canMarkAsPaid = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'approved' && derivedStatus !== 'partially_paid') return false;
    // Country Directors are never allowed to mark paid — financial admin action only
    if (isCountryDirector) return false;
    return isSuperAdmin || isAdmin || isFinanceAdmin || hasMarkPaidOverride;
  };

  const canReconcile = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'paid') return false;
    // If nobody has been granted the override, reconcile is open to any viewer (legacy)
    // Once at least one override exists the button requires explicit grant
    return isSuperAdmin || isAdmin || isFinanceAdmin || hasReconcileOverride;
  };

  // Per-user override checks (stored in user_permission_overrides with resource='cost_submissions')
  const cs = (a: string) => checkPermission('cost_submissions' as any, a as any);
  const hasMarkPaidOverride     = cs('mark_paid');
  const hasSendToFinanceOverride = cs('send_to_finance');
  const hasReconcileOverride    = cs('reconcile');
  const hasRecallOverride       = cs('recall');
  const hasEditOverride         = cs('edit');
  const hasDeleteOverride       = cs('delete');

  // Revert Paid → back to Approved (SuperAdmin or Admin; not once reconciled).
  // The atomic server RPC applies the same boundary.
  const canRevertPaid = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (isCountryDirector) return false;
    return derivedStatus === 'paid' && (isSuperAdmin || isAdmin);
  };

  const handleRevertPaid = async () => {
    if (!revertPaidConfirm) return;
    setActionProcessing(true);
    try {
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically([revertPaidConfirm.id], 'revert');
      if (!result.success) throw new Error(result.message);
      toast({ title: 'Payment Reverted / تم إرجاع الدفعة', description: 'Submission reset to Approved. Payment proof and amount cleared. / تم إعادة الطلب إلى حالة الموافقة ومسح الإيصال والمبلغ المدفوع.' });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Error / خطأ', description: 'Failed to revert payment.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setRevertPaidConfirm(null);
    }
  };

  /** Revert all paid items in a group back to Approved in one action. */
  const handleGroupRevertPaid = async () => {
    if (groupRevertPaidItems.length === 0) return;
    // Snapshot immediately — avoids stale React closure if a re-render fires mid-loop
    const itemsToRevert = [...groupRevertPaidItems];
    setActionProcessing(true);
    try {
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically(itemsToRevert.map(oc => oc.id), 'revert');
      if (!result.success) throw new Error(result.message);
      toast({
        title: `Group Reverted / تم إرجاع المجموعة`,
        description: `${itemsToRevert.length} payment${itemsToRevert.length !== 1 ? 's' : ''} reset to Approved. Proof and amounts cleared.`,
      });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Error / خطأ', description: 'Group revert failed.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setGroupRevertPaidItems([]);
      setGroupRevertPaidTitle('');
    }
  };

  const openMarkAsPaidDialog = (oc: OperationalCostSubmission) => {
    // Open dialog immediately — pre-fund list loads in the background while the user attaches a receipt
    const alreadyPaidCents = oc.amount_paid_cents ?? 0;
    const remainingCents = oc.amount_cents - alreadyPaidCents;
    const remainingAmount = (remainingCents / 100).toFixed(2);
    setMarkAsPaidDialog({
      open: true, submission: oc, proofFiles: [], proofPreviews: [], notes: '', uploading: false, preFundId: null, preFunds: [], preFundsLoading: true, preFundsError: null, payAmountStr: remainingAmount,
      paymentEventKey: `source-payment:operational_cost_submissions:${oc.id}:${crypto.randomUUID()}`,
    });
    // Async: load pre-funds and update dialog state once available
    (async () => {
      let preFunds: Array<{
        id: string;
        name: string;
        currency: string;
        available_balance: number;
      }> = [];
      try {
        const { data: pfData, error: fundsError } = await supabase
          .from('pre_fund_requests' as any)
          .select('id, name, currency, available_balance')
          .in('status', ['active', 'low_balance'])
          .eq('currency', oc.currency)
          .order('name');
        if (fundsError) throw fundsError;

        const fundRows = (pfData ?? []) as any[];
        preFunds = fundRows
          .filter(fund => Number(fund.available_balance ?? 0) > 0)
          .map(fund => ({
            id: fund.id,
            name: fund.name,
            currency: fund.currency,
            available_balance: Number(fund.available_balance ?? 0),
          }));
      } catch (error: any) {
        const message = error?.message || 'Unable to load eligible Pre-Funds.';
        setMarkAsPaidDialog(prev => (prev.open && prev.submission?.id === oc.id)
          ? { ...prev, preFundsLoading: false, preFundsError: message }
          : prev);
        return;
      }
      // Only update if this dialog is still open for the same submission
      setMarkAsPaidDialog(prev => (prev.open && prev.submission?.id === oc.id)
        ? { ...prev, preFunds, preFundsLoading: false, preFundsError: null }
        : prev);
    })();
  };

  const handleMarkAsPaidProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newPreviews = files.map(f => ({
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      name: f.name,
    }));
    setMarkAsPaidDialog(prev => ({
      ...prev,
      proofFiles: [...prev.proofFiles, ...files],
      proofPreviews: [...prev.proofPreviews, ...newPreviews],
    }));
    e.target.value = '';
  };

  const handleConfirmMarkAsPaid = async () => {
    const { submission: oc, proofFiles, notes, payAmountStr } = markAsPaidDialog;
    if (!oc || !currentUser?.id) return;
    if (!proofFiles.length) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Please attach at least one payment receipt before confirming. / يرجى إرفاق إيصال دفع واحد على الأقل قبل التأكيد.", variant: "destructive" });
      return;
    }
    if (!markAsPaidDialog.preFundId) {
      toast({ title: "Pre-Fund Required / التمويل المسبق مطلوب", description: "Please select a pre-fund to charge this payment to. / يرجى اختيار التمويل المسبق لخصم هذه الدفعة منه.", variant: "destructive" });
      return;
    }
    const payAmountVal = parseFloat(payAmountStr);
    if (isNaN(payAmountVal) || payAmountVal <= 0) {
      toast({ title: "Invalid Amount / مبلغ غير صالح", description: "Please enter a valid payment amount greater than zero.", variant: "destructive" });
      return;
    }
    const alreadyPaidCents = oc.amount_paid_cents ?? 0;
    const totalCents = oc.amount_cents ?? 0;
    const remainingCents = totalCents - alreadyPaidCents;
    const payAmountCents = Math.round(payAmountVal * 100);
    // Only enforce the cap when there IS a known remaining balance.
    // When remainingCents ≤ 0 (null/zero amount_cents in DB, or amount matches
    // what's already recorded), allow any positive amount so finance can correct
    // the record rather than being permanently locked out.
    if (remainingCents > 0 && payAmountCents > remainingCents) {
      toast({ title: "Amount Exceeds Remaining / المبلغ يتجاوز الباقي", description: `Payment amount cannot exceed the remaining balance of ${oc.currency} ${(remainingCents / 100).toLocaleString()}.`, variant: "destructive" });
      return;
    }
    const selectedFund = markAsPaidDialog.preFunds.find(fund => fund.id === markAsPaidDialog.preFundId);
    if (!selectedFund) {
      toast({ title: 'Invalid Pre-Fund / تمويل مسبق غير صالح', description: 'Select an eligible Pre-Fund for this submission.', variant: 'destructive' });
      return;
    }
    if (payAmountVal > selectedFund.available_balance) {
      toast({ title: 'Amount Exceeds Fund Balance / المبلغ يتجاوز رصيد التمويل', description: `This fund has only ${oc.currency} ${selectedFund.available_balance.toLocaleString()} available.`, variant: 'destructive' });
      return;
    }
    const isFullPayment = payAmountCents >= remainingCents;
    const newAmountPaidCents = alreadyPaidCents + payAmountCents;

    setMarkAsPaidDialog(prev => ({ ...prev, uploading: true }));
    setActionProcessing(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of proofFiles) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = file.name.split('.').pop()?.toLowerCase() || 'file';
        const filePath = `payment-proofs/${timestamp}_${random}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from('mmp-files')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(uploadErr.message);
        uploadedUrls.push(supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl);
      }
      const proofUrl: string | null = uploadedUrls.length === 1
        ? uploadedUrls[0]
        : uploadedUrls.length > 1 ? JSON.stringify(uploadedUrls) : null;

      const now = new Date().toISOString();
      const { recordRequiredPreFundPayment, createRequiredPreFundPaymentEventKey } = await import('@/utils/preFundLinkage');
      await recordRequiredPreFundPayment({
        sourceTable: 'operational_cost_submissions',
        sourceId: oc.id,
        fundId: markAsPaidDialog.preFundId,
        amount: payAmountCents / 100,
        currency: oc.currency,
        paymentDate: now,
        createdBy: currentUser.id,
        receiptUrl: proofUrl,
        notes: notes.trim() || null,
        paymentEventKey: markAsPaidDialog.paymentEventKey ?? createRequiredPreFundPaymentEventKey('operational_cost_submissions', oc.id),
      });
      toast({
        title: "Payment Sent / تم إرسال الدفعة",
        description: "The payment and its selected Pre-Fund ledger event were saved together."
      });
      {
        // Notify the submitter
        const paidNowAmount = (payAmountCents / 100).toLocaleString();
        const totalAmount = (oc.amount_cents / 100).toLocaleString();
        dispatchNotification({
          event: 'payment_processed',
          recipientIds: [oc.submitted_by],
          titleEn: isFullPayment ? 'Cost Submission Paid ✅' : 'Partial Payment Received 💰',
          titleAr: isFullPayment ? 'تم صرف المطالبة ✅' : 'تم استلام دفعة جزئية 💰',
          messageEn: isFullPayment
            ? `Your cost submission "${oc.reference_number || oc.id.slice(0, 8)}" (${oc.currency} ${totalAmount}) has been fully paid. Please confirm receipt in your Cost Submissions tab.`
            : `A partial payment of ${oc.currency} ${paidNowAmount} has been made on your submission "${oc.reference_number || oc.id.slice(0, 8)}" (total: ${oc.currency} ${totalAmount}). Remaining: ${oc.currency} ${((oc.amount_cents - newAmountPaidCents) / 100).toLocaleString()}.`,
          messageAr: isFullPayment
            ? `تم صرف طلبك "${oc.reference_number || oc.id.slice(0, 8)}" (${oc.currency} ${totalAmount}). يرجى تأكيد الاستلام في تبويب المطالبات.`
            : `تم دفع ${oc.currency} ${paidNowAmount} جزئياً على طلبك "${oc.reference_number || oc.id.slice(0, 8)}". المبلغ المتبقي: ${oc.currency} ${((oc.amount_cents - newAmountPaidCents) / 100).toLocaleString()}.`,
          priority: 'high',
          entityType: 'costSubmission',
          entityId: oc.id,
          actionUrl: '/cost-submission',
          sendEmail: true,
          sendWhatsApp: true,
          metadata: { ref_number: oc.reference_number || oc.id.slice(0, 8), amount: `${oc.currency} ${paidNowAmount}` },
        }).catch(console.error);
        // Notify management that a payment was disbursed
        const paidRef = oc.reference_number || oc.id.slice(0, 8).toUpperCase();
        const submitterName = (users || []).find((u: any) => u.id === oc.submitted_by)?.name
          || (users || []).find((u: any) => u.id === oc.submitted_by)?.fullName
          || 'Staff';
        const disbursedByName = (currentUser as any)?.fullName || (currentUser as any)?.name || 'Finance';
        const submissionTitle = (oc as any).request_title || oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '').trim() || '';
        const categoryLabel = COST_CATEGORY_LABELS[oc.expense_category] || oc.expense_category || '';
        const paidEventDetails: Array<{ label: string; value: string }> = [
          { label: 'Request Type',    value: 'Cost Submission' },
          { label: 'Reference No.',   value: paidRef },
          ...(submissionTitle ? [{ label: 'Title / Description', value: submissionTitle }] : []),
          { label: isFullPayment ? 'Amount Disbursed' : 'Partial Amount Paid', value: `${oc.currency} ${paidNowAmount}` },
          ...(isFullPayment ? [] : [
            { label: 'Total Amount',     value: `${oc.currency} ${totalAmount}` },
            { label: 'Remaining Balance', value: `${oc.currency} ${((oc.amount_cents - newAmountPaidCents) / 100).toLocaleString()}` },
          ]),
          ...(categoryLabel ? [{ label: 'Category', value: categoryLabel }] : []),
          ...(oc.expense_date ? [{ label: 'Expense Date', value: new Date(oc.expense_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }] : []),
          ...(oc.vendor ? [{ label: 'Vendor / Payee', value: oc.vendor }] : []),
          { label: 'Submitted By',    value: submitterName },
          { label: 'Disbursed By',    value: disbursedByName },
          { label: 'Payment Date',    value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
        ];
        void notifyMgmtOfCostEvent(
          isFullPayment ? `Cost Submission Paid — ${paidRef}` : `Partial Payment Disbursed — ${paidRef}`,
          `${isFullPayment ? 'Cost submission' : 'Partial payment of ' + oc.currency + ' ' + paidNowAmount + ' on submission'} "${paidRef}" by ${submitterName} has been disbursed by ${disbursedByName}.${isFullPayment ? '' : ` Remaining: ${oc.currency} ${((oc.amount_cents - newAmountPaidCents) / 100).toLocaleString()}.`}`,
          oc.id,
          currentUser?.id,
          paidEventDetails,
          isFullPayment ? 'تم صرف مطالبة التكلفة ✅' : 'تم استلام دفعة جزئية 💰',
        );
        markAsPaidDialog.proofPreviews.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
        setMarkAsPaidDialog({ open: false, submission: null, proofFiles: [], proofPreviews: [], notes: '', uploading: false, preFundId: null, preFunds: [], preFundsLoading: false, preFundsError: null, payAmountStr: '' });
        fetchOperationalCosts();
      }
    } catch (err: any) {
      toast({ title: "Error / خطأ", description: err.message || "Failed to mark as paid.", variant: "destructive" });
    } finally {
      setMarkAsPaidDialog(prev => ({ ...prev, uploading: false }));
      setActionProcessing(false);
    }
  };

  const handleMarkAsPaid = (oc: OperationalCostSubmission) => openMarkAsPaidDialog(oc);

  const toggleCostSelection = (id: string) => {
    setSelectedCostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleOpenBatchCostPay = (subs: OperationalCostSubmission[]) => {
    const eligible = subs.filter(s => canMarkAsPaid(s));
    if (eligible.length === 0) return;
    // Normalize stale amount_paid_cents: if a submission is in 'approved' status but has
    // amount_paid_cents >= amount_cents (leftover from a buggy revert), treat it as 0
    // so the dialog shows the correct remaining amount.
    const normalizedEligible = eligible.map(sub => {
      const derivedSt = getOperationalDerivedStatus(sub);
      if (derivedSt === 'approved' && (sub.amount_paid_cents ?? 0) >= sub.amount_cents && sub.amount_cents > 0) {
        return { ...sub, amount_paid_cents: 0 };
      }
      return sub;
    });
    // Open dialog immediately — pre-fund list loads in the background while the user attaches a receipt
    setBatchCostPayDialog({ open: true, submissions: normalizedEligible, proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, preFundId: null, preFunds: [], payMode: 'full', payPercent: '100', customInputType: 'pct', payCustomAmountStr: '' });
    // Async: load pre-funds and update dialog state once available
    (async () => {
      let preFunds: Array<{ id: string; name: string; currency: string; available_balance: number }> = [];
      try {
        let allowedFundIds: string[] | null = null;
        if (!isSuperAdmin) {
          const { data: allocData } = await supabase
            .from('pre_fund_allocations' as any)
            .select('pre_fund_request_id')
            .eq('user_id', currentUser?.id);
          allowedFundIds = ((allocData ?? []) as any[]).map((a: any) => a.pre_fund_request_id).filter(Boolean);
        }
        if (isSuperAdmin || (allowedFundIds && allowedFundIds.length > 0)) {
          let q = supabase
            .from('pre_fund_requests' as any)
            .select('id, name, currency, available_balance')
            .in('status', ['active', 'low_balance'])
            .order('name');
          if (!isSuperAdmin && allowedFundIds) q = (q as any).in('id', allowedFundIds);
          const { data: pfData } = await q;
          preFunds = ((pfData ?? []) as any[]).map((f: any) => ({
            id: f.id, name: f.name, currency: f.currency, available_balance: f.available_balance ?? 0,
          }));
        }
      } catch (_) {}
      // Only update if the dialog is still open
      setBatchCostPayDialog(prev => prev.open ? { ...prev, preFunds } : prev);
    })();
  };

  const handleBatchCostPayProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBatchCostPayDialog(prev => {
      prev.proofPreviewUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
      const previewUrls = files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
      return { ...prev, proofFiles: files, proofPreviewUrls: previewUrls };
    });
  };

  const handleConfirmBatchCostPay = async () => {
    const { submissions: subs, proofFiles, notes, preFundId, payMode, payPercent, customInputType, payCustomAmountStr } = batchCostPayDialog;
    if (!currentUser?.id || subs.length === 0) return;
    if (!proofFiles.length) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Attach at least one receipt that covers all selected payments.", variant: "destructive" });
      return;
    }
    if (!preFundId) {
      toast({ title: "Pre-Fund Required / التمويل المسبق مطلوب", description: "Please select a pre-fund to charge these payments to. / يرجى اختيار التمويل المسبق لخصم هذه الدفعات منه.", variant: "destructive" });
      return;
    }
    // Compute pay fraction (percent mode) or total amount (amount mode)
    const isAmountMode = payMode === 'custom' && customInputType === 'amount';
    const customFixedCents = isAmountMode ? Math.round(parseFloat(payCustomAmountStr || '0') * 100) : 0;
    const payFraction = isAmountMode ? 1 /* applied per-sub below */
      : payMode === 'full' ? 1
      : Math.min(1, Math.max(0, parseFloat(payPercent || '0') / 100));
    if (!isAmountMode && payFraction <= 0) {
      toast({ title: 'Invalid Amount / مبلغ غير صحيح', description: 'Enter a positive amount or percentage.', variant: 'destructive' });
      return;
    }
    if (isAmountMode && customFixedCents <= 0) {
      toast({ title: 'Invalid Amount / مبلغ غير صحيح', description: 'Enter a positive amount.', variant: 'destructive' });
      return;
    }

    setBatchCostPayDialog(prev => ({ ...prev, uploading: true }));
    try {
      const timestamp = Date.now();
      // Upload all proof files and collect public URLs
      const uploadedUrls: string[] = [];
      for (let fi = 0; fi < proofFiles.length; fi++) {
        const pf = proofFiles[fi];
        const random = Math.random().toString(36).substring(2, 8);
        const extension = pf.name.split('.').pop()?.toLowerCase() || 'file';
        const filePath = `payment-proofs/batch_cost_${timestamp}_${fi}_${random}.${extension}`;
        const { error: uploadErr } = await supabase.storage.from('mmp-files').upload(filePath, pf, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(uploadErr.message);
        uploadedUrls.push(supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl);
      }
      // Store as JSON array if multiple, plain string if single (backwards compatible)
      const proofUrl = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);
      const now = new Date().toISOString();

      let successCount = 0;
      let failCount = 0;
      // When custom-amount mode, distribute fixed total proportionally across submissions
      const totalRemainingCents = subs.reduce((s, sub) => s + Math.max(0, sub.amount_cents - (sub.amount_paid_cents ?? 0)), 0);
      for (const sub of subs) {
        const remainingCents = Math.max(0, sub.amount_cents - (sub.amount_paid_cents ?? 0));
        // Skip submissions with nothing remaining — prevents 0-amount pre-fund charges
        if (remainingCents <= 0) { failCount++; continue; }
        let payNowCents: number;
        if (isAmountMode) {
          // Distribute the fixed amount proportionally; cap at each sub's remaining
          const proportion = totalRemainingCents > 0 ? remainingCents / totalRemainingCents : 1 / subs.length;
          payNowCents = Math.min(remainingCents, Math.round(customFixedCents * proportion));
        } else {
          payNowCents = payMode === 'full' ? remainingCents : Math.round(remainingCents * payFraction);
        }
        // Guard: skip if computed pay amount is still zero (e.g. rounding down)
        if (payNowCents <= 0) { failCount++; continue; }
        try {
          const { recordRequiredPreFundPayment, createRequiredPreFundPaymentEventKey } = await import('@/utils/preFundLinkage');
          await recordRequiredPreFundPayment({
            sourceTable: 'operational_cost_submissions',
            sourceId: sub.id,
            fundId: preFundId,
            amount: payNowCents / 100,
            currency: sub.currency,
            paymentDate: now,
            createdBy: currentUser.id,
            receiptUrl: proofUrl,
            notes: notes.trim() || null,
            paymentEventKey: createRequiredPreFundPaymentEventKey('operational_cost_submissions', sub.id),
          });
          successCount++;
        } catch (error) {
          console.warn('[Pre-Fund] Bulk payment failed:', error);
          failCount++;
        }
      }

      // Consolidated notifications — one per submitter covering all their paid submissions
      const byUser = subs.reduce<Record<string, Array<{ ref: string; amount: number; currency: string }>>>((acc, sub) => {
        const uid = sub.submitted_by;
        if (!acc[uid]) acc[uid] = [];
        acc[uid].push({ ref: sub.reference_number || sub.id.slice(0, 8), amount: sub.amount_cents / 100, currency: sub.currency });
        return acc;
      }, {});

      Object.entries(byUser).forEach(([userId, items]) => {
        const isSingle = items.length === 1;
        const total = items.reduce((s, i) => s + i.amount, 0);
        const currency = items[0].currency;
        const breakdown = items.map(i => `• Ref ${i.ref} — ${i.currency} ${i.amount.toLocaleString()}`).join('\n');
        const batchMsgEn = isSingle
          ? `Your cost submission "${items[0].ref}" (${currency} ${items[0].amount.toLocaleString()}) has been paid. Please confirm receipt in your Cost Submissions tab.`
          : `${items.length} of your cost submissions have been paid.\n\nTotal: ${currency} ${total.toLocaleString()}\n\n${breakdown}\n\nPlease confirm receipt in your Cost Submissions tab.`;
        dispatchNotification({
          event: 'payment_processed',
          recipientIds: [userId],
          titleEn: isSingle ? 'Cost Submission Paid ✅' : `${items.length} Cost Submissions Paid ✅`,
          titleAr: isSingle ? 'تم صرف المطالبة ✅' : `تم صرف ${items.length} مطالبات ✅`,
          messageEn: batchMsgEn,
          messageAr: isSingle
            ? `تم صرف مطالبتك "${items[0].ref}" (${currency} ${items[0].amount.toLocaleString()}). يرجى تأكيد الاستلام في تبويب المطالبات.`
            : `تم صرف ${items.length} من مطالباتك.\n\nالإجمالي: ${currency} ${total.toLocaleString()}\n\n${breakdown}\n\nيرجى تأكيد الاستلام في تبويب المطالبات.`,
          priority: 'high',
          entityType: 'costSubmission',
          entityId: items[0].ref,
          actionUrl: '/cost-submission',
          sendEmail: true,
          sendWhatsApp: true,
          metadata: { amount: `${currency} ${total.toLocaleString()}`, item_count: items.length },
        }).catch(console.error);
      });

      // Notify management of the batch disbursement
      if (successCount > 0) {
        const batchTotal = subs.slice(0, successCount).reduce((s, sub) => s + sub.amount_cents / 100, 0);
        const batchCurrency = subs[0]?.currency || 'SDG';
        const disbursedBy = (currentUser as any)?.fullName || (currentUser as any)?.name || 'Finance';
        const batchRefs = subs.slice(0, successCount).map(s => s.reference_number || s.id.slice(0, 8).toUpperCase()).join(', ');
        const batchDetails: Array<{ label: string; value: string }> = [
          { label: 'Request Type',         value: 'Cost Submission — Batch Payment' },
          { label: 'Submissions Paid',      value: String(successCount) },
          { label: 'Total Amount Disbursed', value: `${batchCurrency} ${batchTotal.toLocaleString()}` },
          { label: 'Reference Numbers',     value: batchRefs },
          { label: 'Disbursed By',          value: disbursedBy },
          { label: 'Payment Date',          value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
        ];
        void notifyMgmtOfCostEvent(
          `Batch Payment Disbursed — ${successCount} Submission${successCount > 1 ? 's' : ''}`,
          `${successCount} cost submission${successCount > 1 ? 's' : ''} totalling ${batchCurrency} ${batchTotal.toLocaleString()} have been batch-paid by ${disbursedBy}.`,
          subs[0]?.id || '',
          currentUser?.id,
          batchDetails,
          `تم الدفع الجماعي — ${successCount} مطالبة`,
        );
      }

      toast({
        title: `Batch Payment Complete / اكتمل الدفع الجماعي`,
        description: `${successCount} submission${successCount > 1 ? 's' : ''} paid with one shared receipt${failCount > 0 ? ` · ${failCount} failed` : ''}.`,
      });
      setBatchCostPayDialog({ open: false, submissions: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, preFundId: null, preFunds: [], payMode: 'full', payPercent: '100', customInputType: 'pct', payCustomAmountStr: '' });
      setSelectedCostIds(new Set());
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: "Error / خطأ", description: err.message || "Batch payment failed.", variant: "destructive" });
    } finally {
      setBatchCostPayDialog(prev => ({ ...prev, uploading: false }));
    }
  };

  const canRequestPayment = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'approved') return false;
    return isSuperAdmin || isAdmin || hasSendToFinanceOverride;
  };

  const cachedRecipientsRef = useRef<Array<{ id: string; email: string; name: string; role: string }> | null>(null);
  const [ccContacts, setCcContacts] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);
  const ccContactsLoadedRef = useRef(false);
  const loadCcContacts = useCallback(() => {
    if (ccContactsLoadedRef.current) return;
    ccContactsLoadedRef.current = true;
    supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('status', 'approved')
      .not('email', 'is', null)
      .then(({ data }) => {
        if (data) {
          setCcContacts(data
            .filter((u: any) => u.email)
            .map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role || '' })));
        }
      });
  }, []);

  // cc contacts and recipients are loaded lazily when the payment dialog is first opened

  const openPaymentRequestDialog = async (oc: OperationalCostSubmission) => {
    loadCcContacts(); // lazy — only fetches once, no-op on subsequent calls
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, submission: oc, loading: false, selectedRecipientIds: cached.map(r => r.id), ccEmails: [], availableRecipients: cached }));
      supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
        .eq('status', 'approved')
        .then(({ data }) => {
          if (data) {
            const fresh = data.filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
            cachedRecipientsRef.current = fresh;
            setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
          }
        });
    } else {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, submission: oc, loading: true, selectedRecipientIds: [], ccEmails: [], availableRecipients: [] }));
      try {
        const { data: financeUsers } = await supabase
          .from('profiles')
          .select('id, email, full_name, role')
          .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
          .eq('status', 'approved');
        const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
        cachedRecipientsRef.current = recipients;
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map((r: any) => r.id), loading: false }));
      } catch {
        setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
        toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
      }
    }
  };

  const togglePaymentRecipient = (id: string) => {
    setPaymentRequestDialog(prev => ({
      ...prev,
      selectedRecipientIds: prev.selectedRecipientIds.includes(id)
        ? prev.selectedRecipientIds.filter(r => r !== id)
        : [...prev.selectedRecipientIds, id],
    }));
  };

  const toggleAllPaymentRecipients = () => {
    setPaymentRequestDialog(prev => ({
      ...prev,
      selectedRecipientIds: prev.selectedRecipientIds.length === prev.availableRecipients.length
        ? []
        : prev.availableRecipients.map(r => r.id),
    }));
  };

  const openBulkCostEmailDialog = async (forceSubmission?: OperationalCostSubmission, groupItems?: OperationalCostSubmission[]) => {
    console.log('[BulkEmail] OPEN called | forceSubmission id:', forceSubmission?.id ?? 'none', '| expense_category:', forceSubmission?.expense_category ?? 'N/A', '| amount_cents:', forceSubmission?.amount_cents ?? 'N/A', '| selectedCostIds.size:', selectedCostIds.size, '| operationalCosts.length:', operationalCosts.length);

    // Open dialog immediately in loading state so the user sees instant feedback
    setBulkCostEmailDialog({ step: 'rate', open: true, usdRate: '', totalSdg: 0, count: 0, approvedSubmissions: [], availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: true, sending: false });

    // Fetch fresh data from Supabase to avoid stale/incomplete state
    let freshCosts: OperationalCostSubmission[] = [];
    try {
      const rpcResult = await supabase.rpc('get_all_operational_cost_submissions');
      console.log('[BulkEmail] RPC result: error=', rpcResult.error?.message ?? 'none', '| data count=', (rpcResult.data as any[])?.length ?? 'null');
      if (!rpcResult.error && rpcResult.data && (rpcResult.data as any[]).length > 0) {
        freshCosts = rpcResult.data as OperationalCostSubmission[];
      } else {
        const directResult = await supabase
          .from('operational_cost_submissions')
          .select('*')
          .order('created_at', { ascending: false });
        console.log('[BulkEmail] Direct query result: error=', directResult.error?.message ?? 'none', '| data count=', directResult.data?.length ?? 'null');
        freshCosts = (directResult.data as OperationalCostSubmission[]) || [];
      }
      // Update the global state with the fresh data too
      if (freshCosts.length > 0) setOperationalCosts(freshCosts);
    } catch (err) {
      // Fall back to current state if fetch fails
      console.log('[BulkEmail] CATCH error:', err);
      freshCosts = operationalCosts;
    }

    console.log('[BulkEmail] freshCosts total:', freshCosts.length, '| sample keys:', freshCosts[0] ? Object.keys(freshCosts[0]).join(', ') : 'none');
    console.log('[BulkEmail] sample record:', freshCosts[0]);

    const allApproved = freshCosts.filter(o => getOperationalDerivedStatus(o) === 'approved');
    console.log('[BulkEmail] allApproved:', allApproved.length, '| selectedCostIds:', selectedCostIds.size, '| forceSubmission id:', forceSubmission?.id ?? 'none');

    let approvedSubs: OperationalCostSubmission[];
    if (forceSubmission) {
      // Prefer the freshly-fetched version of the record so the dialog always shows current data
      const freshVersion = freshCosts.find(o => o.id === forceSubmission.id);
      console.log('[BulkEmail] forceSubmission freshVersion:', freshVersion ? 'found' : 'not found (using original)', '| amount_cents:', (freshVersion || forceSubmission).amount_cents, '| category:', (freshVersion || forceSubmission).expense_category);
      approvedSubs = [freshVersion || forceSubmission];
    } else if (groupItems && groupItems.length > 0) {
      // Group-level "Send to Finance": use approved items from that specific group
      const groupIds = new Set(groupItems.map(i => i.id));
      const freshGroup = freshCosts.filter(o => groupIds.has(o.id));
      const pool = freshGroup.length > 0 ? freshGroup : groupItems;
      approvedSubs = pool.filter(o => getOperationalDerivedStatus(o) === 'approved');
      // If none are approved yet, include all from the group so the dialog opens with context
      if (approvedSubs.length === 0) approvedSubs = pool;
      console.log('[BulkEmail] groupItems mode: pool=', pool.length, '→ approvedSubs=', approvedSubs.length);
    } else if (selectedCostIds.size > 0) {
      const filtered = allApproved.filter(o => selectedCostIds.has(o.id));
      // If selection doesn't overlap with approved records (e.g., user selected pending ones), fall back to ALL approved
      approvedSubs = filtered.length > 0 ? filtered : allApproved;
      console.log('[BulkEmail] selectedCostIds filtered:', filtered.length, '→ using', approvedSubs.length, 'subs');
    } else {
      approvedSubs = allApproved;
    }
    console.log('[BulkEmail] final approvedSubs:', approvedSubs.length, '| first amount_cents:', approvedSubs[0]?.amount_cents, '| first category:', approvedSubs[0]?.expense_category);
    const totalSdg = approvedSubs.reduce((sum, oc) => {
      const cents = Number((oc as any).amount_cents) || 0;
      const direct = (oc as any).total_amount || (oc as any).amount || 0;
      return sum + (cents > 0 ? cents / 100 : direct);
    }, 0);
    setBulkCostEmailDialog(prev => ({ ...prev, totalSdg, count: approvedSubs.length, approvedSubmissions: approvedSubs, loading: false }));
  };

  const proceedBulkToRecipients = async () => {
    setBulkCostEmailDialog(prev => ({ ...prev, step: 'recipients', loading: true }));
    try {
      const cached = cachedRecipientsRef.current;
      if (cached && cached.length > 0) {
        setBulkCostEmailDialog(prev => ({ ...prev, availableRecipients: cached, selectedRecipientIds: cached.map(r => r.id), loading: false }));
        return;
      }
      const { data: financeUsers } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
        .eq('status', 'approved');
      const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
      cachedRecipientsRef.current = recipients;
      setBulkCostEmailDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map((r: any) => r.id), loading: false }));
    } catch {
      setBulkCostEmailDialog(prev => ({ ...prev, loading: false }));
      toast({ title: "Error / خطأ", description: "Failed to load recipients.", variant: "destructive" });
    }
  };

  const handleBulkCostEmailSend = async () => {
    const { selectedRecipientIds, availableRecipients, ccEmails, totalSdg, count, usdRate, approvedSubmissions } = bulkCostEmailDialog;
    if (!currentUser?.id || selectedRecipientIds.length === 0) return;
    const rate = parseFloat(usdRate);
    const effectiveRate = !isNaN(rate) && rate > 0 ? rate : null;
    setBulkCostEmailDialog(prev => ({ ...prev, sending: true }));
    try {
      const selectedRecipients = availableRecipients.filter(r => selectedRecipientIds.includes(r.id)).map(r => ({ email: r.email, name: r.name }));
      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Approver';
      const approverEmail = currentUser.email || '';
      const bulkId = `BULK-${count}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

      const userMap: BulkUserMap = {};
      (users || []).forEach((u: any) => {
        if (u.id) userMap[u.id] = { name: u.fullName || u.full_name || u.name || u.email || '—', email: u.email || '—', role: u.role };
      });

      const projectMap: BulkProjectMap = {};
      (allProjects || []).forEach((p: any) => {
        if (p.id) projectMap[p.id] = p.name || p.id;
      });

      const bulkSubs: BulkSubmission[] = approvedSubmissions.map(s => ({
        id: s.id,
        expense_category: s.expense_category,
        amount_cents: s.amount_cents,
        currency: s.currency,
        description: s.description,
        expense_date: s.expense_date,
        vendor: s.vendor,
        submitted_by: s.submitted_by,
        submitted_at: s.submitted_at,
        status: s.status,
        tier1_approved_at: s.tier1_approved_at,
        tier2_approved_at: s.tier2_approved_at,
        tier2_notes: s.tier2_notes,
        project_id: s.project_id,
        reference_number: s.reference_number,
      }));

      let pdfAttachment: { base64: string; filename: string } | undefined;
      let excelAttachment: { base64: string; filename: string; mimeType: string } | undefined;
      let pdfFailed = false;
      let excelFailed = false;

      try {
        const pdfBase64 = await generateBulkCostPDFBase64(bulkSubs, approverName, totalSdg, effectiveRate, userMap, projectMap);
        pdfAttachment = {
          base64: pdfBase64,
          filename: `PACT_Approved_Costs_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      } catch (pdfErr) {
        pdfFailed = true;
        console.error('[BulkEmail] PDF generation failed:', pdfErr);
      }

      try {
        const excelBase64 = await generateBulkCostExcelBase64(bulkSubs, approverName, effectiveRate, userMap, projectMap);
        excelAttachment = {
          base64: excelBase64,
          filename: `PACT_Approved_Costs_${new Date().toISOString().slice(0, 10)}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      } catch (xlErr) {
        excelFailed = true;
        console.error('[BulkEmail] Excel generation failed:', xlErr);
      }

      if (pdfFailed && excelFailed) {
        toast({ title: "Attachment Warning / تحذير المرفق", description: "Both PDF and Excel generation failed. The email will be sent without attachments. / فشل إنشاء كلا الملفين. سيُرسل البريد بدون مرفقات.", variant: "destructive" });
      } else if (pdfFailed) {
        toast({ title: "PDF Warning / تحذير PDF", description: "PDF generation failed; only the Excel workbook will be attached. / فشل إنشاء PDF؛ سيُرفق ملف Excel فقط." });
      } else if (excelFailed) {
        toast({ title: "Excel Warning / تحذير Excel", description: "Excel generation failed; only the PDF report will be attached. / فشل إنشاء Excel؛ سيُرفق تقرير PDF فقط." });
      }

      const recalcTotalSdg = approvedSubmissions.reduce((sum, s) => {
        const centsNum = Number(s.amount_cents) || 0;
        const fromCents = centsNum > 0 ? centsNum / 100 : 0;
        const direct = (s as any).total_amount || (s as any).amount || 0;
        return sum + (fromCents > 0 ? fromCents : direct);
      }, 0);
      const effectiveTotalSdg = recalcTotalSdg > 0 ? recalcTotalSdg : totalSdg;

      const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
        selectedRecipients,
        approverName,
        approverEmail,
        'Multiple Submitters',
        'All Approved Operational Cost Submissions',
        bulkId,
        'Operational Costs (Bulk)',
        effectiveTotalSdg,
        'operational_cost',
        (allProjects.find(p => approvedSubmissions[0]?.project_id === p.id)?.name) || 'WFP TPM',
        'SDG',
        '',
        '/cost-submission',
        pdfAttachment,
        excelAttachment ? [excelAttachment] : undefined,
        ccEmails.length > 0 ? ccEmails : undefined,
        'All Approved Submissions',
        effectiveRate ?? undefined
      );
      if (result.success) {
        const attachDesc = [pdfAttachment ? 'PDF report' : '', excelAttachment ? 'Excel workbook' : ''].filter(Boolean).join(' + ');
        toast({ title: "Email Sent / تم الإرسال", description: `Payment request for ${count} submissions sent to ${selectedRecipients.length} recipient(s)${attachDesc ? ` with ${attachDesc} attached` : ''}.` });
        setBulkCostEmailDialog({ step: 'rate', open: false, usdRate: '', totalSdg: 0, count: 0, approvedSubmissions: [], availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
      } else {
        toast({ title: "Send Failed / فشل الإرسال", description: result.error || "Failed to send bulk email.", variant: "destructive" });
        setBulkCostEmailDialog(prev => ({ ...prev, sending: false }));
      }
    } catch (err: any) {
      toast({ title: "Error / خطأ", description: err?.message || "Unexpected error sending bulk email.", variant: "destructive" });
      setBulkCostEmailDialog(prev => ({ ...prev, sending: false }));
    }
  };

  const handleSendPaymentRequest = async () => {
    const { submission: oc, selectedRecipientIds, availableRecipients, ccEmails } = paymentRequestDialog;
    if (!oc || !currentUser?.id || selectedRecipientIds.length === 0) return;

    setPaymentRequestDialog(prev => ({ ...prev, sending: true }));
    try {
      const selectedRecipients = availableRecipients
        .filter(r => selectedRecipientIds.includes(r.id))
        .map(r => ({ email: r.email, name: r.name }));

      const submitterProfile = users?.find(u => u.id === (oc as any).submitted_by);
      const submitterName = (submitterProfile as any)?.fullName || (submitterProfile as any)?.full_name || (submitterProfile as any)?.name || (oc as any).submitted_by || 'Unknown';
      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Approver';
      const approverEmail = currentUser.email || '';
      const project = (oc as any).project_id ? allProjects?.find(p => p.id === (oc as any).project_id) : null;
      const projectName = project?.name || (oc as any).project_id || 'N/A';
      const rawCents = Number((oc as any).amount_cents) || 0;
      const totalAmount = rawCents > 0 ? rawCents / 100 : ((oc as any).total_amount || (oc as any).amount || 0);
      const requestId = oc.id?.slice(0, 8)?.toUpperCase() || 'N/A';

      let pdfAttachment: { base64: string; filename: string } | undefined;
      try {
        const tier1Approver = (oc as any).tier1_approved_by ? users?.find(u => u.id === (oc as any).tier1_approved_by) : null;
        const tier2Approver = (oc as any).tier2_approved_by ? users?.find(u => u.id === (oc as any).tier2_approved_by) : null;
        const tier3Approver = (oc as any).tier3_approved_by ? users?.find(u => u.id === (oc as any).tier3_approved_by) : null;
        const tier4Approver = (oc as any).tier4_approved_by ? users?.find(u => u.id === (oc as any).tier4_approved_by) : null;

        // Signature from final tier notes, cascading T4→T3→T2
        const finalNotes = (oc as any).tier4_notes || (oc as any).tier3_notes || (oc as any).tier2_notes;
        const finalApprovedBy = (oc as any).tier4_approved_by || (oc as any).tier3_approved_by || (oc as any).tier2_approved_by;
        const finalTierSig = (oc as any).tier4_status === 'approved' ? 4 : (oc as any).tier3_status === 'approved' ? 3 : 2;
        let signatureImageData: string | null = null;
        if (finalNotes) {
          const sigMatch = (finalNotes as string).match(/ID:\s*(\S+?)(?:\s*\||$)/);
          if (sigMatch?.[1]) {
            try {
              const { data: sigRow } = await supabase
                .from('document_signatures')
                .select('signature_data, signer_id')
                .eq('id', sigMatch[1])
                .single();
              if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) {
                signatureImageData = sigRow.signature_data;
              }
              if (!signatureImageData && sigRow?.signer_id) {
                const { data: savedSigs } = await supabase
                  .from('handwriting_signatures')
                  .select('signature_image')
                  .eq('user_id', sigRow.signer_id)
                  .eq('is_active', true)
                  .order('is_default', { ascending: false })
                  .limit(1);
                if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
                  signatureImageData = savedSigs[0].signature_image;
                }
              }
            } catch { /* continue without signature */ }
          }
        }
        if (!signatureImageData && finalApprovedBy) {
          try {
            const { data: savedSigs } = await supabase
              .from('handwriting_signatures')
              .select('signature_image')
              .eq('user_id', finalApprovedBy)
              .eq('is_active', true)
              .order('is_default', { ascending: false })
              .limit(1);
            if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
              signatureImageData = savedSigs[0].signature_image;
            }
          } catch { /* continue without signature */ }
        }

        pdfAttachment = await generateApprovalCertificateBase64({
          submission: {
            id: oc.id,
            expense_category: (oc as any).expense_category || 'general',
            amount_cents: (oc as any).amount_cents || 0,
            currency: (oc as any).currency || 'SDG',
            description: oc.description,
            expense_date: (oc as any).expense_date,
            vendor: (oc as any).vendor,
            reference_number: (oc as any).reference_number,
            submitted_at: (oc as any).submitted_at,
            created_at: (oc as any).created_at,
            supporting_documents: (oc as any).supporting_documents,
          },
          submitter: {
            name: (submitterProfile as any)?.name || (submitterProfile as any)?.email || 'Unknown',
            email: (submitterProfile as any)?.email || '',
            role: (oc as any).submitter_role,
          },
          project: project ? { name: project.name } : null,
          tier1: {
            approverName: (tier1Approver as any)?.name || (tier1Approver as any)?.email || 'Unknown',
            approverEmail: (tier1Approver as any)?.email,
            status: (oc as any).tier1_status || 'approved',
            approvedAt: (oc as any).tier1_approved_at || '',
            notes: (oc as any).tier1_notes,
          },
          tier2: {
            approverName: (tier2Approver as any)?.name || (tier2Approver as any)?.email || 'Unknown',
            approverEmail: (tier2Approver as any)?.email,
            status: (oc as any).tier2_status || 'approved',
            approvedAt: (oc as any).tier2_approved_at || '',
            notes: (oc as any).tier2_notes,
            signatureImageData: finalTierSig === 2 ? signatureImageData : null,
          },
          ...((oc as any).tier3_approved_by || (oc as any).tier3_status === 'approved' ? {
            tier3: {
              approverName: (tier3Approver as any)?.name || (tier3Approver as any)?.email || 'Unknown',
              approverEmail: (tier3Approver as any)?.email,
              status: (oc as any).tier3_status || 'approved',
              approvedAt: (oc as any).tier3_approved_at || '',
              notes: (oc as any).tier3_notes,
              signatureImageData: finalTierSig === 3 ? signatureImageData : null,
            },
          } : {}),
          ...((oc as any).tier4_approved_by || (oc as any).tier4_status === 'approved' ? {
            tier4: {
              approverName: (tier4Approver as any)?.name || (tier4Approver as any)?.email || 'Unknown',
              approverEmail: (tier4Approver as any)?.email,
              status: (oc as any).tier4_status || 'approved',
              approvedAt: (oc as any).tier4_approved_at || '',
              notes: (oc as any).tier4_notes,
              signatureImageData: finalTierSig === 4 ? signatureImageData : null,
            },
          } : {}),
        });
      } catch (pdfErr) {
        console.warn('[Payment Request] Failed to generate PDF attachment, sending without it:', pdfErr);
      }

      const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
        selectedRecipients,
        approverName,
        approverEmail,
        submitterName,
        (oc as any).title || oc.description || 'Operational Cost',
        requestId,
        (oc as any).expense_category || (oc as any).category || 'general',
        totalAmount,
        (oc as any).funding_type || 'operational_cost',
        projectName,
        (oc as any).currency || 'SDG',
        '',
        '/cost-submission',
        pdfAttachment,
        undefined,
        ccEmails.length > 0 ? ccEmails : undefined
      );

      if (result.success) {
        toast({
          title: "Payment Request Sent / تم إرسال طلب الدفع",
          description: `Email sent to ${selectedRecipients.length} recipient(s). / تم إرسال البريد إلى ${selectedRecipients.length} مستلم(ين).`,
        });
      } else {
        toast({
          title: "Email Failed / فشل الإرسال",
          description: result.error || "Could not send payment request email. / تعذر إرسال بريد طلب الدفع.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error / خطأ",
        description: "Failed to send payment request. / فشل في إرسال طلب الدفع.",
        variant: "destructive",
      });
    } finally {
      setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
    }
  };

  const handleEditSubmission = (oc: OperationalCostSubmission) => {
    setEditingSubmission(oc);
    setActiveTab("submit");
  };

  const handleDeleteSubmission = async () => {
    if (!deleteConfirm) return;
    setActionProcessing(true);
    try {
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically([deleteConfirm.id], 'delete');
      if (!result.success) throw new Error(result.message);
        toast({ title: "Deleted / تم الحذف", description: "The submission has been deleted. / تم حذف الطلب." });
        // Log to deletion_audit_log (non-blocking, best-effort)
        supabase.from('deletion_audit_log').insert({
          table_name: 'operational_cost_submissions',
          record_id: deleteConfirm.id,
          record_data: deleteConfirm,
          deleted_by: currentUser?.id,
          deleted_by_role: (currentUser as any)?.role || 'superAdmin',
          deleted_by_name: (currentUser as any)?.full_name || (currentUser as any)?.name || currentUser?.email || 'SuperAdmin',
          deletion_reason: 'Direct SuperAdmin deletion',
        }).then(() => setDeletionLog(prev => [{ ...deleteConfirm, _log_type: 'direct', deleted_at: new Date().toISOString(), deleted_by_name: (currentUser as any)?.full_name || currentUser?.email }, ...prev]));
        fetchOperationalCosts();
    } catch (err) {
      toast({ title: "Error / خطأ", description: "Failed to delete submission. / فشل في حذف الطلب.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
      setDeleteConfirm(null);
    }
  };

  // Delete all items in a group (SuperAdmin only) — parallel unlink + single batch delete
  const handleDeleteGroup = async () => {
    if (!groupDeleteConfirm) return;
    setActionProcessing(true);
    try {
      const deletableItems = groupDeleteConfirm.items.filter(o => getOperationalDerivedStatus(o) !== 'reconciled');
      if (deletableItems.length === 0) {
        toast({ title: 'Nothing to delete', description: 'All items in this group are reconciled and cannot be deleted.' });
        return;
      }
      const ids = deletableItems.map(o => o.id);
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically(ids, 'delete');
      if (!result.success) throw new Error(result.message);
      toast({ title: 'Group Deleted / تم حذف المجموعة', description: `${ids.length} item${ids.length !== 1 ? 's' : ''} deleted.` });
      // Log all to deletion_audit_log in parallel (non-blocking)
      const groupTitle = groupDeleteConfirm.title;
      const deleterName = (currentUser as any)?.full_name || (currentUser as any)?.name || currentUser?.email || 'SuperAdmin';
      const deleterRole = (currentUser as any)?.role || 'superAdmin';
      Promise.all(deletableItems.map(item =>
        supabase.from('deletion_audit_log').insert({
          table_name: 'operational_cost_submissions',
          record_id: item.id,
          record_data: item,
          deleted_by: currentUser?.id,
          deleted_by_role: deleterRole,
          deleted_by_name: deleterName,
          deletion_reason: `Group deletion — ${groupTitle}`,
        })
      )).then(() => {
        const now = new Date().toISOString();
        setDeletionLog(prev => [
          ...deletableItems.map(item => ({ ...item, _log_type: 'group', deleted_at: now, deleted_by_name: deleterName })),
          ...prev,
        ]);
      });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Error / خطأ', description: err?.message || 'Failed to delete group.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setGroupDeleteConfirm(null);
    }
  };

  // SuperAdmin transfers a submission to CD as an exception for review
  const handleTransferToCD = async () => {
    const { submission, note } = transferToCDDialog;
    if (!submission || !note.trim()) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          transferred_to_cd: true,
          transferred_by: currentUser?.id,
          transferred_at: new Date().toISOString(),
          transfer_note: note.trim(),
          cd_exception_status: 'pending',
        })
        .eq('id', submission.id);
      if (error) throw error;
      toast({ title: 'Sent to CD / أُرسل إلى المدير القُطري', description: 'Flagged as an exception — Country Director will review it.' });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Transfer failed.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setTransferToCDDialog({ open: false, submission: null, note: '' });
    }
  };

  // CD approves or rejects an exception transferred to them
  const handleCDExceptionDecision = async () => {
    const { submission, note, action } = cdExceptionReviewDialog;
    if (!submission) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          cd_exception_status: action,
          cd_exception_note: note.trim() || null,
          cd_exception_reviewed_by: currentUser?.id,
          cd_exception_reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id);
      if (error) throw error;
      toast({
        title: action === 'approved' ? 'Exception Approved / تمت الموافقة' : 'Exception Rejected / تم الرفض',
        description: action === 'approved' ? 'Submission approved as a CD exception.' : 'Exception request has been rejected.',
      });
      fetchOperationalCosts();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update exception.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
      setCDExceptionReviewDialog({ open: false, submission: null, note: '', action: 'approved' });
    }
  };

  // Submit a deletion request — any user, any status, with a required reason
  const handleRequestDeletion = async () => {
    const { submission, reason } = deleteRequestDialog;
    if (!submission || !reason.trim()) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          delete_requested_at: new Date().toISOString(),
          delete_requested_by: currentUser?.id,
          delete_request_reason: reason.trim(),
          delete_request_status: 'pending',
          delete_request_notes: null,
          delete_request_reviewed_by: null,
          delete_request_reviewed_at: null,
        })
        .eq('id', submission.id);
      if (error) {
        toast({ title: 'Request Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Deletion Requested', description: 'Your request has been sent to the admin for review.' });
        // Notify all Admin/SuperAdmin/FinancialAdmin
        const delTitle = (submission as any).request_title || submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '').trim() || 'Untitled';
        const delRef = submission.reference_number || submission.id.slice(0, 8).toUpperCase();
        const delCatLabel = COST_CATEGORY_LABELS[(submission as any).expense_category] || (submission as any).expense_category || '';
        void notifyMgmtOfCostEvent(
          'Deletion Request — Cost Submission',
          `${currentUser?.name || 'A user'} requested deletion of cost submission "${delRef}". Reason: ${reason.trim()}`,
          submission.id,
          currentUser?.id,
          [
            { label: 'Request Type',      value: 'Cost Submission — Deletion Request' },
            { label: 'Reference No.',     value: delRef },
            ...(delTitle ? [{ label: 'Title / Description', value: delTitle }] : []),
            ...(delCatLabel ? [{ label: 'Category',         value: delCatLabel }] : []),
            ...((submission as any).amount_cents ? [{ label: 'Amount',          value: `${(submission as any).currency || 'SDG'} ${((submission as any).amount_cents / 100).toLocaleString()}` }] : []),
            { label: 'Requested By',      value: currentUser?.name || 'Unknown' },
            { label: 'Deletion Reason',   value: reason.trim() },
            { label: 'Request Date',      value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
          ],
          'طلب حذف مطالبة تكلفة',
        );
        fetchOperationalCosts();
        setDeleteRequestDialog({ open: false, submission: null, reason: '' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to submit deletion request.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
    }
  };

  // Admin/FinancialAdmin approves a delete request — actually deletes the row
  const handleApproveDeleteRequest = async () => {
    const { submission } = deleteReviewDialog;
    if (!submission) return;
    setActionProcessing(true);
    try {
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically([submission.id], 'delete');
      if (!result.success) throw new Error(result.message);
        toast({ title: 'Deletion Approved', description: 'The submission has been deleted.' });
        // Log to deletion_audit_log (non-blocking)
        const deleterName = (currentUser as any)?.full_name || (currentUser as any)?.name || currentUser?.email || 'SuperAdmin';
        supabase.from('deletion_audit_log').insert({
          table_name: 'operational_cost_submissions',
          record_id: submission.id,
          record_data: submission,
          deleted_by: currentUser?.id,
          deleted_by_role: (currentUser as any)?.role || 'superAdmin',
          deleted_by_name: deleterName,
          deletion_reason: `Approved delete request — ${submission.delete_request_reason || 'no reason provided'}`,
        }).then(() => setDeletionLog(prev => [{ ...submission, _log_type: 'approved_request', deleted_at: new Date().toISOString(), deleted_by_name: deleterName }, ...prev]));
        // Notify the original requester
        if (submission.delete_requested_by) {
          dispatchNotification({
            userId: submission.delete_requested_by,
            title: '✅ Deletion Request Approved',
            message: `Your request to delete "${submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}" was approved and the submission has been removed.`,
            type: 'success',
            category: 'financial',
            priority: 'normal',
            link: '/cost-submission',
            sendEmail: true,
          });
        }
        fetchOperationalCosts();
        setDeleteReviewDialog({ open: false, submission: null, notes: '', action: 'approve' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to approve deletion.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
    }
  };

  // SuperAdmin restores a record from the deletion_audit_log back into the table
  const handleRestoreFromLog = async (logEntry: any) => {
    if (!logEntry?.record_data) return;
    setActionProcessing(true);
    try {
      const rd = { ...logEntry.record_data };
      // Strip audit/system fields that shouldn't carry over
      delete rd.delete_request_status;
      delete rd.delete_request_reason;
      delete rd.delete_requested_by;
      delete rd.delete_requested_at;
      delete rd.delete_request_reviewed_by;
      delete rd.delete_request_reviewed_at;
      delete rd.delete_request_notes;
      const { error } = await supabase
        .from('operational_cost_submissions')
        .insert(rd);
      if (error) {
        toast({ title: 'Restore Failed', description: error.message, variant: 'destructive' });
      } else {
        // Mark the log entry as restored
        await supabase.from('deletion_audit_log').update({
          is_restorable: false,
          restored_at: new Date().toISOString(),
          restored_by: currentUser?.id,
          restoration_notes: `Restored by ${(currentUser as any)?.full_name || (currentUser as any)?.name || currentUser?.email || 'SuperAdmin'} on ${new Date().toLocaleString()}`,
        }).eq('id', logEntry.id);
        setDeletionLog(prev => prev.map(l => l.id === logEntry.id ? { ...l, restored_at: new Date().toISOString() } : l));
        setRestoreLogEntry(null);
        fetchOperationalCosts();
        toast({ title: '✅ Submission Restored', description: 'The submission has been brought back successfully.', variant: 'default' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to restore the submission.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
    }
  };

  // Admin/FinancialAdmin rejects a delete request — clears the request and notifies the requester
  const handleRejectDeleteRequest = async () => {
    const { submission, notes } = deleteReviewDialog;
    if (!submission) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          delete_request_status: 'rejected',
          delete_request_notes: notes.trim() || null,
          delete_request_reviewed_by: currentUser?.id,
          delete_request_reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id);
      if (error) {
        toast({ title: 'Reject Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Request Rejected', description: 'The deletion request has been rejected and the submitter notified.' });
        // Notify the requester with feedback
        if (submission.delete_requested_by) {
          dispatchNotification({
            userId: submission.delete_requested_by,
            title: '❌ Deletion Request Rejected',
            message: `Your request to delete "${submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}" was rejected.${notes.trim() ? ` Feedback: ${notes.trim()}` : ' Please make the required corrections and resubmit.'}`,
            type: 'warning',
            category: 'financial',
            priority: 'normal',
            link: `/cost-submission?open=${submission.id}`,
            sendEmail: true,
          });
        }
        fetchOperationalCosts();
        setDeleteReviewDialog({ open: false, submission: null, notes: '', action: 'approve' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to reject request.', variant: 'destructive' });
    } finally {
      setActionProcessing(false);
    }
  };

  const handleRecallSubmission = async () => {
    if (!recallConfirm) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          status: 'pending',
          tier1_status: 'pending',
          tier1_approved_by: null,
          tier1_approved_at: null,
          tier1_notes: null,
          tier2_status: 'pending',
          tier2_approved_by: null,
          tier2_approved_at: null,
          tier2_notes: null,
          tier3_status: null,
          tier3_approved_by: null,
          tier3_approved_at: null,
          tier3_notes: null,
          tier4_status: null,
          tier4_approved_by: null,
          tier4_approved_at: null,
          tier4_notes: null,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recallConfirm.id);

      if (error) {
        toast({ title: "Recall Failed / فشل الاسترجاع", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Recalled / تم الاسترجاع", description: "The submission has been recalled to pending status. All approvals have been reset. / تم استرجاع الطلب إلى حالة المعلق. تمت إعادة ضبط جميع الموافقات." });
        fetchOperationalCosts();
      }
    } catch (err) {
      toast({ title: "Error / خطأ", description: "Failed to recall submission. / فشل في استرجاع الطلب.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
      setRecallConfirm(null);
    }
  };

  const STATUS_AR_MAP_OC: Record<string, string> = {
    pending: 'قيد الانتظار',
    under_review: 'قيد المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض',
    paid: 'مدفوع',
    reconciled: 'مسوّى',
    all: 'الكل',
  };

  const handleOperationalStatementExport = (type: 'pdf' | 'excel') => {
    try {
      const baseFiltered = statusFilter === 'all'
        ? filteredOperationalCosts
        : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
      const statusFiltered = selectedCostIds.size > 0
        ? baseFiltered.filter(oc => selectedCostIds.has(oc.id))
        : baseFiltered;
      if (statusFiltered.length === 0) {
        toast({ title: "No Data / لا توجد بيانات", description: "No submissions match the current filter.", variant: "destructive" });
        return;
      }
      const rows: StatementRow[] = statusFiltered.map(oc => {
        const submitter = users?.find(u => u.id === oc.submitted_by);
        const t1User = oc.tier1_approved_by ? users?.find(u => u.id === oc.tier1_approved_by) : null;
        const t2User = oc.tier2_approved_by ? users?.find(u => u.id === oc.tier2_approved_by) : null;
        const ds = getOperationalDerivedStatus(oc);
        const catLabel = EXPENSE_CATEGORY_MAP[oc.expense_category]?.label || oc.expense_category;
        const projectName = oc.project_id ? (allProjects.find(p => p.id === oc.project_id)?.name || '') : '';
        return {
          refId: (oc.reference_number || oc.id.slice(0, 8)).toUpperCase(),
          date: oc.submitted_at ? format(new Date(oc.submitted_at), 'yyyy-MM-dd') : format(new Date(oc.created_at), 'yyyy-MM-dd'),
          description: oc.description || catLabel,
          requester: submitter ? `${submitter.fullName || submitter.email}` : oc.submitted_by.slice(0, 8),
          project: projectName,
          category: catLabel,
          status: ds,
          statusAr: STATUS_AR_MAP_OC[ds] || ds,
          requestedAmount: oc.amount_cents / 100,
          approvedAmount: ds === 'approved' || ds === 'paid' || ds === 'reconciled' ? oc.amount_cents / 100 : 0,
          paidAmount: ds === 'paid' || ds === 'reconciled' ? oc.amount_cents / 100 : 0,
          t1Approver: t1User ? (t1User.fullName || t1User.email) : undefined,
          t1Date: oc.tier1_approved_at ? format(new Date(oc.tier1_approved_at), 'yyyy-MM-dd') : undefined,
          t1Status: oc.tier1_status || undefined,
          t2Approver: t2User ? (t2User.fullName || t2User.email) : undefined,
          t2Date: oc.tier2_approved_at ? format(new Date(oc.tier2_approved_at), 'yyyy-MM-dd') : undefined,
          t2Status: oc.tier2_status || undefined,
          rejectionReason: oc.rejection_reason || undefined,
          notes: oc.description || undefined,
        };
      });
      const config: StatementConfig = {
        title: 'Operational Cost Statement',
        titleAr: 'كشف التكاليف التشغيلية',
        statementType: 'operational_cost',
        statusFilter: statusFilter === 'all' ? 'All Statuses' : statusFilter.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        statusFilterAr: STATUS_AR_MAP_OC[statusFilter] || statusFilter,
        currency: 'SDG',
        generatedBy: currentUser?.email || 'System',
      };
      if (type === 'pdf') {
        generateFinancialStatementPdf(rows, config);
        toast({ title: "Statement PDF / كشف PDF", description: `${rows.length} transaction(s) exported.` });
      } else {
        generateFinancialStatementExcel(rows, config);
        toast({ title: "Statement Excel / كشف إكسل", description: `${rows.length} transaction(s) exported.` });
      }
    } catch (err) {
      toast({ title: "Export Error / خطأ في التصدير", description: "Failed to generate statement. / فشل في إنشاء الكشف.", variant: "destructive" });
    }
  };

  const submissionStats = {
    total: submissions.length + filteredOperationalCosts.length,
    pending: submissions.filter(s => s.status === 'pending').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length,
    underReview: submissions.filter(s => s.status === 'under_review').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length,
    approved: submissions.filter(s => s.status === 'approved').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length,
    paid: submissions.filter(s => s.status === 'paid').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid').length,
    reconciled: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'reconciled').length
  };

  // Filter projects for budget request form based on user access
  const availableProjects = useMemo(() => {
    if (isAdminOrSuperUser) return allProjects;
    if (userProjectIds.length === 0) return [];
    return allProjects.filter(p => userProjectIds.includes(p.id));
  }, [allProjects, userProjectIds, isAdminOrSuperUser]);

  // Format projects for CostRequestForm
  const projectsForForm = availableProjects.map(p => ({
    id: p.id,
    name: p.name,
    budgetRemaining: (p as any).budgetRemaining
  }));

  if (costSubmitPerms.hasOverride && (costSubmitPerms.isBlocked || !costSubmitPerms.canRead)) {
    return <PageAccessDenied pageLabel="Cost Submission" reason="blocked" />;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {cycleContextMmpId && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0" />
          <span>Showing cost submissions for <strong>{cycleContextMmpName || 'this MMP'}</strong> — filtered from Cycle Close readiness.</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={() => navigate('/cost-submission')} data-testid="button-clear-cycle-filter">Clear filter</Button>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4 hover-elevate"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center flex-wrap gap-2">
                {canViewTeamSubmissions ? "Cost Approval & Tracking" : "Cost Submission"}
                {(isAdmin || isSuperAdmin) && (
                  <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border-purple-300">
                    <Shield className="h-3 w-3 mr-1" />
                    {isSuperAdmin ? 'Super Admin View' : 'Admin View'}
                  </Badge>
                )}
                {isSupervisor && !isFOM && !isCountryDirector && !isAdmin && !isSuperAdmin && (
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300">
                    <Users className="h-3 w-3 mr-1" />
                    Supervisor View
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isAdmin || isSuperAdmin
                  ? "Review, approve, and track cost submissions from all team members"
                  : isFOM || isCountryDirector
                    ? "Review and approve cost submissions from Supervisors and Coordinators. Your approval is required before Finance can process payment."
                    : isSupervisor
                      ? "Review and approve cost submissions from your team members"
                      : "Submit actual costs for completed site visits and track approval status"
                }
              </p>
            </div>
            </div>
            {(isAdmin || isSuperAdmin) && !isFOM && (
              <Button
                size="default"
                onClick={() => openBulkCostEmailDialog()}
                className="bg-[#0F2041] hover:bg-[#1D3461] text-white shrink-0 font-semibold shadow-md"
                data-testid="button-bulk-cost-email"
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Approved Email
                {operationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length > 0 && (
                  <span className="ml-2 bg-amber-400 text-amber-900 text-xs font-bold rounded-full px-2 py-0.5 leading-none">
                    {operationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Task #56 — expense-type selector */}
      <ExpenseTypeSelector
        value={expenseMode}
        onChange={handleSwitchMode}
        className="mb-4"
      />

      {/* Discard-confirm dialog for switching away from a dirty personal claim */}
      <AlertDialog open={!!pendingMode} onOpenChange={(o) => !o && setPendingMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved expense claim? / تجاهل المطالبة غير المحفوظة؟</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the personal reimbursement form. Switching now will lose them.
              <br /><span dir="rtl">لديك تغييرات غير محفوظة في نموذج الاسترداد الشخصي. التبديل الآن سيؤدي إلى فقدها.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-discard-cancel">Keep editing / متابعة التعديل</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchMode} data-testid="button-discard-confirm">Discard &amp; switch / تجاهل وتبديل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {expenseMode === 'personal' && (
        <PersonalExpenseFlow
          ref={personalFlowRef}
          embedded
          onDirtyChange={setPersonalDirty}
        />
      )}

      {expenseMode === 'operational' && (<>
      <PageInfoBanner
        title="Cost Submission - Operational Expenses"
        description="This page is for submitting OPERATIONAL COSTS you have already spent during fieldwork -- things like transportation, accommodation, communication, supplies, and other work-related expenses (9 categories available). This is DIFFERENT from wallet withdrawals (taking money out of your wallet -- use My Wallet page) and transportation advances (getting money upfront before a trip -- use Down-Payment Approval page). Here you are requesting REIMBURSEMENT for expenses already incurred. Each submission goes through a two-tier approval before the amount is credited to your wallet."
        descriptionAr="هذه الصفحة مخصصة لتقديم التكاليف التشغيلية التي أنفقتها أثناء العمل الميداني -- مثل النقل، والإقامة، والاتصالات، والمستلزمات، وغيرها من المصاريف المتعلقة بالعمل (٩ فئات متاحة). هذه الصفحة مختلفة عن سحب المحفظة (سحب الأموال من محفظتك -- استخدم صفحة محفظتي) وعن السلف المسبقة للنقل (الحصول على أموال مقدماً قبل الرحلة -- استخدم صفحة الموافقة على الدفعات المقدمة). هنا أنت تطلب استرداد مصاريف تم إنفاقها بالفعل. كل طلب يمر بموافقة على مستويين قبل إضافة المبلغ إلى محفظتك."
        workflowSteps={[
          { step: 1, role: 'Supervisor / Coordinator', action: 'Submits expense (YOU ARE HERE)', description: 'Fill in cost details, select the expense category, attach receipts if needed, and submit for review.' },
          { step: 2, role: 'FOM / Country Director', action: 'Tier 1 Review', description: 'FOM or Country Director checks the expense is legitimate, then approves, rejects, or sends it back for edits.' },
          { step: 3, role: 'Admin / Super Admin', action: 'Final approval with signature (Tier 2)', description: 'Admin gives final approval and signs digitally. An approval certificate PDF is generated.' },
          { step: 4, role: 'System', action: 'Credits your wallet', description: 'The approved amount is automatically added to your wallet balance. You can then request a withdrawal from the My Wallet page.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'مشرف / منسق', action: 'يقدم المصروف (أنت هنا)', description: 'قم بملء تفاصيل التكلفة، واختر فئة المصروف، وأرفق الإيصالات إن لزم الأمر، ثم أرسل للمراجعة.' },
          { step: 2, role: 'مدير العمليات / مدير القطر', action: 'المراجعة (المستوى الأول)', description: 'يتحقق مدير العمليات الميدانية أو مدير القطر من صحة المصروف، ثم يوافق عليه أو يرفضه أو يعيده للتعديل.' },
          { step: 3, role: 'المسؤول', action: 'الموافقة النهائية مع التوقيع (المستوى الثاني)', description: 'يمنح المسؤول الموافقة النهائية ويوقّع رقمياً. يتم إنشاء شهادة موافقة بصيغة PDF.' },
          { step: 4, role: 'النظام', action: 'يُضيف رصيداً لمحفظتك', description: 'يُضاف المبلغ المعتمد تلقائياً إلى رصيد محفظتك. يمكنك بعدها طلب سحب من صفحة محفظتي.' },
        ]}
      />

      {/* Task #56 — the legacy "Paid out of your own pocket? Use My Expenses,
          not here" cross-link block was removed because the new
          ExpenseTypeSelector at the top of the page already provides the
          personal-reimbursement entry point in-place, making the old "not
          here" copy contradictory. /my-expenses is still reachable from the
          left navigation. */}

      {/* Supervisor submission summary — Supervisors follow the same hierarchy as Coordinators:
          FOM (Tier 1) → Admin (Tier 2) → Finance. They are submitters, not approvers here. */}
      {isSupervisor && !isAdmin && !isSuperAdmin && (() => {
        const mySubmissions = operationalCosts.filter(oc => oc.submitted_by === currentUser?.id);
        const pendingCount  = mySubmissions.filter(oc => getOperationalDerivedStatus(oc) === 'pending').length;
        const reviewCount   = mySubmissions.filter(oc => getOperationalDerivedStatus(oc) === 'under_review').length;
        const approvedCount = mySubmissions.filter(oc => getOperationalDerivedStatus(oc) === 'approved').length;
        if (mySubmissions.length === 0) return null;
        return (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-4 sm:p-5 mb-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <h2 className="font-semibold text-blue-900 dark:text-blue-100 text-sm sm:text-base">My Submissions Overview</h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-2.5 py-1 rounded-full font-medium">
                  <Clock className="h-3 w-3" /> {pendingCount} Awaiting Tier 1
                </span>
              )}
              {reviewCount > 0 && (
                <span className="flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-2.5 py-1 rounded-full font-medium">
                  <RefreshCw className="h-3 w-3" /> {reviewCount} Under Review
                </span>
              )}
              {approvedCount > 0 && (
                <span className="flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle2 className="h-3 w-3" /> {approvedCount} Approved
                </span>
              )}
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-300 ml-auto">
                {mySubmissions.length} total submission{mySubmissions.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Data load error banners — shown when Supabase returns an error */}
      {(operationalCostsError || allSubmissionsQuery.error) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Could not load submission data</p>
            {operationalCostsError && (
              <p className="text-xs text-red-600 dark:text-red-300 mt-0.5 break-words">
                Operational costs: {(operationalCostsError as Error)?.message || String(operationalCostsError)}
              </p>
            )}
            {allSubmissionsQuery.error && (
              <p className="text-xs text-red-600 dark:text-red-300 mt-0.5 break-words">
                Site-visit costs: {(allSubmissionsQuery.error as Error)?.message || String(allSubmissionsQuery.error)}
              </p>
            )}
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              This usually means the migration hasn't been applied in Supabase yet, or the Supabase project is waking up. Try clicking Refresh in a few seconds.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 shrink-0" onClick={() => { fetchOperationalCosts(); }}>
            Retry
          </Button>
        </div>
      )}

      {/* Stats Cards - Cyber Tech Theme */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-pending"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Pending
            </CardTitle>
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.pending}</div>
            <p className="text-xs text-white/80 mt-1">Awaiting review</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-under-review"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Under Review
            </CardTitle>
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.underReview}</div>
            <p className="text-xs text-white/80 mt-1">Being processed</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-approved"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Approved
            </CardTitle>
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.approved}</div>
            <p className="text-xs text-white/80 mt-1">Ready for payment</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-red-500 to-red-700 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-rejected"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Rejected
            </CardTitle>
            <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.rejected}</div>
            <p className="text-xs text-white/80 mt-1">Declined</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-paid"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Paid
            </CardTitle>
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.paid}</div>
            <p className="text-xs text-white/80 mt-1">Completed</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-slate-600 to-slate-800 text-white border-0 min-h-[80px] sm:min-h-[100px]"
          data-testid="stat-total"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-white/90">
              Total
            </CardTitle>
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-white/80" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl sm:text-3xl font-bold text-white">{submissionStats.total}</div>
            <p className="text-xs text-white/80 mt-1">All submissions</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-16 w-16 sm:h-24 sm:w-24 text-white/10" />
        </Card>
      </div>

      {/* Process Guide - Collapsible */}
      <Card className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-base text-blue-800 dark:text-blue-200">Operational Cost Submission Guide</CardTitle>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowGuide(!showGuide)}
              className="text-blue-600 dark:text-blue-400"
              data-testid="button-toggle-guide"
            >
              {showGuide ? 'Hide' : 'Show'} Guide
            </Button>
          </div>
        </CardHeader>
        {showGuide && (
          <CardContent className="pt-2 space-y-4">
            <Alert className="border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30">
              <Info className="h-4 w-4 text-indigo-600" />
              <AlertTitle className="text-indigo-800 dark:text-indigo-200">What is this page for?</AlertTitle>
              <AlertDescription className="text-indigo-700 dark:text-indigo-300 text-sm mt-1">
                <p className="mb-2">
                  This page is for <strong>Operational Field Costs</strong> - expenses related to running field operations that are <strong>separate from site visit transportation costs</strong>.
                </p>
                <p className="mb-1 font-medium">This page covers:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>Permits & Licenses (locality access, government permits)</li>
                  <li>Incentives & Allowances (team bonuses, field allowances)</li>
                  <li>Internet & Communications (SIM cards, airtime, data)</li>
                  <li>Training (workshops, materials, venue hire)</li>
                  <li>General Transportation (office travel, hub visits - NOT site visit transport)</li>
                  <li>Equipment & Supplies (field equipment, stationery)</li>
                  <li>Printing & Materials (forms, reports)</li>
                  <li>Meetings (venue, refreshments)</li>
                  <li>Office Admin & Other operational expenses</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">This is NOT for Site Visit Transportation or Enumerator Fees</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                <p>Site visit transportation and enumerator fees are handled separately through the <strong>Site Visits</strong> and <strong>Finance Approval</strong> pages. Those costs are calculated automatically based on enumerator classification and are managed through the Down Payment / Advance system.</p>
              </AlertDescription>
            </Alert>

            <div>
              <h4 className="font-semibold text-sm mb-3 text-blue-800 dark:text-blue-200">Who can use this page?</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">Can Submit Requests</span>
                  </div>
                  <p className="text-xs text-muted-foreground">FOM, Coordinator, Country Director, Admin, Super Admin, Supervisor</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm">Can Review & Approve</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Hub Supervisor (Tier 1), Admin / Super Admin (Tier 2) / مشرف المركز (المرحلة ١)، المسؤول (المرحلة ٢)</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <span className="font-medium text-sm">Can View All Submissions</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Admin, Super Admin, Hub Supervisor, Country Director</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-3 text-blue-800 dark:text-blue-200">Multi-Tier Approval Process</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <h4 className="font-semibold text-sm">Submit Request</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose Advance or Reimbursement. Select expense category, enter amount, attach documents, and submit.
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <h4 className="font-semibold text-sm">Tier 1 Review</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Supervisor &amp; Coordinator:</strong> FOM / Country Director reviews.
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الأولى (المشرف والمنسق): مدير العمليات الميدانية / مدير القطر
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h4 className="font-semibold text-sm">Tier 2 Review</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Supervisor &amp; Coordinator:</strong> Admin / Super Admin gives final approval with digital signature.
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الثانية (المشرف والمنسق): المسؤول يوافق نهائياً بالتوقيع الرقمي.
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">5</div>
                    <h4 className="font-semibold text-sm">Reconciliation</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For advances: Submit receipts to reconcile after spending. Return unused funds or request more if overspent.
                  </p>
                </div>
              </div>
            </div>

            <div dir="rtl" className="p-4 rounded-lg bg-white dark:bg-slate-800 border text-right">
              <h4 className="font-semibold text-sm mb-2 text-blue-800 dark:text-blue-200">دليل تقديم التكاليف التشغيلية</h4>
              <p className="text-xs text-muted-foreground mb-2">
                هذه الصفحة مخصصة لتقديم <strong>التكاليف التشغيلية الميدانية</strong> مثل التصاريح، التدريب، الاتصالات، المعدات، والاجتماعات. هذه الصفحة <strong>ليست</strong> لتكاليف النقل الخاصة بزيارات المواقع أو رسوم العدادين.
              </p>
              <p className="text-xs text-muted-foreground mb-1"><strong>من يمكنه الاستخدام:</strong> مدير العمليات الميدانية، المنسق، المدير القطري، المشرف، المسؤول</p>
              <p className="text-xs text-muted-foreground mb-1"><strong>عملية الموافقة:</strong> المنسق: المشرف ← مدير العمليات ← المسؤول | المشرف: مدير العمليات ← المسؤول</p>
              <p className="text-xs text-muted-foreground"><strong>نوع الطلب:</strong> سلفة (استلام الأموال مقدماً ثم التسوية) أو استرداد (بعد الدفع من أموالك)</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => {
        if (v !== 'reconciliation') {
          setActiveReconciliation(null);
          setReconcileActualAmount('');
          setReconcileNotes('');
          setReconcileReceipts([]);
          setReconcileReceiptAmounts({});
        }
        setActiveTab(v as any);
      }} className="space-y-6">
        <div className="relative">
          <TabsList className="w-full h-auto p-1.5 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap gap-2 justify-start">
            {/* Submit Request */}
            {canSubmitOperationalCosts && (!costSubmitPerms.hasOverride || costSubmitPerms.canCreate) && (
              <TabsTrigger 
                value="submit" 
                data-testid="tab-submit" 
                className="relative flex-1 min-w-[140px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Submit Request</span>
                <span className="sm:hidden">Submit</span>
                {activeTab === "submit" && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                )}
              </TabsTrigger>
            )}
            
            {/* Outstanding — hidden for Country Director */}
            {!isCountryDirector && (
              <TabsTrigger 
                value="outstanding" 
                data-testid="tab-outstanding" 
                className="relative flex-1 min-w-[120px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
              >
                <CircleDollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">Outstanding</span>
                <span className="sm:hidden">Due</span>
                {submissionStats.approved > 0 && activeTab !== "outstanding" && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0">
                    {submissionStats.approved}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            
            {/* Reconciliation — Finance Admin / Admin / SuperAdmin only */}
            {canViewReconciliationTab && (
              <TabsTrigger 
                value="reconciliation" 
                data-testid="tab-reconciliation" 
                className="relative flex-1 min-w-[130px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Reconciliation</span>
                <span className="sm:hidden">Reconcile</span>
              </TabsTrigger>
            )}

            {/* Reports — available to all users with access to this page */}
            <TabsTrigger
              value="reports"
              data-testid="tab-reports"
              className="relative flex-1 min-w-[110px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-sky-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Reports</span>
              <span className="sm:hidden">Reports</span>
            </TabsTrigger>
            
            {/* History */}
            <TabsTrigger 
              value="history" 
              data-testid="tab-history" 
              className="relative flex-1 min-w-[140px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
            >
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">
                {(isAdmin || isSuperAdmin) ? "All Submissions" : isCountryDirector ? "All Approvals" : isFOM ? "Approvals" : isSupervisor ? "Team" : "My Submissions"}
              </span>
              <span className="sm:hidden">History</span>
              {submissionStats.total > 0 && activeTab !== "history" && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0">
                  {submissionStats.total}
                </Badge>
              )}
            </TabsTrigger>

            {/* Delete Requests — SuperAdmin only */}
            {isSuperAdmin && (
              <TabsTrigger
                value="delete_requests"
                data-testid="tab-delete-requests"
                className="relative flex-1 min-w-[140px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600 data-[state=active]:to-rose-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-red-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete Requests</span>
                <span className="sm:hidden">Del Req</span>
                {(() => {
                  const pendingCount = operationalCosts.filter(o => o.delete_request_status === 'pending').length;
                  return pendingCount > 0 && activeTab !== 'delete_requests' ? (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">
                      {pendingCount}
                    </Badge>
                  ) : null;
                })()}
              </TabsTrigger>
            )}

            {/* Confirmation Audit — admins & supervisors only */}
            {canViewTeamSubmissions && (
              <TabsTrigger
                value="payment_audit"
                data-testid="tab-payment-audit"
                className="relative flex-1 min-w-[150px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-violet-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
              >
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Confirmation Audit</span>
                <span className="sm:hidden">Audit</span>
                {(() => {
                  const unconfirmed = submissions.filter(s => s.status === 'paid' && !s.fund_receipt_confirmed).length
                    + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid' && !o.fund_receipt_confirmed).length;
                  return unconfirmed > 0 && activeTab !== 'payment_audit' ? (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-0">
                      {unconfirmed}
                    </Badge>
                  ) : null;
                })()}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Submit Request Tab - Unified form for all field costs */}
        {canSubmitOperationalCosts && (!costSubmitPerms.hasOverride || costSubmitPerms.canCreate) && (
          <TabsContent value="submit" className="space-y-4">

            {/* ── Pre-Fund allocation notice (soft, non-blocking) ───────────── */}
            {gateStatus === 'prefund_only' && allocatedFunds.length > 0 && (
              <div className="rounded-xl border border-sky-400/40 bg-sky-50 dark:bg-sky-900/15 p-4 flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                    This submission will be auto-linked to your pre-fund allocation / سيتم ربط هذا الطلب بمخصصك التمويلي تلقائياً
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {allocatedFunds.map(f => (
                      <span key={f.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-800/40 text-sky-800 dark:text-sky-300 font-medium border border-sky-200/60">
                        <DollarSign className="h-3 w-3" />
                        {f.name} · {f.currency} {f.remaining.toLocaleString()} remaining
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {editingSubmission && (
              <Alert className="mb-4">
                <Pencil className="h-4 w-4" />
                <AlertTitle>
                  {editingSubmission.status === 'rejected' ? 'Editing Rejected Submission' : 'Editing Pending Submission'}
                </AlertTitle>
                <AlertDescription>
                  {editingSubmission.status === 'rejected'
                    ? 'Make your changes and resubmit. This will reset the approval process.'
                    : 'Update your submission details below. The approval status will remain pending.'}
                </AlertDescription>
              </Alert>
            )}
            {addToGroupContext && !editingSubmission && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30 px-4 py-2.5">
                <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-none" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Adding to group</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 truncate">{addToGroupContext.title} · <span className="font-mono">GRP-{addToGroupContext.id.slice(-8).toUpperCase()}</span></p>
                </div>
                <button onClick={() => setAddToGroupContext(null)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200" data-testid="button-clear-group-context">✕</button>
              </div>
            )}
            <UnifiedCostRequestForm
              key={editingSubmission?.id || addToGroupContext?.id || 'new'}
              projects={projectsForForm}
              hubs={hubs}
              defaultMmpId={cycleContextMmpId}
              initialGroupId={addToGroupContext?.id}
              initialGroupTitle={addToGroupContext?.title}
              editData={editingSubmission ? {
                id: editingSubmission.id,
                expense_category: editingSubmission.expense_category,
                amount_cents: editingSubmission.amount_cents,
                currency: editingSubmission.currency,
                description: editingSubmission.description,
                expense_date: editingSubmission.expense_date,
                vendor: editingSubmission.vendor,
                reference_number: editingSubmission.reference_number,
                hub_id: editingSubmission.hub_id,
                project_id: editingSubmission.project_id,
                mmp_file_id: editingSubmission.mmp_file_id,
                supporting_documents: editingSubmission.supporting_documents,
                status: editingSubmission.status,
              } : null}
              onCancelEdit={() => {
                setEditingSubmission(null);
                setActiveTab("history");
              }}
              onSuccess={() => {
                setEditingSubmission(null);
                setAddToGroupContext(null);
                fetchOperationalCosts();
                setActiveTab("history");
              }}
            />
          </TabsContent>
        )}

        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-purple-600" />
                    <CardTitle>Advance Reconciliation</CardTitle>
                  </div>
                  <CardDescription>
                    Reconcile advance payments by submitting receipts and accounting for all funds received.
                    <span dir="rtl" className="block text-xs mt-0.5">تسوية المدفوعات المسبقة عن طريق تقديم الإيصالات وحساب جميع الأموال المستلمة.</span>
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-export-reconciliation">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      data-testid="button-export-reconciliation-excel"
                      onClick={() => {
                        const reconciledOps = operationalCosts.filter(oc => oc.status === 'reconciled');
                        if (reconciledOps.length === 0) {
                          toast({ title: "No Data / لا توجد بيانات", description: "No reconciled submissions to export.", variant: "destructive" });
                          return;
                        }
                        exportReconciledToExcel(reconciledOps, users);
                        toast({ title: "Excel Exported / تم التصدير", description: `${reconciledOps.length} reconciled submission(s) exported to Excel.` });
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export to Excel / تصدير إلى إكسل
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="button-export-reconciliation-pdf"
                      onClick={() => {
                        const reconciledOps = operationalCosts.filter(oc => oc.status === 'reconciled');
                        if (reconciledOps.length === 0) {
                          toast({ title: "No Data / لا توجد بيانات", description: "No reconciled submissions to export.", variant: "destructive" });
                          return;
                        }
                        exportReconciledToPDF(reconciledOps, users);
                        toast({ title: "PDF Exported / تم التصدير", description: `${reconciledOps.length} reconciled submission(s) exported to PDF.` });
                      }}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Export to PDF / تصدير إلى PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeReconciliation ? (() => {
                const submitter = users.find(u => u.id === activeReconciliation.submitted_by);
                const project = activeReconciliation.project_id ? allProjects.find(p => p.id === activeReconciliation.project_id) : null;
                const tier1Approver = activeReconciliation.tier1_approved_by ? users.find(u => u.id === activeReconciliation.tier1_approved_by) : null;
                const tier2Approver = activeReconciliation.tier2_approved_by ? users.find(u => u.id === activeReconciliation.tier2_approved_by) : null;
                const advanceAmount = activeReconciliation.amount_cents / 100;
                const actualSpent = parseFloat(reconcileActualAmount) || 0;
                const difference = advanceAmount - actualSpent;

                return (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                          Active Reconciliation / تسوية نشطة
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {activeReconciliation.reference_number}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setActiveReconciliation(null); setReconcileReceiptAmounts({}); setReconcileActualAmount(''); setReconcileNotes(''); setReconcileReceipts([]); }} data-testid="button-cancel-reconciliation">
                        <XCircle className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <h4 className="font-semibold text-base">
                            {activeReconciliation.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {submitter?.name || submitter?.email || 'Unknown'} &middot; {project?.name || 'General'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-amber-600">
                            {activeReconciliation.currency} {advanceAmount.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">Advance Amount / المبلغ المسبق</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {activeReconciliation.expense_date ? format(new Date(activeReconciliation.expense_date), 'MMM d, yyyy') : 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <FolderOpen className="h-3 w-3" />
                          {activeReconciliation.expense_category}
                        </span>
                        {activeReconciliation.vendor && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {activeReconciliation.vendor}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs flex-wrap">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>T1: {tier1Approver?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-blue-500" />
                          <span>T2: {tier2Approver?.name || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        Reconciliation Details / تفاصيل التسوية
                      </h4>

                      {/* ── Payment Receipt from Finance (read-only reference) ── */}
                      {activeReconciliation.payment_proof_url && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                              Payment Receipt (Reference) / إيصال الدفع للمرجعية
                            </p>
                            <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                              Paid / مدفوع
                            </Badge>
                          </div>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            This is the payment receipt uploaded by Finance when processing your advance. Use it as reference while reconciling. / هذا هو إيصال الدفع الذي رفعته الإدارة المالية عند تحويل السلفة. استخدمه كمرجع أثناء التسوية.
                          </p>
                          {(() => {
                            const urls = (() => {
                              try {
                                const parsed = JSON.parse(activeReconciliation.payment_proof_url!);
                                return Array.isArray(parsed) ? parsed : [activeReconciliation.payment_proof_url!];
                              } catch { return [activeReconciliation.payment_proof_url!]; }
                            })();
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {urls.map((url, i) => {
                                  const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
                                  return isImg ? (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt={`Payment receipt ${i + 1}`}
                                        className="w-full max-h-48 object-contain rounded border border-emerald-200 bg-white hover:opacity-90 transition-opacity cursor-zoom-in" />
                                    </a>
                                  ) : (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-3 rounded border border-emerald-200 bg-white dark:bg-emerald-950/30 hover:bg-emerald-50 transition-colors text-sm text-emerald-700 dark:text-emerald-400 font-medium"
                                    >
                                      <FileText className="h-4 w-4 shrink-0" />
                                      <span className="truncate">Payment Receipt {i + 1}</span>
                                      <ExternalLink className="h-3.5 w-3.5 ml-auto shrink-0" />
                                    </a>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {activeReconciliation.payment_proof_notes && (
                            <p className="text-xs text-muted-foreground border-t border-emerald-200 pt-2 mt-2">
                              Note: {activeReconciliation.payment_proof_notes}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-semibold">
                            Transfer Receipts / إيصالات التحويل <span className="text-red-500">*</span>
                          </Label>
                          <Badge variant="outline" className="text-xs">
                            Required / مطلوب
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Upload all bank transfer receipts and enter the amount for each one. The total will be calculated automatically. / قم بتحميل جميع إيصالات التحويل البنكي وأدخل المبلغ لكل واحد. سيتم حساب الإجمالي تلقائيًا.
                        </p>
                        <CostDocumentUpload
                          documents={reconcileReceipts}
                          onChange={(newDocs) => {
                            setReconcileReceipts(newDocs);
                            const newUrls = new Set(newDocs.map(d => d.url));
                            const cleanedAmounts: Record<string, string> = {};
                            for (const [key, val] of Object.entries(reconcileReceiptAmounts)) {
                              if (newUrls.has(key)) cleanedAmounts[key] = val;
                            }
                            setReconcileReceiptAmounts(cleanedAmounts);
                            const total = Object.values(cleanedAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                            setReconcileActualAmount(total > 0 ? total.toString() : '');
                          }}
                        />
                        {reconcileReceipts.length === 0 && (
                          <p className="text-xs text-red-500">
                            At least one receipt is required to submit reconciliation. / مطلوب إيصال واحد على الأقل لتقديم التسوية.
                          </p>
                        )}
                      </div>

                      {reconcileReceipts.length > 0 && (
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold">
                            Receipt Amounts / مبالغ الإيصالات
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Enter the transaction amount shown on each receipt. / أدخل مبلغ المعاملة الظاهر على كل إيصال.
                          </p>
                          <div className="space-y-2">
                            {reconcileReceipts.map((receipt, idx) => (
                              <div key={receipt.url} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30" data-testid={`receipt-amount-row-${idx}`}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{receipt.filename}</p>
                                  <p className="text-xs text-muted-foreground">Receipt {idx + 1} of {reconcileReceipts.length}</p>
                                </div>
                                <div className="relative w-40 shrink-0">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={reconcileReceiptAmounts[receipt.url] || ''}
                                    onChange={(e) => {
                                      const newAmounts = { ...reconcileReceiptAmounts, [receipt.url]: e.target.value };
                                      setReconcileReceiptAmounts(newAmounts);
                                      const total = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(newAmounts[r.url] || '0') || 0), 0);
                                      setReconcileActualAmount(total > 0 ? total.toString() : '');
                                    }}
                                    data-testid={`input-receipt-amount-${idx}`}
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    {activeReconciliation.currency}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {reconcileReceipts.length > 1 && (
                            <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
                              <span className="text-sm font-semibold">Total from all receipts / إجمالي جميع الإيصالات:</span>
                              <span className="text-base font-bold">
                                {activeReconciliation.currency} {actualSpent.toLocaleString()}
                              </span>
                            </div>
                          )}

                          {(() => {
                            const hasEmptyAmounts = reconcileReceipts.some(r => !reconcileReceiptAmounts[r.url] || parseFloat(reconcileReceiptAmounts[r.url]) <= 0);
                            if (hasEmptyAmounts && reconcileReceipts.length > 0) {
                              return (
                                <p className="text-xs text-amber-600">
                                  Please enter the amount for each receipt. / يرجى إدخال المبلغ لكل إيصال.
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}

                      <Separator />

                      <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">Balance Summary / ملخص الرصيد</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Advance / السلفة:</span>
                          <span>{activeReconciliation.currency} {advanceAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Spent ({reconcileReceipts.length} receipt{reconcileReceipts.length !== 1 ? 's' : ''}) / المنفق:
                          </span>
                          <span>{activeReconciliation.currency} {actualSpent.toLocaleString()}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold">
                          <span>{difference >= 0 ? 'To Return / للإرجاع:' : 'Overspent / تجاوز:'}</span>
                          <span className={difference >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {activeReconciliation.currency} {Math.abs(difference).toLocaleString()}
                          </span>
                        </div>
                        {difference >= 0 && actualSpent > 0 && (
                          <p className="text-xs text-green-600">Return the unused amount to finance. / أعد المبلغ غير المستخدم للمالية.</p>
                        )}
                        {difference < 0 && (
                          <p className="text-xs text-red-600">Submit a reimbursement request for the overspent amount. / قدم طلب تعويض عن المبلغ الزائد.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reconcile-notes">Notes / ملاحظات</Label>
                        <Textarea
                          id="reconcile-notes"
                          placeholder="Describe how the funds were used... / صف كيف تم استخدام الأموال..."
                          value={reconcileNotes}
                          onChange={(e) => setReconcileNotes(e.target.value)}
                          rows={3}
                          data-testid="input-reconcile-notes"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => { setActiveReconciliation(null); setReconcileReceiptAmounts({}); setReconcileActualAmount(''); setReconcileNotes(''); setReconcileReceipts([]); }}
                        data-testid="button-reconcile-cancel"
                      >
                        Cancel / إلغاء
                      </Button>
                      <Button
                        disabled={
                          !reconcileActualAmount || 
                          parseFloat(reconcileActualAmount) < 0 || 
                          !reconcileNotes.trim() || 
                          reconcileReceipts.length === 0 || 
                          reconcileProcessing ||
                          reconcileReceipts.some(r => !reconcileReceiptAmounts[r.url] || parseFloat(reconcileReceiptAmounts[r.url]) <= 0)
                        }
                        onClick={async () => {
                          if (!activeReconciliation) return;
                          if (reconcileReceipts.length === 0) {
                            toast({ title: "Receipt Required / الإيصال مطلوب", description: "Please upload at least one transfer receipt before submitting. / يرجى تحميل إيصال تحويل واحد على الأقل قبل التقديم.", variant: "destructive" });
                            return;
                          }
                          const hasEmptyAmounts = reconcileReceipts.some(r => !reconcileReceiptAmounts[r.url] || parseFloat(reconcileReceiptAmounts[r.url]) <= 0);
                          if (hasEmptyAmounts) {
                            toast({ title: "Missing Amounts / مبالغ مفقودة", description: "Please enter the amount for each receipt before submitting. / يرجى إدخال المبلغ لكل إيصال قبل التقديم.", variant: "destructive" });
                            return;
                          }
                          setReconcileProcessing(true);
                          try {
                            const actual = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(reconcileReceiptAmounts[r.url] || '0') || 0), 0) * 100;
                            const diff = activeReconciliation.amount_cents - actual;
                            const receiptBreakdown = reconcileReceipts.map((r) => {
                              const amt = parseFloat(reconcileReceiptAmounts[r.url] || '0');
                              return `${r.filename}: ${activeReconciliation.currency} ${amt.toLocaleString()}`;
                            }).join(' | ');
                            const descUpdate = `${activeReconciliation.description || ''}\n[RECONCILED] Actual: ${activeReconciliation.currency} ${(actual/100).toLocaleString()} | Balance: ${activeReconciliation.currency} ${(diff/100).toLocaleString()} | Notes: ${reconcileNotes.trim()} | Receipts (${reconcileReceipts.length}): ${receiptBreakdown}`;
                            
                            const existingDocs = Array.isArray(activeReconciliation.supporting_documents) ? activeReconciliation.supporting_documents : [];
                            const allDocs = [
                              ...existingDocs, 
                              ...reconcileReceipts.map((r) => ({ 
                                ...r, 
                                description: `Reconciliation receipt: ${r.filename} - Amount: ${activeReconciliation.currency} ${parseFloat(reconcileReceiptAmounts[r.url] || '0').toLocaleString()}` 
                              }))
                            ];

                            const receiptTotal = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(reconcileReceiptAmounts[r.url] || '0') || 0), 0);
                            const reconciliationNotesWithBreakdown = reconcileReceipts.length > 1
                              ? `${reconcileNotes.trim()}\n\n--- Receipt Breakdown ---\n${reconcileReceipts.map((r, idx) => `${idx + 1}. ${r.filename}: ${activeReconciliation.currency} ${parseFloat(reconcileReceiptAmounts[r.url] || '0').toLocaleString()}`).join('\n')}\nTotal: ${activeReconciliation.currency} ${receiptTotal.toLocaleString()}`
                              : reconcileNotes.trim();

                            const { error } = await supabase
                              .from('operational_cost_submissions')
                              .update({
                                status: 'reconciled',
                                description: descUpdate,
                                supporting_documents: allDocs,
                                reconciled_at: new Date().toISOString(),
                                reconciled_by: currentUser?.id,
                                reconciled_amount_cents: actual,
                                reconciliation_notes: reconciliationNotesWithBreakdown,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', activeReconciliation.id);

                            if (error) {
                              toast({ title: "Reconciliation Failed / فشلت التسوية", description: error.message, variant: "destructive" });
                            } else {
                              const balanceStr = `${activeReconciliation.currency} ${Math.abs(diff/100).toLocaleString()}`;
                              const balanceLabel = diff > 0 ? `(to return / للإرجاع)` : diff < 0 ? `(overspent / تجاوز)` : `(settled / مسوّى)`;
                              toast({ 
                                title: "Reconciled Successfully / تمت التسوية بنجاح", 
                                description: `Advance "${activeReconciliation.reference_number}" reconciled with ${reconcileReceipts.length} receipt(s). Balance: ${balanceStr} ${balanceLabel}. / تمت تسوية السلفة "${activeReconciliation.reference_number}" مع ${reconcileReceipts.length} إيصال(ات). الرصيد: ${balanceStr} ${balanceLabel}.`,
                                duration: 8000,
                              });
                              setActiveReconciliation(null);
                              setReconcileActualAmount('');
                              setReconcileNotes('');
                              setReconcileReceipts([]);
                              setReconcileReceiptAmounts({});
                              fetchOperationalCosts();
                            }
                          } catch {
                            toast({ title: "Error / خطأ", description: "Failed to reconcile. Please try again. / فشلت التسوية. يرجى المحاولة مرة أخرى.", variant: "destructive" });
                          } finally {
                            setReconcileProcessing(false);
                          }
                        }}
                        data-testid="button-submit-reconciliation"
                      >
                        {reconcileProcessing ? 'Processing... / جارٍ المعالجة...' : `Submit Reconciliation (${reconcileReceipts.length} receipt${reconcileReceipts.length !== 1 ? 's' : ''}) / تقديم التسوية`}
                      </Button>
                    </div>
                  </div>
                );
              })() : (
                <div className="space-y-4">
                  <Alert className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
                    <Info className="h-4 w-4 text-purple-600" />
                    <AlertTitle className="text-purple-800 dark:text-purple-200">How Reconciliation Works / كيف تعمل التسوية</AlertTitle>
                    <AlertDescription className="text-purple-700 dark:text-purple-300 text-sm mt-2">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Go to <strong>"Outstanding"</strong> tab to see advances pending reconciliation / اذهب إلى علامة التبويب "المستحقة"</li>
                        <li>Click <strong>"Reconcile"</strong> on an advance to start the process / انقر على "تسوية" على السلفة</li>
                        <li>Enter the actual amount spent and describe how funds were used / أدخل المبلغ الفعلي المنفق</li>
                        <li>Upload the bank transfer receipt (mandatory) / قم بتحميل إيصال التحويل البنكي (إلزامي)</li>
                        <li>If you spent less, return the unused amount to finance / إذا أنفقت أقل، أعد المبلغ غير المستخدم</li>
                        <li>If you overspent, submit a reimbursement request for the difference / إذا تجاوزت، قدم طلب تعويض</li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                  
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-semibold mb-2">No Active Reconciliation / لا توجد تسوية نشطة</h3>
                    <p className="mb-4">Select an outstanding advance to begin reconciliation.</p>
                    <p dir="rtl" className="mb-4 text-sm">اختر سلفة مستحقة لبدء التسوية.</p>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab("outstanding")}
                      data-testid="button-go-outstanding"
                    >
                      <CircleDollarSign className="h-4 w-4 mr-2" />
                      View Outstanding Advances
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outstanding Advances Tab */}
        <TabsContent value="outstanding" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-5 w-5 text-amber-600" />
                    <CardTitle>Outstanding Advances</CardTitle>
                  </div>
                  <CardDescription>
                    View all advance payments that are pending reconciliation. Track amounts received vs. spent and due dates for submitting receipts.
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-export-outstanding">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      data-testid="button-export-outstanding-excel"
                      onClick={() => {
                        const approvedOps = operationalCosts.filter(oc => getOperationalDerivedStatus(oc) === 'approved');
                        if (approvedOps.length === 0) {
                          toast({ title: "No Data / لا توجد بيانات", description: "No outstanding advances to export.", variant: "destructive" });
                          return;
                        }
                        exportOutstandingToExcel(approvedOps, users);
                        toast({ title: "Excel Exported / تم التصدير", description: `${approvedOps.length} outstanding advance(s) exported to Excel.` });
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export to Excel / تصدير إلى إكسل
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="button-export-outstanding-pdf"
                      onClick={() => {
                        const approvedOps = operationalCosts.filter(oc => getOperationalDerivedStatus(oc) === 'approved');
                        if (approvedOps.length === 0) {
                          toast({ title: "No Data / لا توجد بيانات", description: "No outstanding advances to export.", variant: "destructive" });
                          return;
                        }
                        exportOutstandingToPDF(approvedOps, users);
                        toast({ title: "PDF Exported / تم التصدير", description: `${approvedOps.length} outstanding advance(s) exported to PDF.` });
                      }}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Export to PDF / تصدير إلى PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <OutstandingAdvances 
                requests={(() => {
                  const approvedOps = operationalCosts.filter(oc => {
                    const ds = getOperationalDerivedStatus(oc);
                    return ds === 'approved';
                  });
                  return approvedOps.map(oc => {
                    const submitter = users.find(u => u.id === oc.submitted_by);
                    const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
                    return {
                      id: oc.id,
                      requestType: 'advance' as const,
                      projectId: oc.project_id || '',
                      projectName: project?.name || 'General',
                      budgetLineCategory: (oc.expense_category || 'other') as any,
                      submittedBy: oc.submitted_by,
                      submitterName: submitter?.name || submitter?.email || 'Unknown',
                      submitterRole: oc.submitter_role || undefined,
                      submittedAt: oc.submitted_at || oc.created_at,
                      requestedAmountCents: oc.amount_cents,
                      currency: oc.currency || 'SDG',
                      title: oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled',
                      description: oc.description || '',
                      justification: '',
                      justificationDocuments: [],
                      status: 'disbursed' as const,
                      tier1Status: 'approved' as const,
                      tier1ReviewedBy: oc.tier1_approved_by || undefined,
                      tier1ReviewedAt: oc.tier1_approved_at || undefined,
                      tier1Notes: oc.tier1_notes || undefined,
                      tier2Status: 'approved' as const,
                      tier2ReviewedBy: oc.tier2_approved_by || undefined,
                      tier2ReviewedAt: oc.tier2_approved_at || undefined,
                      tier2Notes: oc.tier2_notes || undefined,
                      approvedAmountCents: oc.amount_cents,
                      disbursedAmountCents: oc.amount_cents,
                      disbursedAt: oc.tier2_approved_at || oc.created_at,
                      balanceStatus: 'open' as const,
                      balanceCents: oc.amount_cents,
                      reconciliationDocuments: [],
                      hubId: oc.hub_id || undefined,
                      createdAt: oc.created_at,
                      updatedAt: oc.updated_at,
                    };
                  });
                })()}
                onReconcile={(request) => {
                  const oc = operationalCosts.find(o => o.id === request.id);
                  if (oc) {
                    setActiveReconciliation(oc);
                    setReconcileActualAmount('');
                    setReconcileNotes('');
                    setActiveTab("reconciliation");
                  }
                }}
                onViewDetails={(request) => {
                  const oc = operationalCosts.find(o => o.id === request.id);
                  if (oc) {
                    setViewAdvanceDetails(oc);
                  }
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submissions History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* ── Finance Email Action Bar — admin / super_admin only ── */}
          {(isSuperAdmin || isAdmin) && (() => {
            const allApprovedOcs = operationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved');
            const effectiveOcs = selectedCostIds.size > 0
              ? allApprovedOcs.filter(o => selectedCostIds.has(o.id))
              : allApprovedOcs;
            const approvedCount = effectiveOcs.length;
            const approvedTotal = effectiveOcs.reduce((sum, o) => sum + (o.amount_cents || 0) / 100, 0);
            return (
              <div className={`rounded-xl border-2 px-5 py-3.5 flex items-center justify-between gap-4 transition-all ${approvedCount > 0 ? 'bg-gradient-to-r from-[#0F2041] to-[#1D3461] border-[#0F2041]' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${approvedCount > 0 ? 'bg-white/15' : 'bg-slate-200 dark:bg-slate-800'}`}>
                    <Mail className={`h-4 w-4 ${approvedCount > 0 ? 'text-white' : 'text-slate-500'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold leading-tight ${approvedCount > 0 ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                      Send Payment Email to Finance
                      <span className="font-normal text-xs opacity-60 mr-1"> / إرسال بريد الدفع للمالية</span>
                    </p>
                    <p className={`text-xs leading-tight mt-0.5 ${approvedCount > 0 ? 'text-white/75' : 'text-muted-foreground'}`}>
                      {approvedCount > 0
                        ? `${approvedCount} ${selectedCostIds.size > 0 ? 'selected' : 'approved'} submission${approvedCount !== 1 ? 's' : ''} · SDG ${approvedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} ready to send`
                        : 'No approved submissions — check back after tier approvals are complete'}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => openBulkCostEmailDialog()}
                  disabled={approvedCount === 0}
                  className={`shrink-0 font-semibold gap-1.5 ${approvedCount > 0 ? 'bg-white text-[#0F2041] hover:bg-white/90 shadow-lg shadow-black/20' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
                  data-testid="button-bulk-cost-email-bar"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Send to Finance
                  {approvedCount > 0 && (
                    <span className="bg-[#0F2041] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{approvedCount}</span>
                  )}
                </Button>
              </div>
            );
          })()}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-slate-600" />
                <CardTitle>
                  {(isAdmin || isSuperAdmin) ? "All Cost Submissions" : isCountryDirector ? "All Approvals" : isFOM ? "Approval Queue" : isSupervisor ? "Team Submissions" : "My Submissions"}
                </CardTitle>
              </div>
              <CardDescription>
                {(isAdmin || isSuperAdmin)
                  ? "Review and manage all cost submissions across the organization. Approve, reject, or request more information."
                  : isCountryDirector
                    ? "Review and manage all cost submissions you oversee. Approve or reject as the final decision-maker."
                    : isFOM
                      ? "Review and approve cost submissions from Supervisors and Coordinators. Your approval is required before Finance can process payment."
                      : isSupervisor
                        ? "Review cost submissions from your team members. Verify and forward for admin approval."
                        : "Track the status of your submitted costs and view approval history."
                }
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Filter row: MMP / Submitter / State */}
          <div className="flex items-center gap-2 flex-wrap mb-1" data-testid="mmp-filter-bar">
            {/* MMP filter */}
            {mmpOptions.length > 0 && !cycleContextMmpId && (
              <Select value={mmpFilter} onValueChange={v => { setMmpFilter(v); setUserFilter('all'); setStateFilter('all'); }} data-testid="select-mmp-filter">
                <SelectTrigger className="h-8 text-xs w-[200px]" data-testid="trigger-mmp-filter">
                  <SelectValue placeholder="All MMPs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">📋 All MMPs</SelectItem>
                  {mmpOptions.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Submitter filter */}
            {(isAdminOrSuperUser || isSuperAdmin || isSupervisor || isFOM || isCountryDirector) && userOptions.length > 1 && (
              <Select value={userFilter} onValueChange={setUserFilter} data-testid="select-user-filter">
                <SelectTrigger className="h-8 text-xs w-[180px]" data-testid="trigger-user-filter">
                  <SelectValue placeholder="All Submitters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">👤 All Submitters</SelectItem>
                  {userOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* State filter */}
            {(isAdminOrSuperUser || isSuperAdmin) && stateOptions.length > 1 && (
              <Select value={stateFilter} onValueChange={setStateFilter} data-testid="select-state-filter">
                <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="trigger-state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🗺 All States</SelectItem>
                  {stateOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {canManagePreFundFilters && (
              <Select value={costPreFundFilter} onValueChange={setCostPreFundFilter} data-testid="select-cost-pre-fund-filter">
                <SelectTrigger className="h-8 text-xs w-[210px]">
                  <SelectValue placeholder="Paid from Pre-Fund" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">💰 All funding sources</SelectItem>
                  <SelectItem value="__unlinked__">⚠ Paid without Pre-Fund</SelectItem>
                  <SelectItem value="__multiple__">🔀 Multiple Pre-Funds</SelectItem>
                  {costPreFundOptions.map(fund => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name} {fund.currency !== '—' ? `(${fund.currency})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Approval-tier filter — Super Admin only */}
            {isSuperAdmin && (
              <Select value={tierFilter} onValueChange={v => setTierFilter(v as typeof tierFilter)} data-testid="select-tier-filter">
                <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="trigger-tier-filter">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🔢 All Tiers</SelectItem>
                  <SelectItem value="t1">⏳ Awaiting T1</SelectItem>
                  <SelectItem value="t2">⏳ Awaiting T2</SelectItem>
                  <SelectItem value="t3">⏳ Awaiting T3</SelectItem>
                  <SelectItem value="t4">⏳ Awaiting T4 (Final)</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Active filter pills + clear */}
            {(mmpFilter !== 'all' || userFilter !== 'all' || stateFilter !== 'all' || tierFilter !== 'all' || costPreFundFilter !== 'all') && (
              <div className="flex items-center gap-1 flex-wrap">
                {mmpFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium">
                    MMP: {mmpOptions.find(m => m.id === mmpFilter)?.name ?? mmpFilter.slice(0, 12)}
                    <button onClick={() => setMmpFilter('all')} className="ml-0.5 hover:text-blue-900" data-testid="button-clear-mmp-filter">✕</button>
                  </span>
                )}
                {userFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 rounded-full px-2 py-0.5 font-medium">
                    User: {userOptions.find(u => u.id === userFilter)?.name ?? userFilter.slice(0, 12)}
                    <button onClick={() => setUserFilter('all')} className="ml-0.5 hover:text-violet-900" data-testid="button-clear-user-filter">✕</button>
                  </span>
                )}
                {stateFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full px-2 py-0.5 font-medium">
                    State: {stateOptions.find(s => s.id === stateFilter)?.label ?? getStateName(stateFilter)}
                    <button onClick={() => setStateFilter('all')} className="ml-0.5 hover:text-emerald-900" data-testid="button-clear-state-filter">✕</button>
                  </span>
                )}
                {tierFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded-full px-2 py-0.5 font-medium">
                    Tier: {tierFilter === 't1' ? 'Awaiting T1' : tierFilter === 't2' ? 'Awaiting T2' : tierFilter === 't3' ? 'Awaiting T3' : 'Awaiting T4'}
                    <button onClick={() => setTierFilter('all')} className="ml-0.5 hover:text-orange-900" data-testid="button-clear-tier-filter">✕</button>
                  </span>
                )}
                {costPreFundFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium">
                     Funding: {costPreFundFilter === '__unlinked__'
                       ? 'Paid without Pre-Fund'
                      : costPreFundFilter === '__multiple__'
                        ? 'Multiple Pre-Funds'
                        : costPreFundOptions.find(f => f.id === costPreFundFilter)?.name ?? costPreFundFilter.slice(0, 12)}
                    <button onClick={() => setCostPreFundFilter('all')} className="ml-0.5 hover:text-amber-900" data-testid="button-clear-cost-pre-fund-filter">✕</button>
                  </span>
                )}
                <button
                  onClick={() => { setMmpFilter('all'); setUserFilter('all'); setStateFilter('all'); setTierFilter('all'); setCostPreFundFilter('all'); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                  data-testid="button-clear-all-filters"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          {costPreFundLinkError && canManagePreFundFilters && (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200" data-testid="cost-pre-fund-link-error">
              <span className="font-semibold">Pre-Fund filter unavailable:</span> {costPreFundLinkError}
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="status-filter-bar">
            {([
              { key: 'all', label: 'All', labelAr: 'الكل', count: filteredOperationalCosts.length, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
              { key: 'pending', label: 'Pending', labelAr: 'معلق', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
              { key: 'under_review', label: 'In Review', labelAr: 'قيد المراجعة', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
              { key: 'approved', label: 'Approved', labelAr: 'موافق', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length, color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
              { key: 'rejected', label: 'Rejected', labelAr: 'مرفوض', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length, color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
              { key: 'partially_paid', label: 'Partial', labelAr: 'جزئي', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'partially_paid').length, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
              { key: 'paid', label: 'Paid', labelAr: 'مدفوع', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid').length, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
              { key: 'reconciled', label: 'Reconciled', labelAr: 'مسوّى', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'reconciled').length, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300' },
            ] as const).map(f => (
              <Button
                key={f.key}
                size="sm"
                variant={statusFilter === f.key ? 'default' : 'outline'}
                onClick={() => setStatusFilter(f.key)}
                data-testid={`button-filter-${f.key}`}
                className={statusFilter === f.key ? '' : f.count === 0 ? 'opacity-50' : ''}
              >
                <span>{f.label}</span>
                {f.count > 0 && (
                  <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${statusFilter === f.key ? 'bg-white/20' : f.color}`}>
                    {f.count}
                  </span>
                )}
              </Button>
            ))}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchOperationalCosts}
              disabled={operationalCostsLoading}
              data-testid="button-refresh-operational"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${operationalCostsLoading ? 'animate-spin' : ''}`} />
              {operationalCostsLoading ? 'Loading...' : 'Refresh'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-export-history">
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-testid="button-export-history-excel"
                  onClick={() => {
                    const baseFiltered = statusFilter === 'all'
                      ? filteredOperationalCosts
                      : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
                    const statusFiltered = selectedCostIds.size > 0
                      ? baseFiltered.filter(oc => selectedCostIds.has(oc.id))
                      : baseFiltered;
                    if (statusFiltered.length === 0) {
                      toast({ title: "No Data / لا توجد بيانات", description: "No submissions to export.", variant: "destructive" });
                      return;
                    }
                    const label = selectedCostIds.size > 0 ? `Cost Submissions (${statusFilter} - selected)` : `Cost Submissions (${statusFilter})`;
                    exportSubmissionsToExcel(statusFiltered, users, label, `cost-submissions-${statusFilter}`, allProjects);
                    toast({ title: "Excel Exported / تم التصدير", description: `${statusFiltered.length} submission(s) exported to Excel.` });
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export to Excel / تصدير إلى إكسل
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="button-export-history-pdf"
                  onClick={() => {
                    const baseFiltered = statusFilter === 'all'
                      ? filteredOperationalCosts
                      : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
                    const statusFiltered = selectedCostIds.size > 0
                      ? baseFiltered.filter(oc => selectedCostIds.has(oc.id))
                      : baseFiltered;
                    if (statusFiltered.length === 0) {
                      toast({ title: "No Data / لا توجد بيانات", description: "No submissions to export.", variant: "destructive" });
                      return;
                    }
                    const label = selectedCostIds.size > 0 ? `Cost Submissions (${statusFilter} - selected)` : `Cost Submissions (${statusFilter})`;
                    exportSubmissionsToPDF(statusFiltered, users, label, statusFilter, `cost-submissions-${statusFilter}`, allProjects);
                    toast({ title: "PDF Exported / تم التصدير", description: `${statusFiltered.length} submission(s) exported to PDF.` });
                  }}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export to PDF / تصدير إلى PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">Bank Statement / كشف مالي:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOperationalStatementExport('pdf')}
              disabled={filteredOperationalCosts.length === 0}
              data-testid="button-op-statement-pdf"
            >
              <CircleDollarSign className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOperationalStatementExport('excel')}
              disabled={filteredOperationalCosts.length === 0}
              data-testid="button-op-statement-excel"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>

          {/* Batch Pay selection bar — shown when ≥1 item is selected, sticky */}
          {(() => {
            const payableOcs = filteredOperationalCosts.filter(canMarkAsPaid);
            const selectedPayable = payableOcs.filter(oc => selectedCostIds.has(oc.id));
            if (selectedPayable.length === 0) return null;
            return (
              <div className="sticky top-0 z-20 flex items-center justify-between gap-2 flex-wrap rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    {selectedPayable.length} selected · {selectedPayable[0].currency} {selectedPayable.reduce((s, oc) => s + oc.amount_cents / 100, 0).toLocaleString()} total
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-emerald-700 hover:text-emerald-900"
                    onClick={() => setSelectedCostIds(prev => {
                      const next = new Set(prev);
                      selectedPayable.forEach(oc => next.delete(oc.id));
                      return next;
                    })}
                    data-testid="button-deselect-all-payable"
                  >
                    Clear selection
                  </Button>
                </div>
                {selectedPayable.length >= 2 && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-3 text-xs"
                    onClick={() => handleOpenBatchCostPay(selectedPayable)}
                    data-testid="button-batch-cost-pay"
                  >
                    <Wallet className="h-3.5 w-3.5 mr-1" />
                    Batch Pay ({selectedPayable.length})
                  </Button>
                )}
              </div>
            );
          })()}

          {/* Stale-submissions alert — shown to approvers when items have been pending >3 days */}
          {!operationalCostsLoading && (() => {
            const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const stalePending = filteredOperationalCosts.filter(oc => {
              const st = getOperationalDerivedStatus(oc);
              if (st !== 'pending' && st !== 'under_review') return false;
              const submittedAt = oc.submitted_at ? new Date(oc.submitted_at).getTime() : 0;
              return submittedAt > 0 && (now - submittedAt) > THREE_DAYS_MS;
            });
            if (stalePending.length === 0) return null;
            const oldest = stalePending.reduce((a, b) => {
              const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
              const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
              return ta < tb ? a : b;
            });
            const oldestDays = Math.floor((now - new Date(oldest.submitted_at!).getTime()) / (24 * 60 * 60 * 1000));
            return (
              <div
                className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm"
                data-testid="banner-stale-submissions"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {stalePending.length === 1
                      ? `1 submission has been waiting for approval for ${oldestDays} days`
                      : `${stalePending.length} submissions have been waiting for approval — oldest is ${oldestDays} days`}
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                    Use the <strong>Send Reminder</strong> (⏰) button on each card to notify approvers via in-app notification, email, and WhatsApp.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex-shrink-0"
                  onClick={() => setStatusFilter('pending')}
                  data-testid="button-stale-filter-pending"
                >
                  Show pending
                </Button>
              </div>
            );
          })()}

          {/* Operational Cost Submissions */}
          {operationalCostsLoading && filteredOperationalCosts.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          )}
          {(() => {
            const statusFiltered = statusFilter === 'all'
              ? filteredOperationalCosts
              : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);

            // In-card status chip counts (computed before the chip filter so badges
            // always reflect the full statusFiltered pool, not the filtered slice)
            const ocStatusCounts = {
              pending: statusFiltered.filter(o => { const d = getOperationalDerivedStatus(o); return d === 'pending' || d === 'under_review'; }).length,
              approved: statusFiltered.filter(o => getOperationalDerivedStatus(o) === 'approved').length,
              paid: statusFiltered.filter(o => { const d = getOperationalDerivedStatus(o); return d === 'paid' || d === 'reconciled'; }).length,
              rejected: statusFiltered.filter(o => getOperationalDerivedStatus(o) === 'rejected').length,
            };
            const myActionCount = statusFiltered.filter(o =>
              canTier1Approve(o) || canTier2Approve(o) || canTier3Approve(o) || canTier4Approve(o)
            ).length;

            // Apply in-card status chip filter + "my action" filter on top of the global tab filter
            const ocChipFiltered = (() => {
              let result = ocStatusFilter.size === 0 ? statusFiltered : statusFiltered.filter(oc => {
                const d = getOperationalDerivedStatus(oc);
                if (ocStatusFilter.has('pending') && (d === 'pending' || d === 'under_review')) return true;
                if (ocStatusFilter.has('approved') && d === 'approved') return true;
                if (ocStatusFilter.has('paid') && (d === 'paid' || d === 'reconciled')) return true;
                if (ocStatusFilter.has('rejected') && d === 'rejected') return true;
                return false;
              });
              if (showMyActionOnly) result = result.filter(oc =>
                canTier1Approve(oc) || canTier2Approve(oc) || canTier3Approve(oc) || canTier4Approve(oc)
              );
              if (costPreFundFilter !== 'all') {
                result = result.filter(oc => {
                  const links = costPreFundLinks.get(oc.id) ?? [];
                  if (costPreFundFilter === '__unlinked__') return links.length === 0 && (oc.amount_paid_cents ?? 0) > 0;
                  if (costPreFundFilter === '__multiple__') return links.length > 1;
                  return links.some(link => link.id === costPreFundFilter);
                });
              }
              return result;
            })();

            const searchTerm = costSearch.trim().toLowerCase();
            const searchFiltered = (() => {
              let res = searchTerm ? ocChipFiltered.filter(oc =>
                (oc.description || '').toLowerCase().includes(searchTerm) ||
                (oc.vendor || '').toLowerCase().includes(searchTerm) ||
                (oc.reference_number || '').toLowerCase().includes(searchTerm) ||
                (EXPENSE_CATEGORY_MAP[oc.expense_category]?.label || '').toLowerCase().includes(searchTerm) ||
                (oc.expense_category || '').toLowerCase().includes(searchTerm) ||
                (oc.id || '').toLowerCase().includes(searchTerm) ||
                (users.find(u => u.id === oc.submitted_by)?.name || '').toLowerCase().includes(searchTerm)
              ) : ocChipFiltered;
              if (ocDateFrom) res = res.filter(oc => { const d = oc.expense_date || oc.submitted_at || oc.created_at; return !!d && new Date(d) >= new Date(ocDateFrom); });
              if (ocDateTo) res = res.filter(oc => { const d = oc.expense_date || oc.submitted_at || oc.created_at; return !!d && new Date(d) <= new Date(ocDateTo + 'T23:59:59'); });
              const amtMin = parseFloat(ocAmtMin); const amtMax = parseFloat(ocAmtMax);
              if (!isNaN(amtMin)) res = res.filter(oc => oc.amount_cents / 100 >= amtMin);
              if (!isNaN(amtMax)) res = res.filter(oc => oc.amount_cents / 100 <= amtMax);
              return [...res].sort((a, b) => {
                const ad = new Date(a.expense_date || a.submitted_at || a.created_at).getTime();
                const bd = new Date(b.expense_date || b.submitted_at || b.created_at).getTime();
                if (ocSortBy === 'date_asc')    return ad - bd;
                if (ocSortBy === 'amount_desc') return b.amount_cents - a.amount_cents;
                if (ocSortBy === 'amount_asc')  return a.amount_cents - b.amount_cents;
                return bd - ad;
              });
            })();

            // Build ordered group list — items sharing request_group_id become one entry
            type OcGroup = { groupId: string | null; items: typeof searchFiltered };
            const ocGroups: OcGroup[] = [];
            const seenGroupIds = new Set<string>();
            for (const oc of searchFiltered) {
              const gid = oc.request_group_id ?? null;
              if (gid && seenGroupIds.has(gid)) continue;
              if (gid) {
                seenGroupIds.add(gid);
                ocGroups.push({ groupId: gid, items: searchFiltered.filter(o => o.request_group_id === gid) });
              } else {
                ocGroups.push({ groupId: null, items: [oc] });
              }
            }

            // Build category groups from ocGroups
            // Multi-category groups (items from >1 distinct categories) go into __multi__
            const catOrderKeys = Object.keys(EXPENSE_CATEGORY_MAP);
            const catGroupMap = new Map<string, typeof ocGroups>();
            for (const g of ocGroups) {
              const distinctCats = [...new Set(g.items.map(i => i.expense_category || 'other'))];
              const cat = g.groupId && distinctCats.length > 1 ? '__multi__' : (distinctCats[0] || 'other');
              if (!catGroupMap.has(cat)) catGroupMap.set(cat, []);
              catGroupMap.get(cat)!.push(g);
            }
            const sortedCatKeys = Array.from(catGroupMap.keys()).sort((a, b) => {
              // __multi__ sorts first so it appears at the top
              if (a === '__multi__') return -1;
              if (b === '__multi__') return 1;
              const ai = catOrderKeys.indexOf(a);
              const bi = catOrderKeys.indexOf(b);
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
            const allPayableFiltered = searchFiltered.filter(canMarkAsPaid);
            const allPayableSelected = allPayableFiltered.length > 0 && allPayableFiltered.every(o => selectedCostIds.has(o.id));
            const selectedFundingPaidByCurrency = new Map<string, number>();
            if (costPreFundFilter !== 'all'
              && costPreFundFilter !== '__unlinked__'
              && costPreFundFilter !== '__multiple__') {
              searchFiltered.forEach(oc => (costPreFundLinks.get(oc.id) ?? [])
                .filter(link => link.id === costPreFundFilter)
                .forEach(link => {
                  const currency = link.currency || oc.currency || 'SDG';
                  selectedFundingPaidByCurrency.set(
                    currency,
                    (selectedFundingPaidByCurrency.get(currency) ?? 0) + Math.round((link.amount ?? 0) * 100),
                  );
                }));
            } else {
              searchFiltered.forEach(oc => {
                const currency = oc.currency || 'SDG';
                selectedFundingPaidByCurrency.set(
                  currency,
                  (selectedFundingPaidByCurrency.get(currency) ?? 0) + (oc.amount_paid_cents ?? 0),
                );
              });
            }
            const selectedFundingPaidTotals = [...selectedFundingPaidByCurrency.entries()];
            const selectedFundingName = costPreFundFilter === 'all'
              ? 'All funding sources'
              : costPreFundFilter === '__unlinked__'
                ? 'Paid without Pre-Fund'
                : costPreFundFilter === '__multiple__'
                  ? 'Requests paid from multiple Pre-Funds'
                  : costPreFundOptions.find(fund => fund.id === costPreFundFilter)?.name ?? 'Selected Pre-Fund';

            return searchFiltered.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Receipt className="h-5 w-5 text-blue-600" />
                      <CardTitle className="text-base">Operational Cost Requests</CardTitle>
                      <Badge variant="secondary">{ocGroups.length}</Badge>
                      {ocGroups.length !== searchFiltered.length && (
                        <span className="text-xs text-muted-foreground">({searchFiltered.length} items)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {allPayableFiltered.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => {
                            setSelectedCostIds(prev => {
                              const next = new Set(prev);
                              allPayableFiltered.forEach(o => { if (allPayableSelected) next.delete(o.id); else next.add(o.id); });
                              return next;
                            });
                          }}
                          data-testid="button-select-all-visible"
                        >
                          {allPayableSelected ? 'Deselect All' : `Select All (${allPayableFiltered.length})`}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs text-muted-foreground"
                        onClick={() => {
                          if (collapsedCategories.size > 0) {
                            setCollapsedCategories(new Set());
                          } else {
                            setCollapsedCategories(new Set(sortedCatKeys));
                          }
                        }}
                        data-testid="button-toggle-all-categories"
                      >
                        {collapsedCategories.size > 0 ? (
                          <><ChevronDown className="h-3.5 w-3.5 mr-1" />Expand All</>
                        ) : (
                          <><ChevronRight className="h-3.5 w-3.5 mr-1" />Collapse All</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs text-muted-foreground"
                        onClick={() => {
                          const allIds = searchFiltered.map(o => o.id);
                          const allExpanded = allIds.every(id => expandedFlows.has(id));
                          if (allExpanded) {
                            setExpandedFlows(new Set());
                          } else {
                            setExpandedFlows(new Set(allIds));
                          }
                        }}
                        data-testid="button-toggle-all-flows"
                      >
                        <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
                        {searchFiltered.every(o => expandedFlows.has(o.id)) ? 'Collapse Flows' : 'Expand Flows'}
                      </Button>
                    </div>
                  </div>
                  {canManagePreFundFilters && costPreFundFilter !== 'all' && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/70 dark:bg-emerald-950/30" data-testid="cost-pre-fund-paid-total">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">Total paid from: {selectedFundingName}</p>
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                          Based on {costPreFundFilter === '__unlinked__' || costPreFundFilter === '__multiple__'
                            ? 'the matching request payment totals'
                            : 'immutable payment events for this Pre-Fund'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {selectedFundingPaidTotals.map(([currency, amount]) => (
                          <p key={currency} className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {currency} {(amount / 100).toLocaleString()}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by description, vendor, reference, category..."
                      value={costSearch}
                      onChange={e => setCostSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                      data-testid="input-cost-search"
                    />
                    {costSearch && (
                      <button className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setCostSearch('')} data-testid="button-clear-cost-search">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Sort · Advanced filters · Remind All · Spend Chart · Save Filter */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${showAdvFilters ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 text-slate-700 dark:text-slate-300' : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'}`}
                      onClick={() => setShowAdvFilters(v => !v)}
                      data-testid="button-toggle-adv-filters"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      Filters{(ocDateFrom || ocDateTo || ocAmtMin || ocAmtMax) ? ' ●' : ''}
                    </button>
                    <select
                      value={ocSortBy}
                      onChange={e => setOcSortBy(e.target.value as typeof ocSortBy)}
                      className="h-7 rounded-full border border-border bg-transparent text-[11px] px-2.5 text-muted-foreground focus:outline-none cursor-pointer"
                      data-testid="select-oc-sort"
                    >
                      <option value="date_desc">↓ Newest first</option>
                      <option value="date_asc">↑ Oldest first</option>
                      <option value="amount_desc">↓ Highest amount</option>
                      <option value="amount_asc">↑ Lowest amount</option>
                    </select>
                    {(isSuperAdmin || isAdmin || isFOM || isSupervisor) && (() => {
                      const pendingItems = searchFiltered.filter(o => { const d = getOperationalDerivedStatus(o); return d === 'pending' || d === 'under_review'; });
                      if (pendingItems.length === 0) return null;
                      return (
                        <button
                          className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
                          onClick={async () => {
                            setRemindAllProcessing(true);
                            let sent = 0;
                            for (const pendOc of pendingItems) {
                              const last = lastRemindedMap[pendOc.id] ? new Date(lastRemindedMap[pendOc.id]).getTime() : 0;
                              if (Date.now() - last < 24 * 60 * 60 * 1000) continue;
                              setLastRemindedMap(prev => ({ ...prev, [pendOc.id]: new Date().toISOString() }));
                              sent++;
                            }
                            setRemindAllProcessing(false);
                            toast({ title: `Reminders queued (${sent})`, description: sent > 0 ? `${sent} item${sent !== 1 ? 's' : ''} queued. Items reminded within 24h were skipped.` : 'All items were already reminded within 24 hours.' });
                          }}
                          disabled={remindAllProcessing}
                          data-testid="button-remind-all-pending"
                        >
                          <Bell className="h-3 w-3" />{remindAllProcessing ? 'Sending...' : `Remind All (${pendingItems.length})`}
                        </button>
                      );
                    })()}
                    <button
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${showSpendChart ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'}`}
                      onClick={() => setShowSpendChart(v => !v)}
                      data-testid="button-toggle-spend-chart"
                    >
                      <BarChart3 className="h-3 w-3" />Spend Chart
                    </button>
                    {(costSearch || ocDateFrom || ocDateTo || ocAmtMin || ocAmtMax) && (
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400 hover:bg-violet-100 transition-colors"
                        onClick={() => {
                          const label = prompt('Name this filter preset:');
                          if (!label) return;
                          const nf = { label, search: costSearch, dateFrom: ocDateFrom, dateTo: ocDateTo, amtMin: ocAmtMin, amtMax: ocAmtMax };
                          const upd = [...savedFilters, nf];
                          setSavedFilters(upd);
                          localStorage.setItem('oc_saved_filters', JSON.stringify(upd));
                          toast({ title: 'Filter saved', description: `"${label}" saved to quick filters.` });
                        }}
                        data-testid="button-save-filter"
                      >
                        <BookmarkPlus className="h-3 w-3" />Pin Filter
                      </button>
                    )}
                  </div>
                  {/* Saved / pinned filter chips */}
                  {savedFilters.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground shrink-0">Pinned:</span>
                      {savedFilters.map((f, fi) => (
                        <div key={fi} className="inline-flex items-center rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-[10px] font-medium text-violet-700 dark:text-violet-400 overflow-hidden">
                          <button className="px-2 py-0.5" onClick={() => { setCostSearch(f.search); setOcDateFrom(f.dateFrom); setOcDateTo(f.dateTo); setOcAmtMin(f.amtMin); setOcAmtMax(f.amtMax); }} data-testid={`button-apply-saved-filter-${fi}`}>{f.label}</button>
                          <button className="px-1.5 border-l border-violet-200 dark:border-violet-700 hover:text-red-500" onClick={() => { const u = savedFilters.filter((_, i) => i !== fi); setSavedFilters(u); localStorage.setItem('oc_saved_filters', JSON.stringify(u)); }} data-testid={`button-remove-saved-filter-${fi}`}><X className="h-2.5 w-2.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Advanced date/amount filter panel */}
                  {showAdvFilters && (
                    <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Date from</label>
                        <Input type="date" value={ocDateFrom} onChange={e => setOcDateFrom(e.target.value)} className="h-7 text-xs" data-testid="input-date-from" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Date to</label>
                        <Input type="date" value={ocDateTo} onChange={e => setOcDateTo(e.target.value)} className="h-7 text-xs" data-testid="input-date-to" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Min amount</label>
                        <Input type="number" placeholder="0" value={ocAmtMin} onChange={e => setOcAmtMin(e.target.value)} className="h-7 text-xs" data-testid="input-amt-min" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Max amount</label>
                        <Input type="number" placeholder="∞" value={ocAmtMax} onChange={e => setOcAmtMax(e.target.value)} className="h-7 text-xs" data-testid="input-amt-max" />
                      </div>
                      {(ocDateFrom || ocDateTo || ocAmtMin || ocAmtMax) && (
                        <button className="col-span-full text-[11px] text-muted-foreground hover:text-foreground text-left" onClick={() => { setOcDateFrom(''); setOcDateTo(''); setOcAmtMin(''); setOcAmtMax(''); }} data-testid="button-clear-adv-filters">✕ Clear all filters</button>
                      )}
                    </div>
                  )}
                  {/* Mini spend-by-category bar chart */}
                  {showSpendChart && (() => {
                    const catTotals = new Map<string, number>();
                    searchFiltered.forEach(o => {
                      const k = EXPENSE_CATEGORY_MAP[o.expense_category]?.label || o.expense_category || 'Other';
                      catTotals.set(k, (catTotals.get(k) || 0) + o.amount_cents / 100);
                    });
                    const sorted = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
                    const maxVal = Math.max(...sorted.map(e => e[1]), 1);
                    const totalAmt = searchFiltered.reduce((s, o) => s + o.amount_cents / 100, 0);
                    const currency = searchFiltered[0]?.currency || 'SDG';
                    const avgCycleMs = (() => {
                      const closed = searchFiltered.filter(o => o.tier1_approved_at && (o.submitted_at || o.created_at));
                      if (!closed.length) return null;
                      return closed.reduce((s, o) => s + (new Date(o.tier1_approved_at!).getTime() - new Date(o.submitted_at || o.created_at).getTime()), 0) / closed.length;
                    })();
                    return (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-[11px] font-semibold text-foreground">Spend by Category</span>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Total: <strong className="text-foreground">{currency} {totalAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                            {avgCycleMs !== null && (
                              <span>Avg T1 cycle: <strong className="text-foreground">{Math.round(avgCycleMs / (1000 * 60 * 60 * 24))}d</strong></span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {sorted.map(([cat, total]) => (
                            <div key={cat} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-28 shrink-0 truncate" title={cat}>{cat}</span>
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500/70 transition-all" style={{ width: `${(total / maxVal) * 100}%` }} />
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground w-24 text-right shrink-0">{currency} {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* In-card status chips — multi-select; empty = show all */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      { key: 'pending',  label: 'Pending',  count: ocStatusCounts.pending,  activeClass: 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-800 dark:text-amber-300' },
                      { key: 'approved', label: 'Approved', count: ocStatusCounts.approved, activeClass: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 text-emerald-800 dark:text-emerald-300' },
                      { key: 'paid',     label: 'Paid',     count: ocStatusCounts.paid,     activeClass: 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-800 dark:text-blue-300' },
                      { key: 'rejected', label: 'Rejected', count: ocStatusCounts.rejected, activeClass: 'bg-red-100 dark:bg-red-900/40 border-red-400 text-red-800 dark:text-red-300' },
                    ] as const).filter(c => c.count > 0).map(({ key, label, count, activeClass }) => {
                      const active = ocStatusFilter.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleOcStatus(key)}
                          data-testid={`chip-oc-status-${key}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer select-none
                            ${active ? activeClass : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'}`}
                        >
                          {label}
                          <span className={`rounded-full px-1 text-[10px] font-semibold ${active ? 'bg-white/40 dark:bg-black/30' : 'bg-muted-foreground/20'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {myActionCount > 0 && (
                      <button
                        onClick={() => setShowMyActionOnly(p => !p)}
                        data-testid="chip-oc-my-action"
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer select-none
                          ${showMyActionOnly ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-400 text-violet-800 dark:text-violet-300' : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'}`}
                      >
                        <Zap className="h-3 w-3" />
                        My Action
                        <span className={`rounded-full px-1 text-[10px] font-semibold ${showMyActionOnly ? 'bg-white/40 dark:bg-black/30' : 'bg-muted-foreground/20'}`}>
                          {myActionCount}
                        </span>
                      </button>
                    )}
                    {(ocStatusFilter.size > 0 || showMyActionOnly) && (
                      <button
                        onClick={() => { setOcStatusFilter(new Set()); setShowMyActionOnly(false); }}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        data-testid="button-clear-oc-status-filter"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div>
                  {sortedCatKeys.map(cat => {
                    const catGroups = catGroupMap.get(cat)!;
                    const catMetaH = EXPENSE_CATEGORY_MAP[cat];
                    const CatIconH = catMetaH?.icon;
                    const catLabelH = catMetaH?.label || cat.replace(/_/g, ' ');
                    const catAllItems = catGroups.flatMap(g => g.items);
                    const catPayable = catAllItems.filter(canMarkAsPaid);
                    const catAllSelected = catPayable.length > 0 && catPayable.every(o => selectedCostIds.has(o.id));
                    const catSomeSelected = catPayable.some(o => selectedCostIds.has(o.id));
                    const catPendingCnt = catAllItems.filter(o => { const ds = getOperationalDerivedStatus(o); return ds === 'pending' || ds === 'under_review'; }).length;
                    const catApprovedOnlyCnt = catAllItems.filter(o => getOperationalDerivedStatus(o) === 'approved').length;
                    const catPaidCnt = catAllItems.filter(o => { const ds = getOperationalDerivedStatus(o); return ds === 'paid' || ds === 'reconciled'; }).length;
                    const catRejectedCnt = catAllItems.filter(o => getOperationalDerivedStatus(o) === 'rejected').length;
                    const catTotalCents = catAllItems.reduce((s, o) => s + o.amount_cents, 0);
                    const catCurrency = catAllItems[0]?.currency || 'USD';
                    const isCatExpanded = !collapsedCategories.has(cat);
                    return (
                      <div key={cat} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0" data-testid={`category-section-${cat}`}>
                        {/* ── Category Header ── */}
                        <div
                          className="flex items-center gap-2.5 px-4 py-3 bg-slate-50/80 dark:bg-slate-900/40 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                          onClick={() => toggleCategory(cat)}
                          data-testid={`button-category-toggle-${cat}`}
                        >
                          {catPayable.length > 0 && (
                            <div
                              className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-none transition-colors ${
                                catAllSelected
                                  ? 'bg-emerald-500 border-emerald-400'
                                  : catSomeSelected
                                  ? 'bg-emerald-400/60 border-emerald-400'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-emerald-400'
                              }`}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCostIds(prev => {
                                  const next = new Set(prev);
                                  catPayable.forEach(o => { if (catAllSelected) next.delete(o.id); else next.add(o.id); });
                                  return next;
                                });
                              }}
                              title={catAllSelected ? 'Deselect all approved in this category' : 'Select all approved in this category'}
                              data-testid={`checkbox-category-${cat}`}
                            >
                              {catAllSelected && <Check className="h-3 w-3 text-white" />}
                              {catSomeSelected && !catAllSelected && <div className="h-2 w-2 rounded-sm bg-emerald-500" />}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="flex-none h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                              {CatIconH && <CatIconH className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-gray-900 dark:text-white leading-none">{catLabelH}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{catAllItems.length} item{catAllItems.length !== 1 ? 's' : ''} · {catCurrency} {(catTotalCents / 100).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center gap-1 flex-wrap">
                            {catPendingCnt > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                <Clock className="h-2.5 w-2.5" /> {catPendingCnt} pending
                              </span>
                            )}
                            {catApprovedOnlyCnt > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400">
                                <CheckCircle2 className="h-2.5 w-2.5" /> {catApprovedOnlyCnt} approved
                              </span>
                            )}
                            {catPaidCnt > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-400">
                                <Wallet className="h-2.5 w-2.5" /> {catPaidCnt} paid
                              </span>
                            )}
                            {catRejectedCnt > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
                                <XCircle className="h-2.5 w-2.5" /> {catRejectedCnt} rejected
                              </span>
                            )}
                          </div>
                          {isCatExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-none" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
                          }
                        </div>
                        {/* ── Category items (when expanded) ── */}
                        {isCatExpanded && (
                        <div className="space-y-3 p-3">
                  {catGroups.map(({ groupId, items: groupItems }) => {
                    const isMultiItem = groupItems.length > 1;

                    // Outer-scope group stats (reused by GroupHeader, item rows, and footer)
                    // Bug fix: use request_title with proper fallback; strip <<title>> markers for display
                    const groupTitle = groupItems[0].request_title
                      || (() => {
                          const raw = groupItems[0].description || '';
                          const titleMatch = raw.match(/<<([^>>]+)>>/);
                          return titleMatch ? titleMatch[1].trim() : raw.split('\n')[0]?.replace(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/, '').trim() || 'Grouped Request';
                        })();
                    // Bug fix: distinct status counts — partially_paid is its own bucket, not "pending"
                    const grpApprovedCnt = groupItems.filter(o => { const ds = getOperationalDerivedStatus(o); return ds === 'approved'; }).length;
                    const grpPaidCnt = groupItems.filter(o => { const ds = getOperationalDerivedStatus(o); return ds === 'paid' || ds === 'reconciled'; }).length;
                    const grpPartialCnt = groupItems.filter(o => getOperationalDerivedStatus(o) === 'partially_paid').length;
                    const grpRejectedCnt = groupItems.filter(o => getOperationalDerivedStatus(o) === 'rejected').length;
                    const grpDoneCnt = grpApprovedCnt + grpPaidCnt; // for progress bar "done" segment
                    const grpPendingCnt = groupItems.length - grpDoneCnt - grpPartialCnt - grpRejectedCnt;
                    // Bug fix: only compute approvable tier; also compute the items that are actually waiting
                    const grpTier1Approvable = isMultiItem ? groupItems.filter(o => canTier1Approve(o)) : [];
                    const grpTier2Approvable = isMultiItem ? groupItems.filter(o => canTier2Approve(o)) : [];
                    const grpTier3Approvable = isMultiItem ? groupItems.filter(o => canTier3Approve(o)) : [];
                    const grpTier4Approvable = isMultiItem ? groupItems.filter(o => canTier4Approve(o)) : [];
                    const grpApprovableTier: 1 | 2 | 3 | 4 | null = isMultiItem ? (
                      grpTier1Approvable.length > 0 ? 1 :
                      grpTier2Approvable.length > 0 ? 2 :
                      grpTier3Approvable.length > 0 ? 3 :
                      grpTier4Approvable.length > 0 ? 4 : null
                    ) : null;
                    const grpApprovableItems = grpApprovableTier === 1 ? grpTier1Approvable
                      : grpApprovableTier === 2 ? grpTier2Approvable
                      : grpApprovableTier === 3 ? grpTier3Approvable
                      : grpTier4Approvable;
                    // Mixed-state: group has BOTH approved and rejected items
                    const grpIsMixed = grpRejectedCnt > 0 && grpDoneCnt > 0;
                    // Category composition for this group
                    const grpCatComposition = (() => {
                      const map = new Map<string, number>();
                      groupItems.forEach(o => { const c = o.expense_category || 'other'; map.set(c, (map.get(c) || 0) + 1); });
                      return [...map.entries()].sort((a, b) => b[1] - a[1]);
                    })();

                     // GROUP HEADER (only for multi-item groups) — navy gradient with collapse/expand
                     const GroupHeader = isMultiItem ? (() => {
                       const totalCents = groupItems.reduce((s, o) => s + o.amount_cents, 0);
                       const totalPaidCents = groupItems.reduce((s, o) => s + (o.amount_paid_cents || 0), 0);
                       const currency = groupItems[0].currency;
                       const submitterName = users.find(u => u.id === groupItems[0].submitted_by)?.name || 'Unknown';
                       const linkedProjectName = groupItems[0].project_id ? allProjects.find(p => p.id === groupItems[0].project_id)?.name : null;
                       const linkedMmpName = groupItems[0].mmp_file_id ? mmpNameMap.get(groupItems[0].mmp_file_id) || null : null;
                        const groupPreFundNames = [...new Map(
                          groupItems
                            .flatMap(item => costPreFundLinks.get(item.id) ?? [])
                            .map(link => [link.id, link.name]),
                        ).values()];
                       const projPalette = getProjectPalette(groupItems[0].project_id);
                      const groupApprovableTier = grpApprovableTier;
                      const isExpanded = expandedGroupIds.has(groupId!);
                      // GRP reference: last 8 chars of the UUID, uppercase
                      const grpRef = groupId ? `GRP-${groupId.slice(-8).toUpperCase()}` : '';
                      // Mixed-state border colour: orange stripe if partially rejected, default project colour otherwise
                      const headerBorderColor = grpIsMixed ? '#f97316' : projPalette.border;

                      // Group-level batch selection
                      const groupPayableItems = groupItems.filter(o => canMarkAsPaid(o));
                      const groupAllSelected = groupPayableItems.length > 0 && groupPayableItems.every(o => selectedCostIds.has(o.id));
                      const groupSomeSelected = groupPayableItems.some(o => selectedCostIds.has(o.id));
                      const handleGroupCheckbox = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedCostIds(prev => {
                          const next = new Set(prev);
                          groupPayableItems.forEach(o => {
                            if (groupAllSelected) next.delete(o.id); else next.add(o.id);
                          });
                          return next;
                        });
                      };

                      return (
                        <div>
                          {/* Navy header row: clicking expands/collapses the group; use View button inside or footer to open details */}
                          <div
                            className="flex items-stretch bg-gradient-to-r from-[#0F2041] to-[#1D3461] cursor-pointer select-none hover:from-[#1a2f58] hover:to-[#243d6e] transition-colors"
                            style={{ borderLeft: `4px solid ${headerBorderColor}` }}
                            onClick={() => toggleGroup(groupId!)}
                            data-testid={`button-group-toggle-${groupId}`}
                          >
                            {/* Group-level checkbox — stops propagation so it doesn't also toggle expand */}
                            {groupPayableItems.length > 0 && (
                              <div
                                className="flex-none flex flex-col items-center justify-center px-3 hover:bg-white/10 border-r border-white/10 gap-1"
                                onClick={handleGroupCheckbox}
                                data-testid={`checkbox-group-${groupId}`}
                                title="Select all payable items in this group for batch payment"
                              >
                                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  groupAllSelected ? 'bg-green-500 border-green-400'
                                  : groupSomeSelected ? 'bg-green-500/50 border-green-400'
                                  : 'bg-white/15 border-white/50 hover:border-white'
                                }`}>
                                  {groupAllSelected && <Check className="h-3 w-3 text-white" />}
                                  {groupSomeSelected && !groupAllSelected && <div className="h-2 w-2 rounded-sm bg-white" />}
                                </div>
                                <span className="text-[9px] text-white/50 leading-none">All</span>
                              </div>
                            )}

                            {/* Collapse / expand toggle content area */}
                            <div
                              className="flex-1 text-left px-4 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-none mt-0.5">
                                  <Layers className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  {/* Title row with GRP ref and mixed-state badge */}
                                  <div className="flex items-start gap-2 flex-wrap">
                                    <p className="font-semibold text-[14px] leading-snug text-white line-clamp-2 flex-1">{groupTitle}</p>
                                    {grpIsMixed && (
                                      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-500/30 border border-orange-400/40 px-1.5 py-0.5 text-[9px] font-bold text-orange-300 uppercase tracking-wide">
                                        ⚠ Mixed
                                      </span>
                                    )}
                                  </div>
                                  {/* GRP reference + meta */}
                                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                    <span className="text-white/40 font-mono text-[10px]">{grpRef}</span>
                                    {linkedProjectName && (
                                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                                        style={{ backgroundColor: projPalette.bg, color: projPalette.text, border: `1px solid ${projPalette.border}40` }}>
                                        <Briefcase className="h-3 w-3" />{linkedProjectName}
                                      </span>
                                    )}
                                    {linkedMmpName && (
                                      <span className="flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold">
                                        <ClipboardCheck className="h-3 w-3" />{linkedMmpName}
                                      </span>
                                    )}
                                     {groupPreFundNames.length > 0 && (
                                       <span
                                         className="flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 text-[11px] font-semibold"
                                         title={groupPreFundNames.join(', ')}
                                         data-testid={`badge-group-pre-fund-${groupId}`}
                                       >
                                         <Wallet className="h-3 w-3" />
                                         Pre-Fund: {groupPreFundNames[0]}{groupPreFundNames.length > 1 ? ` +${groupPreFundNames.length - 1}` : ''}
                                       </span>
                                     )}
                                    {canViewTeamSubmissions && <span className="flex items-center gap-1 text-white/60"><Users className="h-3 w-3" />{submitterName}</span>}
                                    <span className="flex items-center gap-1 text-white/60"><Calendar className="h-3 w-3" />{format(new Date(groupItems[0].created_at), 'MMM d, yyyy h:mm a')}</span>
                                  </div>
                                  {/* Status pills */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                                      <Layers className="h-2.5 w-2.5" /> {groupItems.length} items
                                    </span>
                                    {grpDoneCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/25 px-2 py-0.5 text-[10px] font-semibold text-green-300">
                                        <CheckCircle2 className="h-2.5 w-2.5" /> {grpDoneCnt} approved
                                      </span>
                                    )}
                                    {grpPartialCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/25 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
                                        <Wallet className="h-2.5 w-2.5" /> {grpPartialCnt} partial
                                      </span>
                                    )}
                                    {grpPendingCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                        <Clock className="h-2.5 w-2.5" /> {grpPendingCnt} pending
                                      </span>
                                    )}
                                    {grpRejectedCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                                        <AlertCircle className="h-2.5 w-2.5" /> {grpRejectedCnt} rejected
                                      </span>
                                    )}
                                  </div>
                                  {/* Category composition badges */}
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {grpCatComposition.map(([cat, cnt]) => {
                                      const cm = EXPENSE_CATEGORY_MAP[cat];
                                      const CIcon = cm?.icon;
                                      return (
                                        <span key={cat} className="inline-flex items-center gap-0.5 rounded-full bg-white/10 border border-white/15 px-1.5 py-0.5 text-[9px] text-white/70">
                                          {CIcon && <CIcon className="h-2.5 w-2.5" />}
                                          {cm?.label || cat}{cnt > 1 && ` ×${cnt}`}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex-none text-right">
                                  <p className="font-bold text-base tabular-nums text-white">{currency} {(totalCents / 100).toLocaleString()}</p>
                                  <p className="text-[10px] text-white/50">Total Requested</p>
                                  {totalPaidCents > 0 && (
                                    <p className="text-[11px] font-semibold tabular-nums text-orange-300 mt-0.5">
                                      Paid: {currency} {(totalPaidCents / 100).toLocaleString()}
                                    </p>
                                  )}
                                  {totalPaidCents > 0 && totalPaidCents < totalCents && (
                                    <p className="text-[10px] text-white/40">
                                      Remaining: {currency} {((totalCents - totalPaidCents) / 100).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                                {/* Chevron toggle — far-right edge */}
                                <div className="flex-none flex items-center pl-2">
                                  {isExpanded
                                    ? <ChevronDown className="h-5 w-5 text-white/60" />
                                    : <ChevronRight className="h-5 w-5 text-white/60" />
                                  }
                                </div>
                              </div>
                            </div>
                            {/* Group-level Delete button — SuperAdmin only */}
                            {isSuperAdmin && groupItems.some(o => getOperationalDerivedStatus(o) !== 'reconciled') && (
                              <div
                                className="flex-none flex items-center px-3 border-l border-white/10 hover:bg-red-900/40 transition-colors"
                                onClick={e => { e.stopPropagation(); setGroupDeleteConfirm({ groupId: groupId!, items: groupItems, title: groupTitle }); }}
                                data-testid={`button-group-delete-${groupId}`}
                                title="Delete entire group"
                              >
                                <Trash2 className="h-4 w-4 text-red-400 hover:text-red-300" />
                              </div>
                            )}
                          </div>

                          {/* Progress bar — 5 segments: done / partial / pending / rejected */}
                          <div className="h-1.5 bg-[#0F2041] flex" title={`${grpDoneCnt} approved · ${grpPartialCnt} partial · ${grpPendingCnt} pending · ${grpRejectedCnt} rejected`}>
                            <div className="bg-green-400 transition-all duration-300" style={{ width: `${(grpDoneCnt / groupItems.length) * 100}%` }} />
                            <div className="bg-orange-400 transition-all duration-300" style={{ width: `${(grpPartialCnt / groupItems.length) * 100}%` }} />
                            <div className="bg-amber-400 transition-all duration-300" style={{ width: `${(grpPendingCnt / groupItems.length) * 100}%` }} />
                            <div className="bg-red-400 transition-all duration-300" style={{ width: `${(grpRejectedCnt / groupItems.length) * 100}%` }} />
                          </div>

                          {/* Per-category subtotals (collapsible, shown when expanded) */}
                          {isExpanded && grpCatComposition.length > 1 && (
                            <div className="px-4 py-2 bg-[#0a1628]/40 border-b border-blue-900/20">
                              <p className="text-[10px] text-white/40 mb-1.5 uppercase tracking-wider font-semibold">Category breakdown</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {grpCatComposition.map(([cat, cnt]) => {
                                  const cm = EXPENSE_CATEGORY_MAP[cat];
                                  const CIcon = cm?.icon;
                                  const subtotal = groupItems.filter(o => (o.expense_category || 'other') === cat).reduce((s, o) => s + o.amount_cents, 0);
                                  return (
                                    <div key={cat} className="flex items-center gap-1.5 text-[11px] text-white/70">
                                      {CIcon && <CIcon className="h-3 w-3 text-white/50" />}
                                      <span>{cm?.label || cat}</span>
                                      <span className="text-white/40">×{cnt}</span>
                                      <span className="font-semibold text-white/90 tabular-nums">{currency} {(subtotal / 100).toLocaleString()}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Send to Finance / Mark Paid All / Revert Paid All — visible when approved/paid items exist */}
                          {(grpDoneCnt > 0 || grpPartialCnt > 0) && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-[#0a1628]/60 border-b border-blue-900/30 flex-wrap">
                              <Mail className="h-3.5 w-3.5 text-blue-400 flex-none" />
                              <span className="text-[11px] text-blue-300 flex-1">
                                {grpDoneCnt + grpPartialCnt} item{grpDoneCnt + grpPartialCnt !== 1 ? 's' : ''} approved or partially paid
                              </span>
                              {groupPayableItems.length > 0 && !isCountryDirector && (
                                <Button size="sm"
                                  className="h-7 px-3 text-xs bg-green-700 hover:bg-green-600 text-white border border-green-600/50"
                                  onClick={(e) => { e.stopPropagation(); handleOpenBatchCostPay(groupPayableItems); }}
                                  disabled={actionProcessing}
                                  data-testid={`button-group-mark-paid-all-${groupId}`}>
                                  <Wallet className="h-3 w-3 mr-1" />Mark Paid ({groupPayableItems.length})
                                </Button>
                              )}
                              {grpPaidCnt > 0 && !isCountryDirector && (isSuperAdmin || isAdmin) && (() => {
                                const grpPaidItems = groupItems.filter(o => {
                                  const ds = getOperationalDerivedStatus(o);
                                  return ds === 'paid';
                                });
                                const revertCount = grpPaidItems.length;
                                return (
                                  <Button size="sm"
                                    className="h-7 px-3 text-xs bg-orange-700 hover:bg-orange-600 text-white border border-orange-600/50"
                                    onClick={(e) => { e.stopPropagation(); setGroupRevertPaidItems(grpPaidItems); setGroupRevertPaidTitle(groupTitle); }}
                                    disabled={actionProcessing}
                                    data-testid={`button-group-revert-paid-${groupId}`}>
                                    <RotateCcw className="h-3 w-3 mr-1" />Revert Paid ({revertCount})
                                  </Button>
                                );
                              })()}
                              {(isSuperAdmin || isAdmin) && !isFOM && !isCountryDirector && (
                                <Button size="sm"
                                  className="h-7 px-3 text-xs bg-blue-900 hover:bg-blue-800 text-blue-100 border border-blue-700/50"
                                  onClick={(e) => { e.stopPropagation(); openBulkCostEmailDialog(undefined, groupItems); }}
                                  data-testid={`button-group-send-finance-${groupId}`}>
                                  <Mail className="h-3 w-3 mr-1" />Send to Finance
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Approve Remaining / Reject All / Revert Tier — shown when expanded */}
                          {isExpanded && groupId && (() => {
                            // Revertable items: can be done independently of approvable items
                            const grpRevertableItems = groupItems.filter(o => canRevertSubmission(o));
                            // Determine the dominant revert tier (most items share the same tier)
                            const tierCounts: Record<string, OperationalCostSubmission[]> = {};
                            grpRevertableItems.forEach(o => {
                              const t = getRevertTierLabel(o);
                              if (t) { if (!tierCounts[t]) tierCounts[t] = []; tierCounts[t].push(o); }
                            });
                            const grpRevertTier = Object.entries(tierCounts).sort((a, b) => b[1].length - a[1].length)[0];
                            const showApproveReject = groupApprovableTier !== null && grpApprovableItems.length > 0;
                            const showRevert = grpRevertableItems.length > 0 && (isSuperAdmin || isAdmin);
                            if (!showApproveReject && !showRevert) return null;
                            return (
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F2041]/5 border-b border-[#1D3461]/10 flex-wrap">
                                {showApproveReject && (
                                  <span className="text-[11px] text-muted-foreground italic flex-1">
                                    {grpApprovableItems.length < groupItems.length
                                      ? `${grpApprovableItems.length} of ${groupItems.length} items await Tier ${groupApprovableTier} — review individually or:`
                                      : 'Review items individually below, or:'}
                                  </span>
                                )}
                                {showApproveReject && (
                                  <Button size="sm" className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => openGroupApprovalDialog(groupId, groupTitle, grpApprovableItems, 'approve', groupApprovableTier!)}
                                    data-testid={`button-group-approve-all-${groupId}`}>
                                    <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                    {grpApprovableItems.length < groupItems.length
                                      ? `Approve Remaining (${grpApprovableItems.length}) T${groupApprovableTier}`
                                      : `Approve All T${groupApprovableTier}`}
                                  </Button>
                                )}
                                {showApproveReject && (
                                  <Button size="sm" variant="destructive" className="h-7 px-3 text-xs"
                                    onClick={() => openGroupApprovalDialog(groupId, groupTitle, grpApprovableItems, 'reject', groupApprovableTier!)}
                                    data-testid={`button-group-reject-all-${groupId}`}>
                                    <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                    {grpApprovableItems.length < groupItems.length ? `Reject Remaining (${grpApprovableItems.length})` : 'Reject All'}
                                  </Button>
                                )}
                                {showRevert && grpRevertTier && (
                                  <Button size="sm"
                                    className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={() => setGroupRevertTierConfirm({ items: grpRevertTier[1], tier: grpRevertTier[0], title: groupTitle })}
                                    disabled={actionProcessing}
                                    data-testid={`button-group-revert-tier-${groupId}`}>
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                    Revert {grpRevertTier[0]}{grpRevertTier[1].length < groupItems.length ? ` (${grpRevertTier[1].length} of ${groupItems.length})` : ''}
                                  </Button>
                                )}
                              </div>
                            );
                          })()}

                          {/* Add item to group — submitters can append a new line item */}
                          {isExpanded && groupId && grpDoneCnt === 0 && grpRejectedCnt < groupItems.length && (
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#0F2041]/3 border-b border-[#1D3461]/10">
                              <button
                                className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80 transition-colors"
                                onClick={() => {
                                  setAddToGroupContext({ id: groupId, title: groupTitle });
                                  setActiveTab('submit');
                                  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                                }}
                                data-testid={`button-add-to-group-${groupId}`}
                              >
                                <Plus className="h-3 w-3" /> Add item to this group
                              </button>
                              <span className="text-[10px] text-white/25 ml-auto font-mono">{grpRef}</span>
                            </div>
                          )}
                        </div>
                      );
                    })() : null;

                    const itemElements = groupItems.map((oc, idx) => {
                    const catMeta = EXPENSE_CATEGORY_MAP[oc.expense_category];
                    const CatIcon = catMeta?.icon;
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                      under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                      approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                      rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                      partially_paid: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
                      paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
                      reconciled: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
                    };
                    const derivedStatus = getOperationalDerivedStatus(oc);
                    const pendingTierLabel = oc.tier1_status === 'pending' ? '1' : oc.tier2_status === 'pending' ? '2' : oc.tier3_status === 'pending' ? '3' : oc.tier4_status === 'pending' ? '4' : '?';
                    const statusLabels: Record<string, string> = {
                      pending: `Pending (Tier ${pendingTierLabel}) / معلق (المرحلة ${pendingTierLabel})`,
                      under_review: `In Review (Tier ${pendingTierLabel}) / قيد المراجعة (المرحلة ${pendingTierLabel})`,
                      approved: 'Approved / تمت الموافقة',
                      rejected: 'Rejected / مرفوض',
                      partially_paid: 'Partial Payment / دفع جزئي',
                      paid: 'Paid / تم الدفع',
                      reconciled: 'Reconciled / مسوّى',
                    };
                    const submitterName = users.find(u => u.id === oc.submitted_by)?.name || 'Unknown';
                    const title = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';
                    const linkedProjectName = oc.project_id ? allProjects.find(p => p.id === oc.project_id)?.name : null;
                    const requestId = oc.reference_number || oc.id.substring(0, 8).toUpperCase();
                    const preFundLinks = costPreFundLinks.get(oc.id) ?? [];
                    const preFundNames = [...new Map(preFundLinks.map(link => [link.id, link.name])).values()];
                    const hasRecordedPayment = (oc.amount_paid_cents ?? 0) > 0;

                    const cleanTier1Notes = oc.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier2Notes = oc.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier3Notes = oc.tier3_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier4Notes = oc.tier4_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
                    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
                    const tier3Approver = oc.tier3_approved_by ? users.find(u => u.id === oc.tier3_approved_by) : null;
                    const tier4Approver = oc.tier4_approved_by ? users.find(u => u.id === oc.tier4_approved_by) : null;
                    const hasSig = oc.tier1_notes?.includes('[Signed:') || oc.tier2_notes?.includes('[Signed:') || oc.tier3_notes?.includes('[Signed:') || oc.tier4_notes?.includes('[Signed:');

                    // ── COMPACT ROW (inside a multi-item group — mockup design) ──────────────
                    if (isMultiItem) {
                      const isApproved = derivedStatus === 'approved' || derivedStatus === 'paid' || derivedStatus === 'reconciled';
                      const isRejected = derivedStatus === 'rejected';
                      return (
                        <div key={oc.id} data-testid={`operational-cost-${oc.id}`}
                          className={`border-b border-[#1D3461]/10 last:border-b-0 ${selectedCostIds.has(oc.id) ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : isApproved ? 'bg-green-50/60 dark:bg-green-950/20' : isRejected ? 'bg-red-50/40 dark:bg-red-950/20' : 'bg-white dark:bg-background'}`}>
                          <div className="flex items-start gap-2.5 px-4 py-3">
                            {/* Row number / select checkbox */}
                            <div className="w-5 flex-none text-center pt-1">
                              {canMarkAsPaid(oc) ? (
                                <Checkbox
                                  id={`select-cost-${oc.id}`}
                                  checked={selectedCostIds.has(oc.id)}
                                  onCheckedChange={() => toggleCostSelection(oc.id)}
                                  data-testid={`checkbox-select-cost-${oc.id}`}
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                              )}
                            </div>
                            {/* Category icon */}
                            <div className="flex-none h-7 w-7 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                              {CatIcon && <CatIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />}
                            </div>
                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                              {/* Title — large bold headline matching screenshot */}
                              {(() => {
                                const raw = oc.description || '';
                                const titleMatch = raw.match(/<<([^>>]+)>>/);
                                const reqTitle = titleMatch ? titleMatch[1].trim() : title;
                                const bodyLines = raw.split('\n').filter(l => !l.includes('<<') && !l.startsWith('[ADVANCE]'));
                                const justIdx = bodyLines.findIndex(l => l.trim().startsWith('Justification:'));
                                const descLines = justIdx >= 0 ? bodyLines.slice(0, justIdx) : bodyLines;
                                const descText = descLines.join('\n').trim();
                                const isDuplicate = searchFiltered.some(o =>
                                  o.id !== oc.id &&
                                  o.amount_cents === oc.amount_cents &&
                                  !!oc.vendor && (o.vendor || '').toLowerCase() === (oc.vendor || '').toLowerCase() &&
                                  Math.abs(new Date(o.submitted_at || o.created_at).getTime() - new Date(oc.submitted_at || oc.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000
                                );
                                return (
                                  <div>
                                    <div className="flex items-start gap-1.5">
                                      <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight line-clamp-2" title={reqTitle}>{reqTitle}</p>
                                      {isDuplicate && (
                                        <span className="shrink-0 inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700 dark:text-orange-300" title="Possible duplicate: same amount & vendor within 30 days">⚠ Dup?</span>
                                      )}
                                    </div>
                                    {descText && reqTitle !== descText && (
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 line-clamp-1">{descText}</p>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Meta chips: category · submitter · submitted time · vendor · ID */}
                              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                                  {CatIcon && <CatIcon className="h-2.5 w-2.5" />}{catMeta?.label || oc.expense_category}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                  <User className="h-2.5 w-2.5" />{submitterName}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                                  <Clock className="h-2.5 w-2.5" />{format(new Date(oc.submitted_at || oc.created_at), 'MMM d · h:mm a')}
                                </span>
                                {oc.vendor && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                                    <Building2 className="h-2.5 w-2.5" />{oc.vendor}
                                  </span>
                                )}
                                 {preFundNames.length > 0 && (
                                   <span
                                     className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                                     title={preFundNames.join(', ')}
                                     data-testid={`badge-pre-fund-${oc.id}`}
                                   >
                                     <Wallet className="h-2.5 w-2.5" />Pre-Fund: {preFundNames[0]}{preFundNames.length > 1 ? ` +${preFundNames.length - 1}` : ''}
                                   </span>
                                 )}
                                 {hasRecordedPayment && preFundNames.length === 0 && (
                                   <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" data-testid={`badge-no-pre-fund-${oc.id}`}>
                                     <Wallet className="h-2.5 w-2.5" />No Pre-Fund
                                   </span>
                                 )}
                                <span className="text-[10px] text-gray-400/70 tabular-nums">#{requestId}</span>
                              </div>
                              {isRejected && oc.rejection_reason && (
                                <p className="text-[11px] text-red-500 mt-0.5 italic">↩ {oc.rejection_reason}</p>
                              )}
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusColors[derivedStatus] || statusColors.pending}`}>
                                  {statusLabels[derivedStatus] || derivedStatus}
                                </span>
                                {(derivedStatus === 'paid' || derivedStatus === 'reconciled') && (() => {
                                  const glStatus = opsGlLogMap.get(oc.id);
                                  if (!glStatus) return null;
                                  const glCls = glStatus === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : glStatus === 'error' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
                                  const glLabel = glStatus === 'success' ? 'GL ✓' : glStatus === 'error' ? 'GL ✗' : 'GL~';
                                  return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${glCls}`} data-testid={`status-gl-compact-${oc.id}`}><Receipt className="h-2.5 w-2.5" />{glLabel}</span>;
                                })()}
                                {canTier1Approve(oc) && (
                                  <>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                      onClick={() => openApprovalDialog(oc, 'approve', 1)} data-testid={`button-tier1-approve-${oc.id}`}>
                                      <ThumbsUp className="h-2.5 w-2.5" /> Approve T1
                                    </button>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      onClick={() => openApprovalDialog(oc, 'reject', 1)} data-testid={`button-tier1-reject-${oc.id}`}>
                                      <ThumbsDown className="h-2.5 w-2.5" /> Reject
                                    </button>
                                  </>
                                )}
                                {canTier2Approve(oc) && (
                                  <>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                      onClick={() => openApprovalDialog(oc, 'approve', 2)} data-testid={`button-tier2-approve-${oc.id}`}>
                                      <ThumbsUp className="h-2.5 w-2.5" /> {hasThreeTiers(oc) || hasFourTiers(oc) ? 'Approve T2' : 'Final Approve'}
                                    </button>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      onClick={() => openApprovalDialog(oc, 'reject', 2)} data-testid={`button-tier2-reject-${oc.id}`}>
                                      <ThumbsDown className="h-2.5 w-2.5" /> Reject
                                    </button>
                                  </>
                                )}
                                {canTier3Approve(oc) && (
                                  <>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                      onClick={() => openApprovalDialog(oc, 'approve', 3)} data-testid={`button-tier3-approve-${oc.id}`}>
                                      <ThumbsUp className="h-2.5 w-2.5" /> {hasFourTiers(oc) ? 'Approve T3' : 'Final Approve T3'}
                                    </button>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      onClick={() => openApprovalDialog(oc, 'reject', 3)} data-testid={`button-tier3-reject-${oc.id}`}>
                                      <ThumbsDown className="h-2.5 w-2.5" /> Reject
                                    </button>
                                  </>
                                )}
                                {canTier4Approve(oc) && (
                                  <>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                      onClick={() => openApprovalDialog(oc, 'approve', 4)} data-testid={`button-tier4-approve-${oc.id}`}>
                                      <ThumbsUp className="h-2.5 w-2.5" /> Final Approve T4
                                    </button>
                                    <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      onClick={() => openApprovalDialog(oc, 'reject', 4)} data-testid={`button-tier4-reject-${oc.id}`}>
                                      <ThumbsDown className="h-2.5 w-2.5" /> Reject
                                    </button>
                                  </>
                                )}
                                {canEditSubmission(oc) && (
                                  <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    onClick={() => handleEditSubmission(oc)} data-testid={`button-edit-submission-${oc.id}`}>
                                    <Pencil className="h-2.5 w-2.5" /> Edit
                                  </button>
                                )}
                                {canResubmitSubmission(oc) && (
                                  <button className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={() => handleEditSubmission(oc)} data-testid={`button-resubmit-submission-${oc.id}`}>
                                    <SendHorizonal className="h-2.5 w-2.5" /> Resubmit
                                  </button>
                                )}
                                {isApproved && !canTier1Approve(oc) && !canTier2Approve(oc) && !canTier3Approve(oc) && !canTier4Approve(oc) && (
                                  <span className="text-[10px] text-green-600 font-medium">✓ All tiers approved</span>
                                )}
                              </div>
                            </div>
                            {/* Amount + View + Audit */}
                            <div className="flex-none text-right space-y-1 ml-1">
                              {isColVisible('amount') && (
                                <div>
                                  <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white" data-testid={`text-amount-${oc.id}`}>
                                    {oc.currency} {(oc.amount_cents / 100).toLocaleString()}
                                  </p>
                                  <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight">Requested</p>
                                  {(oc.amount_paid_cents || 0) > 0 && (
                                    <>
                                      <p className="text-[11px] font-semibold tabular-nums text-orange-600 dark:text-orange-400 mt-0.5" data-testid={`text-paid-amount-${oc.id}`}>
                                        Paid: {oc.currency} {((oc.amount_paid_cents || 0) / 100).toLocaleString()}
                                      </p>
                                       <p className={`text-[9px] max-w-[180px] truncate ${((costPreFundLinks.get(oc.id) ?? []).length > 0) ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`} title={(costPreFundLinks.get(oc.id) ?? []).map(link => link.name).join(', ')}>
                                         {(costPreFundLinks.get(oc.id) ?? []).length > 0
                                           ? `From: ${(costPreFundLinks.get(oc.id) ?? []).map(link => link.name).join(', ')}`
                                           : 'Pre-Fund: unlinked historical'}
                                       </p>
                                      {(oc.amount_paid_cents || 0) < oc.amount_cents && (
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                                          Rem: {oc.currency} {((oc.amount_cents - (oc.amount_paid_cents || 0)) / 100).toLocaleString()}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                              <button className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-auto"
                                onClick={() => setViewingSubmission(oc)} data-testid={`button-view-details-${oc.id}`}>
                                <Eye className="h-3 w-3" /> View
                              </button>
                              <button className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 ml-auto"
                                onClick={() => setAuditDrawerItem(oc)} data-testid={`button-audit-trail-${oc.id}`}>
                                <History className="h-3 w-3" /> Audit
                              </button>
                            </div>
                          </div>

                          {/* ── Approval Flow Tracker (compact / group item) ── */}
                          {(() => {
                            const isFomSub   = isFomSubmission(oc);
                            const isCoordSub = hasFourTiers(oc);
                            const isSuperSub = hasThreeTiers(oc);
                            const isCDSub    = isCDSubmission(oc);
                            const fourTier   = isCoordSub;
                            const threeTier  = isSuperSub;

                            type StepStatus = 'done' | 'rejected' | 'active' | 'pending';
                            interface FlowStepC {
                              label: string; stepNum: string; person: string; role: string;
                              status: StepStatus; timestamp?: string | null; notes?: string;
                              notifIcon: string; notifText: string;
                              waitingSince?: string | null;
                              expectedApprovers?: Array<{ id: string; name?: string; email?: string; role?: string }>;
                            }

                            const nr = (r: string) => r.toLowerCase().replace(/[\s_-]/g, '');
                            const fmtRoleC = (r?: string | null) => (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                            const submitterUser2 = users.find(u => u.id === oc.submitted_by);
                            const submitterRoleDisplay2 = fmtRoleC(submitterUser2?.role) || 'Staff';

                            const getExpectedC = (rolePredicate: (r: string) => boolean, hubMatch?: boolean) => {
                              // Match the same effective hub used by the T1 authorization check.
                              // A request may not carry hub_id, while a user may be assigned a
                              // state name such as "West Darfur"; both resolve to Forchana Hub.
                              const submitter = users.find(u => u.id === oc.submitted_by);
                              const effectiveHubId = oc.hub_id
                                || submitter?.hubId
                                || submitter?.stateId
                                || (submitter as any)?.state
                                || null;
                              const normalizedRequestHubId = normalizeHubId(effectiveHubId);

                              return users.filter(u => {
                                if (!u.role) return false;
                                const roleNorm = nr(u.role);
                                if (!rolePredicate(roleNorm)) return false;
                                if (hubMatch) {
                                  if (!normalizedRequestHubId) return false;
                                  return getHubAccessInfo(u as any).hubIds.includes(normalizedRequestHubId);
                                }
                                return true;
                              }).slice(0, 5);
                            };

                            const isSupervisorRolePredC  = (r: string) => r.includes('supervisor') || r.includes('hubsupervisor');
                            const isFomRolePredC         = (r: string) => r === 'fom' || r.includes('fieldoperationmanager') || r.includes('fieldopmanager');
                            const isCDRolePredC          = (r: string) => r === 'countrydirector' || r === 'country_director';
                            const isAdminRolePredC       = (r: string) => r === 'admin' || r === 'superadmin' || r.includes('superadmin');
                            const isFinanceAdminRolePredC = (r: string) => r === 'financialadmin' || r === 'financeadmin' || r === 'finance' || r.includes('financ');

                            const t1ExpectedC = oc.tier1_status === 'approved' || oc.tier1_status === 'rejected' ? [] :
                              isCoordSub ? getExpectedC(isSupervisorRolePredC, true) :
                              isSuperSub ? getExpectedC(isFomRolePredC)              :
                              isFomSub   ? getExpectedC(isCDRolePredC)               :
                              isCDSub    ? getExpectedC(isAdminRolePredC)            :
                              getExpectedC(isSupervisorRolePredC, true);

                            const t2ExpectedC = isCDSub || (oc.tier2_status === 'approved' || oc.tier2_status === 'rejected') ? [] :
                              isCoordSub ? getExpectedC(isFomRolePredC)    :
                              isSuperSub ? getExpectedC(isCDRolePredC)     :
                              isFomSub   ? getExpectedC(isAdminRolePredC)  :
                              [];

                            const t3ExpectedC = (oc.tier3_status === 'approved' || oc.tier3_status === 'rejected') ? [] :
                              isCoordSub ? getExpectedC(isCDRolePredC)    :
                              isSuperSub ? getExpectedC(isAdminRolePredC) :
                              [];

                            const t4ExpectedC = (oc.tier4_status === 'approved' || oc.tier4_status === 'rejected') ? [] :
                              isCoordSub ? getExpectedC(isAdminRolePredC) : [];

                            const finExpectedC = derivedStatus === 'approved' ? getExpectedC(isFinanceAdminRolePredC) : [];

                            const nameListC = (people: Array<{ name?: string; email?: string }>) =>
                              people.map(p => p.name || p.email || '').filter(Boolean).join(', ');

                            const t1NameC = tier1Approver?.name || tier1Approver?.email || nameListC(t1ExpectedC) || 'Tier 1 approver';
                            const t2NameC = tier2Approver?.name || tier2Approver?.email || nameListC(t2ExpectedC) || 'Tier 2 approver';
                            // Keep Admin/Super Admin identities private in the final approval
                            // steps; the tier label is enough to identify the responsible role.
                            const t3NameC = fourTier
                              ? tier3Approver?.name || tier3Approver?.email || nameListC(t3ExpectedC) || 'Tier 3 approver'
                              : 'Admin / Super Admin';
                            const t4NameC = 'Admin / Super Admin';

                            const stepsC: FlowStepC[] = [];

                            stepsC.push({
                              label: 'Submitted', stepNum: '①', person: submitterName,
                              role: submitterRoleDisplay2, status: 'done', timestamp: oc.created_at,
                              notifIcon: '📧', notifText: `Email sent to: ${t1NameC}`,
                            });

                            const t1RoleLabelC = isCoordSub ? 'Hub Supervisor'
                              : isSuperSub ? 'Field Op. Manager (FOM)'
                              : isFomSub   ? 'Country Director'
                              : isCDSub    ? 'Admin / Super Admin'
                              : 'Hub Supervisor';
                            const t1StatusC: StepStatus = oc.tier1_status === 'approved' ? 'done' : oc.tier1_status === 'rejected' ? 'rejected' : 'active';
                            stepsC.push({
                              label: isCoordSub ? 'Tier 1 — Supervisor'
                                : isSuperSub ? 'Tier 1 — FOM Review'
                                : isFomSub   ? 'Tier 1 — Country Director'
                                : isCDSub    ? 'Tier 1 — Admin Review'
                                : 'Tier 1 Review',
                              stepNum: '②',
                              person: tier1Approver?.name || tier1Approver?.email || '',
                              role: fmtRoleC((tier1Approver as any)?.role) || t1RoleLabelC,
                              status: t1StatusC, timestamp: oc.tier1_approved_at,
                              waitingSince: t1StatusC === 'active' ? (oc.submitted_at || oc.created_at) : null,
                              notes: cleanTier1Notes || undefined,
                              notifIcon: '📧',
                              notifText: t1StatusC === 'done'
                                ? `Email sent to: ${submitterName}, ${t2NameC}`
                                : `Email sent to: ${t1NameC}`,
                              expectedApprovers: t1ExpectedC,
                            });

                            if (!isCDSub) {
                              const t2RoleLabelC = isCoordSub ? 'Field Op. Manager (FOM)'
                                : isSuperSub ? 'Country Director'
                                : isFomSub   ? 'Admin / Super Admin'
                                : 'Tier 2 Approver';
                              const t2ReachedC = oc.tier1_status === 'approved';
                              const t2StatusC: StepStatus = oc.tier2_status === 'approved' ? 'done' : oc.tier2_status === 'rejected' ? 'rejected' : t2ReachedC ? 'active' : 'pending';
                              stepsC.push({
                                label: isCoordSub ? 'Tier 2 — FOM Review'
                                  : isSuperSub ? 'Tier 2 — Country Director'
                                  : isFomSub   ? 'Tier 2 — Admin Review'
                                  : 'Tier 2 Review',
                                stepNum: '③',
                                person: tier2Approver?.name || tier2Approver?.email || '',
                                role: fmtRoleC((tier2Approver as any)?.role) || t2RoleLabelC,
                                status: t2StatusC, timestamp: oc.tier2_approved_at,
                                waitingSince: t2StatusC === 'active' ? oc.tier1_approved_at : null,
                                notes: cleanTier2Notes || undefined,
                                notifIcon: '📧',
                                notifText: t2StatusC === 'done'
                                  ? `Email sent to: ${submitterName}, ${t3NameC}`
                                  : `Email sent to: ${t2NameC}`,
                                expectedApprovers: t2ExpectedC,
                              });
                            }

                            if (threeTier || fourTier) {
                              const raw3C = oc.tier3_status as string | null;
                              const t3ReachedC = oc.tier1_status === 'approved' && oc.tier2_status === 'approved';
                              const t3StatusC: StepStatus = raw3C === 'approved' ? 'done' : raw3C === 'rejected' ? 'rejected' : t3ReachedC ? 'active' : 'pending';
                              stepsC.push({
                                label: fourTier ? 'Tier 3 — Country Director' : 'Tier 3 — Admin',
                                stepNum: '④',
                                person: fourTier ? tier3Approver?.name || tier3Approver?.email || '' : '',
                                role: fourTier ? fmtRoleC((tier3Approver as any)?.role) || 'Country Director' : 'Admin / Super Admin',
                                status: t3StatusC, timestamp: oc.tier3_approved_at,
                                waitingSince: t3StatusC === 'active' ? oc.tier2_approved_at : null,
                                notes: cleanTier3Notes || undefined,
                                notifIcon: '📧',
                                notifText: t3StatusC === 'done'
                                  ? `Email sent to: ${submitterName}, ${t4NameC}`
                                  : `Email sent to: ${t3NameC}`,
                                expectedApprovers: fourTier ? t3ExpectedC : undefined,
                              });
                            }

                            if (fourTier) {
                              const raw4C = oc.tier4_status as string | null;
                              const t4ReachedC = oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && oc.tier3_status === 'approved';
                              const t4StatusC: StepStatus = raw4C === 'approved' ? 'done' : raw4C === 'rejected' ? 'rejected' : t4ReachedC ? 'active' : 'pending';
                              stepsC.push({
                                label: 'Tier 4 — Admin', stepNum: '⑤',
                                person: '',
                                role: 'Admin / Super Admin',
                                status: t4StatusC, timestamp: oc.tier4_approved_at,
                                waitingSince: t4StatusC === 'active' ? oc.tier3_approved_at : null,
                                notes: cleanTier4Notes || undefined,
                                notifIcon: '📧',
                                notifText: t4StatusC === 'done'
                                  ? `Email sent to: ${submitterName}`
                                  : `Email sent to: ${t4NameC}`,
                                expectedApprovers: undefined,
                              });
                            }

                            const finStatusC: StepStatus =
                              derivedStatus === 'paid' || derivedStatus === 'reconciled' ? 'done'
                              : derivedStatus === 'approved' ? 'active'
                              : 'pending';
                            const finStepNumC = fourTier ? '⑥' : threeTier ? '⑤' : isFomSub ? '④' : isCDSub ? '③' : '④';
                            stepsC.push({
                              label: derivedStatus === 'reconciled' ? 'Reconciled' : derivedStatus === 'paid' ? 'Paid' : 'Finance / Payment',
                              stepNum: finStepNumC,
                              person: derivedStatus === 'paid' || derivedStatus === 'reconciled' ? 'Payment complete' : finStatusC === 'active' ? 'Finance Admin' : '—',
                              role: 'Finance Admin', status: finStatusC, timestamp: null,
                              notifIcon: '📧', notifText: `Email sent to: ${submitterName}`,
                              expectedApprovers: finExpectedC.length > 0 ? finExpectedC : undefined,
                            });

                            const doneStepsC = stepsC.filter(s => s.status === 'done').length;
                            const totalStepsC = stepsC.length;
                            const isFlowOverdueC = stepsC.some(s =>
                              s.status === 'active' && s.waitingSince &&
                              Math.floor((Date.now() - new Date(s.waitingSince).getTime()) / (1000 * 60 * 60 * 24)) >= 3
                            );

                            const dotClsC = (s: StepStatus) =>
                              s === 'done'     ? 'bg-green-500 dark:bg-green-500'
                            : s === 'rejected' ? 'bg-red-500 dark:bg-red-400'
                            : s === 'active'   ? 'bg-amber-400 dark:bg-amber-400 ring-4 ring-amber-200 dark:ring-amber-900'
                            :                   'bg-border dark:bg-muted';

                            const labelClsC = (s: StepStatus) =>
                              s === 'done'     ? 'text-green-700 dark:text-green-400'
                            : s === 'rejected' ? 'text-red-600 dark:text-red-400'
                            : s === 'active'   ? 'text-amber-700 dark:text-amber-400'
                            :                   'text-muted-foreground/60';

                            const activeStepC = stepsC.find(s => s.status === 'active');
                            const statusSummaryC =
                              derivedStatus === 'paid'        ? { label: 'Paid', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' }
                            : derivedStatus === 'reconciled'  ? { label: 'Reconciled', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' }
                            : derivedStatus === 'approved'    ? { label: 'Fully Approved — Awaiting Payment', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
                            : derivedStatus === 'rejected'    ? { label: 'Rejected', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
                            : derivedStatus === 'under_review' ? { label: `Under Review — Awaiting ${activeStepC?.label || 'Tier 2'}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
                            : { label: `Pending — Awaiting ${activeStepC?.label || 'Tier 1'}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };

                            const sendReminderC = (step: FlowStepC) => {
                              const recipients = step.expectedApprovers?.length ? step.expectedApprovers : [];
                              if (recipients.length === 0) {
                                toast({ title: 'No recipient found', description: 'Could not identify who to remind.', variant: 'destructive', duration: 4000 });
                                return;
                              }
                              setReminderPreviewDialog({
                                open: true,
                                stepLabel: step.label,
                                recipients: recipients.map(r => ({ id: r.id, name: r.name, email: r.email, role: (r as any).role })),
                                refNum: oc.reference_number || oc.id.substring(0, 8).toUpperCase(),
                                description: oc.description || oc.expense_category || '',
                                amtStr: `${oc.currency} ${(oc.amount_cents / 100).toLocaleString()}`,
                                submitterName,
                                ocId: oc.id,
                                tab: 'notification',
                              });
                            };

                            return (
                              <div className="border-t px-4 bg-gray-50/30 dark:bg-gray-900/10" data-testid={`approval-flow-compact-${oc.id}`}>
                                <button
                                  className="w-full flex items-center justify-between gap-2 py-2 flex-wrap group"
                                  onClick={() => toggleFlow(oc.id)}
                                  data-testid={`button-toggle-flow-${oc.id}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                                      <ClipboardCheck className="h-3 w-3" />
                                      Approval Flow
                                    </p>
                                    {derivedStatus === 'rejected' && oc.rejection_reason && (
                                      <span className="text-[9px] text-red-500 truncate italic">↩ {oc.rejection_reason.slice(0, 55)}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] text-muted-foreground/50 tabular-nums">{doneStepsC}/{totalStepsC}</span>
                                    {isFlowOverdueC && (
                                      <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full">⚠ Overdue</span>
                                    )}
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${statusSummaryC.cls}`}>
                                      {statusSummaryC.label}
                                    </span>
                                    {expandedFlows.has(oc.id)
                                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                                    }
                                  </div>
                                </button>
                                {expandedFlows.has(oc.id) && (
                                  <div className="pb-3 relative pl-5 space-y-0">
                                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />
                                  {stepsC.map((step, i) => {
                                    const isDoneC = step.status === 'done';
                                    const isActiveC = step.status === 'active';
                                    const isPendingC = step.status === 'pending';
                                    const isRejectedC = step.status === 'rejected';
                                    const daysWaitingC = isActiveC && step.waitingSince
                                      ? Math.floor((Date.now() - new Date(step.waitingSince).getTime()) / (1000 * 60 * 60 * 24))
                                      : 0;
                                    const overdueC = daysWaitingC >= 3;
                                    return (
                                      <div key={i} className="relative flex gap-2.5 pb-2 last:pb-0">
                                        <div className={`absolute left-[-13px] top-[6px] h-2.5 w-2.5 rounded-full shrink-0 z-10 border-2 border-background ${dotClsC(step.status)}`} />
                                        <div className={`flex-1 min-w-0 rounded-md px-2.5 py-1.5 transition-colors ${
                                          isActiveC && overdueC ? 'bg-red-50/70 dark:bg-red-950/30 border border-red-200/70 dark:border-red-800/50 shadow-sm' :
                                          isActiveC  ? 'bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 shadow-sm' :
                                          isPendingC ? 'opacity-45' : ''
                                        }`}>
                                          {/* Label + badges + timestamp */}
                                          <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className={`text-[11px] font-semibold leading-tight ${labelClsC(step.status)}`}>
                                              {step.stepNum} {step.label}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {step.timestamp && (
                                                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                                                  {format(new Date(step.timestamp), 'MMM d · h:mm a')}
                                                </span>
                                              )}
                                              {isActiveC && (
                                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                                  overdueC
                                                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                                    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                                                }`}>
                                                  {overdueC ? `⚠ ${daysWaitingC}d overdue` : daysWaitingC > 0 ? `⏳ ${daysWaitingC}d` : '⏳ Awaiting'}
                                                </span>
                                              )}
                                              {isRejectedC && (
                                                <span className="text-[9px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full">
                                                  ✗ Rejected
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Completed by (done/rejected) */}
                                          {step.person && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                              {step.person}
                                              <span className="opacity-60"> · {step.role}</span>
                                            </p>
                                          )}

                                          {/* Active: who needs to act (inline, no header label) */}
                                          {isActiveC && step.expectedApprovers && step.expectedApprovers.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                              {step.expectedApprovers.map((a, ai) => (
                                                <span key={a.id} className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                                                  {a.name || a.email}
                                                  {a.role && <span className="font-normal text-amber-700/60 dark:text-amber-400/60"> · {fmtRoleC(a.role)}</span>}
                                                  {ai < step.expectedApprovers!.length - 1 && <span className="text-amber-400 ml-0.5">,</span>}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Pending future: dim approver names */}
                                          {isPendingC && !step.person && step.expectedApprovers && step.expectedApprovers.length > 0 && (
                                            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                              {step.expectedApprovers.map(a => a.name || a.email).join(', ')}
                                            </p>
                                          )}

                                          {/* Inline notes / approval comment */}
                                          {step.notes && (
                                            <p className="mt-1 text-[10px] text-muted-foreground/80 italic pl-2 border-l-2 border-border">
                                              "{step.notes}"
                                            </p>
                                          )}

                                          {/* Email / WhatsApp notification audit line — shown for done & active steps */}
                                          {(isDoneC || isActiveC) && (
                                            <p className="mt-0.5 text-[9px] text-muted-foreground/50 flex items-center gap-1 flex-wrap">
                                              <span>{step.notifIcon}</span>
                                              <span>{step.notifText}</span>
                                              {step.timestamp && isDoneC && (
                                                <span className="tabular-nums">· sent {format(new Date(step.timestamp), 'MMM d · h:mm a')}</span>
                                              )}
                                              {i === stepsC.length - 1 && (
                                                <span>· 💬 WhatsApp (if opted-in)</span>
                                              )}
                                            </p>
                                          )}

                                          {/* Send Reminder (active step only) */}
                                          {isActiveC && (
                                            <div className="mt-1.5 space-y-0.5">
                                              <Button
                                                size="sm" variant="outline"
                                                className="h-6 px-2.5 text-[10px] border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-1"
                                                onClick={() => sendReminderC(step)}
                                                data-testid={`button-send-reminder-compact-${oc.id}`}
                                              >
                                                <Mail className="h-3 w-3" />Send Reminder
                                              </Button>
                                              {lastRemindedMap[oc.id] && (
                                                <p className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
                                                  <Clock className="h-2.5 w-2.5" />Last reminded: {format(new Date(lastRemindedMap[oc.id]), 'MMM d · h:mm a')}
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* ── Action bar for compact row ─────────────────────────────────── */}
                          <div className="flex items-center gap-2 px-4 py-2 border-t border-[#1D3461]/10 flex-wrap bg-gray-50/50 dark:bg-gray-900/20">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setViewingSubmission(oc)}
                              data-testid={`button-view-details-${oc.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View Details
                            </Button>
                            {getOperationalDerivedStatus(oc) === 'approved' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => handleDownloadCertificate(oc)}
                                data-testid={`button-download-certificate-${oc.id}`}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                PDF
                              </Button>
                            )}
                            {canRequestPayment(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={() => openPaymentRequestDialog(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-request-payment-${oc.id}`}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Request Payment
                              </Button>
                            )}
                            {canMarkAsPaid(oc) && (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleMarkAsPaid(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-mark-paid-${oc.id}`}
                              >
                                <Wallet className="h-3 w-3 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                            {oc.payment_proof_url && (() => {
                              let urls: string[] = [];
                              try { const p = JSON.parse(oc.payment_proof_url!); urls = Array.isArray(p) ? p : [oc.payment_proof_url!]; } catch { urls = [oc.payment_proof_url!]; }
                              const proofUnconfirmed = derivedStatus !== 'paid' && derivedStatus !== 'reconciled';
                              return (
                                <div className="relative group/proof">
                                  <Button size="sm" variant="outline"
                                    className={proofUnconfirmed
                                      ? "h-7 px-2.5 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400"
                                      : "h-7 px-2.5 text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400"}
                                    onClick={() => openAttach(urls, 'Payment Proof')}
                                    data-testid={`button-view-proof-${oc.id}`}>
                                    <Eye className="h-3 w-3 mr-1" />
                                    Proof{urls.length > 1 ? ` (${urls.length})` : ''}{proofUnconfirmed ? ' ⚠' : ''}
                                  </Button>
                                  {/* Hover preview */}
                                  <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/proof:block z-[9998] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-muted p-2 pointer-events-none min-w-[160px]">
                                    {proofUnconfirmed && (
                                      <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5 mb-1.5">⚠ Proof uploaded — click Mark Paid to confirm payment</p>
                                    )}
                                    {isImage(urls[0]) ? (
                                      <img src={urls[0]} alt="Receipt preview" className="max-h-[120px] max-w-[180px] rounded object-contain mx-auto" />
                                    ) : (
                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1 px-2">
                                        <FileText className="h-4 w-4 text-red-500" /> PDF Receipt
                                      </div>
                                    )}
                                    {urls.length > 1 && (
                                      <p className="text-[10px] text-center text-muted-foreground mt-1 border-t pt-1">{urls.length} receipts — click to view</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {canReconcile(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => { setActiveReconciliation(oc); setActiveTab('reconciliation'); }}
                                data-testid={`button-reconcile-${oc.id}`}
                              >
                                <Receipt className="h-3 w-3 mr-1" />
                                Reconcile
                              </Button>
                            )}
                            {canRevertPaid(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400"
                                onClick={() => setRevertPaidConfirm(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-revert-paid-${oc.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Revert Paid
                              </Button>
                            )}
                            {(isSuperAdmin || isAdmin) && !['rejected', 'cancelled', 'reconciled'].includes(derivedStatus) && !canRequestPayment(oc) && !canMarkAsPaid(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
                                onClick={() => openBulkCostEmailDialog(oc)}
                                data-testid={`button-send-finance-${oc.id}`}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Send to Finance
                              </Button>
                            )}
                            {canTier1Approve(oc) && (
                              <>
                                <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openApprovalDialog(oc, 'approve', 1)} data-testid={`button-approve-bar-t1-${oc.id}`}>
                                  <ThumbsUp className="h-3 w-3 mr-1" />Approve T1
                                </Button>
                                <button className="flex items-center gap-0.5 rounded-md h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => openApprovalDialog(oc, 'reject', 1)} data-testid={`button-reject-bar-t1-${oc.id}`}>
                                  Reject
                                </button>
                              </>
                            )}
                            {canTier2Approve(oc) && (
                              <>
                                <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openApprovalDialog(oc, 'approve', 2)} data-testid={`button-approve-bar-t2-${oc.id}`}>
                                  <ThumbsUp className="h-3 w-3 mr-1" />{hasThreeTiers(oc) || hasFourTiers(oc) ? 'Approve T2' : 'Final Approve'}
                                </Button>
                                <button className="flex items-center gap-0.5 rounded-md h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => openApprovalDialog(oc, 'reject', 2)} data-testid={`button-reject-bar-t2-${oc.id}`}>
                                  Reject
                                </button>
                              </>
                            )}
                            {canTier3Approve(oc) && (
                              <>
                                <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openApprovalDialog(oc, 'approve', 3)} data-testid={`button-approve-bar-t3-${oc.id}`}>
                                  <ThumbsUp className="h-3 w-3 mr-1" />{hasFourTiers(oc) ? 'Approve T3' : 'Final Approve'}
                                </Button>
                                <button className="flex items-center gap-0.5 rounded-md h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => openApprovalDialog(oc, 'reject', 3)} data-testid={`button-reject-bar-t3-${oc.id}`}>
                                  Reject
                                </button>
                              </>
                            )}
                            {canTier4Approve(oc) && (
                              <>
                                <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openApprovalDialog(oc, 'approve', 4)} data-testid={`button-approve-bar-t4-${oc.id}`}>
                                  <ThumbsUp className="h-3 w-3 mr-1" />Final Approve
                                </Button>
                                <button className="flex items-center gap-0.5 rounded-md h-7 px-2 text-xs font-medium border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => openApprovalDialog(oc, 'reject', 4)} data-testid={`button-reject-bar-t4-${oc.id}`}>
                                  Reject
                                </button>
                              </>
                            )}
                            <div className="flex-1" />
                            {canEditSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => handleEditSubmission(oc)}
                                data-testid={`button-edit-submission-${oc.id}`}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                            {canResubmitSubmission(oc) && (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => handleEditSubmission(oc)}
                                data-testid={`button-resubmit-submission-${oc.id}`}
                              >
                                <SendHorizonal className="h-3 w-3 mr-1" />
                                Resubmit
                              </Button>
                            )}
                            {canDeleteSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setDeleteConfirm(oc)}
                                data-testid={`button-delete-submission-${oc.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            )}
                            {canRequestDeletion(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteRequestDialog({ open: true, submission: oc, reason: '' })}
                                data-testid={`button-request-delete-${oc.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Request Deletion
                              </Button>
                            )}
                            {oc.delete_request_status === 'pending' && !canApproveDeleteRequest(oc) && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-100 text-orange-700 border border-orange-300">
                                <Trash2 className="h-3 w-3" />Deletion Pending
                              </span>
                            )}
                            {oc.delete_request_status === 'rejected' && !canDeleteSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteRequestDialog({ open: true, submission: oc, reason: '' })}
                                data-testid={`button-request-delete-again-${oc.id}`}
                                title={oc.delete_request_notes ? `Rejected: ${oc.delete_request_notes}` : 'Request rejected — click to request again'}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Request Again
                              </Button>
                            )}
                            {/* CD Exception Transfer — SuperAdmin sends, CD reviews */}
                            {isSuperAdmin && !oc.transferred_to_cd && getOperationalDerivedStatus(oc) !== 'reconciled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-purple-400 text-purple-700 hover:bg-purple-50"
                                onClick={() => setTransferToCDDialog({ open: true, submission: oc, note: '' })}
                                data-testid={`button-transfer-cd-${oc.id}`}
                              >
                                <Send className="h-3 w-3 mr-1" />Send to CD
                              </Button>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'pending' && isCountryDirector && (
                              <div className="flex gap-1">
                                <Button size="sm" className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => setCDExceptionReviewDialog({ open: true, submission: oc, note: '', action: 'approved' })}
                                  data-testid={`button-approve-exception-${oc.id}`}>
                                  <CheckCircle className="h-3 w-3 mr-1" />Approve Exception
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                  onClick={() => setCDExceptionReviewDialog({ open: true, submission: oc, note: '', action: 'rejected' })}
                                  data-testid={`button-reject-exception-${oc.id}`}>
                                  Reject
                                </Button>
                              </div>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'pending' && !isCountryDirector && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-purple-100 text-purple-700 border border-purple-300">
                                <Send className="h-3 w-3" />CD Exception Pending
                              </span>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'approved' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-green-100 text-green-700 border border-green-300"
                                title={oc.cd_exception_note || ''}>
                                <CheckCircle className="h-3 w-3" />CD Approved Exception
                              </span>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-100 text-red-700 border border-red-300"
                                title={oc.cd_exception_note || ''}>
                                <XCircle className="h-3 w-3" />CD Rejected Exception
                              </span>
                            )}
                            {canApproveDeleteRequest(oc) && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="destructive" className="h-7 px-2.5 text-xs"
                                  onClick={() => setDeleteReviewDialog({ open: true, submission: oc, notes: '', action: 'approve' })}
                                  data-testid={`button-approve-delete-${oc.id}`}>
                                  <Trash2 className="h-3 w-3 mr-1" />Approve Delete
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs"
                                  onClick={() => setDeleteReviewDialog({ open: true, submission: oc, notes: '', action: 'reject' })}
                                  data-testid={`button-reject-delete-${oc.id}`}>
                                  Reject
                                </Button>
                              </div>
                            )}
                            {canRecallSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setRecallConfirm(oc)}
                                data-testid={`button-recall-submission-${oc.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Recall
                              </Button>
                            )}
                            {canRevertSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                                onClick={() => setRevertConfirm(oc)}
                                data-testid={`button-revert-submission-${oc.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Revert {getRevertTierLabel(oc)}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── FULL CARD (standalone / non-grouped items) ───────────────────────────
                    return (
                      <div
                        key={oc.id}
                        className={`transition-colors border-b last:border-b-0 ${selectedCostIds.has(oc.id) ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''} ${derivedStatus === 'rejected' ? 'border-l-2 border-l-red-400' : ''}`}
                        data-testid={`operational-cost-${oc.id}`}
                      >
                          {/* ── Collapsed header row — always visible, click to toggle ── */}
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                            onClick={() => toggleCard(oc.id)}
                            data-testid={`button-toggle-card-${oc.id}`}
                          >
                            {canMarkAsPaid(oc) && (
                              <Checkbox
                                id={`select-cost-${oc.id}`}
                                checked={selectedCostIds.has(oc.id)}
                                onCheckedChange={() => toggleCostSelection(oc.id)}
                                onClick={e => e.stopPropagation()}
                                data-testid={`checkbox-select-cost-${oc.id}`}
                                className="shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              {(() => {
                                const raw = oc.description || '';
                                const titleMatch = raw.match(/<<([^>>]+)>>/);
                                const reqTitle = titleMatch ? titleMatch[1].trim() : title;
                                const isDuplicate = searchFiltered.some(o =>
                                  o.id !== oc.id && o.amount_cents === oc.amount_cents &&
                                  !!oc.vendor && (o.vendor || '').toLowerCase() === (oc.vendor || '').toLowerCase() &&
                                  Math.abs(new Date(o.submitted_at || o.created_at).getTime() - new Date(oc.submitted_at || oc.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000
                                );
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug truncate">{reqTitle}</h3>
                                    {isDuplicate && (
                                      <span className="shrink-0 inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700 dark:text-orange-300">⚠ Dup?</span>
                                    )}
                                  </div>
                                );
                              })()}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:text-slate-400">
                                  {CatIcon && <CatIcon className="h-2.5 w-2.5" />}{catMeta?.label || oc.expense_category}
                                </span>
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">
                                  <User className="h-2.5 w-2.5" />{submitterName}
                                </span>
                                <span className="hidden sm:inline-flex items-center gap-0.5 border border-gray-200 dark:border-gray-700 rounded-full px-1.5 py-0.5 text-[9px] text-gray-500 dark:text-gray-400">
                                  <Clock className="h-2.5 w-2.5" />{format(new Date(oc.submitted_at || oc.created_at), 'MMM d, yyyy')}
                                </span>
                                {oc.vendor && (
                                  <span className="hidden md:inline-flex items-center gap-0.5 border border-gray-200 dark:border-gray-700 rounded-full px-1.5 py-0.5 text-[9px] text-gray-500 dark:text-gray-400">
                                    <Building2 className="h-2.5 w-2.5" />{oc.vendor}
                                  </span>
                                )}
                                 {preFundNames.length > 0 && (
                                   <span
                                     className="inline-flex items-center gap-0.5 rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                                     title={preFundNames.join(', ')}
                                     data-testid={`badge-pre-fund-${oc.id}`}
                                   >
                                     <Wallet className="h-2.5 w-2.5" />Pre-Fund: {preFundNames[0]}{preFundNames.length > 1 ? ` +${preFundNames.length - 1}` : ''}
                                   </span>
                                 )}
                                 {hasRecordedPayment && preFundNames.length === 0 && (
                                   <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" data-testid={`badge-no-pre-fund-${oc.id}`}>
                                     <Wallet className="h-2.5 w-2.5" />No Pre-Fund
                                   </span>
                                 )}
                                <span className="text-[9px] text-gray-400/60 tabular-nums">#{requestId}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="font-bold text-sm tabular-nums text-gray-900 dark:text-white" data-testid={`text-amount-${oc.id}`}>
                                {oc.currency} {(oc.amount_cents / 100).toLocaleString()}
                              </span>
                              <span className="text-[9px] text-muted-foreground leading-none">Requested</span>
                              {(oc.amount_paid_cents || 0) > 0 && (
                                <>
                                  <span className="text-[11px] font-semibold tabular-nums text-orange-600 dark:text-orange-400" data-testid={`text-paid-amount-${oc.id}`}>
                                    Paid: {oc.currency} {((oc.amount_paid_cents || 0) / 100).toLocaleString()}
                                  </span>
                                   <span className={`text-[9px] max-w-[180px] truncate ${((costPreFundLinks.get(oc.id) ?? []).length > 0) ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`} title={(costPreFundLinks.get(oc.id) ?? []).map(link => link.name).join(', ')}>
                                     {(costPreFundLinks.get(oc.id) ?? []).length > 0
                                       ? `From: ${(costPreFundLinks.get(oc.id) ?? []).map(link => link.name).join(', ')}`
                                       : 'Pre-Fund: unlinked historical'}
                                   </span>
                                  {(oc.amount_paid_cents || 0) < oc.amount_cents && (
                                    <span className="text-[10px] text-muted-foreground/70">
                                      Rem: {oc.currency} {((oc.amount_cents - (oc.amount_paid_cents || 0)) / 100).toLocaleString()}
                                    </span>
                                  )}
                                </>
                              )}
                              <Badge className={`text-[10px] border-0 ${statusColors[derivedStatus] || statusColors.pending}`}>
                                {statusLabels[derivedStatus] || derivedStatus}
                              </Badge>
                            </div>
                            {expandedCards.has(oc.id)
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                            }
                          </button>

                          {/* ── Collapsible body — hidden when card is collapsed ── */}
                          {expandedCards.has(oc.id) && (
                          <div className="px-2.5 pb-2 space-y-2 border-t bg-background/50">
                          {derivedStatus === 'rejected' && (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-2 py-1.5 mt-2" data-testid={`alert-cost-needs-attention-${oc.id}`}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Needs Attention — Submission rejected. Review and resubmit if needed.</span>
                            </div>
                          )}
                          {!['rejected', 'cancelled', 'reconciled', 'paid'].includes(derivedStatus) && (isSuperAdmin || isAdmin || isFinanceAdmin) && !canMarkAsPaid(oc) && (
                            <p className="text-[11px] text-muted-foreground/60 italic mt-1">
                              {derivedStatus === 'pending' ? 'Pending Tier 1 approval' : derivedStatus === 'under_review' ? 'Pending Tier 2 approval' : 'Awaiting approval'} — cannot select for payment yet
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-2" data-testid={`status-progress-${oc.id}`}>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {(() => {
                                const tierStatusBadge = (status: string | null, label: string, testId: string) => (
                                  <div
                                    data-testid={testId}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                    status === 'approved'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                      : status === 'rejected'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                        : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {status === 'approved' ? (
                                      <CheckCircle className="h-3 w-3" />
                                    ) : status === 'rejected' ? (
                                      <XCircle className="h-3 w-3" />
                                    ) : (
                                      <Clock className="h-3 w-3" />
                                    )}
                                    <span>{label}</span>
                                  </div>
                                );
                                const threeTier = hasThreeTiers(oc);
                                const fourTier  = hasFourTiers(oc);
                                const isCDSub   = isCDSubmission(oc);
                                return (
                                  <>
                                    {tierStatusBadge(oc.tier1_status, 'T1', `status-tier1-${oc.id}`)}
                                    {!isCDSub && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                    {!isCDSub && tierStatusBadge(oc.tier2_status, 'T2', `status-tier2-${oc.id}`)}
                                    {(threeTier || fourTier) && (
                                      <>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                        {tierStatusBadge(oc.tier3_status, fourTier ? 'T3 CD' : 'T3 Admin', `status-tier3-${oc.id}`)}
                                      </>
                                    )}
                                    {fourTier && (
                                      <>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                        {tierStatusBadge(oc.tier4_status, 'T4 Admin', `status-tier4-${oc.id}`)}
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                              {hasSig && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <div
                                    data-testid={`status-signed-${oc.id}`}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                  >
                                    <Shield className="h-3 w-3" />
                                    <span>Signed</span>
                                  </div>
                                </>
                              )}
                              {(derivedStatus === 'approved' || derivedStatus === 'paid' || derivedStatus === 'reconciled') && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <div
                                    data-testid={`status-paid-${oc.id}`}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                      derivedStatus === 'paid' || derivedStatus === 'reconciled'
                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {derivedStatus === 'paid' || derivedStatus === 'reconciled' ? (
                                      <CheckCircle className="h-3 w-3" />
                                    ) : (
                                      <Clock className="h-3 w-3" />
                                    )}
                                    <span>Paid</span>
                                  </div>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <div
                                    data-testid={`status-reconciled-${oc.id}`}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                      derivedStatus === 'reconciled'
                                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {derivedStatus === 'reconciled' ? (
                                      <CheckCircle className="h-3 w-3" />
                                    ) : (
                                      <Clock className="h-3 w-3" />
                                    )}
                                    <span>Reconciled</span>
                                  </div>
                                  {(() => {
                                    const glStatus = opsGlLogMap.get(oc.id);
                                    const glCls = glStatus === 'success'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                      : glStatus === 'error'
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                      : glStatus === 'skipped'
                                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                      : 'bg-muted text-muted-foreground';
                                    const glLabel = glStatus === 'success' ? 'GL Posted' : glStatus === 'error' ? 'GL Error' : glStatus === 'skipped' ? 'GL Skipped' : 'GL Pending';
                                    return (
                                      <>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <div data-testid={`status-gl-${oc.id}`} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${glCls}`}>
                                          <FileText className="h-3 w-3" />
                                          <span>{glLabel}</span>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </>
                              )}
                            </div>
                          </div>

                          {/* ── Approval Flow Tracker ── */}
                          {(() => {
                            const isFomSub = isFomSubmission(oc);
                            const isCoordSub = hasFourTiers(oc);
                            const isSuperSub = hasThreeTiers(oc);
                            const isCDSub   = isCDSubmission(oc);
                            const fourTier  = isCoordSub;
                            const threeTier = isSuperSub;

                            type StepStatus = 'done' | 'rejected' | 'active' | 'pending';
                            interface FlowStep {
                              label: string;
                              stepNum: string;
                              person: string;
                              role: string;
                              status: StepStatus;
                              timestamp?: string | null;
                              notes?: string;
                              notifIcon: string;
                              notifText: string;
                              waitingSince?: string | null;
                              expectedApprovers?: Array<{ id: string; name?: string; email?: string; role?: string }>;
                            }

                            const nr = (r: string) => r.toLowerCase().replace(/[\s_-]/g, '');
                            const fmtRole = (r?: string | null) => (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                            const submitterUser = users.find(u => u.id === oc.submitted_by);
                            const submitterRoleDisplay = fmtRole(submitterUser?.role) || 'Staff';

                            // ── Resolve expected pending-step approvers from loaded users list ──
                            const getExpected = (rolePredicate: (r: string) => boolean, hubMatch?: boolean) => {
                              // Use the exact hub normalization applied by the T1 permission
                              // check so the pending approver names match who can approve.
                              const submitter = users.find(u => u.id === oc.submitted_by);
                              const effectiveHubId = oc.hub_id
                                || submitter?.hubId
                                || submitter?.stateId
                                || (submitter as any)?.state
                                || null;
                              const normalizedRequestHubId = normalizeHubId(effectiveHubId);

                              return users.filter(u => {
                                if (!u.role) return false;
                                const roleNorm = nr(u.role);
                                if (!rolePredicate(roleNorm)) return false;
                                if (hubMatch) {
                                  if (!normalizedRequestHubId) return false;
                                  return getHubAccessInfo(u as any).hubIds.includes(normalizedRequestHubId);
                                }
                                return true;
                              }).slice(0, 5);
                            };

                            const isSupervisorRolePred  = (r: string) => r.includes('supervisor') || r.includes('hubsupervisor');
                            const isFomRolePred         = (r: string) => r === 'fom' || r.includes('fieldoperationmanager') || r.includes('fieldopmanager');
                            const isCDRolePred          = (r: string) => r === 'countrydirector' || r === 'country_director';
                            const isAdminRolePred       = (r: string) => r === 'admin' || r === 'superadmin' || r.includes('superadmin');
                            const isFinanceAdminRolePred = (r: string) => r === 'financialadmin' || r === 'financeadmin' || r === 'finance' || r.includes('financ');

                            // T1 expected approvers per flow
                            const t1Expected = oc.tier1_status === 'approved' || oc.tier1_status === 'rejected' ? [] :
                              isCoordSub ? getExpected(isSupervisorRolePred, true) :   // T1=Supervisor
                              isSuperSub ? getExpected(isFomRolePred)              :   // T1=FOM
                              isFomSub   ? getExpected(isCDRolePred)               :   // T1=CD
                              isCDSub    ? getExpected(isAdminRolePred)            :   // T1=Admin
                              getExpected(isSupervisorRolePred, true);

                            // T2 expected approvers per flow
                            const t2Expected = isCDSub || (oc.tier2_status === 'approved' || oc.tier2_status === 'rejected') ? [] :
                              isCoordSub ? getExpected(isFomRolePred)    :   // T2=FOM
                              isSuperSub ? getExpected(isCDRolePred)     :   // T2=CD
                              isFomSub   ? getExpected(isAdminRolePred)  :   // T2=Admin
                              [];

                            // T3 expected approvers per flow
                            const t3Expected = (oc.tier3_status === 'approved' || oc.tier3_status === 'rejected') ? [] :
                              isCoordSub ? getExpected(isCDRolePred)    :   // T3=CD
                              isSuperSub ? getExpected(isAdminRolePred) :   // T3=Admin
                              [];

                            // T4 expected approvers (coordinator only)
                            const t4Expected = (oc.tier4_status === 'approved' || oc.tier4_status === 'rejected') ? [] :
                              isCoordSub ? getExpected(isAdminRolePred) : [];

                            // Finance step expected approvers (only shown when step is active / awaiting payment)
                            const finExpected = derivedStatus === 'approved' ? getExpected(isFinanceAdminRolePred) : [];

                            // ── Helper: build "sent to: Name1, Name2" strings ──
                            const nameList = (people: Array<{ name?: string; email?: string }>) =>
                              people.map(p => p.name || p.email || '').filter(Boolean).join(', ');

                            const t1Name = tier1Approver?.name || tier1Approver?.email || nameList(t1Expected) || 'Tier 1 approver';
                            const t2Name = tier2Approver?.name || tier2Approver?.email || nameList(t2Expected) || 'Tier 2 approver';
                            // Keep Admin/Super Admin identities private in Tier 3/Tier 4;
                            // display only the responsible tier/role.
                            const t3Name = fourTier
                              ? tier3Approver?.name || tier3Approver?.email || nameList(t3Expected) || 'Tier 3 approver'
                              : 'Admin / Super Admin';
                            const t4Name = 'Admin / Super Admin';

                            const steps: FlowStep[] = [];

                            // ① Submitted
                            steps.push({
                              label: 'Submitted',
                              stepNum: '①',
                              person: submitterName,
                              role: submitterRoleDisplay,
                              status: 'done',
                              timestamp: oc.created_at,
                              notifIcon: '📧',
                              notifText: `Email sent to: ${t1Name}`,
                            });

                            // ② Tier 1
                            const t1RoleLabel = isCoordSub ? 'Hub Supervisor'
                              : isSuperSub ? 'Field Op. Manager (FOM)'
                              : isFomSub   ? 'Country Director'
                              : isCDSub    ? 'Admin / Super Admin'
                              : 'Hub Supervisor';
                            const t1Status: StepStatus = oc.tier1_status === 'approved' ? 'done' : oc.tier1_status === 'rejected' ? 'rejected' : 'active';
                            steps.push({
                              label: isCoordSub ? 'Tier 1 — Supervisor'
                                : isSuperSub ? 'Tier 1 — FOM Review'
                                : isFomSub   ? 'Tier 1 — Country Director'
                                : isCDSub    ? 'Tier 1 — Admin Review'
                                : 'Tier 1 Review',
                              stepNum: '②',
                              person: tier1Approver?.name || tier1Approver?.email || '',
                              role: fmtRole((tier1Approver as any)?.role) || t1RoleLabel,
                              status: t1Status,
                              timestamp: oc.tier1_approved_at,
                              waitingSince: t1Status === 'active' ? (oc.submitted_at || oc.created_at) : null,
                              notes: cleanTier1Notes || undefined,
                              notifIcon: '📧',
                              notifText: t1Status === 'done'
                                ? `Email sent to: ${submitterName}, ${t2Name}`
                                : `Email sent to: ${t1Name}`,
                              expectedApprovers: t1Expected,
                            });

                            // ③ Tier 2 (skip for CD single-tier)
                            if (!isCDSub) {
                              const t2RoleLabel = isCoordSub ? 'Field Op. Manager (FOM)'
                                : isSuperSub ? 'Country Director'
                                : isFomSub   ? 'Admin / Super Admin'
                                : 'Tier 2 Approver';
                              const t2Reached = oc.tier1_status === 'approved';
                              const t2Status: StepStatus = oc.tier2_status === 'approved' ? 'done' : oc.tier2_status === 'rejected' ? 'rejected' : t2Reached ? 'active' : 'pending';
                              steps.push({
                                label: isCoordSub ? 'Tier 2 — FOM Review'
                                  : isSuperSub ? 'Tier 2 — Country Director'
                                  : isFomSub   ? 'Tier 2 — Admin Review'
                                  : 'Tier 2 Review',
                                stepNum: '③',
                                person: tier2Approver?.name || tier2Approver?.email || '',
                                role: fmtRole((tier2Approver as any)?.role) || t2RoleLabel,
                                status: t2Status,
                                timestamp: oc.tier2_approved_at,
                                waitingSince: t2Status === 'active' ? oc.tier1_approved_at : null,
                                notes: cleanTier2Notes || undefined,
                                notifIcon: '📧',
                                notifText: t2Status === 'done'
                                  ? `Email sent to: ${submitterName}, ${t3Name}`
                                  : `Email sent to: ${t2Name}`,
                                expectedApprovers: t2Expected,
                              });
                            }

                            // ④ Tier 3 (supervisor: T3=Admin final; coordinator: T3=CD, more ahead)
                            if (threeTier || fourTier) {
                              const raw3 = oc.tier3_status as string | null;
                              const t3Reached = oc.tier1_status === 'approved' && oc.tier2_status === 'approved';
                              const t3Status: StepStatus = raw3 === 'approved' ? 'done' : raw3 === 'rejected' ? 'rejected' : t3Reached ? 'active' : 'pending';
                              const t3RoleLabel = fourTier ? 'Country Director' : 'Admin / Super Admin';
                              steps.push({
                                label: fourTier ? 'Tier 3 — Country Director' : 'Tier 3 — Admin',
                                stepNum: '④',
                                person: fourTier ? tier3Approver?.name || tier3Approver?.email || '' : '',
                                role: fourTier ? fmtRole((tier3Approver as any)?.role) || t3RoleLabel : 'Admin / Super Admin',
                                status: t3Status,
                                timestamp: oc.tier3_approved_at,
                                waitingSince: t3Status === 'active' ? oc.tier2_approved_at : null,
                                notes: cleanTier3Notes || undefined,
                                notifIcon: '📧',
                                notifText: t3Status === 'done'
                                  ? `Email sent to: ${submitterName}${fourTier ? `, ${t4Name}` : ''}`
                                  : `Email sent to: ${t3Name}`,
                                expectedApprovers: fourTier ? t3Expected : undefined,
                              });
                            }

                            // ⑤ Tier 4 — Admin (coordinator 4-tier only)
                            if (fourTier) {
                              const raw4 = oc.tier4_status as string | null;
                              const t4Reached = oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && oc.tier3_status === 'approved';
                              const t4Status: StepStatus = raw4 === 'approved' ? 'done' : raw4 === 'rejected' ? 'rejected' : t4Reached ? 'active' : 'pending';
                              steps.push({
                                label: 'Tier 4 — Admin',
                                stepNum: '⑤',
                                person: '',
                                role: 'Admin / Super Admin',
                                status: t4Status,
                                timestamp: oc.tier4_approved_at,
                                waitingSince: t4Status === 'active' ? oc.tier3_approved_at : null,
                                notes: cleanTier4Notes || undefined,
                                notifIcon: '📧',
                                notifText: t4Status === 'done'
                                  ? `Email sent to: ${submitterName}`
                                  : `Email sent to: ${t4Name}`,
                                expectedApprovers: undefined,
                              });
                            }

                            // ⑥ Finance / Payment
                            const finStatus: StepStatus =
                              derivedStatus === 'paid' || derivedStatus === 'reconciled' ? 'done'
                              : derivedStatus === 'approved' ? 'active'
                              : 'pending';
                            const finStepNum = fourTier ? '⑥' : threeTier ? '⑤' : isFomSub ? '④' : isCDSub ? '③' : '④';
                            steps.push({
                              label: derivedStatus === 'reconciled' ? 'Reconciled' : derivedStatus === 'paid' ? 'Paid' : 'Finance / Payment',
                              stepNum: finStepNum,
                              person: derivedStatus === 'paid' || derivedStatus === 'reconciled' ? 'Payment complete' : finStatus === 'active' ? 'Finance Admin' : '—',
                              role: 'Finance Admin',
                              status: finStatus,
                              timestamp: null,
                              notifIcon: '📧',
                              notifText: `Email sent to: ${submitterName}`,
                              expectedApprovers: finExpected.length > 0 ? finExpected : undefined,
                            });

                            // ── Style helpers ──
                            const doneSteps = steps.filter(s => s.status === 'done').length;
                            const totalSteps = steps.length;
                            const isFlowOverdue = steps.some(s =>
                              s.status === 'active' && s.waitingSince &&
                              Math.floor((Date.now() - new Date(s.waitingSince).getTime()) / (1000 * 60 * 60 * 24)) >= 3
                            );

                            const dotCls = (s: StepStatus) =>
                              s === 'done'     ? 'bg-green-500 ring-2 ring-green-200 dark:ring-green-800'
                            : s === 'rejected' ? 'bg-red-500 ring-2 ring-red-200 dark:ring-red-800'
                            : s === 'active'   ? 'bg-amber-400 ring-4 ring-amber-200 dark:ring-amber-900 animate-pulse'
                            :                   'bg-border dark:bg-muted';

                            const cardCls = (s: StepStatus, overdue: boolean) =>
                              s === 'done'     ? 'bg-green-50/60 dark:bg-green-950/20 border-l-[3px] border-l-green-500'
                            : s === 'rejected' ? 'bg-red-50/60 dark:bg-red-950/20 border-l-[3px] border-l-red-500'
                            : s === 'active' && overdue ? 'bg-red-50/80 dark:bg-red-950/30 border-l-[3px] border-l-red-400 border border-red-200/60 shadow-sm'
                            : s === 'active'   ? 'bg-amber-50/80 dark:bg-amber-950/30 border-l-[3px] border-l-amber-400 border border-amber-200/60 shadow-sm'
                            :                   'opacity-40';

                            const labelCls = (s: StepStatus) =>
                              s === 'done'     ? 'text-green-700 dark:text-green-400'
                            : s === 'rejected' ? 'text-red-600 dark:text-red-400'
                            : s === 'active'   ? 'text-amber-700 dark:text-amber-400'
                            :                   'text-muted-foreground/60';

                            const lineCls = (s: StepStatus) =>
                              s === 'done' ? 'bg-green-400 dark:bg-green-600' : 'bg-border';

                            // ── Current status summary ──
                            const activeStep = steps.find(s => s.status === 'active');
                            const statusSummary =
                              derivedStatus === 'paid'       ? { label: 'Paid', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' }
                            : derivedStatus === 'reconciled' ? { label: 'Reconciled', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' }
                            : derivedStatus === 'approved'   ? { label: 'Fully Approved — Awaiting Payment', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
                            : derivedStatus === 'rejected'   ? { label: 'Rejected', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
                            : derivedStatus === 'under_review' ? { label: `Under Review — Awaiting ${activeStep?.label || 'Tier 2'}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
                            : { label: `Pending — Awaiting ${activeStep?.label || 'Tier 1'}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };

                            // ── Send reminder handler (inline, no extra state needed) ──
                            const sendReminder = (step: typeof steps[0]) => {
                              const recipients = step.expectedApprovers?.length ? step.expectedApprovers : [];
                              if (recipients.length === 0) {
                                toast({ title: 'No recipient found', description: 'Could not identify who to remind.', variant: 'destructive', duration: 4000 });
                                return;
                              }
                              const refNum = oc.reference_number || oc.id.substring(0, 8).toUpperCase();
                              const amtStr = `${oc.currency} ${(oc.amount_cents / 100).toLocaleString()}`;
                              setReminderPreviewDialog({
                                open: true,
                                stepLabel: step.label,
                                recipients: recipients.map(r => ({ id: r.id, name: r.name, email: r.email, role: (r as any).role })),
                                refNum,
                                description: oc.description || oc.expense_category || '',
                                amtStr,
                                submitterName,
                                ocId: oc.id,
                                tab: 'notification',
                              });
                            };

                            return (
                              <div className="border-t" data-testid={`approval-flow-${oc.id}`}>
                                {/* ── Collapsible header ── */}
                                <button
                                  className="w-full flex items-center justify-between gap-2 py-2 px-0 flex-wrap group"
                                  onClick={() => toggleFlow(oc.id)}
                                  data-testid={`button-toggle-flow-${oc.id}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                                      <ClipboardCheck className="h-3 w-3" />
                                      Approval Flow
                                    </p>
                                    {derivedStatus === 'rejected' && oc.rejection_reason && (
                                      <span className="text-[9px] text-red-500 truncate italic">↩ {oc.rejection_reason.slice(0, 55)}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] text-muted-foreground/50 tabular-nums">{doneSteps}/{totalSteps}</span>
                                    {isFlowOverdue && (
                                      <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full">⚠ Overdue</span>
                                    )}
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${statusSummary.cls}`}>
                                      {statusSummary.label}
                                    </span>
                                    {expandedFlows.has(oc.id)
                                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                                    }
                                  </div>
                                </button>

                                {/* ── Vertical timeline (shown only when expanded) ── */}
                                {expandedFlows.has(oc.id) && (
                                  <div className="pb-2 relative pl-4 space-y-0">
                                    <div className="absolute left-[6px] top-1 bottom-1 w-px bg-border/60" />

                                  {steps.map((step, i) => {
                                    const isDone = step.status === 'done';
                                    const isActive = step.status === 'active';
                                    const isPending = step.status === 'pending';
                                    const isRejected = step.status === 'rejected';
                                    return (
                                      <div key={i} className="relative flex gap-2 pb-1 last:pb-0">
                                        {/* Status dot */}
                                        <div className={`absolute left-[-12px] top-[4px] h-3 w-3 rounded-full shrink-0 z-10 border-2 border-background ${dotCls(step.status)}`} />

                                        {/* Content card */}
                                        {(() => {
                                          const daysWaiting = isActive && step.waitingSince
                                            ? Math.floor((Date.now() - new Date(step.waitingSince).getTime()) / (1000 * 60 * 60 * 24))
                                            : 0;
                                          const overdue = daysWaiting >= 3;
                                          return (
                                        <div className={`flex-1 min-w-0 rounded px-2 py-1 transition-colors ${cardCls(step.status, overdue)}`}>
                                          {/* Label + badge + timestamp */}
                                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                            <span className={`text-[10px] font-semibold leading-tight ${labelCls(step.status)}`}>
                                              {step.stepNum} {step.label}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              {step.timestamp && (
                                                <span className="text-[9px] text-muted-foreground/60 tabular-nums">
                                                  {format(new Date(step.timestamp), 'MMM d · h:mm a')}
                                                </span>
                                              )}
                                              {isActive && (
                                                <span className={`text-[9px] font-semibold px-1 py-0.5 rounded-full whitespace-nowrap ${
                                                  overdue
                                                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                                    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                                                }`}>
                                                  {overdue ? `⚠ ${daysWaiting}d` : daysWaiting > 0 ? `⏳ ${daysWaiting}d` : '⏳'}
                                                </span>
                                              )}
                                              {isRejected && (
                                                <span className="text-[9px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1 py-0.5 rounded-full">✗</span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Who acted (done / rejected) + expected (active/pending) — single compact line */}
                                          {step.person ? (
                                            <p className="text-[9px] text-muted-foreground leading-tight">
                                              {step.person}<span className="opacity-50"> · {step.role}</span>
                                            </p>
                                          ) : (isActive || isPending) && step.expectedApprovers && step.expectedApprovers.length > 0 ? (
                                            <p className={`text-[9px] leading-tight ${isActive ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-muted-foreground/50'}`}>
                                              {step.expectedApprovers.map(a => a.name || a.email).join(', ')}
                                            </p>
                                          ) : null}

                                          {/* Inline approval notes */}
                                          {step.notes && (
                                            <p className="text-[9px] text-muted-foreground/70 italic pl-1.5 border-l border-border">
                                              "{step.notes}"
                                            </p>
                                          )}

                                          {/* Notification audit — single compact line */}
                                          {(isDone || isActive) && (
                                            <p className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5 flex-wrap leading-tight">
                                              <span>{step.notifIcon}</span>
                                              <span className="truncate">{step.notifText}</span>
                                              {i === steps.length - 1 && <span>· 💬</span>}
                                            </p>
                                          )}

                                          {/* Send Reminder (active step only) */}
                                          {isActive && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="mt-1 h-5 px-2 text-[9px] border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-1"
                                              onClick={() => sendReminder(step)}
                                              data-testid={`button-send-reminder-${oc.id}`}
                                            >
                                              <Mail className="h-2.5 w-2.5" />
                                              Remind
                                            </Button>
                                          )}
                                        </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {oc.rejection_reason && (
                            <div className="pt-1 border-t" data-testid={`notes-section-${oc.id}`}>
                              <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid={`text-rejection-${oc.id}`}>
                                  <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                                    <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                      <p className="font-semibold">
                                        Rejection Reason / سبب الرفض
                                      </p>
                                      <p>"{oc.rejection_reason}"</p>
                                      {oc.tier1_status === 'rejected' && tier1Approver && (
                                        <p className="text-red-500 dark:text-red-400">
                                          Rejected by / رفض بواسطة: {tier1Approver.name || tier1Approver.email}
                                          {oc.tier1_approved_at && ` — ${format(new Date(oc.tier1_approved_at), 'MMM d, yyyy h:mm a')}`}
                                        </p>
                                      )}
                                      {oc.tier2_status === 'rejected' && tier2Approver && (
                                        <p className="text-red-500 dark:text-red-400">
                                          Rejected by / رفض بواسطة: {tier2Approver.name || tier2Approver.email}
                                          {oc.tier2_approved_at && ` — ${format(new Date(oc.tier2_approved_at), 'MMM d, yyyy h:mm a')}`}
                                        </p>
                                      )}
                                      {oc.tier3_status === 'rejected' && tier3Approver && (
                                        <p className="text-red-500 dark:text-red-400">
                                          Rejected by / رفض بواسطة: {tier3Approver.name || tier3Approver.email}
                                          {oc.tier3_approved_at && ` — ${format(new Date(oc.tier3_approved_at), 'MMM d, yyyy h:mm a')}`}
                                        </p>
                                      )}
                                      {oc.tier4_status === 'rejected' && tier4Approver && (
                                        <p className="text-red-500 dark:text-red-400">
                                          Rejected by / رفض بواسطة: {tier4Approver.name || tier4Approver.email}
                                          {oc.tier4_approved_at && ` — ${format(new Date(oc.tier4_approved_at), 'MMM d, yyyy h:mm a')}`}
                                        </p>
                                      )}
                                      <p className="text-red-500/80 dark:text-red-400/80 italic">
                                        You can edit and resubmit this request. / يمكنك تعديل الطلب وإعادة تقديمه.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                            </div>
                          )}

                          {Array.isArray(oc.supporting_documents) && oc.supporting_documents.length > 0 && (
                            <div className="pt-1 border-t space-y-1.5" data-testid={`docs-section-${oc.id}`}>
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Paperclip className="h-3 w-3" />
                                Attachments / المرفقات ({oc.supporting_documents.length})
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(oc.supporting_documents as any[]).map((doc: any, idx: number) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => openAttach(doc.url, doc.filename || `Document ${idx + 1}`)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors max-w-[180px]"
                                    data-testid={`link-doc-${oc.id}-${idx}`}
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{doc.filename || `Document ${idx + 1}`}</span>
                                    <Eye className="h-3 w-3 shrink-0 opacity-60" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          </div>)}
                          {/* ── Action bar — always visible ── */}
                          {(() => {
                            const btnGhost = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm hover:shadow transition-all";
                            const btnPrimary = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md bg-[#0F2041] hover:bg-[#1a3460] text-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all";
                            const btnDanger = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all";
                            const btnSuccess = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all";
                            const btnBlue = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 shadow-sm transition-all";
                            const btnAudit = "h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 shadow-sm transition-all";
                            return (
                          <div className="flex items-center gap-1.5 px-3 py-2 border-t bg-gray-50/60 dark:bg-gray-900/30 flex-wrap" data-testid={`action-bar-${oc.id}`}>
                            <button className={btnGhost} onClick={() => setViewingSubmission(oc)} data-testid={`button-view-details-${oc.id}`}>
                              <Eye className="h-3.5 w-3.5" />View
                            </button>
                            {canTier1Approve(oc) && (<>
                              <button className={btnPrimary} onClick={() => openApprovalDialog(oc, 'approve', 1)} data-testid={`button-tier1-approve-${oc.id}`}>
                                <ThumbsUp className="h-3.5 w-3.5" />Approve T1
                              </button>
                              <button className={btnDanger} onClick={() => openApprovalDialog(oc, 'reject', 1)} data-testid={`button-tier1-reject-${oc.id}`}>
                                <ThumbsDown className="h-3.5 w-3.5" />Reject
                              </button>
                            </>)}
                            {canTier2Approve(oc) && (<>
                              <button className={btnPrimary} onClick={() => openApprovalDialog(oc, 'approve', 2)} data-testid={`button-tier2-approve-${oc.id}`}>
                                <ThumbsUp className="h-3.5 w-3.5" />{hasThreeTiers(oc) ? 'Approve T2' : 'Final Approve'}
                              </button>
                              <button className={btnDanger} onClick={() => openApprovalDialog(oc, 'reject', 2)} data-testid={`button-tier2-reject-${oc.id}`}>
                                <ThumbsDown className="h-3.5 w-3.5" />Reject
                              </button>
                            </>)}
                            {canTier3Approve(oc) && (<>
                              <button className={btnPrimary} onClick={() => openApprovalDialog(oc, 'approve', 3)} data-testid={`button-tier3-approve-${oc.id}`}>
                                <ThumbsUp className="h-3.5 w-3.5" />{hasFourTiers(oc) ? 'Approve T3' : 'Final Approve T3'}
                              </button>
                              <button className={btnDanger} onClick={() => openApprovalDialog(oc, 'reject', 3)} data-testid={`button-tier3-reject-${oc.id}`}>
                                <ThumbsDown className="h-3.5 w-3.5" />Reject
                              </button>
                            </>)}
                            {canTier4Approve(oc) && (<>
                              <button className={btnPrimary} onClick={() => openApprovalDialog(oc, 'approve', 4)} data-testid={`button-tier4-approve-${oc.id}`}>
                                <ThumbsUp className="h-3.5 w-3.5" />Final Approve T4
                              </button>
                              <button className={btnDanger} onClick={() => openApprovalDialog(oc, 'reject', 4)} data-testid={`button-tier4-reject-${oc.id}`}>
                                <ThumbsDown className="h-3.5 w-3.5" />Reject
                              </button>
                            </>)}
                            {getOperationalDerivedStatus(oc) === 'approved' && (
                              <button className={btnGhost} onClick={() => handleDownloadCertificate(oc)} data-testid={`button-download-certificate-${oc.id}`}>
                                <Download className="h-3.5 w-3.5" />PDF
                              </button>
                            )}
                            {canRequestPayment(oc) && (
                              <button className={btnBlue} onClick={() => openPaymentRequestDialog(oc)} data-testid={`button-request-payment-${oc.id}`}>
                                <Mail className="h-3.5 w-3.5" />Request Payment
                              </button>
                            )}
                            {canMarkAsPaid(oc) && (
                              <button className={btnSuccess} onClick={() => handleMarkAsPaid(oc)} data-testid={`button-mark-paid-${oc.id}`}>
                                <Wallet className="h-3.5 w-3.5" />Mark Paid
                              </button>
                            )}
                            {oc.payment_proof_url && (() => {
                              let urls: string[] = [];
                              try { const p = JSON.parse(oc.payment_proof_url!); urls = Array.isArray(p) ? p : [oc.payment_proof_url!]; } catch { urls = [oc.payment_proof_url!]; }
                              const proofUnconfirmed = derivedStatus !== 'paid' && derivedStatus !== 'reconciled';
                              return (
                                <div className="relative group/proof">
                                  <button
                                    className={proofUnconfirmed
                                      ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/20 transition-colors"
                                      : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/20 transition-colors"}
                                    onClick={() => openAttach(urls, 'Payment Proof')}
                                    data-testid={`button-view-proof-${oc.id}`}>
                                    <Eye className="h-3.5 w-3.5" />Proof{urls.length > 1 ? ` (${urls.length})` : ''}{proofUnconfirmed ? ' ⚠' : ''}
                                  </button>
                                  {/* Hover preview */}
                                  <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/proof:block z-[9998] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-muted p-2 pointer-events-none min-w-[160px]">
                                    {proofUnconfirmed && (
                                      <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5 mb-1.5">⚠ Proof uploaded — click Mark Paid to confirm payment</p>
                                    )}
                                    {isImage(urls[0]) ? (
                                      <img src={urls[0]} alt="Receipt preview" className="max-h-[120px] max-w-[180px] rounded object-contain mx-auto" />
                                    ) : (
                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1 px-2">
                                        <FileText className="h-4 w-4 text-red-500" /> PDF Receipt
                                      </div>
                                    )}
                                    {urls.length > 1 && (
                                      <p className="text-[10px] text-center text-muted-foreground mt-1 border-t pt-1">{urls.length} receipts — click to view</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {canReconcile(oc) && (
                              <button className={btnGhost} onClick={() => { setActiveReconciliation(oc); setActiveTab("reconciliation"); }} data-testid={`button-reconcile-${oc.id}`}>
                                <Receipt className="h-3.5 w-3.5" />Reconcile
                              </button>
                            )}
                            {canRevertPaid(oc) && (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/20 transition-colors"
                                onClick={() => setRevertPaidConfirm(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-revert-paid-${oc.id}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />Revert Paid
                              </button>
                            )}
                            {(isSuperAdmin || isAdmin) && !['rejected', 'cancelled', 'reconciled'].includes(derivedStatus) && !canRequestPayment(oc) && !canMarkAsPaid(oc) && (
                              <button className={btnBlue} onClick={() => openBulkCostEmailDialog(oc)} data-testid={`button-send-finance-${oc.id}`}>
                                <Mail className="h-3.5 w-3.5" />Send to Finance
                              </button>
                            )}
                            <button className={btnAudit} onClick={() => setAuditDrawerItem(oc)} data-testid={`button-audit-trail-${oc.id}`}>
                              <History className="h-3.5 w-3.5" />Audit
                            </button>
                            <div className="flex-1" />
                            {canEditSubmission(oc) && (
                              <button className={btnGhost} onClick={() => handleEditSubmission(oc)} data-testid={`button-edit-submission-${oc.id}`}>
                                <Pencil className="h-3.5 w-3.5" />Edit
                              </button>
                            )}
                            {canResubmitSubmission(oc) && (
                              <button className={btnPrimary} onClick={() => handleEditSubmission(oc)} data-testid={`button-resubmit-submission-${oc.id}`}>
                                <SendHorizonal className="h-3.5 w-3.5" />Resubmit
                              </button>
                            )}
                            {canRecallSubmission(oc) && (
                              <button className={btnGhost} onClick={() => setRecallConfirm(oc)} data-testid={`button-recall-submission-${oc.id}`}>
                                <RotateCcw className="h-3.5 w-3.5" />Recall
                              </button>
                            )}
                            {canRevertSubmission(oc) && (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors"
                                onClick={() => setRevertConfirm(oc)}
                                data-testid={`button-revert-submission-${oc.id}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />Revert {getRevertTierLabel(oc)}
                              </button>
                            )}
                            {canDeleteSubmission(oc) && (
                              <button className={btnDanger} onClick={() => setDeleteConfirm(oc)} data-testid={`button-delete-submission-${oc.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />Delete
                              </button>
                            )}
                            {canRequestDeletion(oc) && (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                                onClick={() => setDeleteRequestDialog({ open: true, submission: oc, reason: '' })}
                                data-testid={`button-request-delete-${oc.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />Request Deletion
                              </button>
                            )}
                            {oc.delete_request_status === 'pending' && !canApproveDeleteRequest(oc) && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-100 text-orange-700 border border-orange-300">
                                <Trash2 className="h-3.5 w-3.5" />Deletion Pending
                              </span>
                            )}
                            {oc.delete_request_status === 'rejected' && !canDeleteSubmission(oc) && (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                                onClick={() => setDeleteRequestDialog({ open: true, submission: oc, reason: '' })}
                                title={oc.delete_request_notes ? `Rejected: ${oc.delete_request_notes}` : 'Request rejected — click to request again'}
                                data-testid={`button-request-delete-again-${oc.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />Request Again
                              </button>
                            )}
                            {/* CD Exception Transfer — SuperAdmin sends, CD reviews */}
                            {isSuperAdmin && !oc.transferred_to_cd && getOperationalDerivedStatus(oc) !== 'reconciled' && (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-purple-400 text-purple-700 hover:bg-purple-50 transition-colors"
                                onClick={() => setTransferToCDDialog({ open: true, submission: oc, note: '' })}
                                data-testid={`button-transfer-cd-${oc.id}`}>
                                <Send className="h-3.5 w-3.5" />Send to CD
                              </button>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'pending' && isCountryDirector && (
                              <div className="flex gap-1">
                                <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                                  onClick={() => setCDExceptionReviewDialog({ open: true, submission: oc, note: '', action: 'approved' })}
                                  data-testid={`button-approve-exception-${oc.id}`}>
                                  <CheckCircle className="h-3.5 w-3.5" />Approve Exception
                                </button>
                                <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                                  onClick={() => setCDExceptionReviewDialog({ open: true, submission: oc, note: '', action: 'rejected' })}
                                  data-testid={`button-reject-exception-${oc.id}`}>
                                  <XCircle className="h-3.5 w-3.5" />Reject
                                </button>
                              </div>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'pending' && !isCountryDirector && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-purple-100 text-purple-700 border border-purple-300">
                                <Send className="h-3.5 w-3.5" />CD Exception Pending
                              </span>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'approved' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-green-100 text-green-700 border border-green-300"
                                title={oc.cd_exception_note || ''}>
                                <CheckCircle className="h-3.5 w-3.5" />CD Approved Exception
                              </span>
                            )}
                            {oc.transferred_to_cd && oc.cd_exception_status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-100 text-red-700 border border-red-300"
                                title={oc.cd_exception_note || ''}>
                                <XCircle className="h-3.5 w-3.5" />CD Rejected
                              </span>
                            )}
                            {canApproveDeleteRequest(oc) && (
                              <div className="flex gap-1">
                                <button className={btnDanger}
                                  onClick={() => setDeleteReviewDialog({ open: true, submission: oc, notes: '', action: 'approve' })}
                                  data-testid={`button-approve-delete-${oc.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />Approve Delete
                                </button>
                                <button
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                                  onClick={() => setDeleteReviewDialog({ open: true, submission: oc, notes: '', action: 'reject' })}
                                  data-testid={`button-reject-delete-${oc.id}`}>
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                            );
                          })()}
                      </div>
                    );
                    }); // end itemElements map

                    if (isMultiItem) {
                      return (
                        <div key={groupId} className="rounded-xl border border-[#1D3461]/20 shadow-sm overflow-hidden">
                          {GroupHeader}
                          {expandedGroupIds.has(groupId!) && (
                            <>
                              <div>{itemElements}</div>
                              {/* Group footer */}
                              <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0F2041]/5 border-t border-[#1D3461]/10 flex-wrap">
                                <span className="text-[11px] text-muted-foreground font-medium">
                                  {grpApprovedCnt}/{groupItems.length} items approved
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs"
                                    onClick={() => setViewingSubmission(groupItems[0])}
                                    data-testid={`button-group-view-${groupId}`}>
                                    <Eye className="h-3 w-3 mr-1" /> View Details
                                  </Button>
                                  {grpApprovableTier !== null && (
                                    <Button size="sm" className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                      onClick={() => openGroupApprovalDialog(groupId!, groupTitle, groupItems, 'approve', grpApprovableTier!)}
                                      data-testid={`button-group-approve-all-footer-${groupId}`}>
                                      <ThumbsUp className="h-3 w-3 mr-1" /> Approve All Pending
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }

                     // Standalone item — navy header matching grouped style
                     const soc = groupItems[0];
                     const sTitle = soc.request_title
                       || soc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '')
                       || 'Cost Request';
                     const sSubmitter = users.find(u => u.id === soc.submitted_by)?.name || 'Unknown';
                     const sProject = soc.project_id ? allProjects.find(p => p.id === soc.project_id)?.name : null;
                     const sMmpName = soc.mmp_file_id ? mmpNameMap.get(soc.mmp_file_id) || null : null;
                     const sPalette = getProjectPalette(soc.project_id);
                    const sDs = getOperationalDerivedStatus(soc);
                    const sBarColor = (sDs === 'approved' || sDs === 'paid' || sDs === 'reconciled')
                      ? 'bg-green-400'
                      : sDs === 'rejected' ? 'bg-red-400' : 'bg-amber-400';

                    return (
                      <div key={soc.id} className="rounded-xl border border-[#1D3461]/20 shadow-sm overflow-hidden">
                        {/* Standalone navy header */}
                        <div
                          className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-4 py-3"
                          style={{ borderLeft: `4px solid ${sPalette.border}` }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-none mt-0.5">
                              <Receipt className="h-4 w-4 text-white/70" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <p className="font-semibold text-[14px] leading-snug text-white line-clamp-2">{sTitle}</p>
                               <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                 {sProject && (
                                   <span
                                     className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                                     style={{ backgroundColor: sPalette.bg, color: sPalette.text, border: `1px solid ${sPalette.border}40` }}
                                   >
                                     <Briefcase className="h-3 w-3" />{sProject}
                                   </span>
                                 )}
                                 {sMmpName && (
                                   <span className="flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold">
                                     <ClipboardCheck className="h-3 w-3" />{sMmpName}
                                   </span>
                                 )}
                                 {canViewTeamSubmissions && <span className="flex items-center gap-1 text-white/60"><Users className="h-3 w-3" />{sSubmitter}</span>}
                                  <span className="flex items-center gap-1 text-white/60"><Calendar className="h-3 w-3" />{format(new Date(soc.created_at), 'MMM d, yyyy h:mm a')}</span>
                               </div>
                            </div>
                            <div className="flex-none text-right space-y-1">
                              <p className="font-bold text-base tabular-nums text-white">{soc.currency} {(soc.amount_cents / 100).toLocaleString()}</p>
                              <p className="text-[10px] text-white/50">Total</p>
                            </div>
                          </div>
                        </div>
                        <div className={`h-1 ${sBarColor}`} />
                        {/* Item body */}
                        <div>{itemElements[0]}</div>
                      </div>
                    );
                  })}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            ) : !operationalCostsLoading ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-results">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{costSearch ? `No results for "${costSearch}"` : `No ${statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} submissions found`}</p>
                <p className="text-xs">{costSearch ? '' : `لا توجد طلبات ${statusFilter !== 'all' ? 'بهذه الحالة' : ''}`}</p>
              </div>
            ) : null;
          })()}

          {/* Site Visit Cost Submissions */}
          {(isLoading || operationalCostsLoading) ? (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          ) : submissions.length > 0 ? (
            <CostSubmissionHistory submissions={submissions} />
          ) : operationalCosts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">No Submissions Yet</h3>
                  <p className="mb-4">You haven't submitted any cost requests. Use the Submit Request tab to get started.</p>
                  {canSubmitOperationalCosts && (
                    <Button variant="outline" onClick={() => setActiveTab("submit")} data-testid="button-go-submit">
                      <Receipt className="h-4 w-4 mr-2" />
                      Submit a Request
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ─── Confirmation Audit ─── */}
        {canViewTeamSubmissions && (
          <TabsContent value="payment_audit" className="space-y-4">
            {(() => {
              const paidSubs = [
                ...submissions.filter(s => s.status === 'paid'),
                ...filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid'),
              ] as OperationalCostSubmission[];
              const confirmed = paidSubs.filter(s => s.fund_receipt_confirmed === true);
              const unconfirmed = paidSubs.filter(s => !s.fund_receipt_confirmed);
              const totalPaidCents = paidSubs.reduce((s, sub) => s + (sub.amount_cents ?? 0), 0);
              const confirmedCents = confirmed.reduce((s, sub) => s + (sub.amount_cents ?? 0), 0);
              return (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Card className="border-violet-200 bg-violet-50 dark:bg-violet-950/30">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground mb-1">Total Paid Out</p>
                        <p className="text-xl font-bold text-violet-700 dark:text-violet-300">
                          {(totalPaidCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} SDG
                        </p>
                        <p className="text-xs text-muted-foreground">{paidSubs.length} submission{paidSubs.length !== 1 ? 's' : ''}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-green-200 bg-green-50 dark:bg-green-950/30">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground mb-1">Receipt Confirmed</p>
                        <p className="text-xl font-bold text-green-700 dark:text-green-300">
                          {(confirmedCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} SDG
                        </p>
                        <p className="text-xs text-muted-foreground">{confirmed.length} submission{confirmed.length !== 1 ? 's' : ''}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground mb-1">Awaiting Confirmation</p>
                        <p className="text-xl font-bold text-orange-700 dark:text-orange-300">
                          {((totalPaidCents - confirmedCents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} SDG
                        </p>
                        <p className="text-xs text-muted-foreground">{unconfirmed.length} pending</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Fund Receipt Confirmation Audit
                      </CardTitle>
                      <CardDescription>
                        All paid cost submissions — shows whether the field staff member has confirmed receiving the funds
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {isLoading ? (
                        <div className="p-6 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                      ) : paidSubs.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">No paid submissions found</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Submitted By</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Amount (SDG)</TableHead>
                                <TableHead>Paid At</TableHead>
                                <TableHead>Payment Receipt</TableHead>
                                <TableHead>Receipt Confirmed</TableHead>
                                <TableHead>Confirmed At</TableHead>
                                <TableHead>Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paidSubs.map(sub => {
                                const submitterName = users.find(u => u.id === sub.submitted_by)?.name || sub.submitted_by;
                                const amountSdg = (sub.amount_cents ?? 0) / 100;
                                const categoryLabel: Record<string, string> = {
                                  permits: 'Permits', incentives: 'Incentives', communications: 'Comms',
                                  training: 'Training', transport: 'Transport', general_transport: 'Transport',
                                  equipment: 'Equipment', printing: 'Printing', meetings: 'Meetings',
                                  office_admin: 'Office Admin', other: 'Other',
                                };
                                return (
                                  <TableRow key={sub.id} data-testid={`row-audit-${sub.id}`}>
                                    <TableCell className="font-medium">{submitterName}</TableCell>
                                    <TableCell>{categoryLabel[sub.expense_category] ?? sub.expense_category}</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {amountSdg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {sub.paid_at ? format(parseISO(sub.paid_at), 'dd/MM/yyyy') : '—'}
                                    </TableCell>
                                    <TableCell>
                                      {sub.payment_proof_url ? (() => {
                                        let urls: string[] = [];
                                        try { const p = JSON.parse(sub.payment_proof_url!); urls = Array.isArray(p) ? p : [sub.payment_proof_url!]; }
                                        catch { urls = [sub.payment_proof_url!]; }
                                        const MAX_VISIBLE = 3;
                                        const visible = urls.slice(0, MAX_VISIBLE);
                                        const extra = urls.length - MAX_VISIBLE;
                                        return (
                                          <div className="flex flex-wrap items-center gap-1">
                                            {visible.map((u, i) => (
                                              <button key={i} type="button"
                                                onClick={() => openAttach(urls, 'Payment Receipt', i)}
                                                className="inline-flex items-center gap-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors">
                                                <Eye className="h-2.5 w-2.5" />
                                                {urls.length > 1 ? `#${i + 1}` : 'View'}
                                              </button>
                                            ))}
                                            {extra > 0 && (
                                              <span className="text-[10px] text-muted-foreground font-medium">+{extra} more</span>
                                            )}
                                          </div>
                                        );
                                      })() : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {sub.fund_receipt_confirmed ? (
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 gap-1">
                                          <CheckCircle className="h-3 w-3" />Confirmed
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200 gap-1">
                                          <Clock className="h-3 w-3" />Pending
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {sub.fund_receipt_confirmed_at
                                        ? format(parseISO(sub.fund_receipt_confirmed_at), 'dd/MM/yyyy HH:mm')
                                        : '—'}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[180px] truncate" title={sub.fund_receipt_notes ?? ''}>
                                      {sub.fund_receipt_notes || '—'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>
        )}

        {/* ─── Reports Tab ─────────────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-6">
          {(() => {
            const catLabel: Record<string, string> = {
              permits: 'Permits', incentives: 'Incentives', communications: 'Communications',
              training: 'Training', transport: 'Transport', general_transport: 'Transport',
              equipment: 'Equipment', printing: 'Printing', meetings: 'Meetings',
              office_admin: 'Office Admin', other: 'Other',
            };
            const statusColors: Record<string, string> = {
              pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
              under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
              approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
              partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
              paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
              rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
              reconciled: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
            };
            const fmtAmt = (cents: number, currency = 'SDG') =>
              `${currency} ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const daysBetween = (a?: string | null, b?: string | null): number | null => {
              if (!a || !b) return null;
              return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000 * 10) / 10;
            };

            // ── My Submissions ───────────────────────────────────────────
            const mine = operationalCosts.filter(o => o.submitted_by === currentUser?.id);
            const mineTotal = mine.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
            const minePaid = mine.filter(o => ['paid','reconciled'].includes(o.status)).reduce((s, o) => s + (o.amount_paid_cents ?? o.amount_cents ?? 0), 0);
            const mineApproved = mine.filter(o => ['approved','partially_paid','paid','reconciled'].includes(o.status));
            const minePending = mine.filter(o => o.status === 'pending').length;
            const mineUnderReview = mine.filter(o => o.status === 'under_review').length;
            const mineRejected = mine.filter(o => o.status === 'rejected').length;
            const minePaidCount = mine.filter(o => ['paid','reconciled'].includes(o.status)).length;

            // Role guard — must be declared before catSource and all breakdown blocks
            const isApproverRole = isFOM || isSupervisor || isCountryDirector || isFinanceAdmin || isAdmin || isSuperAdmin;
            // Org-level admins see ALL submissions in breakdowns; mid-tier flow approvers see only their own scope
            const isOrgAdmin = isAdmin || isSuperAdmin || isFinanceAdmin;
            const isFlowApprover = isApproverRole && !isOrgAdmin; // CD / FOM / Supervisor

            // Tier position in the approval flow (for the role banner)
            const flowTier = isSupervisor ? 1 : isFOM ? 2 : isCountryDirector ? 3 : isFinanceAdmin ? 4 : null;
            const flowTierLabel = flowTier ? `Tier ${flowTier}` : null;
            const flowRoleLabel = isSupervisor ? 'Supervisor' : isFOM ? 'Field Operations Manager (FOM)' : isCountryDirector ? 'Country Director (CD)' : isFinanceAdmin ? 'Finance Admin' : '';

            // Category breakdown — org admins see ALL; flow approvers & regular users see own submissions only
            const catSource = isOrgAdmin ? operationalCosts : mine;
            const catMap = new Map<string, { count: number; requested: number; paid: number; approved: number }>();
            for (const o of catSource) {
              const cat = catLabel[o.expense_category] || o.expense_category || 'Other';
              if (!catMap.has(cat)) catMap.set(cat, { count: 0, requested: 0, paid: 0, approved: 0 });
              const row = catMap.get(cat)!;
              row.count++;
              row.requested += o.amount_cents ?? 0;
              if (['paid','reconciled'].includes(o.status)) row.paid += o.amount_paid_cents ?? o.amount_cents ?? 0;
              if (['approved','partially_paid','paid','reconciled'].includes(o.status)) row.approved++;
            }
            const catRows = [...catMap.entries()].sort((a,b) => b[1].requested - a[1].requested);
            const catTotal = { count: catSource.length, requested: catSource.reduce((s,o)=>s+(o.amount_cents??0),0), paid: catSource.filter(o=>['paid','reconciled'].includes(o.status)).reduce((s,o)=>s+(o.amount_paid_cents??o.amount_cents??0),0) };

            // By Users breakdown — org admins only (scoped to catSource)
            const userMap = new Map<string, { name: string; role: string; count: number; requested: number; paid: number; balance: number }>();
            if (isOrgAdmin) {
              for (const o of catSource) {
                const sid = o.submitted_by ?? 'unknown';
                if (!userMap.has(sid)) {
                  const u = users.find(x => x.id === sid);
                  userMap.set(sid, { name: u?.name || '—', role: u?.role?.replace(/_/g,' ') || '', count: 0, requested: 0, paid: 0, balance: 0 });
                }
                const row = userMap.get(sid)!;
                row.count++;
                row.requested += o.amount_cents ?? 0;
                if (['paid','reconciled'].includes(o.status)) row.paid += o.amount_paid_cents ?? o.amount_cents ?? 0;
              }
              userMap.forEach(r => { r.balance = Math.max(0, r.requested - r.paid); });
            }
            const userRows = [...userMap.values()].sort((a,b) => b.requested - a.requested);

            // By Fund breakdown — org admins only
            const getFundName = (o: OperationalCostSubmission): string => {
              const txnId = (o as any).pre_fund_transaction_id as string | null | undefined;
              return txnId ? (txnToFundMap.get(txnId) ?? '—') : '—';
            };
            const fundBreakMap = new Map<string, { count: number; requested: number; paid: number; pending: number }>();
            if (isOrgAdmin) {
              for (const o of catSource) {
                const fund = getFundName(o);
                if (!fundBreakMap.has(fund)) fundBreakMap.set(fund, { count: 0, requested: 0, paid: 0, pending: 0 });
                const row = fundBreakMap.get(fund)!;
                row.count++;
                row.requested += o.amount_cents ?? 0;
                if (['paid','reconciled'].includes(o.status)) row.paid += o.amount_paid_cents ?? o.amount_cents ?? 0;
                if (['pending','under_review'].includes(o.status)) row.pending += o.amount_cents ?? 0;
              }
            }
            const fundRows = [...fundBreakMap.entries()].sort((a,b) => b[1].requested - a[1].requested);
            const fundTotal = fundRows.reduce((s,[,r]) => ({ count: s.count+r.count, requested: s.requested+r.requested, paid: s.paid+r.paid, pending: s.pending+r.pending }), { count:0, requested:0, paid:0, pending:0 });

            // By Role breakdown — org admins only
            const roleBreakMap = new Map<string, { count: number; requested: number; paid: number; pending: number }>();
            if (isOrgAdmin) {
              for (const o of catSource) {
                const role = (o.submitter_role || users.find(u => u.id === o.submitted_by)?.role || 'unknown')
                  .replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                if (!roleBreakMap.has(role)) roleBreakMap.set(role, { count: 0, requested: 0, paid: 0, pending: 0 });
                const row = roleBreakMap.get(role)!;
                row.count++;
                row.requested += o.amount_cents ?? 0;
                if (['paid','reconciled'].includes(o.status)) row.paid += o.amount_paid_cents ?? o.amount_cents ?? 0;
                if (['pending','under_review'].includes(o.status)) row.pending += o.amount_cents ?? 0;
              }
            }
            const roleRows = [...roleBreakMap.entries()].sort((a,b) => b[1].requested - a[1].requested);
            const roleBreakTotal = roleRows.reduce((s,[,r]) => ({ count: s.count+r.count, requested: s.requested+r.requested, paid: s.paid+r.paid, pending: s.pending+r.pending }), { count:0, requested:0, paid:0, pending:0 });

            // ── My Approvals ──────────────────────────────────────────────
            const myApprovals = operationalCosts.filter(o =>
              o.tier1_approved_by === currentUser?.id || o.tier2_approved_by === currentUser?.id ||
              o.tier3_approved_by === currentUser?.id || o.tier4_approved_by === currentUser?.id
            );
            // ── Approval Time Metrics (for my OWN submissions) ───────────
            const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null;
            const fmtDays = (d: number | null) => d === null ? '—' : d < 1 ? `${Math.round(d*24)}h` : `${d}d`;

            // Map approver userId → role label (Supervisor / Hub Manager / FOM / CD / Finance / Admin)
            const approverRoleLabel = (userId: string | null | undefined): string => {
              if (!userId) return '—';
              const u = users.find(x => x.id === userId);
              const r = (u?.role || '').toLowerCase().replace(/[_\s]/g, '');
              if (r === 'supervisor') return 'Supervisor';
              if (r === 'hubmanager' || r === 'hub_manager') return 'Hub Manager';
              if (r === 'fom' || r.includes('fieldoperations')) return 'FOM';
              if (r === 'countrydirector' || r === 'country_director') return 'Country Director (CD)';
              if (r === 'financialadmin' || r === 'financial_admin') return 'Finance Admin';
              if (r === 'superadmin' || r === 'super_admin') return 'Super Admin';
              if (r === 'admin') return 'Admin';
              return u?.role || '—';
            };
            // Canonical role order for display
            const ROLE_ORDER = ['Supervisor','Hub Manager','FOM','Country Director (CD)','Finance Admin','Admin','Super Admin'];

            // Build role-level and user-level timing maps
            const roleTimes = new Map<string, number[]>();
            const userTimesMap = new Map<string, { name: string; role: string; times: number[] }>();
            const addTiming = (approvedBy: string | null | undefined, prevAt: string | null | undefined, approvedAt: string | null | undefined) => {
              if (!approvedBy || !prevAt || !approvedAt) return;
              const d = daysBetween(prevAt, approvedAt);
              if (d === null || d < 0) return;
              // role bucket
              const rl = approverRoleLabel(approvedBy);
              if (!roleTimes.has(rl)) roleTimes.set(rl, []);
              roleTimes.get(rl)!.push(d);
              // user bucket
              if (!userTimesMap.has(approvedBy)) {
                const u = users.find(x => x.id === approvedBy);
                userTimesMap.set(approvedBy, { name: u?.name || '—', role: rl, times: [] });
              }
              userTimesMap.get(approvedBy)!.times.push(d);
            };
            // Timing source: org admins → all submissions; flow approvers → requests they acted on; others → own
            const timingSource = isOrgAdmin ? catSource : (isFlowApprover ? myApprovals : mine);
            for (const o of timingSource) {
              addTiming(o.tier1_approved_by, o.submitted_at,       o.tier1_approved_at);
              addTiming(o.tier2_approved_by, o.tier1_approved_at,  o.tier2_approved_at);
              addTiming(o.tier3_approved_by, o.tier2_approved_at,  o.tier3_approved_at);
              addTiming(o.tier4_approved_by, o.tier3_approved_at,  o.tier4_approved_at);
            }
            const roleTimeRows = ROLE_ORDER
              .filter(rl => roleTimes.has(rl))
              .map(rl => ({ label: rl, times: roleTimes.get(rl)! }));
            // Also include any unlisted roles
            roleTimes.forEach((times, rl) => {
              if (!ROLE_ORDER.includes(rl)) roleTimeRows.push({ label: rl, times });
            });
            // Build nested role → users map for the drilled-down timeline card
            const roleNestedMap = new Map<string, { times: number[]; users: Array<{name: string; times: number[]}> }>();
            roleTimeRows.forEach(({ label, times }) => {
              const users_in_role = [...userTimesMap.values()]
                .filter(u => u.role === label)
                .sort((a, b) => (avg(b.times) ?? 0) - (avg(a.times) ?? 0));
              roleNestedMap.set(label, { times, users: users_in_role });
            });
            const userTimeRows = [...userTimesMap.values()]
              .sort((a, b) => (avg(b.times) ?? 0) - (avg(a.times) ?? 0)); // slowest first

            return (
              <>
                {/* ── Header ─────────────────────────────────────────────── */}
                <Card className="bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-50 dark:from-sky-950/30 dark:via-cyan-950/20 dark:to-sky-950/30 border-sky-200 dark:border-sky-800">
                  <CardContent className="pt-6 pb-5">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-sky-600" />
                          <h2 className="text-xl font-bold text-sky-900 dark:text-sky-200">
                            Cost Submission Reports / تقارير طلبات التكلفة
                          </h2>
                        </div>
                        <p className="text-sm text-sky-700 dark:text-sky-400">
                          Comprehensive financial statements across all your submissions and approvals
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-400">
                        <Calendar className="h-3.5 w-3.5" />
                        Generated: {format(new Date(), 'dd MMM yyyy, HH:mm')}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── My Submissions Section ──────────────────────────────── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-slate-600" />
                    <h3 className="font-semibold text-base">My Submissions / طلباتي</h3>
                    <Badge variant="secondary" className="text-xs">{mine.length} total</Badge>
                  </div>

                  {mine.length === 0 ? (
                    <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No submissions found for your account.</CardContent></Card>
                  ) : (
                    <>
                      {/* Status KPI row */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'Total', count: mine.length, color: 'from-slate-500 to-slate-600', icon: <ClipboardCheck className="h-4 w-4" /> },
                          { label: 'Pending', count: minePending, color: 'from-slate-400 to-slate-500', icon: <Clock className="h-4 w-4" /> },
                          { label: 'Under Review', count: mineUnderReview, color: 'from-blue-500 to-blue-600', icon: <Eye className="h-4 w-4" /> },
                          { label: 'Approved', count: mineApproved.length, color: 'from-green-500 to-green-600', icon: <CheckCircle className="h-4 w-4" /> },
                          { label: 'Paid', count: minePaidCount, color: 'from-emerald-500 to-teal-600', icon: <DollarSign className="h-4 w-4" /> },
                          { label: 'Rejected', count: mineRejected, color: 'from-red-500 to-red-600', icon: <XCircle className="h-4 w-4" /> },
                        ].map(kpi => (
                          <Card key={kpi.label} className="overflow-hidden">
                            <div className={`bg-gradient-to-br ${kpi.color} p-3 text-white`}>
                              <div className="flex items-center justify-between">
                                {kpi.icon}
                                <span className="text-2xl font-bold">{kpi.count}</span>
                              </div>
                              <p className="text-xs mt-1 opacity-90">{kpi.label}</p>
                            </div>
                          </Card>
                        ))}
                      </div>

                      {/* Financial Summary */}
                      <Card>
                        <CardHeader className="pb-3 pt-4 px-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                            Financial Summary / الملخص المالي
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isOrgAdmin ? 'All submissions / جميع الطلبات' : 'My submissions / طلباتي'}
                          </p>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-1">
                              <p className="text-xs text-muted-foreground">Total Requested</p>
                              <p className="text-lg font-bold">{fmtAmt(isOrgAdmin ? catTotal.requested : mineTotal)}</p>
                              {isOrgAdmin && <p className="text-xs text-muted-foreground">{catTotal.count} requests</p>}
                            </div>
                            <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 space-y-1">
                              <p className="text-xs text-muted-foreground">Total Paid</p>
                              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{fmtAmt(isOrgAdmin ? catTotal.paid : minePaid)}</p>
                            </div>
                            <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-1">
                              <p className="text-xs text-muted-foreground">Remaining / Approved</p>
                              <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                                {isOrgAdmin
                                  ? fmtAmt(Math.max(0, catTotal.requested - catTotal.paid))
                                  : fmtAmt(Math.max(0, mine.filter(o=>o.status==='approved').reduce((s,o)=>s+(o.amount_cents??0),0)))}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* By Category breakdown */}
                      <Card>
                        <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('cat')}>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Layers className="h-4 w-4 text-violet-600" />
                            By Category / حسب الفئة
                            <span className="ml-auto text-muted-foreground">{collapsedCards.has('cat') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                          </CardTitle>
                        </CardHeader>
                        {!collapsedCards.has('cat') && (
                          <CardContent className="px-0 pb-2">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Category</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Count</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Requested</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Paid</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {catRows.map(([cat, data]) => (
                                    <tr key={cat} className="border-b hover:bg-muted/20 transition-colors">
                                      <td className="px-4 py-2.5 font-medium">{cat}</td>
                                      <td className="text-right px-4 py-2.5 text-muted-foreground">{data.count}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(data.requested)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(data.paid)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(Math.max(0, data.requested - data.paid))}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-muted/40 font-semibold">
                                    <td className="px-4 py-2.5">Total</td>
                                    <td className="text-right px-4 py-2.5">{catTotal.count}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(catTotal.requested)}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(catTotal.paid)}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(Math.max(0, catTotal.requested - catTotal.paid))}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* By Users breakdown — org admins only */}
                      {isOrgAdmin && userRows.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('users')}>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Users className="h-4 w-4 text-sky-600" />
                              By Users / حسب المستخدمين
                              <span className="ml-auto text-muted-foreground">{collapsedCards.has('users') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                            </CardTitle>
                          </CardHeader>
                          {!collapsedCards.has('users') && (
                            <CardContent className="px-0 pb-2">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">User</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Count</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Requested</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Paid</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userRows.map((row, i) => (
                                      <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2.5">
                                          <div className="font-medium text-xs">{row.name}</div>
                                          <div className="text-[10px] text-muted-foreground capitalize">{row.role}</div>
                                        </td>
                                        <td className="text-right px-4 py-2.5 text-muted-foreground">{row.count}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(row.requested)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(row.paid)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(row.balance)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/40 font-semibold">
                                      <td className="px-4 py-2.5 text-xs">Total</td>
                                      <td className="text-right px-4 py-2.5">{userRows.reduce((s,r)=>s+r.count,0)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(userRows.reduce((s,r)=>s+r.requested,0))}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(userRows.reduce((s,r)=>s+r.paid,0))}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(userRows.reduce((s,r)=>s+r.balance,0))}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      )}

                      {/* By Fund breakdown — org admins only */}
                      {isOrgAdmin && fundRows.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('fund')}>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-teal-600" />
                              By Fund / حسب الصندوق
                              <span className="ml-auto text-muted-foreground">{collapsedCards.has('fund') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                            </CardTitle>
                          </CardHeader>
                          {!collapsedCards.has('fund') && (
                            <CardContent className="px-0 pb-2">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Fund / الصندوق</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Count</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Requested</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Paid</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Pending</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fundRows.map(([fund, data]) => (
                                      <tr key={fund} className="border-b hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-xs max-w-[200px] truncate" title={fund}>{fund}</td>
                                        <td className="text-right px-4 py-2.5 text-muted-foreground">{data.count}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(data.requested)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(data.paid)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(data.pending)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-400">{fmtAmt(Math.max(0, data.requested - data.paid))}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/40 font-semibold">
                                      <td className="px-4 py-2.5 text-xs">Total</td>
                                      <td className="text-right px-4 py-2.5">{fundTotal.count}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(fundTotal.requested)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(fundTotal.paid)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(fundTotal.pending)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-400">{fmtAmt(Math.max(0, fundTotal.requested - fundTotal.paid))}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      )}

                      {/* By Role breakdown — org admins only */}
                      {isOrgAdmin && roleRows.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('role')}>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Shield className="h-4 w-4 text-indigo-600" />
                              By Role / حسب الدور
                              <span className="ml-auto text-muted-foreground">{collapsedCards.has('role') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                            </CardTitle>
                          </CardHeader>
                          {!collapsedCards.has('role') && (
                            <CardContent className="px-0 pb-2">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Role / الدور</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Count</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Requested</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Paid</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Pending</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {roleRows.map(([role, data]) => (
                                      <tr key={role} className="border-b hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-xs capitalize">{role}</td>
                                        <td className="text-right px-4 py-2.5 text-muted-foreground">{data.count}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(data.requested)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(data.paid)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(data.pending)}</td>
                                        <td className="text-right px-4 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-400">{fmtAmt(Math.max(0, data.requested - data.paid))}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/40 font-semibold">
                                      <td className="px-4 py-2.5 text-xs">Total</td>
                                      <td className="text-right px-4 py-2.5">{roleBreakTotal.count}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(roleBreakTotal.requested)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(roleBreakTotal.paid)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-amber-700 dark:text-amber-400">{fmtAmt(roleBreakTotal.pending)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-rose-700 dark:text-rose-400">{fmtAmt(Math.max(0, roleBreakTotal.requested - roleBreakTotal.paid))}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      )}

                      {/* Approval Timeline — Role → Users nested, collapsible per role */}
                      {roleTimeRows.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('timeline')}>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              Approval Timeline by Role / مدة الموافقة حسب الدور
                              <span className="ml-auto text-muted-foreground">{collapsedCards.has('timeline') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                            </CardTitle>
                            <CardDescription>Click a role row to expand individual approvers · Avg &gt; 3d shown in amber</CardDescription>
                          </CardHeader>
                          {!collapsedCards.has('timeline') && (
                            <CardContent className="px-0 pb-2">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium w-5"></th>
                                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Approver Role / الدور</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Approvals</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Avg Time</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Fastest</th>
                                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Slowest</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {roleTimeRows.map(row => {
                                      const nested = roleNestedMap.get(row.label);
                                      const isExpanded = expandedRoles.has(row.label);
                                      const avgT = avg(row.times);
                                      const isSlow = avgT !== null && avgT > 3;
                                      return (
                                        <>
                                          {/* Role row — clickable to expand */}
                                          <tr
                                            key={row.label}
                                            className="border-b hover:bg-muted/20 cursor-pointer"
                                            onClick={() => toggleRole(row.label)}
                                          >
                                            <td className="px-4 py-2.5 text-muted-foreground w-5">
                                              {nested && nested.users.length > 0
                                                ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                                                : null}
                                            </td>
                                            <td className="px-4 py-2.5 font-semibold text-xs">{row.label}</td>
                                            <td className="text-right px-4 py-2.5 text-muted-foreground">{row.times.length}</td>
                                            <td className={`text-right px-4 py-2.5 font-bold text-xs ${isSlow ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>
                                              {fmtDays(avgT)}
                                            </td>
                                            <td className="text-right px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">{fmtDays(Math.min(...row.times))}</td>
                                            <td className="text-right px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">{fmtDays(Math.max(...row.times))}</td>
                                          </tr>
                                          {/* Expanded user rows under this role */}
                                          {isExpanded && nested?.users.map((u, ui) => {
                                            const uAvg = avg(u.times);
                                            const uSlow = uAvg !== null && uAvg > 3;
                                            return (
                                              <tr key={`${row.label}-${ui}`} className="border-b bg-muted/10 hover:bg-muted/20">
                                                <td className="px-4 py-2 w-5"></td>
                                                <td className="px-6 py-2 text-xs text-muted-foreground">
                                                  <span className="inline-flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {u.name}
                                                  </span>
                                                </td>
                                                <td className="text-right px-4 py-2 text-xs text-muted-foreground">{u.times.length}</td>
                                                <td className={`text-right px-4 py-2 text-xs font-semibold ${uSlow ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                                  {fmtDays(uAvg)}
                                                </td>
                                                <td className="text-right px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400">{fmtDays(Math.min(...u.times))}</td>
                                                <td className="text-right px-4 py-2 text-xs text-amber-600 dark:text-amber-400">{fmtDays(Math.max(...u.times))}</td>
                                              </tr>
                                            );
                                          })}
                                        </>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      )}
                    </>
                  )}
                </div>

                {/* ── My Role in the Flow banner (flow approvers: CD / FOM / Supervisor) ── */}
                {isFlowApprover && flowTierLabel && (
                  <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardContent className="px-4 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {/* Role + tier */}
                        <div className="flex items-center gap-3 flex-1">
                          <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            T{flowTier}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{flowRoleLabel}</p>
                            <p className="text-xs text-muted-foreground">{flowTierLabel} Approver in the Cost Submission Flow</p>
                          </div>
                        </div>
                        {/* Quick stats */}
                        <div className="flex gap-4 sm:gap-6 text-center">
                          <div>
                            <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{myApprovals.length}</p>
                            <p className="text-[10px] text-muted-foreground">Requests Acted On</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                              {myApprovals.filter(o => !['rejected'].includes(o.status)).length}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Approved / Passed</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                              {myApprovals.filter(o => ['pending','under_review'].includes(o.status)).length}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Pending Action</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-violet-700 dark:text-violet-400">
                              {fmtAmt(myApprovals.filter(o=>!['rejected'].includes(o.status)).reduce((s,o)=>s+(o.amount_cents??0),0))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Value Processed</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── My Approval Activity (approver roles) ──────────────────── */}
                {isApproverRole && myApprovals.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4 text-slate-600" />
                      <h3 className="font-semibold text-base">My Approvals / موافقاتي</h3>
                      <Badge variant="secondary" className="text-xs">{myApprovals.length} requests</Badge>
                    </div>

                    {/* Approvals financial summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Card>
                        <CardContent className="pt-4 pb-4 text-center space-y-1">
                          <p className="text-xs text-muted-foreground">Requests Processed</p>
                          <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">{myApprovals.length}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-4 text-center space-y-1">
                          <p className="text-xs text-muted-foreground">Total Value Approved</p>
                          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                            {fmtAmt(myApprovals.filter(o => !['rejected'].includes(o.status)).reduce((s,o)=>s+(o.amount_cents??0),0))}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-4 text-center space-y-1">
                          <p className="text-xs text-muted-foreground">Total Paid Out</p>
                          <p className="text-lg font-bold text-violet-700 dark:text-violet-400">
                            {fmtAmt(myApprovals.filter(o => ['paid','reconciled'].includes(o.status)).reduce((s,o)=>s+(o.amount_paid_cents??o.amount_cents??0),0))}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Per-submitter totals */}
                    {(() => {
                      const submitterMap = new Map<string, {
                        name: string; role: string; count: number;
                        totalCents: number; paidCents: number; avgTaken: number[];
                      }>();
                      for (const o of myApprovals) {
                        const sid = o.submitted_by ?? 'unknown';
                        if (!submitterMap.has(sid)) {
                          const u = users.find(x => x.id === sid);
                          submitterMap.set(sid, { name: u?.name || '—', role: u?.role || '', count: 0, totalCents: 0, paidCents: 0, avgTaken: [] });
                        }
                        const row = submitterMap.get(sid)!;
                        row.count++;
                        row.totalCents += o.amount_cents ?? 0;
                        if (['paid','reconciled'].includes(o.status)) row.paidCents += o.amount_paid_cents ?? o.amount_cents ?? 0;
                        // time taken at my tier
                        const myTier = o.tier1_approved_by === currentUser?.id ? 1
                          : o.tier2_approved_by === currentUser?.id ? 2
                          : o.tier3_approved_by === currentUser?.id ? 3 : 4;
                        const prevAt = myTier === 1 ? o.submitted_at : myTier === 2 ? o.tier1_approved_at : myTier === 3 ? o.tier2_approved_at : o.tier3_approved_at;
                        const myAt   = myTier === 1 ? o.tier1_approved_at : myTier === 2 ? o.tier2_approved_at : myTier === 3 ? o.tier3_approved_at : o.tier4_approved_at;
                        const d = daysBetween(prevAt, myAt);
                        if (d !== null && d >= 0) row.avgTaken.push(d);
                      }
                      const rows = [...submitterMap.values()].sort((a, b) => b.totalCents - a.totalCents);
                      return (
                        <Card>
                          <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('approvals-submitters')}>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Users className="h-4 w-4 text-sky-600" />
                              Totals by Submitter / إجمالي حسب مقدم الطلب
                              <span className="ml-auto text-muted-foreground">{collapsedCards.has('approvals-submitters') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                            </CardTitle>
                          </CardHeader>
                          {!collapsedCards.has('approvals-submitters') && <CardContent className="px-0 pb-2">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Submitter</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Requests</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Total Requested</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Total Paid</th>
                                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Avg Approval Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-muted/20">
                                      <td className="px-4 py-2.5">
                                        <div className="font-medium text-xs">{row.name}</div>
                                        <div className="text-xs text-muted-foreground">{row.role}</div>
                                      </td>
                                      <td className="text-right px-4 py-2.5 text-muted-foreground">{row.count}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(row.totalCents)}</td>
                                      <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(row.paidCents)}</td>
                                      <td className="text-right px-4 py-2.5 text-xs">
                                        {row.avgTaken.length > 0 ? (
                                          <span className={avg(row.avgTaken)! > 3 ? 'text-amber-600' : 'text-emerald-600'}>
                                            {fmtDays(avg(row.avgTaken))}
                                          </span>
                                        ) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="bg-muted/40 font-semibold">
                                    <td className="px-4 py-2.5 text-xs">Total</td>
                                    <td className="text-right px-4 py-2.5">{myApprovals.length}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(rows.reduce((s,r)=>s+r.totalCents,0))}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtAmt(rows.reduce((s,r)=>s+r.paidCents,0))}</td>
                                    <td />
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </CardContent>}
                        </Card>
                      );
                    })()}

                    {/* Detailed approvals table */}
                    <Card>
                      <CardHeader className="pb-3 pt-4 px-4 cursor-pointer select-none" onClick={() => toggleReportCard('approvals-detail')}>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ClipboardCheck className="h-4 w-4" />
                          Requests Through My Approval / الطلبات عبر موافقتي
                          <span className="ml-auto text-muted-foreground">{collapsedCards.has('approvals-detail') ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                        </CardTitle>
                      </CardHeader>
                      {!collapsedCards.has('approvals-detail') && <CardContent className="px-0 pb-2">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Fund / الصندوق</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Submitter</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Category</th>
                                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Amount</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Submitted</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">My Tier</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Time Taken</th>
                                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {myApprovals.slice().sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50).map(o => {
                                const submitter = users.find(u => u.id === o.submitted_by);
                                const fundName = getFundName(o);
                                const myTier = o.tier1_approved_by === currentUser?.id ? 1
                                  : o.tier2_approved_by === currentUser?.id ? 2
                                  : o.tier3_approved_by === currentUser?.id ? 3 : 4;
                                const prevAt = myTier === 1 ? o.submitted_at
                                  : myTier === 2 ? o.tier1_approved_at
                                  : myTier === 3 ? o.tier2_approved_at : o.tier3_approved_at;
                                const myApprovedAt = myTier === 1 ? o.tier1_approved_at
                                  : myTier === 2 ? o.tier2_approved_at
                                  : myTier === 3 ? o.tier3_approved_at : o.tier4_approved_at;
                                const taken = daysBetween(prevAt, myApprovedAt);
                                return (
                                  <tr key={o.id} className="border-b hover:bg-muted/20">
                                    <td className="px-4 py-2.5 text-xs max-w-[160px]">
                                      {fundName !== '—' ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium truncate max-w-full" title={fundName}>
                                          {fundName}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="font-medium text-xs">{submitter?.name || '—'}</div>
                                      <div className="text-xs text-muted-foreground">{submitter?.role || ''}</div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs">{catLabel[o.expense_category] || o.expense_category}</td>
                                    <td className="text-right px-4 py-2.5 font-mono text-xs">{fmtAmt(o.amount_cents)}</td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {o.submitted_at ? format(parseISO(o.submitted_at), 'dd MMM yy') : '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                        T{myTier}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs">
                                      {taken === null ? '—' : (
                                        <span className={taken > 3 ? 'text-amber-600' : 'text-emerald-600'}>
                                          {fmtDays(taken)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[o.status] || ''}`}>
                                        {o.status.replace(/_/g,' ')}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {myApprovals.length > 50 && (
                            <p className="text-xs text-center text-muted-foreground py-2">Showing 50 of {myApprovals.length} entries</p>
                          )}
                        </div>
                      </CardContent>}
                    </Card>
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>

        {/* ── Delete Requests + Deletion Audit Log Tab — SuperAdmin only ── */}
        {isSuperAdmin && (
          <TabsContent value="delete_requests" className="space-y-6">
            {(() => {
              const todayStr = new Date().toDateString();
              const myId = currentUser?.id;

              // ── SECTION 1: Actual Deletions (from audit log) ──────────────
              const myTodayDeletions = deletionLog.filter(l =>
                l.deleted_by === myId && new Date(l.deleted_at).toDateString() === todayStr
              );
              const otherDeletions = deletionLog.filter(l =>
                !(l.deleted_by === myId && new Date(l.deleted_at).toDateString() === todayStr)
              );

              const renderLogRow = (l: any) => {
                const rd = l.record_data ?? {};
                const catMeta = EXPENSE_CATEGORY_MAP[rd.expense_category];
                const CatIcon = catMeta?.icon;
                const typeLabel: Record<string, string> = {
                  direct: 'Direct Delete',
                  group: 'Group Delete',
                  approved_request: 'Approved Request',
                };
                const isMine = l.deleted_by === myId;
                return (
                  <div key={l.id ?? l.record_id} className={`rounded-xl border shadow-sm overflow-hidden ${isMine ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-900`}>
                    <div className={`flex items-center gap-3 px-4 py-3 border-b ${isMine ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex-none w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                        {CatIcon ? <CatIcon className="h-4 w-4 text-red-500" /> : <Trash2 className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {rd.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || rd.request_title || 'Untitled submission'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {rd.currency} {((rd.amount_cents ?? 0) / 100).toLocaleString()}
                          {catMeta ? ` · ${catMeta.label}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-300">
                          <Trash2 className="h-2.5 w-2.5" />Deleted
                        </span>
                        <span className="text-[10px] text-slate-400">{typeLabel[l._log_type] || 'Deleted'}</span>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-400">Deleted by</span>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{l.deleted_by_name || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Deleted at</span>
                        <p className="font-medium text-slate-700 dark:text-slate-200">
                          {l.deleted_at ? new Date(l.deleted_at).toLocaleString() : '—'}
                        </p>
                      </div>
                      {l.deletion_reason && (
                        <div className="col-span-2 mt-1">
                          <span className="text-slate-400">Reason</span>
                          <p className="font-medium text-slate-600 dark:text-slate-300 italic">{l.deletion_reason}</p>
                        </div>
                      )}
                      {l.restored_at && (
                        <div className="col-span-2 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-300">
                            <CheckCircle className="h-2.5 w-2.5" />Already Restored
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Restore action — only if not already restored */}
                    {!l.restored_at && (
                      <div className="flex items-center justify-end px-4 py-2 border-t border-slate-100 dark:border-slate-700/50">
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                          disabled={actionProcessing}
                          onClick={() => setRestoreLogEntry(l)}
                          data-testid={`button-restore-log-${l.id}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />Restore Submission
                        </button>
                      </div>
                    )}
                  </div>
                );
              };

              // ── SECTION 2: Delete Requests (from live data) ──────────────
              const allRequests = operationalCosts.filter(o => o.delete_request_status != null);
              const pendingItems  = allRequests.filter(o => o.delete_request_status === 'pending');
              const resolvedItems = allRequests.filter(o => o.delete_request_status !== 'pending');

              const renderRequestRow = (o: OperationalCostSubmission) => {
                const requester = users.find(u => u.id === o.delete_requested_by);
                const reviewer  = users.find(u => u.id === o.delete_request_reviewed_by);
                const catMeta   = EXPENSE_CATEGORY_MAP[o.expense_category];
                const CatIcon   = catMeta?.icon;
                const sc = o.delete_request_status === 'pending'
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : o.delete_request_status === 'rejected'
                  ? 'bg-red-100 text-red-700 border-red-300'
                  : 'bg-green-100 text-green-700 border-green-300';
                return (
                  <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex-none w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        {CatIcon && <CatIcon className="h-4 w-4 text-slate-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {o.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {o.currency} {((o.amount_cents ?? 0) / 100).toLocaleString()} · {catMeta?.label ?? o.expense_category}
                        </p>
                      </div>
                      <span className={`flex-none inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${sc}`}>
                        {o.delete_request_status}
                      </span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        <div>
                          <span className="text-slate-400">Requested by</span>
                          <p className="font-medium text-slate-700 dark:text-slate-200">{requester?.name || requester?.email || o.delete_requested_by?.slice(0,8) || '—'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Requested at</span>
                          <p className="font-medium text-slate-700 dark:text-slate-200">{o.delete_requested_at ? new Date(o.delete_requested_at).toLocaleDateString() : '—'}</p>
                        </div>
                        {o.delete_request_status !== 'pending' && reviewer && (
                          <>
                            <div>
                              <span className="text-slate-400">Reviewed by</span>
                              <p className="font-medium text-slate-700 dark:text-slate-200">{reviewer?.name || reviewer?.email || '—'}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Reviewed at</span>
                              <p className="font-medium text-slate-700 dark:text-slate-200">{o.delete_request_reviewed_at ? new Date(o.delete_request_reviewed_at).toLocaleDateString() : '—'}</p>
                            </div>
                          </>
                        )}
                      </div>
                      {o.delete_request_reason && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide mb-0.5">Reason</p>
                          <p className="text-xs text-amber-800 dark:text-amber-200">{o.delete_request_reason}</p>
                        </div>
                      )}
                      {o.delete_request_notes && (
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2">
                          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-0.5">Admin Notes</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300">{o.delete_request_notes}</p>
                        </div>
                      )}
                    </div>
                    {o.delete_request_status === 'pending' && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700">
                        <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                          disabled={actionProcessing}
                          onClick={() => setDeleteReviewDialog({ open: true, submission: o, notes: '', action: 'approve' })}
                          data-testid={`button-dr-approve-${o.id}`}>
                          <CheckCircle className="h-3.5 w-3.5" />Approve & Delete
                        </button>
                        <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                          disabled={actionProcessing}
                          onClick={() => setDeleteReviewDialog({ open: true, submission: o, notes: '', action: 'reject' })}
                          data-testid={`button-dr-reject-${o.id}`}>
                          <XCircle className="h-3.5 w-3.5" />Reject
                        </button>
                        <button className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                          onClick={() => setViewingSubmission(o)} data-testid={`button-dr-view-${o.id}`}>
                          <Eye className="h-3.5 w-3.5" />View Details
                        </button>
                      </div>
                    )}
                    {o.delete_request_status !== 'pending' && (
                      <div className="flex items-center justify-end px-4 py-2 border-t border-slate-100 dark:border-slate-700/50">
                        <button className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                          onClick={() => setViewingSubmission(o)} data-testid={`button-dr-view-resolved-${o.id}`}>
                          <Eye className="h-3.5 w-3.5" />View Details
                        </button>
                      </div>
                    )}
                  </div>
                );
              };

              const emptyRow = (msg: string) => (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-5 text-center">
                  <p className="text-xs text-slate-400 italic">{msg}</p>
                </div>
              );

              return (
                <div className="space-y-6">
                  {/* Page header */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-red-500" />
                      Deletions &amp; Requests
                      <span dir="rtl" className="text-sm font-normal text-slate-400">الحذف والطلبات</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {deletionLog.length} permanently deleted · {pendingItems.length} pending requests
                    </p>
                  </div>

                  {/* ── SECTION 1: MY TODAY'S DELETIONS ── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-none w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">
                        My Deletions Today {myTodayDeletions.length > 0 ? `(${myTodayDeletions.length})` : ''}
                      </span>
                      <span dir="rtl" className="text-xs text-slate-400">ما حذفته اليوم</span>
                      <div className="flex-1 h-px bg-red-200 dark:bg-red-900" />
                      <span className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    </div>
                    {myTodayDeletions.length > 0
                      ? myTodayDeletions.map(renderLogRow)
                      : emptyRow('No submissions deleted by you today')}
                  </div>

                  {/* ── SECTION 2: PENDING REQUESTS ── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${pendingItems.length > 0 ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        <AlertTriangle className="h-3 w-3" />
                        Pending Requests {pendingItems.length > 0 ? `(${pendingItems.length})` : '(0)'}
                      </span>
                      <div className="flex-1 h-px bg-amber-200 dark:bg-amber-900/40" />
                    </div>
                    {pendingItems.length > 0
                      ? pendingItems.map(renderRequestRow)
                      : emptyRow('No pending deletion requests')}
                  </div>

                  {/* ── SECTION 3: ALL DELETIONS LOG ── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        All Deletions ({otherDeletions.length})
                      </span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>
                    {otherDeletions.length > 0
                      ? otherDeletions.map(renderLogRow)
                      : emptyRow('No other deletions recorded — future permanent deletions will appear here with a Restore button')}
                  </div>

                  {/* ── SECTION 4: RESOLVED REQUESTS ── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Resolved Requests ({resolvedItems.length})
                      </span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>
                    {resolvedItems.length > 0
                      ? resolvedItems.map(renderRequestRow)
                      : emptyRow('No approved or rejected requests yet')}
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        )}
      </Tabs>

      {/* ── Request Detail Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!viewingSubmission} onOpenChange={(open) => { if (!open) setViewingSubmission(null); }}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden" side="right">
          {viewingSubmission && (() => {
            const oc = viewingSubmission;
            const catMeta = EXPENSE_CATEGORY_MAP[oc.expense_category];
            const CatIcon = catMeta?.icon;
            const submitter = users.find(u => u.id === oc.submitted_by);
            const t1User = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
            const t2User = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
            const t3User = oc.tier3_approved_by ? users.find(u => u.id === oc.tier3_approved_by) : null;
            const t4User = oc.tier4_approved_by ? users.find(u => u.id === oc.tier4_approved_by) : null;
            const linkedProject = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
            const derivedStatus = oc.paid_at ? 'paid' : oc.reconciled_at ? 'reconciled' : oc.status;
            const cleanNote = (n: string | null) => n?.replace(/\[Signed:.*?\]/g, '').trim() || null;
            const pendingTierLabel = oc.tier1_status === 'pending' ? '1' : oc.tier2_status === 'pending' ? '2' : oc.tier3_status === 'pending' ? '3' : oc.tier4_status === 'pending' ? '4' : '?';

            const statusColors: Record<string, string> = {
              pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
              under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
              rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
              partially_paid: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
              paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
              reconciled: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
            };
            const statusLabels: Record<string, string> = {
              pending: `Pending (Tier ${pendingTierLabel}) / معلق (المرحلة ${pendingTierLabel})`,
              under_review: `In Review (Tier ${pendingTierLabel}) / قيد المراجعة (المرحلة ${pendingTierLabel})`,
              approved: 'Approved / تمت الموافقة',
              rejected: 'Rejected / مرفوض',
              partially_paid: 'Partial Payment / دفع جزئي',
              paid: 'Paid / تم الدفع',
              reconciled: 'Reconciled / مسوّى',
            };

            const statusBand: Record<string, string> = {
              approved: 'bg-emerald-600 dark:bg-emerald-700',
              paid: 'bg-purple-600 dark:bg-purple-700',
              reconciled: 'bg-teal-600 dark:bg-teal-700',
              rejected: 'bg-red-600 dark:bg-red-700',
              under_review: 'bg-blue-600 dark:bg-blue-700',
              pending: 'bg-amber-500 dark:bg-amber-600',
            };

            const ApprovalStep = ({ tier, tStatus, tUser: tu, tAt, tNotes }: {
              tier: number;
              tStatus: string | null;
              tUser: { name?: string; email?: string } | null | undefined;
              tAt: string | null;
              tNotes: string | null;
            }) => (
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex-none w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                  tStatus === 'approved' ? 'bg-emerald-500' : tStatus === 'rejected' ? 'bg-red-500' : 'bg-muted-foreground/40'
                }`}>T{tier}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {tStatus === 'approved' ? 'Approved' : tStatus === 'rejected' ? 'Rejected' : tStatus === 'pending' ? 'Pending' : 'Not reached'}
                    </span>
                    {tu && <span className="text-xs text-muted-foreground">by {tu.name || tu.email}</span>}
                    {tAt && <span className="text-xs text-muted-foreground">{format(new Date(tAt), 'dd MMM yyyy, h:mm a')}</span>}
                  </div>
                  {cleanNote(tNotes) && (
                    <p className="text-xs text-muted-foreground mt-0.5 bg-muted/50 rounded px-2 py-1">{cleanNote(tNotes)}</p>
                  )}
                </div>
              </div>
            );

            const docs = Array.isArray(oc.supporting_documents) ? oc.supporting_documents as any[] : [];

            return (
              <>
                {/* ── Colored status header ── */}
                <div className={`${statusBand[derivedStatus] || statusBand.pending} text-white px-5 py-4 shrink-0`}>
                  <SheetHeader>
                    <SheetTitle className="text-white flex items-center gap-2 text-base">
                      {CatIcon && <CatIcon className="h-4 w-4 opacity-90" />}
                      {catMeta?.label || oc.expense_category}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex items-end justify-between mt-2">
                    <div>
                      <p className="text-3xl font-bold tabular-nums leading-none">{oc.currency} {(oc.amount_cents / 100).toLocaleString()}</p>
                      <p className="text-xs opacity-75 mt-1">
                        {oc.expense_date ? format(new Date(oc.expense_date), 'dd MMM yyyy') : 'No date'}
                        {submitter && <span> · {submitter.name || submitter.email}</span>}
                      </p>
                    </div>
                    <Badge className={`text-xs border-0 ${statusColors[derivedStatus] || statusColors.pending} !bg-white/20 !text-white`}>
                      {statusLabels[derivedStatus] || derivedStatus}
                    </Badge>
                  </div>
                  {oc.request_title && (
                    <div className="mt-2.5 rounded bg-white/10 px-3 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">Request</p>
                      <p className="text-sm font-medium">{oc.request_title}</p>
                    </div>
                  )}
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                  {/* ── Needs Attention Banner ── */}
                  {(derivedStatus === 'rejected' || oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.tier3_status === 'rejected' || oc.tier4_status === 'rejected') && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                        Needs Attention — This cost submission has been rejected.
                        {[oc.tier1_notes, oc.tier2_notes, oc.tier3_notes, oc.tier4_notes].filter(Boolean).slice(-1)[0] && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            "{[oc.tier1_notes, oc.tier2_notes, oc.tier3_notes, oc.tier4_notes].filter(Boolean).slice(-1)[0]}"
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Group Line Items (multi-item requests) ── */}
                  {oc.request_group_id && (() => {
                    const groupItems = operationalCosts.filter(o => o.request_group_id === oc.request_group_id);
                    if (groupItems.length <= 1) return null;
                    const groupTotal = groupItems.reduce((s, o) => s + o.amount_cents, 0);
                    const canAdminEdit = isSuperAdmin || isAdmin;
                    return (
                      <section>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                            Line Items / بنود الطلب ({groupItems.length})
                          </p>
                          <span className="text-[11px] font-semibold text-foreground tabular-nums">
                            Total: {groupItems[0]?.currency} {(groupTotal / 100).toLocaleString()}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {groupItems.map((item, idx) => {
                            const itemCat = EXPENSE_CATEGORY_MAP[item.expense_category];
                            const ItemIcon = itemCat?.icon;
                            const rawDesc = item.description || '';
                            const cleanDesc = rawDesc.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || item.expense_category;
                            const adminNotes = rawDesc.match(/\[Admin edit[^\]]*\]/g) || [];
                            const itemDerivedStatus = item.paid_at ? 'paid' : item.reconciled_at ? 'reconciled' : item.status;
                            const isCurrentItem = item.id === oc.id;
                            return (
                              <div key={item.id} className={`rounded-lg border text-sm overflow-hidden ${isCurrentItem ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}>
                                {/* Item header */}
                                <div className={`flex items-center gap-2 px-3 py-2 ${isCurrentItem ? 'bg-primary/5' : 'bg-muted/30'}`}>
                                  <div className="flex-none w-6 h-6 rounded-full bg-background border flex items-center justify-center text-xs font-semibold text-muted-foreground">{idx + 1}</div>
                                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                    {ItemIcon ? <ItemIcon className="h-3.5 w-3.5 text-muted-foreground flex-none" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground flex-none" />}
                                    <span className="font-medium truncate">{itemCat?.label || item.expense_category}</span>
                                  </div>
                                  <Badge variant="outline" className={`text-[10px] flex-none border-0 ${
                                    itemDerivedStatus === 'paid' || itemDerivedStatus === 'approved' ? 'bg-green-100 text-green-700' :
                                    itemDerivedStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                    itemDerivedStatus === 'reconciled' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {statusLabels[itemDerivedStatus] || itemDerivedStatus}
                                  </Badge>
                                </div>
                                {/* Item fields */}
                                <div className="px-3 py-2.5 space-y-1.5 border-t">
                                  {/* Description */}
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Description / الوصف</p>
                                    <p className="text-[13px] font-medium leading-snug">{cleanDesc || <span className="text-muted-foreground italic">—</span>}</p>
                                  </div>
                                  {/* Amount */}
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Amount / المبلغ</p>
                                      <p className="text-[15px] font-bold tabular-nums">{item.currency} {(item.amount_cents / 100).toLocaleString()}</p>
                                    </div>
                                    {item.expense_date && (
                                      <div className="text-right">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Date / التاريخ</p>
                                        <p className="text-[13px]">{format(new Date(item.expense_date), 'dd MMM yyyy')}</p>
                                      </div>
                                    )}
                                  </div>
                                  {/* Vendor & Reference */}
                                  {(item.vendor || item.reference_number) && (
                                    <div className="flex gap-4">
                                      {item.vendor && (
                                        <div>
                                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vendor / المورد</p>
                                          <p className="text-[12px]">{item.vendor}</p>
                                        </div>
                                      )}
                                      {item.reference_number && (
                                        <div>
                                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ref # / المرجع</p>
                                          <p className="text-[12px] font-mono">{item.reference_number}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* Admin change notes */}
                                  {adminNotes.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                      {adminNotes.map((note, ni) => (
                                        <div key={ni} className="flex gap-1.5 items-start rounded bg-amber-50 dark:bg-amber-900/20 px-2 py-1">
                                          <PencilLine className="h-3 w-3 text-amber-600 mt-0.5 flex-none" />
                                          <p className="text-[11px] text-amber-800 dark:text-amber-300">{note.replace(/^\[|\]$/g, '')}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Admin edit button */}
                                  {canAdminEdit && (
                                    <div className="pt-1">
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEditItem(item)}>
                                        <Pencil className="h-3 w-3" /> Edit Item
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })()}

                  {/* ── Expense Details ── */}
                  <section>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Expense Details / تفاصيل المصروف</p>
                    <div className="rounded-lg border divide-y text-sm">
                      {oc.description && (
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Description / الوصف</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{oc.description.replace(/^\[.*?\]\s*/, '')}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 divide-x">
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                          <p className="font-medium flex items-center gap-1">
                            {CatIcon && <CatIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                            {catMeta?.label || oc.expense_category}
                          </p>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                          <p className="font-bold tabular-nums">{oc.currency} {(oc.amount_cents / 100).toLocaleString()}</p>
                        </div>
                      </div>
                      {(oc.vendor || oc.reference_number) && (
                        <div className="grid grid-cols-2 divide-x">
                          {oc.vendor && (
                            <div className="px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Vendor / المورد</p>
                              <p>{oc.vendor}</p>
                            </div>
                          )}
                          {oc.reference_number && (
                            <div className="px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Reference #</p>
                              <p className="font-mono text-xs">{oc.reference_number}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {oc.expense_date && (
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Expense Date / تاريخ المصروف</p>
                          <p className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            {format(new Date(oc.expense_date), 'EEEE, dd MMMM yyyy')}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* ── Submission Info ── */}
                  <section>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Submission Info / معلومات الطلب</p>
                    <div className="rounded-lg border divide-y text-sm">
                       <div className="px-3 py-2">
                         <p className="text-xs text-muted-foreground mb-0.5">Submitted By / مقدم الطلب</p>
                          <p className="font-medium">{submitter?.fullName || submitter?.name || submitter?.email || resolvedProfiles[oc.submitted_by]?.name || `User ${oc.submitted_by.slice(0, 8)}`}</p>
                         {oc.submitter_role && <p className="text-xs text-muted-foreground capitalize">{oc.submitter_role.replace(/_/g, ' ')}</p>}
                       </div>
                      {oc.submitted_at && (
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Submitted At / وقت التقديم</p>
                          <p>{format(new Date(oc.submitted_at), 'dd MMM yyyy, h:mm a')}</p>
                        </div>
                      )}
                       {linkedProject && (
                         <div className="px-3 py-2">
                           <p className="text-xs text-muted-foreground mb-0.5">Project / المشروع</p>
                           <button
                             onClick={() => { setViewingSubmission(null); navigate(`/projects/${linkedProject.id}`); }}
                             className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                           >
                             {linkedProject.name}
                           </button>
                         </div>
                       )}
                       {oc.mmp_file_id && mmpNameMap.get(oc.mmp_file_id) && (
                         <div className="px-3 py-2">
                           <p className="text-xs text-muted-foreground mb-0.5">Monthly Monitoring Plan (MMP)</p>
                           <p className="font-medium flex items-center gap-1.5">
                             <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                             {mmpNameMap.get(oc.mmp_file_id)}
                           </p>
                         </div>
                       )}
                       <div className="px-3 py-2">
                         <p className="text-xs text-muted-foreground mb-0.5">Submission ID</p>
                         <p className="font-mono text-xs opacity-60">{oc.id}</p>
                       </div>
                    </div>
                  </section>

                  {/* ── Rejection Reason ── */}
                  {oc.rejection_reason && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-3">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-1">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm font-semibold">Rejection Reason / سبب الرفض</span>
                      </div>
                      <p className="text-sm text-red-700 dark:text-red-300">{oc.rejection_reason}</p>
                    </div>
                  )}

                  {/* ── Approval Trail ── */}
                  <section>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">Approval Trail / مسار الموافقة</p>
                    <div className="space-y-3">
                      <ApprovalStep tier={1} tStatus={oc.tier1_status} tUser={t1User} tAt={oc.tier1_approved_at} tNotes={oc.tier1_notes} />
                      {!isCDSubmission(oc) && (
                        <>
                          <div className="ml-3 border-l-2 border-dashed border-muted h-3" />
                          <ApprovalStep tier={2} tStatus={oc.tier2_status} tUser={t2User} tAt={oc.tier2_approved_at} tNotes={oc.tier2_notes} />
                        </>
                      )}
                      {(hasThreeTiers(oc) || hasFourTiers(oc)) && (
                        <>
                          <div className="ml-3 border-l-2 border-dashed border-muted h-3" />
                          <ApprovalStep tier={3} tStatus={oc.tier3_status} tUser={t3User} tAt={oc.tier3_approved_at} tNotes={oc.tier3_notes} />
                        </>
                      )}
                      {hasFourTiers(oc) && (
                        <>
                          <div className="ml-3 border-l-2 border-dashed border-muted h-3" />
                          <ApprovalStep tier={4} tStatus={oc.tier4_status} tUser={t4User} tAt={oc.tier4_approved_at} tNotes={oc.tier4_notes} />
                        </>
                      )}
                    </div>
                  </section>

                  {/* ── Payment Info ── */}
                  {oc.paid_at && (
                    <section>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Payment / الدفع</p>
                      <div className="rounded-lg border divide-y text-sm">
                        <div className="px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Paid At</p>
                          <p className="flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5 text-purple-500" />
                            {format(new Date(oc.paid_at), 'dd MMM yyyy, h:mm a')}
                          </p>
                        </div>
                        {oc.payment_proof_url && (
                          <div className="px-3 py-2 flex flex-col gap-0.5">
                            {(() => { let urls: string[] = []; try { const p = JSON.parse(oc.payment_proof_url!); urls = Array.isArray(p) ? p : [oc.payment_proof_url!]; } catch { urls = [oc.payment_proof_url!]; } return urls.map((u, i) => (
                              <button key={i} type="button" onClick={() => openAttach(urls, 'Payment Proof', i)}
                                className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1">
                                <Eye className="h-3.5 w-3.5" /> {urls.length > 1 ? `Receipt ${i + 1} of ${urls.length}` : 'View Payment Proof'}
                              </button>
                            )); })()}
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* ── Attachments ── */}
                  {docs.length > 0 && (
                    <section>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                        Attachments / المرفقات ({docs.length})
                      </p>
                      <div className="space-y-1.5">
                        {docs.map((doc: any, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => openAttach(doc.url, doc.filename || `Document ${idx + 1}`)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            data-testid={`link-detail-doc-${oc.id}-${idx}`}
                          >
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="flex-1 text-sm text-blue-700 dark:text-blue-300 truncate text-left">{doc.filename || `Document ${idx + 1}`}</span>
                            <Eye className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Approval Status History ── */}
                  <StatusHistoryPanel entityType="cost_submission" entityId={oc.id} />
                </div>

                {/* ── Footer action bar ── */}
                <div className="shrink-0 border-t px-5 py-3 flex items-center justify-between gap-2 bg-muted/20">
                  <Button variant="ghost" size="sm" onClick={() => setViewingSubmission(null)} data-testid="button-detail-close">
                    Close
                  </Button>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {(isSuperAdmin || isAdmin || canTier1Approve(oc) || canTier2Approve(oc) || canTier3Approve(oc) || canTier4Approve(oc)) && !oc.paid_at && !oc.reconciled_at && (
                      <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20 gap-1"
                        onClick={() => { setSendBackDialog({ open: true, item: oc }); setSendBackComment(''); }}
                        data-testid={`button-detail-sendback-${oc.id}`}>
                        <CornerUpLeft className="h-3.5 w-3.5" /> Send Back
                      </Button>
                    )}
                    {canTier1Approve(oc) && (
                      <Button size="sm" onClick={() => { setViewingSubmission(null); openApprovalDialog(oc, 'approve', 1); }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`button-detail-approve-${oc.id}`}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve T1
                      </Button>
                    )}
                    {canTier2Approve(oc) && (
                      <Button size="sm" onClick={() => { setViewingSubmission(null); openApprovalDialog(oc, 'approve', 2); }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`button-detail-approve-t2-${oc.id}`}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve T2
                      </Button>
                    )}
                    {canTier3Approve(oc) && (
                      <Button size="sm" onClick={() => { setViewingSubmission(null); openApprovalDialog(oc, 'approve', 3); }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`button-detail-approve-t3-${oc.id}`}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> {hasFourTiers(oc) ? 'Approve T3' : 'Final Approve T3'}
                      </Button>
                    )}
                    {canTier4Approve(oc) && (
                      <Button size="sm" onClick={() => { setViewingSubmission(null); openApprovalDialog(oc, 'approve', 4); }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`button-detail-approve-t4-${oc.id}`}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Final Approve T4
                      </Button>
                    )}
                    {canEditSubmission(oc) && (
                      <Button size="sm" variant="outline" onClick={() => { setViewingSubmission(null); handleEditSubmission(oc); }}
                        data-testid={`button-detail-edit-${oc.id}`}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Edit Line Item Dialog ── */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-amber-600" /> Edit Line Item
            </DialogTitle>
            <DialogDescription>Adjust this item's details. A reason is required and will be logged.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-3 py-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category / الفئة</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={editItemFields.expense_category}
                  onChange={e => setEditItemFields(f => ({ ...f, expense_category: e.target.value }))}>
                  {Object.entries(EXPENSE_CATEGORY_MAP).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description / الوصف</label>
                <Textarea rows={2} className="text-sm" value={editItemFields.description}
                  onChange={e => setEditItemFields(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount ({editingItem.currency})</label>
                  <input type="number" min="0" step="0.01" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={editItemFields.amount_str}
                    onChange={e => setEditItemFields(f => ({ ...f, amount_str: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date / التاريخ</label>
                  <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={editItemFields.expense_date}
                    onChange={e => setEditItemFields(f => ({ ...f, expense_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor / المورد</label>
                  <input type="text" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={editItemFields.vendor}
                    onChange={e => setEditItemFields(f => ({ ...f, vendor: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ref # / المرجع</label>
                  <input type="text" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={editItemFields.reference_number}
                    onChange={e => setEditItemFields(f => ({ ...f, reference_number: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1 border-t pt-3">
                <label className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Reason for Change * / سبب التعديل
                </label>
                <Textarea rows={2} className="text-sm border-amber-300 focus:border-amber-500"
                  placeholder="Explain what was changed and why…"
                  value={editItemFields.reason}
                  onChange={e => setEditItemFields(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={handleSaveItemEdit} disabled={itemEditSubmitting || !editItemFields.reason.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              {itemEditSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Back Dialog ── */}
      <Dialog open={sendBackDialog.open} onOpenChange={(open) => { if (!open) { setSendBackDialog({ open: false, item: null }); setSendBackComment(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CornerUpLeft className="h-4 w-4 text-amber-600" /> Send Back for Revision / إعادة للمراجعة
            </DialogTitle>
            <DialogDescription>
              {sendBackDialog.item?.request_group_id
                ? `All ${operationalCosts.filter(o => o.request_group_id === sendBackDialog.item?.request_group_id).length} items in this group will be reset to Pending.`
                : 'This request will be reset to Pending and the submitter will be notified to revise.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Comment / تعليق *
            </label>
            <Textarea rows={3} className="text-sm"
              placeholder="Explain what needs to be corrected…"
              value={sendBackComment}
              onChange={e => setSendBackComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendBackDialog({ open: false, item: null }); setSendBackComment(''); }}>Cancel</Button>
            <Button onClick={handleSendBack} disabled={sendBackSubmitting || !sendBackComment.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              {sendBackSubmitting ? 'Sending…' : 'Send Back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approvalDialog.open} onOpenChange={(open) => {
        if (!open) {
          setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null });
          setApprovalNotes('');
          setApprovalReason('');
          setApprovalAttachments([]);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-approval-title">
              {approvalDialog.action === 'approve' 
                ? `Tier ${approvalDialog.tier} Approval` 
                : `Tier ${approvalDialog.tier} Rejection`}
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">
                {approvalDialog.action === 'approve'
                  ? `الموافقة - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' }[approvalDialog.tier]}`
                  : `الرفض - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' }[approvalDialog.tier]}`}
              </span>
            </DialogTitle>
            <DialogDescription>
              {approvalDialog.action === 'approve'
                ? approvalDialog.submission && isFinalTier(approvalDialog.submission, approvalDialog.tier)
                  ? 'You are about to give final approval (clears for payment). Digital signature required.'
                  : (isSuperAdmin || isAdmin)
                    ? `You are about to approve this submission at Tier ${approvalDialog.tier}. Digital signature required.`
                    : `You are about to approve this submission (moves to Tier ${approvalDialog.tier + 1} review).`
                : 'You are about to reject this submission. Please provide a reason.'}
              <span dir="rtl" className="block text-xs mt-1">
                {approvalDialog.action === 'approve'
                  ? approvalDialog.submission && isFinalTier(approvalDialog.submission, approvalDialog.tier)
                    ? 'أنت على وشك الموافقة النهائية على هذا الطلب (تمهيد للدفع). التوقيع الرقمي مطلوب.'
                    : (isSuperAdmin || isAdmin)
                      ? `أنت على وشك الموافقة على هذا الطلب في المرحلة ${approvalDialog.tier}. التوقيع الرقمي مطلوب.`
                      : `أنت على وشك الموافقة على هذا الطلب (ينتقل إلى المرحلة ${{ 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' }[approvalDialog.tier + 1] || ''} للمراجعة).`
                  : 'أنت على وشك رفض هذا الطلب. يرجى تقديم سبب الرفض.'}
              </span>
            </DialogDescription>
          </DialogHeader>
          {approvalDialog.submission && (() => {
            const sub = approvalDialog.submission;
            const submitter = users.find(u => u.id === sub.submitted_by);
            const tier1Approver = sub.tier1_approved_by ? users.find(u => u.id === sub.tier1_approved_by) : null;
            const linkedProject = allProjects.find(p => p.id === sub.project_id);
            const budgetRemaining = linkedProject ? (linkedProject as any).budgetRemaining : null;
            const amountValue = sub.amount_cents / 100;
            const isOverBudget = budgetRemaining !== null && budgetRemaining !== undefined && amountValue > budgetRemaining;
            const docCount = Array.isArray(sub.supporting_documents) ? sub.supporting_documents.length : 0;

            return (
              <div className="space-y-4 py-1">
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{sub.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</p>
                      {sub.description && sub.description.split('\n').length > 1 && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sub.description.split('\n').slice(1).join(' ').trim()}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-lg">{sub.currency} {amountValue.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3 w-3 shrink-0" />
                      <span className="truncate"><span className="font-medium text-foreground">{submitter?.name || 'Unknown'}</span> ({sub.submitter_role || 'N/A'})</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{sub.expense_category?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>{sub.expense_date ? format(new Date(sub.expense_date), 'MMM d, yyyy') : 'N/A'}</span>
                    </div>
                    {sub.vendor && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sub.vendor}</span>
                      </div>
                    )}
                    {sub.reference_number && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="truncate">Ref: {sub.reference_number}</span>
                      </div>
                    )}
                    {linkedProject && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <button
                          onClick={() => navigate(`/projects/${linkedProject.id}`)}
                          className="truncate text-blue-600 dark:text-blue-400 hover:underline"
                          data-testid={`link-approval-project-${linkedProject.id}`}
                        >
                          {linkedProject.name}
                        </button>
                      </div>
                    )}
                    <div className={`${docCount > 0 ? 'col-span-2' : ''} space-y-1.5`}>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span>{docCount} attachment{docCount !== 1 ? 's' : ''}</span>
                      </div>
                      {docCount > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(sub.supporting_documents as any[]).map((doc: any, idx: number) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => openAttach(doc.url, doc.filename || `Document ${idx + 1}`)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors max-w-[200px]"
                              data-testid={`link-approval-doc-${idx}`}
                            >
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{doc.filename || `Document ${idx + 1}`}</span>
                              <Eye className="h-3 w-3 shrink-0 opacity-60" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {linkedProject && budgetRemaining !== null && budgetRemaining !== undefined && (
                  <div className={`p-3 rounded-lg border text-sm ${isOverBudget ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className={`h-4 w-4 ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                        <span className="font-medium">Budget Status <span dir="rtl" className="text-xs font-normal text-muted-foreground">/ حالة الميزانية</span></span>
                      </div>
                      <Badge className={`text-xs border-0 ${isOverBudget ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'}`}>
                        {isOverBudget ? 'Exceeds Budget' : 'Within Budget'}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span>Project remaining: <strong>{sub.currency} {budgetRemaining.toLocaleString()}</strong></span>
                      {isOverBudget && (
                        <span className="ml-2 text-red-600 dark:text-red-400">(Over by {sub.currency} {(amountValue - budgetRemaining).toLocaleString()})</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request Timeline <span dir="rtl" className="normal-case">/ الجدول الزمني للطلب</span></p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                        <FileText className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">Submitted <span dir="rtl" className="text-[10px] font-normal text-muted-foreground">/ تم التقديم</span></span>
                        <span className="text-muted-foreground ml-1">by {submitter?.name || 'Unknown'}</span>
                        <p className="text-muted-foreground">{sub.submitted_at ? format(new Date(sub.submitted_at), 'MMM d, yyyy h:mm a') : sub.created_at ? format(new Date(sub.created_at), 'MMM d, yyyy h:mm a') : 'N/A'}</p>
                      </div>
                    </div>

                    {sub.tier1_approved_at && (
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${sub.tier1_status === 'approved' ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                          {sub.tier1_status === 'approved' 
                            ? <CheckCircle className="h-2.5 w-2.5 text-green-600 dark:text-green-400" /> 
                            : <XCircle className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />}
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">Tier 1 {sub.tier1_status === 'approved' ? 'Approved' : 'Rejected'} <span dir="rtl" className="text-[10px] font-normal text-muted-foreground">/ المرحلة الأولى {sub.tier1_status === 'approved' ? 'تمت الموافقة' : 'تم الرفض'}</span></span>
                          <span className="text-muted-foreground ml-1">by {tier1Approver?.name || 'Unknown'}</span>
                          <p className="text-muted-foreground">{format(new Date(sub.tier1_approved_at), 'MMM d, yyyy h:mm a')}</p>
                          {sub.tier1_notes && <p className="text-muted-foreground italic mt-0.5">"{sub.tier1_notes}"</p>}
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                        <Clock className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-amber-700 dark:text-amber-300">
                          {approvalDialog.action === 'approve' ? 'Pending Your Approval' : 'Pending Your Decision'}
                          <span dir="rtl" className="text-[10px] font-normal block">
                            {approvalDialog.action === 'approve' ? 'في انتظار موافقتك' : 'في انتظار قرارك'}
                          </span>
                        </span>
                        <span className="text-muted-foreground ml-1">(Tier {approvalDialog.tier} / المرحلة {{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' }[approvalDialog.tier]})</span>
                        <p className="text-muted-foreground">{format(new Date(), 'MMM d, yyyy h:mm a')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ArrowRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">Next Step After This Action <span dir="rtl" className="font-normal text-[10px]">/ الخطوة التالية</span></span>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {(() => {
                      const sub = approvalDialog.submission;
                      const isFinal = sub ? isFinalTier(sub, approvalDialog.tier) : false;
                      if (approvalDialog.action === 'approve') {
                        if (isFinal) return 'This submission will be marked as fully approved and cleared for payment processing. Your digital signature will be required to finalize.';
                        return `This submission will move to Tier ${approvalDialog.tier + 1} for the next level of review.`;
                      }
                      if (approvalDialog.tier === 1) return 'This submission will be rejected and sent back to the submitter. They will see your rejection reason and can resubmit if needed.';
                      return 'This submission will be rejected. The submitter and previous approvers will be notified.';
                    })()}
                  </p>
                  <p dir="rtl" className="text-xs text-blue-700 dark:text-blue-300 mt-1.5 border-t border-blue-200 dark:border-blue-800 pt-1.5">
                    {(() => {
                      const sub = approvalDialog.submission;
                      const isFinal = sub ? isFinalTier(sub, approvalDialog.tier) : false;
                      if (approvalDialog.action === 'approve') {
                        if (isFinal) return 'سيتم اعتماد هذا الطلب بشكل نهائي وتمهيده للدفع. سيتطلب توقيعك الرقمي لإتمام العملية.';
                        return `سينتقل هذا الطلب إلى المرحلة التالية للمراجعة.`;
                      }
                      if (approvalDialog.tier === 1) return 'سيتم رفض هذا الطلب وإعادته إلى مقدم الطلب. سيرى سبب الرفض ويمكنه إعادة التقديم.';
                      return 'سيتم رفض هذا الطلب. سيتم إخطار مقدم الطلب والمراجعين السابقين.';
                    })()}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approval-reason-select">
                    {approvalDialog.action === 'approve' ? 'Approval Reason *' : 'Rejection Reason *'}
                    <span dir="rtl" className="text-xs font-normal text-muted-foreground mr-2">
                      {approvalDialog.action === 'approve' ? '/ سبب الموافقة *' : '/ سبب الرفض *'}
                    </span>
                  </Label>
                  <Select value={approvalReason} onValueChange={setApprovalReason}>
                    <SelectTrigger id="approval-reason-select" data-testid="select-approval-reason">
                      <SelectValue placeholder="Select a reason... / اختر سبباً..." />
                    </SelectTrigger>
                    <SelectContent>
                      {groupReasonOptions(
                        approvalDialog.action === 'reject'
                          ? REJECTION_REASONS.cost_submission || REJECTION_REASONS.general
                          : APPROVAL_REASONS.cost_submission || APPROVAL_REASONS.general
                      ).map(({ group, items }) =>
                        group ? (
                          <SelectGroup key={group}>
                            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">{group}</SelectLabel>
                            {items.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                          </SelectGroup>
                        ) : (
                          items.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)
                        )
                      )}
                    </SelectContent>
                  </Select>
                  {!approvalReason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {approvalDialog.action === 'approve' ? 'An approval reason is required. / سبب الموافقة مطلوب.' : 'A rejection reason is required. / سبب الرفض مطلوب.'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approval-notes">
                    {approvalDialog.action === 'approve' ? 'Additional Notes' : 'Additional Comments'}
                    <span dir="rtl" className="text-xs font-normal text-muted-foreground mr-2">
                      {approvalDialog.action === 'approve' ? '/ ملاحظات إضافية' : '/ تعليقات إضافية'}
                    </span>
                  </Label>
                  <Textarea
                    id="approval-notes"
                    placeholder={approvalDialog.action === 'approve' ? 'Provide any additional notes... / اكتب ملاحظات إضافية...' : 'Provide more context... / أضف سياقاً إضافياً...'}
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    rows={3}
                    data-testid="input-approval-notes"
                  />
                </div>

                {/* ── Approval-stage attachment upload ── */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments (optional)
                    <span dir="rtl" className="text-xs font-normal text-muted-foreground">/ مرفقات اختيارية</span>
                  </Label>
                  <label
                    className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    data-testid="dropzone-approval-attachments"
                  >
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Upload className="h-4 w-4" />
                      <span className="text-xs">Click to attach Excel, PDF, images…</span>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files) {
                          setApprovalAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {approvalAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {approvalAttachments.map((f, i) => (
                        <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 max-w-[200px]">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setApprovalAttachments(prev => prev.filter((_, j) => j !== i))}
                            className="ml-0.5 text-blue-400 hover:text-red-500 shrink-0"
                            data-testid={`button-remove-approval-attachment-${i}`}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null }); setApprovalAttachments([]); }}
              disabled={approvalProcessing}
              data-testid="button-approval-cancel"
            >
              Cancel / إلغاء
            </Button>
            <Button
              variant={approvalDialog.action === 'approve' ? 'default' : 'destructive'}
              onClick={handleApprovalAction}
              disabled={approvalProcessing || !approvalReason.trim()}
              data-testid="button-approval-confirm"
            >
              {approvalProcessing ? 'Processing... / جارٍ المعالجة...' : approvalDialog.action === 'approve' 
                ? (approvalDialog.submission && shouldRequireSignature(approvalDialog.submission, approvalDialog.tier) ? 'Sign & Approve / توقيع وموافقة' : 'Confirm Approval / تأكيد الموافقة') 
                : 'Confirm Rejection / تأكيد الرفض'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Group Approval Dialog ────────────────────────────────────────── */}
      <Dialog
        open={groupApprovalDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setGroupApprovalDialog(prev => ({ ...prev, open: false }));
            setGroupApprovalNotes('');
            setGroupApprovalReason('');
            setGroupApprovalAttachments([]);
          }
        }}
      >
        <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
          {/* ── Colored header band ── */}
          {(() => {
            const isApprove = groupApprovalDialog.action === 'approve';
            const totalCents = groupApprovalDialog.submissions.reduce((s, o) => s + o.amount_cents, 0);
            const currency = groupApprovalDialog.submissions[0]?.currency ?? 'SDG';
            const tierLabel: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };

            /* group by category for summary chips */
            const byCat: Record<string, { label: string; icon: any; total: number; count: number }> = {};
            groupApprovalDialog.submissions.forEach(s => {
              const cat = s.expense_category;
              const meta = EXPENSE_CATEGORY_MAP[cat];
              if (!byCat[cat]) byCat[cat] = { label: meta?.label || cat, icon: meta?.icon, total: 0, count: 0 };
              byCat[cat].total += s.amount_cents;
              byCat[cat].count += 1;
            });
            const catEntries = Object.entries(byCat);

            return (
              <>
                {/* Header band */}
                <div className={`px-5 py-4 ${isApprove
                  ? 'bg-emerald-600 dark:bg-emerald-700'
                  : 'bg-red-600 dark:bg-red-700'} text-white`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {isApprove
                          ? <CheckCircle2 className="h-4 w-4 shrink-0 opacity-90" />
                          : <XCircle className="h-4 w-4 shrink-0 opacity-90" />}
                        <span className="font-semibold text-base leading-tight">
                          {isApprove ? `Approve All — Tier ${groupApprovalDialog.tier}` : 'Reject All Items'}
                        </span>
                      </div>
                      <p dir="rtl" className="text-xs opacity-80 mt-0.5">
                        {isApprove
                          ? `الموافقة على جميع البنود — المرحلة ${tierLabel[groupApprovalDialog.tier] ?? groupApprovalDialog.tier}`
                          : 'رفض جميع بنود هذا الطلب'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold tabular-nums leading-none">
                        {currency} {(totalCents / 100).toLocaleString()}
                      </p>
                      <p className="text-xs opacity-75 mt-0.5">{groupApprovalDialog.submissions.length} expense items</p>
                    </div>
                  </div>

                  {/* Request title */}
                  <div className="mt-3 rounded-md bg-white/10 px-3 py-2">
                    <p className="text-xs opacity-75 uppercase tracking-wide font-semibold mb-0.5">Request</p>
                    <p className="text-sm font-medium leading-snug">{groupApprovalDialog.groupTitle || 'Grouped Request'}</p>
                  </div>
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                  {/* Category summary chips */}
                  {catEntries.length > 1 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Category</p>
                      <div className="flex flex-wrap gap-2">
                        {catEntries.map(([cat, data]) => {
                          const CatIcon = data.icon;
                          return (
                            <div key={cat} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border
                              ${isApprove
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'}`}>
                              {CatIcon && <CatIcon className="h-3 w-3" />}
                              <span className="font-medium">{data.label}</span>
                              <span className="opacity-70">× {data.count}</span>
                              <span className="font-semibold tabular-nums">{currency} {(data.total / 100).toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Line-item list with scroll */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Items</p>
                      <p className="text-xs text-muted-foreground">{groupApprovalDialog.submissions.length} rows</p>
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      {/* Sticky column headers */}
                      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Category / Description</span>
                        <span className="text-right">Amount</span>
                      </div>
                      {/* Scrollable rows */}
                      <div className="divide-y overflow-y-auto max-h-52 overscroll-contain">
                        {groupApprovalDialog.submissions.map((s, idx) => {
                          const catMeta = EXPENSE_CATEGORY_MAP[s.expense_category];
                          const CatIcon = catMeta?.icon;
                          const desc = s.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '';
                          return (
                            <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 hover:bg-muted/30 transition-colors">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground/60 tabular-nums w-4 shrink-0">{idx + 1}.</span>
                                  {CatIcon && <CatIcon className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                  <span className="text-xs font-medium">{catMeta?.label || s.expense_category}</span>
                                </div>
                                {desc && (
                                  <p className="text-[10px] text-muted-foreground truncate ml-5 mt-0.5">{desc}</p>
                                )}
                              </div>
                              <span className="text-xs font-semibold tabular-nums self-center text-right whitespace-nowrap">
                                {s.currency} {(s.amount_cents / 100).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Sticky total row */}
                      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 bg-muted/60 border-t">
                        <span className="text-xs font-bold">Total ({groupApprovalDialog.submissions.length} items)</span>
                        <span className={`text-sm font-bold tabular-nums ${isApprove ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                          {currency} {(totalCents / 100).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning banner for reject */}
                  {!isApprove && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-red-700 dark:text-red-300">
                        <p className="font-semibold mb-0.5">All {groupApprovalDialog.submissions.length} items will be rejected</p>
                        <p className="opacity-80">The submitter will be notified and can revise and resubmit. This action cannot be undone.</p>
                      </div>
                    </div>
                  )}

                  {/* Success-path info for approve */}
                  {isApprove && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-700 dark:text-emerald-300">
                        <p className="font-semibold mb-0.5">
                          {(groupApprovalDialog.tier === 4 || (groupApprovalDialog.tier === 3 && !groupApprovalDialog.submissions.some(s => hasFourTiers(s))))
                            ? `All items will be fully approved and cleared for payment`
                            : `All items will advance to Tier ${groupApprovalDialog.tier + 1} review`}
                        </p>
                        <p className="opacity-80" dir="rtl">
                          {(groupApprovalDialog.tier === 4 || (groupApprovalDialog.tier === 3 && !groupApprovalDialog.submissions.some(s => hasFourTiers(s))))
                            ? 'سيتم اعتماد جميع البنود نهائياً وتمهيدها للدفع'
                            : `ستنتقل جميع البنود إلى المرحلة التالية للمراجعة`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Structured Reason (Required for both approve and reject) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="group-approval-reason">
                      {isApprove ? 'Reason for Approval' : 'Reason for Rejection'}
                      <span className="text-red-500 ml-0.5">*</span>
                      <span dir="rtl" className="text-xs font-normal text-muted-foreground ml-2">
                        {isApprove ? '/ سبب الموافقة *' : '/ سبب الرفض *'}
                      </span>
                    </Label>
                    <Select value={groupApprovalReason} onValueChange={setGroupApprovalReason}>
                      <SelectTrigger id="group-approval-reason" data-testid="select-group-approval-reason">
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groupReasonOptions(
                          isApprove
                            ? APPROVAL_REASONS.cost_submission || APPROVAL_REASONS.general
                            : REJECTION_REASONS.cost_submission || REJECTION_REASONS.general
                        ).map(({ group, items }) =>
                          group ? (
                            <SelectGroup key={group}>
                              <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">{group}</SelectLabel>
                              {items.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                            </SelectGroup>
                          ) : (
                            items.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)
                          )
                        )}
                      </SelectContent>
                    </Select>
                    {!groupApprovalReason && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        A reason is required / السبب مطلوب
                      </p>
                    )}
                  </div>

                  {/* Notes / Comment */}
                  <div className="space-y-1.5">
                    <Label htmlFor="group-approval-notes">
                      {isApprove ? 'Additional Notes' : 'Additional Details'}
                      <span dir="rtl" className="text-xs font-normal text-muted-foreground ml-2">
                        {isApprove ? '/ ملاحظات إضافية (اختياري)' : '/ تفاصيل (اختياري)'}
                      </span>
                    </Label>
                    <Textarea
                      id="group-approval-notes"
                      placeholder={isApprove
                        ? 'Optional notes that will apply to all items...'
                        : 'Optional — provide additional context for the submitter.'}
                      value={groupApprovalNotes}
                      onChange={e => setGroupApprovalNotes(e.target.value)}
                      className="min-h-[60px] resize-none"
                      data-testid="textarea-group-approval-notes"
                    />
                  </div>

                  {/* ── Approval-stage attachments ── */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm">
                      <Paperclip className="h-3.5 w-3.5" />
                      Attachments (optional)
                      <span dir="rtl" className="text-xs font-normal text-muted-foreground">/ مرفقات — تُضاف لجميع البنود</span>
                    </Label>
                    <label
                      className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      data-testid="dropzone-group-approval-attachments"
                    >
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span className="text-xs">Click to attach Excel, PDF, images…</span>
                        <span className="text-[10px] opacity-60">Will be added to all {groupApprovalDialog.submissions.length} items</span>
                      </div>
                      <input
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                        className="hidden"
                        onChange={e => {
                          if (e.target.files) {
                            setGroupApprovalAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                    {groupApprovalAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {groupApprovalAttachments.map((f, i) => (
                          <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 max-w-[200px]">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setGroupApprovalAttachments(prev => prev.filter((_, j) => j !== i))}
                              className="ml-0.5 text-blue-400 hover:text-red-500 shrink-0"
                              data-testid={`button-remove-group-attachment-${i}`}
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Footer (outside scroll) ── */}
                <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setGroupApprovalDialog(prev => ({ ...prev, open: false })); setGroupApprovalNotes(''); setGroupApprovalReason(''); setGroupApprovalAttachments([]); }}
                    disabled={groupApprovalProcessing}
                    data-testid="button-group-approval-cancel"
                  >
                    Cancel / إلغاء
                  </Button>
                  <Button
                    variant={isApprove ? 'default' : 'destructive'}
                    onClick={handleGroupApproval}
                    disabled={groupApprovalProcessing || !groupApprovalReason.trim()}
                    className={isApprove ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                    data-testid="button-group-approval-confirm"
                  >
                    {isApprove
                      ? <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      : <XCircle className="h-4 w-4 mr-1.5" />}
                    {groupApprovalProcessing
                      ? `Processing... / جارٍ المعالجة...`
                      : isApprove
                        ? `Approve All ${groupApprovalDialog.submissions.length} Items`
                        : `Reject All ${groupApprovalDialog.submissions.length} Items`}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-delete-title">
              Delete Submission
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">حذف الطلب</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cost submission? This action cannot be undone.
              <span dir="rtl" className="block text-xs mt-1">هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.</span>
              {deleteConfirm && (
                <span className="block mt-2 font-medium">
                  {deleteConfirm.currency} {(deleteConfirm.amount_cents / 100).toLocaleString()} - {deleteConfirm.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-delete-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteSubmission();
              }}
              disabled={actionProcessing}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-delete-confirm"
            >
              {actionProcessing ? 'Deleting... / جارٍ الحذف...' : 'Delete / حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Group Delete confirmation dialog ────────────────────────────── */}
      <AlertDialog open={!!groupDeleteConfirm} onOpenChange={(open) => !open && setGroupDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Group / حذف المجموعة
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This will permanently delete <strong>all {groupDeleteConfirm?.items.filter(o => getOperationalDerivedStatus(o) !== 'reconciled').length} items</strong> in this group. This cannot be undone.</p>
                {groupDeleteConfirm && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-foreground">
                    {groupDeleteConfirm.title}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {groupDeleteConfirm.items.length} item{groupDeleteConfirm.items.length !== 1 ? 's' : ''} · {groupDeleteConfirm.items[0]?.currency} {(groupDeleteConfirm.items.reduce((s, o) => s + o.amount_cents, 0) / 100).toLocaleString()} total
                    </span>
                    {groupDeleteConfirm.items.some(o => getOperationalDerivedStatus(o) === 'reconciled') && (
                      <span className="block text-xs text-amber-600 mt-1">⚠ Reconciled items will be skipped.</span>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-group-delete-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); handleDeleteGroup(); }}
              disabled={actionProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-group-delete-confirm"
            >
              {actionProcessing ? 'Deleting... / جارٍ الحذف...' : 'Delete Group / حذف المجموعة'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Request Deletion dialog (any user) ─────────────────────────── */}
      <AlertDialog open={deleteRequestDialog.open} onOpenChange={(open) => !open && setDeleteRequestDialog({ open: false, submission: null, reason: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Deletion / طلب الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              Your request will be reviewed by an admin. Provide a clear reason below.
              {deleteRequestDialog.submission && (
                <span className="block mt-2 font-medium text-foreground">
                  {deleteRequestDialog.submission.currency} {(deleteRequestDialog.submission.amount_cents / 100).toLocaleString()} — {deleteRequestDialog.submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Reason for deletion (required) / سبب الحذف (مطلوب)"
              value={deleteRequestDialog.reason}
              onChange={(e) => setDeleteRequestDialog(prev => ({ ...prev, reason: e.target.value }))}
              data-testid="input-delete-request-reason"
            />
            {deleteRequestDialog.submission?.delete_request_status === 'rejected' && deleteRequestDialog.submission.delete_request_notes && (
              <p className="mt-2 text-xs text-destructive">Previous rejection feedback: {deleteRequestDialog.submission.delete_request_notes}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionProcessing || !deleteRequestDialog.reason.trim()}
              onClick={(e) => { e.preventDefault(); handleRequestDeletion(); }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-submit-delete-request"
            >
              {actionProcessing ? 'Sending…' : 'Submit Request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Review Delete Request dialog (Admin / FinancialAdmin) ───────── */}
      {/* ── Restore from Deletion Log Confirmation ── */}
      <AlertDialog open={!!restoreLogEntry} onOpenChange={(open) => { if (!open) setRestoreLogEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />Restore Deleted Submission?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {restoreLogEntry && (() => {
                  const rd = restoreLogEntry.record_data ?? {};
                  return (
                    <>
                      <p className="font-medium text-foreground">
                        {rd.currency} {((rd.amount_cents ?? 0) / 100).toLocaleString()} — {rd.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                      </p>
                      <p className="text-xs">
                        Deleted by <strong>{restoreLogEntry.deleted_by_name}</strong> on {new Date(restoreLogEntry.deleted_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        This will re-insert the submission exactly as it was. Its approval status will be the same as when it was deleted.
                      </p>
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={actionProcessing}
              onClick={() => restoreLogEntry && handleRestoreFromLog(restoreLogEntry)}
            >
              {actionProcessing ? 'Restoring…' : 'Yes, Restore It'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteReviewDialog.open} onOpenChange={(open) => !open && setDeleteReviewDialog({ open: false, submission: null, notes: '', action: 'approve' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteReviewDialog.action === 'approve' ? '🗑 Approve Deletion Request' : '❌ Reject Deletion Request'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReviewDialog.submission && (
                <>
                  <span className="block font-medium text-foreground">
                    {deleteReviewDialog.submission.currency} {(deleteReviewDialog.submission.amount_cents / 100).toLocaleString()} — {deleteReviewDialog.submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                  </span>
                  {deleteReviewDialog.submission.delete_request_reason && (
                    <span className="block mt-1 text-xs">Reason: {deleteReviewDialog.submission.delete_request_reason}</span>
                  )}
                </>
              )}
              {deleteReviewDialog.action === 'approve'
                ? 'This will permanently delete the submission and notify the requester.'
                : 'The requester will be notified with your feedback so they can make corrections.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteReviewDialog.action === 'reject' && (
            <div className="px-6 pb-2">
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px] focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Feedback to requester (optional but recommended)"
                value={deleteReviewDialog.notes}
                onChange={(e) => setDeleteReviewDialog(prev => ({ ...prev, notes: e.target.value }))}
                data-testid="input-delete-reject-notes"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionProcessing}
              onClick={(e) => {
                e.preventDefault();
                if (deleteReviewDialog.action === 'approve') handleApproveDeleteRequest();
                else handleRejectDeleteRequest();
              }}
              className={deleteReviewDialog.action === 'approve' ? 'bg-destructive text-destructive-foreground' : ''}
              data-testid="button-confirm-delete-review"
            >
              {actionProcessing ? 'Processing…' : deleteReviewDialog.action === 'approve' ? 'Approve & Delete' : 'Reject & Notify'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Transfer to CD Dialog (SuperAdmin) ── */}
      <AlertDialog open={transferToCDDialog.open} onOpenChange={(open) => !open && setTransferToCDDialog({ open: false, submission: null, note: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to CD as Exception / إرسال للمدير القُطري
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">سيظهر هذا الطلب للمدير القُطري كاستثناء يتطلب مراجعته</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {transferToCDDialog.submission && (
                <span className="block text-xs font-medium text-foreground mb-2">
                  {transferToCDDialog.submission.currency} {((transferToCDDialog.submission.amount_cents ?? 0) / 100).toLocaleString()} — {transferToCDDialog.submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
              The Country Director will see this submission under their <strong>Exception Requests</strong> tab and can approve or reject it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Reason / context for this exception (required) — السبب أو السياق"
              value={transferToCDDialog.note}
              onChange={(e) => setTransferToCDDialog(prev => ({ ...prev, note: e.target.value }))}
              data-testid="input-transfer-cd-note"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing}>Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionProcessing || !transferToCDDialog.note.trim()}
              onClick={(e) => { e.preventDefault(); handleTransferToCD(); }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              data-testid="button-confirm-transfer-cd"
            >
              {actionProcessing ? 'Sending…' : 'Send to CD / إرسال'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── CD Exception Review Dialog (Country Director) ── */}
      <AlertDialog open={cdExceptionReviewDialog.open} onOpenChange={(open) => !open && setCDExceptionReviewDialog({ open: false, submission: null, note: '', action: 'approved' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cdExceptionReviewDialog.action === 'approved' ? '✅ Approve Exception / الموافقة على الاستثناء' : '❌ Reject Exception / رفض الاستثناء'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cdExceptionReviewDialog.submission && (
                <span className="block text-xs font-medium text-foreground mb-1">
                  {cdExceptionReviewDialog.submission.currency} {((cdExceptionReviewDialog.submission.amount_cents ?? 0) / 100).toLocaleString()} — {cdExceptionReviewDialog.submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
              {cdExceptionReviewDialog.submission?.transfer_note && (
                <span className="block text-xs text-muted-foreground italic mt-1">SuperAdmin note: "{cdExceptionReviewDialog.submission.transfer_note}"</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={cdExceptionReviewDialog.action === 'approved' ? 'Approval note (optional)' : 'Rejection reason (recommended)'}
              value={cdExceptionReviewDialog.note}
              onChange={(e) => setCDExceptionReviewDialog(prev => ({ ...prev, note: e.target.value }))}
              data-testid="input-cd-exception-note"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing}>Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionProcessing}
              onClick={(e) => { e.preventDefault(); handleCDExceptionDecision(); }}
              className={cdExceptionReviewDialog.action === 'approved' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-destructive text-destructive-foreground'}
              data-testid="button-confirm-cd-exception"
            >
              {actionProcessing ? 'Processing…' : cdExceptionReviewDialog.action === 'approved' ? 'Approve / موافقة' : 'Reject / رفض'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recallConfirm} onOpenChange={(open) => !open && setRecallConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-recall-title">
              Recall Submission
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">استرجاع الطلب</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to recall this submission back to pending? This will remove all existing approvals and reset the entire approval process.
              <span dir="rtl" className="block text-xs mt-1">هل أنت متأكد من استرجاع هذا الطلب إلى حالة المعلق؟ سيتم إزالة جميع الموافقات وإعادة ضبط عملية الموافقة بالكامل.</span>
              {recallConfirm && (
                <span className="block mt-2 font-medium">
                  {recallConfirm.currency} {(recallConfirm.amount_cents / 100).toLocaleString()} - {recallConfirm.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-recall-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRecallSubmission();
              }}
              disabled={actionProcessing}
              data-testid="button-recall-confirm"
            >
              {actionProcessing ? 'Recalling... / جارٍ الاسترجاع...' : 'Recall to Pending / استرجاع إلى معلق'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert Paid → Approved — SuperAdmin only */}
      <AlertDialog open={!!revertPaidConfirm} onOpenChange={(open) => !open && setRevertPaidConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-revert-paid-title">
              Revert Payment
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">إرجاع الدفعة إلى حالة الموافقة</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the submission as <strong>Approved</strong> again and clear the payment record. The submission can then be re-paid or sent back to finance.
              <span dir="rtl" className="block text-xs mt-1">سيتم إعادة الطلب إلى حالة الموافقة ومسح سجل الدفع. يمكن بعد ذلك إعادة صرفه أو إرساله للمالية.</span>
              {revertPaidConfirm && (
                <span className="block mt-2 font-medium text-orange-700 dark:text-orange-400">
                  {revertPaidConfirm.currency} {(revertPaidConfirm.amount_cents / 100).toLocaleString()} — {revertPaidConfirm.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-revert-paid-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={(e) => { e.preventDefault(); handleRevertPaid(); }}
              disabled={actionProcessing}
              data-testid="button-revert-paid-confirm"
            >
              {actionProcessing ? 'Reverting... / جارٍ الإرجاع...' : 'Revert Payment / إرجاع الدفعة'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Revert Paid → Approved — reverts all paid items in a group */}
      <AlertDialog open={groupRevertPaidItems.length > 0} onOpenChange={(open) => { if (!open && !actionProcessing) { setGroupRevertPaidItems([]); setGroupRevertPaidTitle(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-group-revert-paid-title">
              Revert All Paid Items
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">إرجاع جميع المدفوعات إلى حالة الموافقة</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reset <strong>{groupRevertPaidItems.length} paid item{groupRevertPaidItems.length !== 1 ? 's' : ''}</strong> back to <strong>Approved</strong> status and clear all payment proofs and amounts. Any pre-fund deductions will be reversed.
              <span dir="rtl" className="block text-xs mt-1">سيتم إعادة تحديد العناصر المدفوعة إلى حالة الموافقة ومسح جميع الإيصالات والمبالغ المدفوعة.</span>
              {groupRevertPaidTitle && (
                <span className="block mt-2 font-medium text-orange-700 dark:text-orange-400">
                  Group: {groupRevertPaidTitle}
                </span>
              )}
              {groupRevertPaidItems.length > 0 && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  Total to reverse: {groupRevertPaidItems[0].currency} {(groupRevertPaidItems.reduce((s, o) => s + (o.amount_paid_cents ?? 0), 0) / 100).toLocaleString()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-group-revert-paid-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={(e) => { e.preventDefault(); handleGroupRevertPaid(); }}
              disabled={actionProcessing}
              data-testid="button-group-revert-paid-confirm"
            >
              {actionProcessing ? 'Reverting... / جارٍ الإرجاع...' : `Revert ${groupRevertPaidItems.length} Payment${groupRevertPaidItems.length !== 1 ? 's' : ''} / إرجاع الدفعات`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert one tier — Admin/SuperAdmin only */}
      <AlertDialog open={!!revertConfirm} onOpenChange={(open) => !open && setRevertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-revert-title">
              Revert {revertConfirm ? getRevertTierLabel(revertConfirm) : ''} Approval
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">إرجاع الموافقة خطوة للخلف</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will undo only the <strong>{revertConfirm ? getRevertTierLabel(revertConfirm) : ''}</strong> approval and return the submission to the previous step. All earlier approvals remain intact.
              {revertConfirm?.payment_proof_url && (
                <span className="block mt-1.5 text-amber-700 dark:text-amber-400 font-medium text-xs">
                  ⚠ Payment proof attached — it will be removed along with any recorded payment amount.
                  <span dir="rtl" className="block">⚠ يوجد إيصال دفع مرفق — سيتم حذفه مع المبلغ المدفوع المسجّل.</span>
                </span>
              )}
              <span dir="rtl" className="block text-xs mt-1">سيتم إلغاء موافقة {revertConfirm ? getRevertTierLabel(revertConfirm) : ''} فقط وإعادة الطلب إلى الخطوة السابقة. جميع الموافقات السابقة تبقى سارية.</span>
              {revertConfirm && (
                <span className="block mt-2 font-medium text-amber-700">
                  {revertConfirm.currency} {(revertConfirm.amount_cents / 100).toLocaleString()} — {revertConfirm.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-revert-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={(e) => { e.preventDefault(); handleRevertSubmission(); }}
              disabled={actionProcessing}
              data-testid="button-revert-confirm"
            >
              {actionProcessing ? 'Reverting... / جارٍ الإرجاع...' : `Revert ${revertConfirm ? getRevertTierLabel(revertConfirm) : ''} / إرجاع`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Tier Revert — batch step-back one approval tier for all revertable items in a group */}
      <AlertDialog open={!!groupRevertTierConfirm} onOpenChange={(open) => { if (!open && !actionProcessing) setGroupRevertTierConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-group-revert-tier-title">
              Revert {groupRevertTierConfirm?.tier} — Group
              <span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">إرجاع موافقة المجموعة خطوة للخلف</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will undo the <strong>{groupRevertTierConfirm?.tier}</strong> approval for{' '}
              <strong>{groupRevertTierConfirm?.items.length} item{(groupRevertTierConfirm?.items.length ?? 0) !== 1 ? 's' : ''}</strong> in this group,
              returning them to the previous approval step. All earlier approvals remain intact.
              <span dir="rtl" className="block text-xs mt-1">سيتم إلغاء موافقة {groupRevertTierConfirm?.tier} لجميع العناصر في المجموعة وإعادتها إلى الخطوة السابقة. الموافقات السابقة تبقى سارية.</span>
              {groupRevertTierConfirm?.title && (
                <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                  Group: {groupRevertTierConfirm.title}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-group-revert-tier-cancel">Cancel / إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={(e) => { e.preventDefault(); handleGroupRevertTier(); }}
              disabled={actionProcessing}
              data-testid="button-group-revert-tier-confirm"
            >
              {actionProcessing
                ? 'Reverting... / جارٍ الإرجاع...'
                : `Revert ${groupRevertTierConfirm?.tier} for ${groupRevertTierConfirm?.items.length ?? 0} Item${(groupRevertTierConfirm?.items.length ?? 0) !== 1 ? 's' : ''} / إرجاع`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => {
        if (!open && !paymentRequestDialog.sending) {
          setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
        }
      }}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">

          {/* ── Gradient Header ── */}
          <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Mail className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight" data-testid="dialog-payment-request-title">
                  Request Payment
                  <span dir="rtl" className="font-normal text-white/60 text-xs mr-2"> / طلب دفع</span>
                </h2>
                <p className="text-xs text-white/65 mt-0.5">
                  Select who should receive the payment request email / من سيستلم بريد طلب الدفع.
                </p>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-3">

            {paymentRequestDialog.loading ? (
              <div className="space-y-3 animate-pulse py-2">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : paymentRequestDialog.availableRecipients.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No finance/admin users found.
                <span dir="rtl" className="block text-xs mt-1">لم يتم العثور على مستخدمين في المالية/الإدارة.</span>
              </div>
            ) : (
              <>
                {/* Select All row */}
                <div
                  className="flex items-center gap-3 pb-3 border-b cursor-pointer group"
                  onClick={toggleAllPaymentRecipients as any}
                >
                  <Checkbox
                    id="select-all-recipients"
                    checked={paymentRequestDialog.selectedRecipientIds.length === paymentRequestDialog.availableRecipients.length && paymentRequestDialog.availableRecipients.length > 0}
                    onCheckedChange={toggleAllPaymentRecipients}
                    data-testid="checkbox-select-all-recipients"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="w-9 h-9 rounded-full bg-[#0F2041]/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-4 w-4 text-[#0F2041] dark:text-white/70" />
                  </div>
                  <Label htmlFor="select-all-recipients" className="flex-1 cursor-pointer">
                    <span className="text-sm font-semibold">Select All ({paymentRequestDialog.availableRecipients.length})</span>
                    <span dir="rtl" className="text-xs text-muted-foreground mr-2"> / تحديد الكل</span>
                  </Label>
                </div>

                {/* Recipient list */}
                <div className="space-y-1">
                  {paymentRequestDialog.availableRecipients.map(recipient => {
                    const isSelected = paymentRequestDialog.selectedRecipientIds.includes(recipient.id);
                    const initials = (recipient.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
                    const roleColor = recipient.role === 'super_admin' || recipient.role === 'superAdmin'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                      : recipient.role === 'finance'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
                    return (
                      <div
                        key={recipient.id}
                        onClick={() => togglePaymentRecipient(recipient.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#0F2041]/8 dark:bg-white/8 border border-[#0F2041]/20 dark:border-white/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                        }`}
                      >
                        <Checkbox
                          id={`recipient-${recipient.id}`}
                          checked={isSelected}
                          onCheckedChange={() => togglePaymentRecipient(recipient.id)}
                          data-testid={`checkbox-recipient-${recipient.id}`}
                          onClick={e => e.stopPropagation()}
                        />
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-[#0F2041] flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-sm">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{recipient.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{recipient.email}</div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${roleColor}`}>
                          {recipient.role}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── CC Section ── */}
          {!paymentRequestDialog.loading && paymentRequestDialog.availableRecipients.length > 0 && (
            <div className="border-t px-5 pt-3 pb-2">
              <EmailCCInput
                ccEmails={paymentRequestDialog.ccEmails}
                onChange={(emails) => setPaymentRequestDialog(prev => ({ ...prev, ccEmails: emails }))}
                contacts={ccContacts.filter(c => !paymentRequestDialog.selectedRecipientIds.includes(c.id))}
              />
            </div>
          )}

          {/* ── Footer ── */}
          <div className="border-t px-5 py-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
            <Button
              variant="outline"
              onClick={() => setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false })}
              disabled={paymentRequestDialog.sending}
              data-testid="button-payment-request-cancel"
            >
              Cancel / إلغاء
            </Button>
            <Button
              onClick={handleSendPaymentRequest}
              disabled={paymentRequestDialog.sending || paymentRequestDialog.selectedRecipientIds.length === 0}
              className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-1.5"
              data-testid="button-payment-request-send"
            >
              <Mail className="h-3.5 w-3.5" />
              {paymentRequestDialog.sending
                ? 'Sending… / جارٍ الإرسال…'
                : `Send to ${paymentRequestDialog.selectedRecipientIds.length} Recipient${paymentRequestDialog.selectedRecipientIds.length !== 1 ? 's' : ''} / إرسال`}
            </Button>
          </div>

        </DialogContent>
      </Dialog>

      {/* ── Bulk Payment Email Dialog (2-step: Review & Rate → Recipients & Send) ── */}
      <Dialog open={bulkCostEmailDialog.open} onOpenChange={(open) => {
        if (!open && !bulkCostEmailDialog.sending) {
          setBulkCostEmailDialog({ step: 'rate', open: false, usdRate: '', totalSdg: 0, count: 0, approvedSubmissions: [], availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
        }
      }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">

          {/* ── Dialog Header (shared across both steps) ── */}
          <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                  <Mail className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">
                    Payment Email to Finance
                    <span className="font-normal text-white/60 text-xs mr-2"> / بريد الدفع للمالية</span>
                  </h2>
                  <p className="text-xs text-white/65 mt-0.5">
                    {bulkCostEmailDialog.step === 'rate' ? 'Step 1 of 2 · Review submissions & set exchange rate' : 'Step 2 of 2 · Choose recipients & send'}
                  </p>
                </div>
              </div>
              {/* Step dots */}
              <div className="flex gap-1.5 items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${bulkCostEmailDialog.step === 'rate' ? 'bg-white text-[#0F2041]' : 'bg-white/30 text-white'}`}>1</div>
                <div className="w-4 h-0.5 bg-white/30 rounded" />
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${bulkCostEmailDialog.step === 'recipients' ? 'bg-white text-[#0F2041]' : 'bg-white/30 text-white'}`}>2</div>
              </div>
            </div>
          </div>

          {bulkCostEmailDialog.step === 'rate' ? (
            <>
              <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">

                {/* Loading skeleton while fetching fresh data */}
                {bulkCostEmailDialog.loading && (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                    <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                    <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg w-2/3" />
                    <p className="text-center text-xs text-muted-foreground">Loading submissions… / جاري التحميل…</p>
                  </div>
                )}

                {/* Warning: no submissions */}
                {!bulkCostEmailDialog.loading && bulkCostEmailDialog.count === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      No approved submissions found. The email will be sent without payment details.
                      <span className="block mt-0.5 text-xs opacity-70">لا توجد طلبات موافق عليها.</span>
                    </p>
                  </div>
                )}

                {/* Submissions table */}
                {!bulkCostEmailDialog.loading && bulkCostEmailDialog.approvedSubmissions.length > 0 && (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2.5 flex items-center justify-between border-b">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        Approved Submissions · {bulkCostEmailDialog.count}
                      </p>
                      <span className="text-xs font-bold text-green-700 dark:text-green-400">
                        Total: SDG {bulkCostEmailDialog.totalSdg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50/50 dark:bg-slate-900/50">
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Ref / Category</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Submitter</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Date</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Tier 1 ✓</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Tier 2 ✓</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Amount (SDG)</th>
                            {bulkCostEmailDialog.usdRate && !isNaN(parseFloat(bulkCostEmailDialog.usdRate)) && parseFloat(bulkCostEmailDialog.usdRate) > 0 && (
                              <th className="text-right px-3 py-2 font-semibold text-blue-600">Amount (USD)</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkCostEmailDialog.approvedSubmissions.map((sub, idx) => {
                            const rawAmtCents = Number(sub.amount_cents) || 0;
                            const amtSdg = rawAmtCents > 0 ? rawAmtCents / 100 : ((sub as any).total_amount || (sub as any).amount || 0);
                            const rate = parseFloat(bulkCostEmailDialog.usdRate);
                            const amtUsd = !isNaN(rate) && rate > 0 ? amtSdg / rate : null;
                            const submitterUser = users.find(u => u.id === sub.submitted_by);
                            const submitterName = (submitterUser as any)?.fullName || (submitterUser as any)?.full_name || (submitterUser as any)?.name || (submitterUser as any)?.email || sub.submitted_by?.slice(0, 8) || '—';
                            const tier1User = sub.tier1_approved_by ? users.find(u => u.id === sub.tier1_approved_by) : null;
                            const tier2User = sub.tier2_approved_by ? users.find(u => u.id === sub.tier2_approved_by) : null;
                            const categoryLabel = (sub.expense_category || (sub as any).request_title || '').replace(/_/g, ' ') || 'N/A';
                            const displayDate = sub.expense_date
                              ? format(parseISO(sub.expense_date), 'dd MMM yy')
                              : sub.created_at
                                ? format(parseISO(sub.created_at), 'dd MMM yy')
                                : '—';
                            return (
                              <tr key={sub.id || idx} className={`border-b last:border-0 ${idx % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-900/30'}`}>
                                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                                <td className="px-3 py-2">
                                  <span className="font-medium text-[#0F2041] dark:text-blue-300 capitalize">{categoryLabel}</span>
                                  {sub.reference_number && <span className="block text-[10px] text-muted-foreground">{sub.reference_number}</span>}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {submitterName}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                  {displayDate}
                                </td>
                                <td className="px-3 py-2">
                                  {tier1User ? (
                                    <span className="text-green-700 dark:text-green-400 font-medium">{(tier1User as any)?.fullName || (tier1User as any)?.full_name || (tier1User as any)?.name || '✓'}</span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {tier2User ? (
                                    <span className="text-green-700 dark:text-green-400 font-medium">{(tier2User as any)?.fullName || (tier2User as any)?.full_name || (tier2User as any)?.name || '✓'}</span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-[#0F2041] dark:text-blue-200 whitespace-nowrap">
                                  {amtSdg > 0 ? amtSdg.toLocaleString(undefined, { maximumFractionDigits: 0 }) : <span className="text-amber-600 font-normal">No amt</span>}
                                </td>
                                {bulkCostEmailDialog.usdRate && !isNaN(parseFloat(bulkCostEmailDialog.usdRate)) && parseFloat(bulkCostEmailDialog.usdRate) > 0 && (
                                  <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                    {amtUsd !== null ? amtUsd.toFixed(2) : '—'}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Totals row */}
                        <tfoot>
                          <tr className="border-t-2 bg-[#0F2041]/5 dark:bg-[#0F2041]/20">
                            <td colSpan={6} className="px-3 py-2 text-xs font-bold text-[#0F2041] dark:text-blue-200 text-right">Total</td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-green-700 dark:text-green-400 whitespace-nowrap">
                              {bulkCostEmailDialog.totalSdg.toLocaleString(undefined, { maximumFractionDigits: 0 })} SDG
                            </td>
                            {bulkCostEmailDialog.usdRate && !isNaN(parseFloat(bulkCostEmailDialog.usdRate)) && parseFloat(bulkCostEmailDialog.usdRate) > 0 && (
                              <td className="px-3 py-2 text-right text-sm font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                {(bulkCostEmailDialog.totalSdg / parseFloat(bulkCostEmailDialog.usdRate)).toFixed(2)} USD
                              </td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Exchange Rate Input + Attachment note — only show once data is loaded */}
                {!bulkCostEmailDialog.loading && <>
                  <div className="rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                      <Label htmlFor="usd-rate-input" className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Today's USD / SDG Exchange Rate
                        <span className="font-normal text-xs text-muted-foreground mr-1"> — optional / اختياري</span>
                      </Label>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">1 USD =</span>
                      <Input
                        id="usd-rate-input"
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="e.g. 3500"
                        value={bulkCostEmailDialog.usdRate}
                        onChange={(e) => setBulkCostEmailDialog(prev => ({ ...prev, usdRate: e.target.value }))}
                        data-testid="input-bulk-usd-rate"
                        className="text-lg font-bold border-blue-300 dark:border-blue-700 focus:ring-blue-400 max-w-[140px]"
                        onKeyDown={(e) => { if (e.key === 'Enter') proceedBulkToRecipients(); }}
                      />
                      <span className="text-sm font-semibold text-muted-foreground">SDG</span>
                    </div>
                    {bulkCostEmailDialog.usdRate && !isNaN(parseFloat(bulkCostEmailDialog.usdRate)) && parseFloat(bulkCostEmailDialog.usdRate) > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/50 px-3 py-1 text-xs font-semibold text-blue-800 dark:text-blue-200">
                          <CheckCircle className="h-3 w-3" />
                          Total ≈ USD {(bulkCostEmailDialog.totalSdg / parseFloat(bulkCostEmailDialog.usdRate)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs text-muted-foreground">
                          Avg per submission: ~USD {(bulkCostEmailDialog.count > 0 ? (bulkCostEmailDialog.totalSdg / parseFloat(bulkCostEmailDialog.usdRate)) / bulkCostEmailDialog.count : 0).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Leave blank to send SDG amounts only — the table above will update live as you type.</p>
                    )}
                  </div>

                  {/* What will be attached */}
                  <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A <strong className="text-foreground">PDF report</strong> and <strong className="text-foreground">Excel workbook</strong> with full submission details will be auto-generated and attached to the email.
                    </p>
                  </div>
                </>}
              </div>

              <div className="border-t px-6 py-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <Button type="button" variant="outline" onClick={() => setBulkCostEmailDialog(prev => ({ ...prev, open: false }))}>
                  Cancel / إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={proceedBulkToRecipients}
                  disabled={bulkCostEmailDialog.loading}
                  className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-1.5"
                  data-testid="button-bulk-next-recipients"
                >
                  {bulkCostEmailDialog.loading ? 'Loading…' : 'Next: Choose Recipients'}
                  {!bulkCostEmailDialog.loading && <ArrowRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">

                {/* Email summary strip */}
                <div className="rounded-xl border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800 px-4 py-3">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email Preview — What recipients will receive
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Subject:</span>
                      <span className="font-medium text-foreground">Payment Request — {bulkCostEmailDialog.count} Approved Cost Submission{bulkCostEmailDialog.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Total (SDG):</span>
                      <span className="font-bold text-green-700 dark:text-green-400">SDG {bulkCostEmailDialog.totalSdg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    {bulkCostEmailDialog.usdRate && !isNaN(parseFloat(bulkCostEmailDialog.usdRate)) && parseFloat(bulkCostEmailDialog.usdRate) > 0 && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">Total (USD):</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400">≈ USD {(bulkCostEmailDialog.totalSdg / parseFloat(bulkCostEmailDialog.usdRate)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Attachments:</span>
                      <span className="text-foreground flex gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-1.5 py-0.5 text-[10px] font-semibold">PDF Report</span>
                        <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded px-1.5 py-0.5 text-[10px] font-semibold">Excel Workbook</span>
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Sent by:</span>
                      <span className="font-medium text-foreground">{(currentUser as any)?.fullName || (currentUser as any)?.full_name || currentUser?.email || 'You'}</span>
                    </div>
                  </div>
                </div>

                {/* Recipients */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Finance Recipients
                    <span className="text-xs font-normal text-muted-foreground">— select who receives this email</span>
                  </p>
                  {bulkCostEmailDialog.loading ? (
                    <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : bulkCostEmailDialog.availableRecipients.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      No finance or admin recipients found in the system.
                    </div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden">
                      {/* Select All */}
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b">
                        <Checkbox
                          id="bulk-select-all"
                          checked={bulkCostEmailDialog.selectedRecipientIds.length === bulkCostEmailDialog.availableRecipients.length}
                          onCheckedChange={() => setBulkCostEmailDialog(prev => ({
                            ...prev,
                            selectedRecipientIds: prev.selectedRecipientIds.length === prev.availableRecipients.length ? [] : prev.availableRecipients.map(r => r.id),
                          }))}
                          data-testid="checkbox-bulk-select-all"
                        />
                        <label htmlFor="bulk-select-all" className="text-xs font-semibold text-muted-foreground cursor-pointer uppercase tracking-wide">
                          Select All Recipients ({bulkCostEmailDialog.availableRecipients.length})
                        </label>
                        <span className="ml-auto text-xs text-muted-foreground">{bulkCostEmailDialog.selectedRecipientIds.length} selected</span>
                      </div>
                      {/* Recipient rows */}
                      {bulkCostEmailDialog.availableRecipients.map((recipient, idx) => (
                        <div key={recipient.id} className={`flex items-center gap-3 px-4 py-2.5 ${idx % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-900/30'} border-b last:border-0`}>
                          <Checkbox
                            id={`bulk-r-${recipient.id}`}
                            checked={bulkCostEmailDialog.selectedRecipientIds.includes(recipient.id)}
                            onCheckedChange={() => setBulkCostEmailDialog(prev => ({
                              ...prev,
                              selectedRecipientIds: prev.selectedRecipientIds.includes(recipient.id)
                                ? prev.selectedRecipientIds.filter(id => id !== recipient.id)
                                : [...prev.selectedRecipientIds, recipient.id],
                            }))}
                            data-testid={`checkbox-bulk-recipient-${recipient.id}`}
                          />
                          <div className="w-8 h-8 rounded-full bg-[#0F2041]/10 dark:bg-[#0F2041]/30 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-[#0F2041] dark:text-blue-300">{(recipient.name || '?')[0].toUpperCase()}</span>
                          </div>
                          <label htmlFor={`bulk-r-${recipient.id}`} className="text-sm cursor-pointer flex-1 min-w-0">
                            <span className="font-semibold text-foreground block truncate">{recipient.name}</span>
                            <span className="text-xs text-muted-foreground truncate block">{recipient.email}</span>
                          </label>
                          <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{recipient.role?.replace(/_/g, ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CC Emails */}
                {!bulkCostEmailDialog.loading && bulkCostEmailDialog.availableRecipients.length > 0 && (
                  <EmailCCInput
                    ccEmails={bulkCostEmailDialog.ccEmails}
                    onChange={(emails) => setBulkCostEmailDialog(prev => ({ ...prev, ccEmails: emails }))}
                    contacts={ccContacts.filter(c => !bulkCostEmailDialog.selectedRecipientIds.includes(c.id))}
                  />
                )}
              </div>

              <div className="border-t px-6 py-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <Button type="button" variant="outline" onClick={() => setBulkCostEmailDialog(prev => ({ ...prev, step: 'rate' }))} disabled={bulkCostEmailDialog.sending}>
                  ← Back
                </Button>
                <Button
                  type="button"
                  onClick={handleBulkCostEmailSend}
                  disabled={bulkCostEmailDialog.sending || bulkCostEmailDialog.selectedRecipientIds.length === 0}
                  className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-1.5"
                  data-testid="button-bulk-cost-send"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {bulkCostEmailDialog.sending
                    ? 'Generating & Sending...'
                    : `Send to ${bulkCostEmailDialog.selectedRecipientIds.length} Recipient${bulkCostEmailDialog.selectedRecipientIds.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewAdvanceDetails} onOpenChange={(open) => !open && setViewAdvanceDetails(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Advance Details
              <span dir="rtl" className="text-sm font-normal text-muted-foreground">/ تفاصيل السلفة</span>
            </DialogTitle>
          </DialogHeader>
          {viewAdvanceDetails && (() => {
            const oc = viewAdvanceDetails;
            const submitter = users.find(u => u.id === oc.submitted_by);
            const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
            const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
            const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
            const cleanDesc = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';

            return (
              <div className="space-y-4" data-testid="view-advance-details">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-semibold text-base">{cleanDesc}</h3>
                    <p className="text-sm text-muted-foreground">{oc.reference_number}</p>
                  </div>
                  <Badge className={
                    oc.status === 'reconciled' 
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200'
                      : oc.status === 'paid' 
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                  }>
                    {oc.status === 'reconciled' ? 'Reconciled / مسوّى' : oc.status === 'paid' ? 'Paid / مدفوع' : 'Approved / معتمد'}
                  </Badge>
                </div>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Amount / المبلغ</p>
                    <p className="font-bold text-lg">{oc.currency} {(oc.amount_cents / 100).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Category / الفئة</p>
                    <p className="font-medium flex items-center gap-1.5">
                      {(() => { const cm = EXPENSE_CATEGORY_MAP[oc.expense_category]; const CI = cm?.icon; return CI ? <CI className="h-4 w-4 text-muted-foreground" /> : null; })()}
                      {EXPENSE_CATEGORY_MAP[oc.expense_category]?.label || oc.expense_category}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Submitted By / مقدم من</p>
                    <p className="font-medium">{submitter?.name || submitter?.email || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{oc.submitter_role}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Project / المشروع</p>
                    {project ? (
                      <button
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                        data-testid={`link-detail-project-${project.id}`}
                      >
                        {project.name}
                      </button>
                    ) : (
                      <p className="font-medium">General</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Expense Date / تاريخ المصروف</p>
                    <p className="font-medium">{oc.expense_date ? format(new Date(oc.expense_date), 'MMM d, yyyy') : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Reference / المرجع</p>
                    <p className="font-medium text-sm">{oc.reference_number || 'N/A'}</p>
                  </div>
                  {oc.vendor && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Vendor / المورد</p>
                      <p className="font-medium">{oc.vendor}</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Submitted / تاريخ التقديم</p>
                    <p className="font-medium">{oc.submitted_at ? format(new Date(oc.submitted_at), 'MMM d, yyyy HH:mm') : oc.created_at ? format(new Date(oc.created_at), 'MMM d, yyyy HH:mm') : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Disbursed / تاريخ الصرف</p>
                    <p className="font-medium">{oc.tier2_approved_at ? format(new Date(oc.tier2_approved_at), 'MMM d, yyyy HH:mm') : 'N/A'}</p>
                  </div>
                </div>

                {oc.description && oc.description.split('\n').length > 1 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Description / الوصف</p>
                      <p className="text-sm whitespace-pre-line">{oc.description}</p>
                    </div>
                  </>
                )}

                {Array.isArray(oc.supporting_documents) && oc.supporting_documents.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Submission Attachments / مرفقات التقديم
                        <span className="text-xs font-normal text-muted-foreground">({oc.supporting_documents.length})</span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {(oc.supporting_documents as any[]).map((doc: any, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => openAttach(doc.url, doc.filename || `Document ${idx + 1}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            data-testid={`link-detail-doc-${idx}`}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[160px] truncate">{doc.filename || `Document ${idx + 1}`}</span>
                            <Eye className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Approval Timeline / مسار الموافقة
                  </h4>

                  <div className="rounded-lg border-l-2 border-green-500 pl-3 py-2 bg-green-50/50 dark:bg-green-950/20">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">Tier 1 - Supervisor / FOM / المرحلة 1 - المشرف</span>
                    </div>
                    <p className="text-sm">Approved by / اعتمد بواسطة: {tier1Approver?.name || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">
                      {oc.tier1_approved_at ? format(new Date(oc.tier1_approved_at), 'MMM d, yyyy HH:mm') : 'N/A'}
                    </p>
                    {oc.tier1_notes && (
                      <p className="text-xs mt-1 italic text-muted-foreground">
                        "{oc.tier1_notes.replace(/\s*\[SIG:.*?\]\s*/g, '').trim()}"
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border-l-2 border-blue-500 pl-3 py-2 bg-blue-50/50 dark:bg-blue-950/20">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Tier 2 - Admin / Super Admin / المرحلة 2 - المسؤول</span>
                    </div>
                    <p className="text-sm">Approved by / اعتمد بواسطة: {tier2Approver?.name || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">
                      {oc.tier2_approved_at ? format(new Date(oc.tier2_approved_at), 'MMM d, yyyy HH:mm') : 'N/A'}
                    </p>
                    {oc.tier2_notes && (
                      <p className="text-xs mt-1 italic text-muted-foreground">
                        "{oc.tier2_notes.replace(/\n?\[Signed:.*?\]/g, '').replace(/\s*\[SIG:.*?\]\s*/g, '').replace(/\s*Method:.*$/g, '').trim()}"
                      </p>
                    )}
                  </div>

                  {oc.paid_at && (
                    <div className="rounded-lg border-l-2 border-purple-500 pl-3 py-2 bg-purple-50/50 dark:bg-purple-950/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Wallet className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-sm">Payment Disbursed / تم الصرف</span>
                      </div>
                      <p className="text-sm">
                        Paid by / صرف بواسطة: {users.find(u => u.id === oc.paid_by)?.name || 'Finance'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(oc.paid_at), 'MMM d, yyyy HH:mm')}
                      </p>
                      {oc.payment_proof_url && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Payment Receipt(s) / إيصالات الدفع:
                          </p>
                          {(() => {
                            let urls: string[] = [];
                            try { const p = JSON.parse(oc.payment_proof_url!); urls = Array.isArray(p) ? p : [oc.payment_proof_url!]; } catch { urls = [oc.payment_proof_url!]; }
                            return (
                              <div className="flex flex-wrap gap-2">
                                {urls.map((u, i) => u.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                  <button key={i} type="button" onClick={() => openAttach(urls, 'Payment Receipt', i)} className="block text-left">
                                    <img src={u} alt={`Receipt ${i + 1}`}
                                      className="max-h-28 max-w-[120px] rounded border border-purple-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                                    {urls.length > 1 && <p className="text-[10px] text-center text-muted-foreground mt-0.5">Receipt {i + 1}</p>}
                                  </button>
                                ) : (
                                  <button key={i} type="button" onClick={() => openAttach(urls, 'Payment Receipt', i)}
                                    className="inline-flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 underline hover:no-underline">
                                    <FileText className="h-3.5 w-3.5" />
                                    {urls.length > 1 ? `Receipt ${i + 1} of ${urls.length}` : 'View Payment Receipt / عرض الإيصال'}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          {oc.payment_proof_notes && (
                            <p className="text-xs text-muted-foreground italic">"{oc.payment_proof_notes}"</p>
                          )}
                        </div>
                      )}
                      {(() => {
                        const evidence = costPreFundLinks.get(oc.id) ?? [];
                        if (evidence.length === 0) return null;
                        return (
                          <div className="mt-3 border-t border-purple-200/70 pt-2 dark:border-purple-800/70">
                            <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Pre-Fund payment evidence</p>
                            <div className="mt-1.5 space-y-1.5">
                              {evidence.map(link => (
                                <div key={link.paymentEventId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-muted-foreground">
                                    {link.name} · {link.currency || oc.currency} {Number(link.amount ?? 0).toLocaleString()}
                                  </span>
                                  {isFinanceAdmin && link.isCorrectable && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => void openPreFundCorrectionDialog(link)}
                                      data-testid={`button-correct-pre-fund-${link.paymentEventId}`}
                                    >
                                      <RefreshCw className="mr-1 h-3 w-3" />
                                      Correct Pre-Fund
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {oc.paid_at && (
                    <div className={`rounded-lg border-l-2 pl-3 py-2 ${oc.fund_receipt_confirmed ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {oc.fund_receipt_confirmed
                          ? <CheckCircle className="h-4 w-4 text-green-500" />
                          : <AlertCircle className="h-4 w-4 text-amber-500" />}
                        <span className="font-medium text-sm">
                          {oc.fund_receipt_confirmed
                            ? 'Receipt Confirmed by Recipient / تم تأكيد الاستلام'
                            : 'Awaiting Recipient Confirmation / بانتظار تأكيد المستلم'}
                        </span>
                      </div>
                      {oc.fund_receipt_confirmed && oc.fund_receipt_confirmed_at && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(oc.fund_receipt_confirmed_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      )}
                      {!oc.fund_receipt_confirmed && (
                        <p className="text-xs text-muted-foreground">
                          The recipient must confirm receipt in their Cost Submissions tab. / على المستلم تأكيد الاستلام في تبويب تقديم التكاليف.
                        </p>
                      )}
                    </div>
                  )}

                  {oc.reconciled_at && (
                    <div className="rounded-lg border-l-2 border-teal-500 pl-3 py-2 bg-teal-50/50 dark:bg-teal-950/20">
                      <div className="flex items-center gap-2 mb-1">
                        <ClipboardCheck className="h-4 w-4 text-teal-500" />
                        <span className="font-medium text-sm">Reconciled / تمت التسوية</span>
                      </div>
                      <p className="text-sm">
                        Reconciled by / سوّى بواسطة: {users.find(u => u.id === oc.reconciled_by)?.name || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(oc.reconciled_at), 'MMM d, yyyy HH:mm')}
                      </p>
                      {oc.reconciled_amount_cents != null && (
                        <p className="text-sm mt-1">
                          Actual spent / المصروف الفعلي: {oc.currency} {(oc.reconciled_amount_cents / 100).toLocaleString()}
                          {' '}
                          <span className={`text-xs ${
                            oc.amount_cents - oc.reconciled_amount_cents > 0 
                              ? 'text-green-600' 
                              : oc.amount_cents - oc.reconciled_amount_cents < 0 
                                ? 'text-red-600' 
                                : 'text-muted-foreground'
                          }`}>
                            ({oc.amount_cents - oc.reconciled_amount_cents > 0 ? 'Under' : oc.amount_cents - oc.reconciled_amount_cents < 0 ? 'Over' : 'Exact'}: {oc.currency} {Math.abs((oc.amount_cents - oc.reconciled_amount_cents) / 100).toLocaleString()})
                          </span>
                        </p>
                      )}
                      {oc.reconciliation_notes && (
                        <p className="text-xs mt-1 italic text-muted-foreground">
                          "{oc.reconciliation_notes}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAdvanceDetails(null)} data-testid="button-close-details">
              Close / إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signatureModal.submission && (
        <SignatureConfirmationModal
          open={signatureModal.open}
          onOpenChange={(open) => {
            if (!open) {
              if (signatureCompletedRef.current) {
                signatureCompletedRef.current = false;
                return;
              }
              const { submission: sub, notes, tier: modalTier } = signatureModal;
              setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
              setApprovalProcessing(false);
              if (sub) {
                setApprovalNotes(notes);
                setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub });
              }
            }
          }}
          transaction={{
            id: signatureModal.submission.id,
            type: 'cost_submission',
            title: `Tier ${signatureModal.tier} Approval / الموافقة المرحلة ${signatureModal.tier} - ${signatureModal.submission.expense_category.replace(/_/g, ' ')}`,
            description: (signatureModal.submission.description || undefined),
            amount: signatureModal.submission.amount_cents / 100,
            currency: signatureModal.submission.currency || 'SDG',
            counterparty: users.find(u => u.id === signatureModal.submission!.submitted_by)?.name || 'Unknown',
            date: signatureModal.submission.expense_date || signatureModal.submission.submitted_at || undefined,
            reference: signatureModal.submission.reference_number || undefined,
          }}
          userId={currentUser?.id || ''}
          userName={currentUser?.name || currentUser?.email || 'Unknown'}
          userEmail={currentUser?.email}
          userRole={currentUser?.role}
          allowedMethods={['uuid', 'handwriting']}
          onSignatureComplete={handleSignatureComplete}
          onCancel={() => {
            const { submission: sub, notes, tier: modalTier } = signatureModal;
            setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
            setApprovalProcessing(false);
            if (sub) {
              setApprovalNotes(notes);
              setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub });
            }
          }}
        />
      )}

      {/* Mark as Paid dialog — multi-receipt upload */}
      <Dialog
        open={markAsPaidDialog.open}
        onOpenChange={(open) => {
          if (!open && !markAsPaidDialog.uploading) {
            markAsPaidDialog.proofPreviews.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
            setMarkAsPaidDialog({ open: false, submission: null, proofFiles: [], proofPreviews: [], notes: '', uploading: false, preFundId: null, preFundsLoading: false, preFundsError: null, payAmountStr: '' });
          }
        }}
      >
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <span>Mark as Paid / تحديد كمدفوع</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Attach one or more payment receipts before confirming. At least one receipt is required. / أرفق إيصالًا أو أكثر قبل التأكيد. مطلوب إيصال واحد على الأقل.
            </DialogDescription>
          </DialogHeader>

          {markAsPaidDialog.submission && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
              {/* Submission summary */}
              <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50/60 dark:bg-green-950/20 p-3.5 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-4.5 w-4.5 text-green-700 dark:text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-green-900 dark:text-green-100 capitalize">
                    {markAsPaidDialog.submission.expense_category.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-300 leading-tight">
                    {markAsPaidDialog.submission.currency} {(markAsPaidDialog.submission.amount_cents / 100).toLocaleString()}
                  </p>
                  {(markAsPaidDialog.submission.amount_paid_cents ?? 0) > 0 && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Paid: <span className="font-semibold text-orange-600">{markAsPaidDialog.submission.currency} {((markAsPaidDialog.submission.amount_paid_cents ?? 0) / 100).toLocaleString()}</span></span>
                        <span>Remaining: <span className="font-semibold text-green-700">{markAsPaidDialog.submission.currency} {((markAsPaidDialog.submission.amount_cents - (markAsPaidDialog.submission.amount_paid_cents ?? 0)) / 100).toLocaleString()}</span></span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(100, ((markAsPaidDialog.submission.amount_paid_cents ?? 0) / markAsPaidDialog.submission.amount_cents) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    {markAsPaidDialog.submission.reference_number && (
                      <span className="text-[11px] text-muted-foreground font-mono">#{markAsPaidDialog.submission.reference_number}</span>
                    )}
                    {markAsPaidDialog.submission.vendor && (
                      <span className="text-[11px] text-muted-foreground">Vendor: {markAsPaidDialog.submission.vendor}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Amount to Pay */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Amount to Pay / المبلغ المدفوع <span className="text-red-500">*</span>
                </Label>
                {/* Quick-pick % buttons */}
                {markAsPaidDialog.submission && (() => {
                  const sub = markAsPaidDialog.submission!;
                  const totalCents = sub.amount_cents ?? 0;
                  const rem = (totalCents - (sub.amount_paid_cents ?? 0)) / 100;
                  // When rem ≤ 0 (null/zero amount_cents in DB, or amounts are
                  // already matched), fall back to the submission's total amount
                  // so the % buttons still produce useful values.
                  const basis = rem > 0 ? rem : totalCents / 100;
                  const setAmt = (pct: number) => setMarkAsPaidDialog(prev => ({ ...prev, payAmountStr: (basis * pct / 100).toFixed(2) }));
                  const curVal = parseFloat(markAsPaidDialog.payAmountStr) || 0;
                  return (
                    <>
                      {rem <= 0 && totalCents > 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                          ⚠️ Remaining balance shows 0 — percentages are based on the total amount. Enter the correct amount manually if needed. / الرصيد المتبقي يظهر صفراً — النسب محسوبة من المبلغ الإجمالي. أدخل المبلغ الصحيح يدوياً إذا لزم.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Full / الكل', pct: 100 },
                          { label: '75%', pct: 75 },
                          { label: '50%', pct: 50 },
                          { label: '25%', pct: 25 },
                        ].map(opt => {
                          const optAmt = parseFloat((basis * opt.pct / 100).toFixed(2));
                          const isActive = basis > 0 && Math.abs(curVal - optAmt) < 0.01;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              disabled={markAsPaidDialog.uploading || basis <= 0}
                              onClick={() => setAmt(opt.pct)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                isActive
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'bg-background border-input text-foreground hover:bg-accent disabled:opacity-40'
                              }`}
                              data-testid={`button-pay-quick-${opt.pct}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground w-12 shrink-0">{markAsPaidDialog.submission?.currency}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={markAsPaidDialog.payAmountStr}
                    onChange={e => setMarkAsPaidDialog(prev => ({ ...prev, payAmountStr: e.target.value }))}
                    disabled={markAsPaidDialog.uploading}
                    placeholder="0.00"
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    data-testid="input-pay-amount"
                  />
                </div>
                {(() => {
                  const sub = markAsPaidDialog.submission!;
                  const payVal = parseFloat(markAsPaidDialog.payAmountStr) || 0;
                  const remCents = sub.amount_cents - (sub.amount_paid_cents ?? 0);
                  const payCents = Math.round(payVal * 100);
                  const afterCents = remCents - payCents;
                  if (payVal <= 0 || payCents > remCents) return null;
                  return afterCents > 0 ? (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      Partial payment — {sub.currency} {(afterCents / 100).toLocaleString()} will remain outstanding / دفع جزئي — يتبقى {sub.currency} {(afterCents / 100).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      This will fully settle the submission / سيتم تسوية الطلب بالكامل
                    </p>
                  );
                })()}
              </div>

              {/* Receipt upload zone */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Payment Receipts / إيصالات الدفع <span className="text-red-500">*</span>
                  </Label>
                  {markAsPaidDialog.proofFiles.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:text-green-300">
                      <CheckCircle className="h-3 w-3" />
                      {markAsPaidDialog.proofFiles.length} {markAsPaidDialog.proofFiles.length === 1 ? 'receipt' : 'receipts'} added
                    </span>
                  )}
                </div>

                {/* Thumbnail grid of added files */}
                {markAsPaidDialog.proofFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {markAsPaidDialog.proofPreviews.map((preview, idx) => (
                      <div key={idx} className="relative group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                        {preview.url ? (
                          <img src={preview.url} alt={preview.name} className="w-full h-20 object-cover" />
                        ) : (
                          <div className="w-full h-20 flex flex-col items-center justify-center gap-1 p-1">
                            <FileText className="h-7 w-7 text-red-500 flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 break-all">{preview.name}</span>
                          </div>
                        )}
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (preview.url) URL.revokeObjectURL(preview.url);
                            setMarkAsPaidDialog(prev => ({
                              ...prev,
                              proofFiles: prev.proofFiles.filter((_, i) => i !== idx),
                              proofPreviews: prev.proofPreviews.filter((_, i) => i !== idx),
                            }));
                          }}
                          disabled={markAsPaidDialog.uploading}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                          data-testid={`button-remove-receipt-${idx}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/40 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[9px] text-white truncate">{preview.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-muted-foreground/25 rounded-xl p-4 cursor-pointer hover:border-green-400 hover:bg-green-50/40 dark:hover:bg-green-950/20 transition-colors group">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={handleMarkAsPaidProofFileChange}
                    disabled={markAsPaidDialog.uploading}
                    data-testid="input-payment-proof"
                  />
                  <div className="h-9 w-9 rounded-full bg-muted group-hover:bg-green-100 dark:group-hover:bg-green-900/40 flex items-center justify-center transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground group-hover:text-green-600 transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-green-700 dark:group-hover:text-green-300 transition-colors">
                      {markAsPaidDialog.proofFiles.length > 0 ? 'Add more receipts / أضف المزيد' : 'Upload receipts / ارفع الإيصالات'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">Images or PDFs — multiple files allowed / صور أو PDF - متعدد</p>
                  </div>
                </label>
              </div>

              {/* Charge to Pre-Fund — mandatory when funds are available */}
              {markAsPaidDialog.preFunds.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Charge to Pre-Fund / خصم من التمويل المسبق{' '}
                    <span className="text-red-500">*</span>
                    {markAsPaidDialog.preFundId
                      ? <span className="ml-1 text-xs font-normal text-emerald-600">✓ Selected</span>
                      : <span className="ml-1 text-xs font-normal text-rose-500">(required / مطلوب)</span>
                    }
                  </Label>
                  <Select
                    value={markAsPaidDialog.preFundId ?? ''}
                    onValueChange={v => setMarkAsPaidDialog(prev => ({ ...prev, preFundId: v || null }))}
                    disabled={markAsPaidDialog.uploading}
                  >
                    <SelectTrigger className={`h-9 text-sm ${!markAsPaidDialog.preFundId ? 'border-rose-300 dark:border-rose-700' : ''}`} data-testid="select-mark-paid-pre-fund">
                      <SelectValue placeholder="Select pre-fund… / اختر التمويل المسبق" />
                    </SelectTrigger>
                    <SelectContent>
                      {markAsPaidDialog.preFunds.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} · {f.currency} {f.available_balance.toLocaleString()} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {markAsPaidDialog.preFundId && (() => {
                    const f = markAsPaidDialog.preFunds.find(x => x.id === markAsPaidDialog.preFundId);
                    const payAmt = parseFloat(markAsPaidDialog.payAmountStr) || 0;
                    const after = (f?.available_balance ?? 0) - payAmt;
                    return (
                      <p className={`text-xs ${after < 0 ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                        After payment: {f?.currency} {after.toLocaleString()} remaining
                        {after < 0 && ' ⚠ Exceeds available balance'}
                      </p>
                    );
                  })()}
                </div>
              )}
              {markAsPaidDialog.preFundsLoading && (
                <p className="text-xs text-muted-foreground">Loading eligible Pre-Funds…</p>
              )}
              {markAsPaidDialog.preFundsError && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                  Could not load eligible Pre-Funds. Please close the dialog and try again.
                </p>
              )}
              {!markAsPaidDialog.preFundsLoading && !markAsPaidDialog.preFundsError && markAsPaidDialog.preFunds.length === 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  No active Pre-Fund with an available balance matches this submission’s currency.
                </p>
              )}

              {/* Payment notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Payment Notes / ملاحظات الدفع{' '}
                  <span className="text-muted-foreground font-normal text-xs">(optional / اختياري)</span>
                </Label>
                <Textarea
                  value={markAsPaidDialog.notes}
                  onChange={(e) => setMarkAsPaidDialog(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Bank transfer ref: TXN123... / مثال: رقم التحويل: TXN123..."
                  className="resize-none h-18 text-sm"
                  disabled={markAsPaidDialog.uploading}
                  data-testid="input-payment-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-1 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                markAsPaidDialog.proofPreviews.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
                setMarkAsPaidDialog({ open: false, submission: null, proofFiles: [], proofPreviews: [], notes: '', uploading: false, preFundId: null, preFunds: [], preFundsLoading: false, preFundsError: null, payAmountStr: '' });
              }}
              disabled={markAsPaidDialog.uploading}
              data-testid="button-cancel-mark-paid"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmMarkAsPaid}
              disabled={markAsPaidDialog.uploading || markAsPaidDialog.proofFiles.length === 0 || markAsPaidDialog.preFundsLoading || Boolean(markAsPaidDialog.preFundsError) || markAsPaidDialog.preFunds.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-mark-paid"
            >
              {markAsPaidDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Uploading {markAsPaidDialog.proofFiles.length} receipt{markAsPaidDialog.proofFiles.length > 1 ? 's' : ''}...</>
              ) : (() => {
                const sub = markAsPaidDialog.submission;
                if (!sub) return <><CheckCircle className="h-4 w-4 mr-1.5" /> Confirm Payment / تأكيد الدفع</>;
                const payVal = parseFloat(markAsPaidDialog.payAmountStr) || 0;
                const remCents = sub.amount_cents - (sub.amount_paid_cents ?? 0);
                const isFullPay = Math.round(payVal * 100) >= remCents;
                return isFullPay
                  ? <><CheckCircle className="h-4 w-4 mr-1.5" /> Mark as Fully Paid / تأكيد الدفع الكامل</>
                  : <><DollarSign className="h-4 w-4 mr-1.5" /> Record Partial Payment / تسجيل دفعة جزئية</>;
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Cost Pay — one shared receipt for multiple submissions */}
      <Dialog
        open={batchCostPayDialog.open}
        onOpenChange={(open) => {
          if (!open && !batchCostPayDialog.uploading) {
            batchCostPayDialog.proofPreviewUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
            setBatchCostPayDialog({ open: false, submissions: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, preFundId: null, preFunds: [], payMode: 'full', payPercent: '100', customInputType: 'pct', payCustomAmountStr: '' });
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Batch Cost Payment / دفع مصاريف جماعي
            </DialogTitle>
            <DialogDescription>
              One receipt covers all selected submissions. The same receipt will be attached to every submission below.
            </DialogDescription>
          </DialogHeader>

          {batchCostPayDialog.submissions.length > 0 && (() => {
            const batchCurrency = batchCostPayDialog.submissions[0]?.currency || '';
            const totalRemaining = batchCostPayDialog.submissions.reduce((s, sub) => s + (sub.amount_cents - (sub.amount_paid_cents ?? 0)), 0);
            const pct = parseFloat(batchCostPayDialog.payPercent || '0');
            const isAmountModeDisplay = batchCostPayDialog.payMode === 'custom' && batchCostPayDialog.customInputType === 'amount';
            const payNowCents = batchCostPayDialog.payMode === 'full'
              ? totalRemaining
              : isAmountModeDisplay
              ? Math.min(totalRemaining, Math.round(parseFloat(batchCostPayDialog.payCustomAmountStr || '0') * 100))
              : Math.round(totalRemaining * Math.min(1, Math.max(0, pct / 100)));
            const isPartial = batchCostPayDialog.payMode !== 'full' && payNowCents < totalRemaining;
            const selectedFund = batchCostPayDialog.preFunds.find(f => f.id === batchCostPayDialog.preFundId);
            return (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {batchCostPayDialog.submissions.length} Submission{batchCostPayDialog.submissions.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {batchCurrency} {(totalRemaining / 100).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Total remaining to pay — covered by this single receipt</p>
              </div>

              {/* Breakdown */}
              <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                {batchCostPayDialog.submissions.map((sub) => {
                  const submitterName = users.find(u => u.id === sub.submitted_by)?.name || 'Unknown';
                  const ref = sub.reference_number || sub.id.slice(0, 8).toUpperCase();
                  const remaining = (sub.amount_cents - (sub.amount_paid_cents ?? 0)) / 100;
                  return (
                    <div key={sub.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{sub.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || ref}</p>
                        <p className="text-xs text-muted-foreground">{submitterName} · Ref {ref}</p>
                      </div>
                      <span className="font-semibold tabular-nums shrink-0 ml-2">
                        {sub.currency} {remaining.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Amount to Pay */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Amount to Pay / المبلغ المدفوع <span className="text-red-500">*</span>
                </Label>
                {/* Quick-pick % buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Full / الكل', mode: 'full' as const, pct: '100' },
                    { label: '75%', mode: 'percent' as const, pct: '75' },
                    { label: '50%', mode: 'percent' as const, pct: '50' },
                    { label: '25%', mode: 'percent' as const, pct: '25' },
                    { label: 'Custom', mode: 'custom' as const, pct: '' },
                  ].map(opt => {
                    const isActive = opt.mode === 'full'
                      ? batchCostPayDialog.payMode === 'full'
                      : batchCostPayDialog.payMode === opt.mode && (opt.pct === '' || batchCostPayDialog.payPercent === opt.pct);
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        disabled={batchCostPayDialog.uploading}
                        onClick={() => setBatchCostPayDialog(prev => ({
                          ...prev,
                          payMode: opt.mode === 'custom' ? 'custom' : opt.mode,
                          payPercent: opt.pct || prev.payPercent,
                        }))}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isActive
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-background border-input text-foreground hover:bg-accent'
                        }`}
                        data-testid={`button-batch-pay-mode-${opt.label.replace(/\s/g, '-').toLowerCase()}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom input — toggle between % and fixed Amount */}
                {batchCostPayDialog.payMode !== 'full' && (
                  <div className="space-y-1.5">
                    {/* % / Amount toggle tabs (only shown for custom mode) */}
                    {batchCostPayDialog.payMode === 'custom' && (
                      <div className="inline-flex rounded-md border border-input overflow-hidden">
                        {(['pct', 'amount'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            disabled={batchCostPayDialog.uploading}
                            onClick={() => setBatchCostPayDialog(prev => ({ ...prev, customInputType: t }))}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${
                              batchCostPayDialog.customInputType === t
                                ? 'bg-emerald-600 text-white'
                                : 'bg-background text-foreground hover:bg-accent'
                            }`}
                            data-testid={`button-batch-custom-type-${t}`}
                          >
                            {t === 'pct' ? '% Percentage' : 'Amount / مبلغ'}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Input row */}
                    {batchCostPayDialog.payMode === 'custom' && batchCostPayDialog.customInputType === 'amount' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-muted-foreground shrink-0">{batchCurrency}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={batchCostPayDialog.payCustomAmountStr}
                          onChange={e => setBatchCostPayDialog(prev => ({ ...prev, payCustomAmountStr: e.target.value }))}
                          disabled={batchCostPayDialog.uploading}
                          placeholder="e.g. 5000.00"
                          className="w-36 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          data-testid="input-batch-pay-amount"
                        />
                        <span className="text-sm text-muted-foreground">→ {batchCurrency} {(payNowCents / 100).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          value={batchCostPayDialog.payPercent}
                          onChange={e => setBatchCostPayDialog(prev => ({ ...prev, payPercent: e.target.value, payMode: 'percent' }))}
                          disabled={batchCostPayDialog.uploading}
                          placeholder="e.g. 60"
                          className="w-24 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          data-testid="input-batch-pay-percent"
                        />
                        <span className="text-sm text-muted-foreground">%  →  {batchCurrency} {(payNowCents / 100).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Settlement info */}
                {isPartial ? (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    Partial payment — {batchCurrency} {((totalRemaining - payNowCents) / 100).toLocaleString()} will remain outstanding across all submissions
                  </p>
                ) : (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    This will fully settle all {batchCostPayDialog.submissions.length} submissions
                  </p>
                )}
              </div>

              {/* Charge to Pre-Fund — mandatory when funds are available */}
              {batchCostPayDialog.preFunds.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Charge to Pre-Fund / خصم من التمويل المسبق{' '}
                    <span className="text-red-500">*</span>
                    {batchCostPayDialog.preFundId
                      ? <span className="ml-1 text-xs font-normal text-emerald-600">✓ Selected</span>
                      : <span className="ml-1 text-xs font-normal text-rose-500">(required / مطلوب)</span>
                    }
                  </Label>
                  <Select
                    value={batchCostPayDialog.preFundId ?? ''}
                    onValueChange={v => setBatchCostPayDialog(prev => ({ ...prev, preFundId: v || null }))}
                    disabled={batchCostPayDialog.uploading}
                  >
                    <SelectTrigger className={`h-9 text-sm ${!batchCostPayDialog.preFundId ? 'border-rose-300 dark:border-rose-700' : ''}`} data-testid="select-batch-pay-pre-fund">
                      <SelectValue placeholder="Select pre-fund… / اختر التمويل المسبق" />
                    </SelectTrigger>
                    <SelectContent>
                      {batchCostPayDialog.preFunds.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} · {f.currency} {f.available_balance.toLocaleString()} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedFund && (
                    <p className={`text-xs ${(selectedFund.available_balance - payNowCents / 100) < 0 ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                      After payment: {selectedFund.currency} {(selectedFund.available_balance - payNowCents / 100).toLocaleString()} remaining
                      {(selectedFund.available_balance - payNowCents / 100) < 0 && ' ⚠ Exceeds available balance'}
                    </p>
                  )}
                </div>
              )}

              {/* Receipt upload — multiple files allowed */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  Shared Receipt(s) / الإيصالات المشتركة <span className="text-red-500">*</span>
                  <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-semibold">Multi-file</span>
                </Label>
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg hover:border-emerald-400 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleBatchCostPayProofFileChange}
                    disabled={batchCostPayDialog.uploading}
                    data-testid="input-batch-cost-payment-proof"
                  />
                  {batchCostPayDialog.proofFiles.length > 0 ? (
                    <div className="p-3 space-y-2">
                      {/* Image grid preview */}
                      {batchCostPayDialog.proofPreviewUrls.some(u => u) && (
                        <div className="flex flex-wrap gap-2 justify-center">
                          {batchCostPayDialog.proofFiles.map((f, i) => (
                            batchCostPayDialog.proofPreviewUrls[i] ? (
                              <img key={i} src={batchCostPayDialog.proofPreviewUrls[i]} alt={`Receipt ${i + 1}`}
                                className="h-20 max-w-[100px] rounded object-contain border border-muted" />
                            ) : (
                              <div key={i} className="h-20 w-20 flex flex-col items-center justify-center rounded border border-muted bg-muted/40">
                                <FileText className="h-6 w-6 text-red-500" />
                                <span className="text-[10px] text-muted-foreground mt-1 text-center px-1 truncate w-full">{f.name}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      {/* File list for non-image files */}
                      {batchCostPayDialog.proofFiles.map((f, i) => !batchCostPayDialog.proofPreviewUrls[i] && (
                        <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                      ))}
                      <p className="text-xs text-center text-muted-foreground">
                        {batchCostPayDialog.proofFiles.length} file{batchCostPayDialog.proofFiles.length > 1 ? 's' : ''} selected — click to change or add more
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <p className="text-sm">Upload receipt(s) — images or PDFs</p>
                      <p className="text-xs opacity-60 mt-0.5">You can select multiple files. All link to the {batchCostPayDialog.submissions.length} submissions.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Notes / ملاحظات <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  value={batchCostPayDialog.notes}
                  onChange={(e) => setBatchCostPayDialog(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Bank transfer batch ref: TXN-BATCH-001..."
                  className="resize-none h-20 text-sm"
                  disabled={batchCostPayDialog.uploading}
                  data-testid="input-batch-cost-payment-notes"
                />
              </div>

              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Each submitter receives one consolidated payment notification listing all their paid submissions.
              </p>
            </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                batchCostPayDialog.proofPreviewUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
                setBatchCostPayDialog({ open: false, submissions: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, preFundId: null, preFunds: [], payMode: 'full', payPercent: '100', customInputType: 'pct', payCustomAmountStr: '' });
              }}
              disabled={batchCostPayDialog.uploading}
              data-testid="button-cancel-batch-cost-pay"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBatchCostPay}
              disabled={batchCostPayDialog.uploading || batchCostPayDialog.proofFiles.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-confirm-batch-cost-pay"
            >
              {batchCostPayDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Processing...</>
              ) : (() => {
                const total = batchCostPayDialog.submissions.reduce((s, sub) => s + (sub.amount_cents - (sub.amount_paid_cents ?? 0)), 0);
                const pct = parseFloat(batchCostPayDialog.payPercent || '0');
                const isAmtMode = batchCostPayDialog.payMode === 'custom' && batchCostPayDialog.customInputType === 'amount';
                const payAmt = batchCostPayDialog.payMode === 'full'
                  ? total
                  : isAmtMode
                  ? Math.min(total, Math.round(parseFloat(batchCostPayDialog.payCustomAmountStr || '0') * 100))
                  : Math.round(total * Math.min(1, Math.max(0, pct / 100)));
                const currency = batchCostPayDialog.submissions[0]?.currency || '';
                return <><CheckCircle className="h-4 w-4 mr-1.5" /> Pay {batchCostPayDialog.submissions.length} — {currency} {(payAmt / 100).toLocaleString()}</>;
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reminder Preview Dialog ── */}
      {reminderPreviewDialog && (
        <Dialog
          open={reminderPreviewDialog.open}
          onOpenChange={(open) => { if (!open && !reminderSending) setReminderPreviewDialog(null); }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" data-testid="dialog-reminder-preview">
            {/* Header */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <Mail className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">Reminder Preview</h2>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                    This is exactly what <strong>{reminderPreviewDialog.recipients.map(r => r.name || r.email || 'the approver').join(', ')}</strong> will receive
                  </p>
                </div>
              </div>
              {/* Step + submission info pills */}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-full px-2.5 py-0.5 text-amber-800 dark:text-amber-300 font-medium">
                  <Clock className="h-3 w-3" /> Awaiting: {reminderPreviewDialog.stepLabel}
                </span>
                <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-full px-2.5 py-0.5 text-amber-800 dark:text-amber-300 font-medium">
                  Ref: {reminderPreviewDialog.refNum}{reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 60 ? reminderPreviewDialog.description.substring(0, 60) + '…' : reminderPreviewDialog.description}` : ''}
                </span>
                <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-full px-2.5 py-0.5 text-amber-800 dark:text-amber-300 font-medium">
                  {reminderPreviewDialog.amtStr}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 pb-1">
              <Tabs
                value={reminderPreviewDialog.tab}
                onValueChange={(v) => setReminderPreviewDialog(prev => prev ? { ...prev, tab: v as 'notification' | 'email' | 'whatsapp' } : prev)}
              >
                <TabsList className="w-full grid grid-cols-3 mb-4">
                  <TabsTrigger value="notification" className="gap-1.5 text-xs">
                    <Bell className="h-3.5 w-3.5" /> In-App
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-1.5 text-xs">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-1.5 text-xs">
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </TabsTrigger>
                </TabsList>

                {/* ── Notification Tab ── */}
                <TabsContent value="notification" className="mt-0">
                  <p className="text-xs text-muted-foreground mb-3">This appears in the recipient's notification bell (🔔) inside the app:</p>
                  <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                    {/* Notification item mock */}
                    <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-50/60 dark:bg-amber-950/20 border-l-4 border-amber-400">
                      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-base">
                        ⏰
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground leading-snug">
                            Reminder: Action Required — Cost Submission
                          </span>
                          <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 font-medium border border-amber-200 dark:border-amber-700">
                            Financial
                          </span>
                          <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full px-2 py-0.5 font-medium border border-red-200 dark:border-red-800">
                            High Priority
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          This is a reminder that cost submission &ldquo;<strong>{reminderPreviewDialog.refNum}{reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 80 ? reminderPreviewDialog.description.substring(0, 80) + '…' : reminderPreviewDialog.description}` : ''}</strong>&rdquo; ({reminderPreviewDialog.amtStr}) submitted by {reminderPreviewDialog.submitterName} is waiting for your review at <strong>{reminderPreviewDialog.stepLabel}</strong>. Please log in and take action.
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-muted-foreground">Just now</span>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium cursor-default">→ Go to Cost Submission</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-2 border-t bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">Also delivered as a push notification on mobile (FCM) if the recipient has the app installed</p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground space-y-1">
                    <p><strong>To:</strong> {reminderPreviewDialog.recipients.map(r => `${r.name || ''}${r.email ? ` <${r.email}>` : ''}`).join(', ')}</p>
                    <p><strong>Title (Arabic):</strong> تذكير: مطلوب إجراء على طلب التكلفة</p>
                  </div>
                </TabsContent>

                {/* ── Email Tab ── */}
                <TabsContent value="email" className="mt-0">
                  <p className="text-xs text-muted-foreground mb-3">This email is sent to the recipient's registered email address via IONOS SMTP:</p>
                  {/* Email preview — matches the actual generateNotificationEmailHTML template */}
                  <div className="rounded-xl border overflow-hidden shadow-sm text-sm font-sans">
                    {/* Navy header */}
                    <div className="px-8 py-5" style={{ background: '#0F2041' }}>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.5px' }}>PACT Command Center</p>
                      <p style={{ margin: '3px 0 0 0', fontSize: 11, color: '#8FADD4' }}>مركز قيادة باكت &nbsp;|&nbsp; ICT Team Platform</p>
                    </div>
                    {/* Gradient accent line */}
                    <div style={{ height: 4, background: 'linear-gradient(90deg,#2962FF,#00C6FF)' }} />
                    {/* Body */}
                    <div className="px-8 py-6 bg-white dark:bg-slate-900">
                      {/* Greeting */}
                      <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">
                        Dear {reminderPreviewDialog.recipients[0]?.name || 'Approver'}{reminderPreviewDialog.recipients[0]?.role ? ` (${reminderPreviewDialog.recipients[0].role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())})` : ''},
                      </p>
                      {/* Subject / title */}
                      <h2 className="mt-4 mb-2 text-lg font-bold leading-snug" style={{ color: '#0F2041' }}>
                        ⏰ Reminder: Action Required — Cost Submission
                      </h2>
                      {/* Message */}
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                        This is a reminder that cost submission &ldquo;<strong>{reminderPreviewDialog.refNum}{reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 80 ? reminderPreviewDialog.description.substring(0, 80) + '…' : reminderPreviewDialog.description}` : ''}</strong>&rdquo; ({reminderPreviewDialog.amtStr}) submitted by <strong>{reminderPreviewDialog.submitterName}</strong> is waiting for your review at <strong>{reminderPreviewDialog.stepLabel}</strong>. Please log in and take action.
                      </p>
                      {/* Action button */}
                      <div className="flex justify-center my-6">
                        <span
                          className="inline-block cursor-default rounded text-white text-sm font-bold px-8 py-3 select-none"
                          style={{ background: '#0F2041' }}
                        >
                          Review Now &nbsp;|&nbsp; عرض التفاصيل
                        </span>
                      </div>
                      {/* Divider */}
                      <hr className="border-t border-gray-200 dark:border-gray-700 my-5" />
                      {/* Arabic section */}
                      <div dir="rtl" className="text-right">
                        <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">
                          عزيزي {reminderPreviewDialog.recipients[0]?.name || 'المعتمد'}،
                        </p>
                        <h3 className="mt-3 mb-2 text-base font-bold" style={{ color: '#0F2041' }}>
                          تذكير: مطلوب إجراء على طلب التكلفة
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                          هذه رسالة تذكير بأن طلب التكلفة رقم &ldquo;<strong>{reminderPreviewDialog.refNum}{reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 80 ? reminderPreviewDialog.description.substring(0, 80) + '…' : reminderPreviewDialog.description}` : ''}</strong>&rdquo; ({reminderPreviewDialog.amtStr}) المقدَّم من <strong>{reminderPreviewDialog.submitterName}</strong> بانتظار مراجعتك في مرحلة <strong>{reminderPreviewDialog.stepLabel}</strong>. يرجى تسجيل الدخول واتخاذ الإجراء اللازم.
                        </p>
                      </div>
                      {/* Divider */}
                      <hr className="border-t border-gray-200 dark:border-gray-700 my-5" />
                      {/* Sign-off */}
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-0.5">Kind regards,</p>
                      <p className="text-sm font-bold mb-0.5" style={{ color: '#0F2041' }}>PACT Command Center</p>
                      <p className="text-xs text-gray-500">ICT Team &nbsp;|&nbsp; فريق تكنولوجيا المعلومات</p>
                      <p className="text-xs text-gray-400 italic mt-1">On behalf of the PACT Operations Team &nbsp;|&nbsp; نيابةً عن فريق عمليات باكت</p>
                    </div>
                    {/* Footer */}
                    <div className="px-8 py-3 text-center border-t" style={{ background: '#F8FAFC' }}>
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        This is an automated notification from the PACT Command Center Platform.<br />
                        هذه رسالة آلية من منصة مركز قيادة باكت &nbsp;|&nbsp; <strong>PACT Platform v2</strong>
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground space-y-1">
                    <p><strong>To:</strong> {reminderPreviewDialog.recipients.map(r => `${r.name || ''}${r.email ? ` <${r.email}>` : ''}`).join(', ')}</p>
                    <p><strong>Subject:</strong> ⏰ Reminder: Action Required — Cost Submission / تذكير: مطلوب إجراء على طلب التكلفة</p>
                    <p><strong>Priority:</strong> High &nbsp;·&nbsp; <strong>Category:</strong> Financial</p>
                  </div>
                </TabsContent>

                {/* ── WhatsApp Tab ── */}
                <TabsContent value="whatsapp" className="mt-0">
                  <p className="text-xs text-muted-foreground mb-3">
                    Sent via WhatsApp to recipients who have opted in to WhatsApp notifications:
                  </p>
                  <div className="rounded-xl overflow-hidden bg-[#ECE5DD] dark:bg-[#1A2C37] p-4 space-y-3 shadow-sm border">
                    {/* WA header */}
                    <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 pb-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-[#075E54] dark:text-[#25D366]">PACT Command Center</span>
                    </div>
                    {/* Bubble */}
                    <div className="bg-white dark:bg-[#202C33] rounded-lg px-3.5 py-2.5 shadow-sm max-w-xs">
                      <p className="text-sm font-semibold text-[#25D366] mb-1">⏰ Reminder: Action Required / تذكير: مطلوب إجراء</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
                        {`This is a reminder that cost submission "${reminderPreviewDialog.refNum}${reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 60 ? reminderPreviewDialog.description.substring(0, 60) + '…' : reminderPreviewDialog.description}` : ''}" (${reminderPreviewDialog.amtStr}) submitted by ${reminderPreviewDialog.submitterName} is waiting for your review at ${reminderPreviewDialog.stepLabel}. Please log in and take action.`}
                      </p>
                      <hr className="my-2 border-gray-200 dark:border-gray-600" />
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line text-right" dir="rtl">
                        {`تذكير: طلب التكلفة "${reminderPreviewDialog.refNum}${reminderPreviewDialog.description ? ` — ${reminderPreviewDialog.description.length > 60 ? reminderPreviewDialog.description.substring(0, 60) + '…' : reminderPreviewDialog.description}` : ''}" (${reminderPreviewDialog.amtStr}) المقدَّم من ${reminderPreviewDialog.submitterName} بانتظار مراجعتك في مرحلة ${reminderPreviewDialog.stepLabel}. يرجى تسجيل الدخول واتخاذ الإجراء اللازم.`}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1.5 text-right">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {/* CTA link */}
                    <div className="bg-white dark:bg-[#202C33] rounded-lg px-3.5 py-2 shadow-sm max-w-xs">
                      <p className="text-xs text-[#25D366] font-medium flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> Open PACT Command Center
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground space-y-1">
                    <p><strong>Via:</strong> WasenderAPI (WhatsApp Business)</p>
                    <p><strong>To:</strong> {reminderPreviewDialog.recipients.map(r => r.name || r.email || 'approver').join(', ')}</p>
                    <p className="text-amber-600 dark:text-amber-400"><strong>Note:</strong> Only delivered to recipients with WhatsApp opted in.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t bg-muted/20 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReminderPreviewDialog(null)}
                disabled={reminderSending}
                data-testid="button-reminder-preview-cancel"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={executeReminder}
                disabled={reminderSending}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                data-testid="button-reminder-preview-send"
              >
                {reminderSending ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="h-3.5 w-3.5" /> Send Reminder to {reminderPreviewDialog.recipients.map(r => r.name || r.email || 'approver').join(', ')}</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Audit Trail Drawer ─────────────────────────────────────────────── */}
      {auditDrawerItem && (() => {
        const aud = auditDrawerItem;
        const raw = aud.description || '';
        const titleMatch = raw.match(/<<([^>>]+)>>/);
        const reqTitle = titleMatch ? titleMatch[1].trim() : (aud.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled');
        const submitter = users.find(u => u.id === aud.submitted_by)?.name || aud.submitted_by?.slice(0, 8) || '—';
        const t1User = aud.tier1_approved_by ? (users.find(u => u.id === aud.tier1_approved_by)?.name || aud.tier1_approved_by.slice(0, 8)) : null;
        const t2User = aud.tier2_approved_by ? (users.find(u => u.id === aud.tier2_approved_by)?.name || aud.tier2_approved_by.slice(0, 8)) : null;
        const t3User = aud.tier3_approved_by ? (users.find(u => u.id === aud.tier3_approved_by)?.name || aud.tier3_approved_by.slice(0, 8)) : null;
        const t4User = aud.tier4_approved_by ? (users.find(u => u.id === aud.tier4_approved_by)?.name || aud.tier4_approved_by.slice(0, 8)) : null;

        type AuditEvent = { ts: string; icon: string; label: string; by?: string | null; notes?: string | null; color: string };
        const events: AuditEvent[] = [];

        events.push({ ts: aud.submitted_at || aud.created_at, icon: '📝', label: 'Submitted', by: submitter, notes: null, color: 'bg-blue-500' });

        if (aud.tier1_approved_at) {
          const approved = aud.tier1_status === 'approved';
          events.push({ ts: aud.tier1_approved_at, icon: approved ? '✅' : '❌', label: `Tier 1 ${approved ? 'Approved' : 'Rejected'}`, by: t1User, notes: aud.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || null, color: approved ? 'bg-green-500' : 'bg-red-500' });
        } else if (aud.tier1_status === 'pending') {
          events.push({ ts: '', icon: '⏳', label: 'Tier 1 Approval — Pending', by: null, notes: null, color: 'bg-amber-400' });
        }

        if (hasTwoTiers(aud) || hasThreeTiers(aud) || hasFourTiers(aud)) {
          if (aud.tier2_approved_at) {
            const approved = aud.tier2_status === 'approved';
            events.push({ ts: aud.tier2_approved_at, icon: approved ? '✅' : '❌', label: `Tier 2 ${approved ? 'Approved' : 'Rejected'}`, by: t2User, notes: aud.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || null, color: approved ? 'bg-green-500' : 'bg-red-500' });
          } else if (aud.tier1_status === 'approved' && aud.tier2_status === 'pending') {
            events.push({ ts: '', icon: '⏳', label: 'Tier 2 Approval — Pending', by: null, notes: null, color: 'bg-amber-400' });
          }
        }

        if (hasThreeTiers(aud) || hasFourTiers(aud)) {
          if (aud.tier3_approved_at) {
            const approved = aud.tier3_status === 'approved';
            events.push({ ts: aud.tier3_approved_at, icon: approved ? '✅' : '❌', label: `Tier 3 ${approved ? 'Approved' : 'Rejected'}`, by: t3User, notes: aud.tier3_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || null, color: approved ? 'bg-green-500' : 'bg-red-500' });
          } else if (aud.tier2_status === 'approved' && aud.tier3_status === 'pending') {
            events.push({ ts: '', icon: '⏳', label: 'Tier 3 Approval — Pending', by: null, notes: null, color: 'bg-amber-400' });
          }
        }

        if (hasFourTiers(aud)) {
          if (aud.tier4_approved_at) {
            const approved = aud.tier4_status === 'approved';
            events.push({ ts: aud.tier4_approved_at, icon: approved ? '✅' : '❌', label: `Tier 4 ${approved ? 'Approved' : 'Rejected'}`, by: t4User, notes: aud.tier4_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || null, color: approved ? 'bg-green-500' : 'bg-red-500' });
          } else if (aud.tier3_status === 'approved' && aud.tier4_status === 'pending') {
            events.push({ ts: '', icon: '⏳', label: 'Tier 4 Approval — Pending', by: null, notes: null, color: 'bg-amber-400' });
          }
        }

        if (aud.status === 'paid' || aud.status === 'reconciled') {
          events.push({ ts: (aud as any).paid_at || '', icon: '💰', label: aud.status === 'reconciled' ? 'Reconciled' : 'Marked as Paid', by: null, notes: null, color: 'bg-purple-500' });
        }

        if (lastRemindedMap[aud.id]) {
          events.push({ ts: lastRemindedMap[aud.id], icon: '🔔', label: 'Reminder Sent', by: null, notes: 'Via Remind All', color: 'bg-amber-400' });
        }

        return (
          <Sheet open={!!auditDrawerItem} onOpenChange={open => { if (!open) setAuditDrawerItem(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-audit-trail">
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-purple-500" />
                  Audit Trail
                </SheetTitle>
                <div className="space-y-1 mt-1">
                  <p className="font-semibold text-sm text-foreground line-clamp-2">{reqTitle}</p>
                  <p className="text-xs text-muted-foreground">{aud.currency} {(aud.amount_cents / 100).toLocaleString()} · {EXPENSE_CATEGORY_MAP[aud.expense_category]?.label || aud.expense_category}</p>
                </div>
              </SheetHeader>

              <div className="relative pl-5 space-y-0 mt-2">
                <div className="absolute left-[9px] top-0 bottom-0 w-px bg-border" />
                {events.map((ev, i) => (
                  <div key={i} className="relative pb-5 last:pb-0">
                    <div className={`absolute -left-5 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${ev.ts ? ev.color : 'bg-muted'} ring-2 ring-background`}>
                      {ev.icon}
                    </div>
                    <div className="ml-3 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{ev.label}</p>
                      {ev.by && <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{ev.by}</p>}
                      {ev.ts && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(ev.ts), 'MMM d, yyyy · h:mm a')}</p>}
                      {ev.notes && <p className="text-xs text-muted-foreground/80 italic mt-0.5 border-l-2 border-border pl-2">"{ev.notes}"</p>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t space-y-2">
                <button
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => { setAuditDrawerItem(null); setViewingSubmission(aud); }}
                  data-testid="button-audit-view-full"
                >
                  <Eye className="h-3.5 w-3.5" /> Open full submission details
                </button>
              </div>
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* ── In-page Attachment / Receipt Viewer ── */}
      {/* Rendered via createPortal so it floats above Radix Sheets/Dialogs regardless of stacking context */}
      {attachViewer.open && (() => {
        const currentUrl = attachViewer.urls[attachViewer.index] ?? '';
        const total = attachViewer.urls.length;
        const hasPrev = attachViewer.index > 0;
        const hasNext = attachViewer.index < total - 1;
        const label = total > 1
          ? `${attachViewer.name} (${attachViewer.index + 1} / ${total})`
          : attachViewer.name;
        return createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            style={{ zIndex: 99999 }}
            tabIndex={-1}
            onClick={closeAttach}
            onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeAttach(); } }}
          >
            <div
              className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxWidth: '92vw', maxHeight: '90vh', width: isImage(currentUrl) ? 'auto' : '92vw' }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isImage(currentUrl)
                    ? <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                    : isPdf(currentUrl)
                    ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <span className="font-medium text-sm truncate">{label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Prev / Next navigation for multi-receipt */}
                  {total > 1 && (
                    <div className="flex items-center gap-1 border rounded-md overflow-hidden">
                      <button type="button" disabled={!hasPrev}
                        onClick={e => { e.stopPropagation(); setAttachViewer(v => ({ ...v, index: v.index - 1 })); }}
                        className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Previous receipt">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-2 py-1 text-xs font-mono border-x select-none">
                        {attachViewer.index + 1} / {total}
                      </span>
                      <button type="button" disabled={!hasNext}
                        onClick={e => { e.stopPropagation(); setAttachViewer(v => ({ ...v, index: v.index + 1 })); }}
                        className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next receipt">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <a href={currentUrl} download target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border hover:bg-muted transition-colors"
                    onClick={e => e.stopPropagation()}>
                    <Download className="h-3.5 w-3.5" />Download
                  </a>
                  <button type="button" onClick={closeAttach}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-0" style={{ minHeight: '200px' }}>
                {isImage(currentUrl) ? (
                  <img src={currentUrl} alt={label} className="max-w-full max-h-[75vh] object-contain rounded" />
                ) : isPdf(currentUrl) ? (
                  <iframe src={currentUrl} title={label} className="w-full rounded"
                    style={{ height: '75vh', minWidth: 'min(80vw, 800px)' }} />
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">This file type cannot be previewed.</p>
                    <a href={currentUrl} download target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                      <Download className="h-4 w-4" />Download File
                    </a>
                  </div>
                )}
              </div>

              {/* Thumbnail strip for multiple receipts */}
              {total > 1 && (
                <div className="shrink-0 border-t px-3 py-2 flex items-center gap-2 overflow-x-auto bg-muted/30">
                  {attachViewer.urls.map((u, i) => (
                    <button key={i} type="button"
                      onClick={e => { e.stopPropagation(); setAttachViewer(v => ({ ...v, index: i })); }}
                      className={`shrink-0 rounded border-2 transition-all ${i === attachViewer.index ? 'border-blue-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}>
                      {isImage(u) ? (
                        <img src={u} alt={`Receipt ${i + 1}`} className="h-12 w-16 object-cover rounded" />
                      ) : (
                        <div className="h-12 w-16 flex items-center justify-center bg-red-50 dark:bg-red-950/30 rounded">
                          <FileText className="h-5 w-5 text-red-500" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Receipt Confirmation Gate Dialog ─────────────────────────── */}
      <Dialog open={receiptConfirmDialog.open} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-5 w-5" />
              Confirm Payment Receipt / تأكيد استلام الدفع
            </DialogTitle>
            <DialogDescription>
              A payment has been processed for your cost submission. Please confirm you have received the funds before continuing.
            </DialogDescription>
          </DialogHeader>
          {receiptConfirmDialog.submission && (() => {
            const sub = receiptConfirmDialog.submission;
            const proofUrl = (sub as any).payment_proof_url || (sub as any).payment_proof_urls?.[0];
            const isImg = proofUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(proofUrl);
            return (
              <div className="space-y-4 py-1">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Submission</span>
                    <span className="font-medium">{(sub as any).title || sub.description || `#${sub.id.slice(0, 8)}`}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {sub.currency || 'SDG'} {new Intl.NumberFormat().format(
                        (sub.amount_paid_cents ?? sub.amount_cents ?? 0) / 100
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="capitalize font-medium text-emerald-600">{sub.status}</span>
                  </div>
                </div>
                {proofUrl && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Receipt / إيصال الدفع</p>
                    {isImg ? (
                      <img src={proofUrl} alt="Payment proof" className="w-full max-h-64 object-contain rounded-lg border" />
                    ) : (
                      <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sky-600 hover:text-sky-700 underline text-sm"
                      >
                        <ExternalLink className="h-4 w-4" />View Payment Receipt Document
                      </a>
                    )}
                  </div>
                )}
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                  By clicking <strong>Confirm Receipt</strong>, you acknowledge that you have received the payment for this cost submission.
                  You cannot take any action on this submission until you confirm.
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button
              onClick={handleConfirmReceipt}
              disabled={confirmingReceipt}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-confirm-receipt"
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              {confirmingReceipt ? 'Confirming…' : 'Confirm Receipt / تأكيد الاستلام'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={preFundCorrectionDialog.open}
        onOpenChange={(open) => !open && !preFundCorrectionDialog.saving && setPreFundCorrectionDialog({ open: false, evidence: null, replacementFundId: '', reason: '', funds: [], loadingFunds: false, saving: false })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Correct Pre-Fund</DialogTitle>
            <DialogDescription>
              This records an immutable reversal and replacement payment. It does not change the payment amount, receipt, or source payment history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{preFundCorrectionDialog.evidence?.name}</p>
              <p className="text-xs text-muted-foreground">
                {preFundCorrectionDialog.evidence?.currency} {Number(preFundCorrectionDialog.evidence?.amount ?? 0).toLocaleString()} was selected for this payment.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Replacement active Pre-Fund <span className="text-destructive">*</span></Label>
              <Select
                value={preFundCorrectionDialog.replacementFundId}
                onValueChange={replacementFundId => setPreFundCorrectionDialog(current => ({ ...current, replacementFundId }))}
                disabled={preFundCorrectionDialog.loadingFunds || preFundCorrectionDialog.saving}
              >
                <SelectTrigger data-testid="select-correct-cost-pre-fund">
                  <SelectValue placeholder={preFundCorrectionDialog.loadingFunds ? 'Loading active Pre-Funds…' : 'Select a replacement Pre-Fund'} />
                </SelectTrigger>
                <SelectContent>
                  {preFundCorrectionDialog.funds
                    .filter(fund => fund.id !== preFundCorrectionDialog.evidence?.id)
                    .map(fund => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name} · {fund.currency} {fund.available_balance.toLocaleString()} available
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correct-cost-pre-fund-reason">Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="correct-cost-pre-fund-reason"
                value={preFundCorrectionDialog.reason}
                onChange={event => setPreFundCorrectionDialog(current => ({ ...current, reason: event.target.value }))}
                placeholder="Explain why the payment was charged to the wrong Pre-Fund."
                disabled={preFundCorrectionDialog.saving}
                data-testid="input-correct-cost-pre-fund-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreFundCorrectionDialog({ open: false, evidence: null, replacementFundId: '', reason: '', funds: [], loadingFunds: false, saving: false })} disabled={preFundCorrectionDialog.saving}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitPreFundCorrection()}
              disabled={preFundCorrectionDialog.saving || preFundCorrectionDialog.loadingFunds || !preFundCorrectionDialog.replacementFundId || !preFundCorrectionDialog.reason.trim()}
              data-testid="button-confirm-correct-cost-pre-fund"
            >
              {preFundCorrectionDialog.saving ? 'Correcting…' : 'Record correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>)}
    </div>
  );
};

export default CostSubmission;
