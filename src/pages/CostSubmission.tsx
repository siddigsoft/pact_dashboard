import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronDown, ChevronRight, Clock, CheckCircle, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, ThumbsUp, ThumbsDown, ArrowRight, Calendar, MapPin, Building2, FolderOpen, Hash, Paperclip, Download, Pencil, PencilLine, Trash2, RotateCcw, SendHorizonal, FileSpreadsheet, FileDown, Info, RefreshCw, CircleDollarSign, ClipboardCheck, HelpCircle, Wallet, Ticket, Gift, Wifi, GraduationCap, Car, Package, Printer, Coffee, MoreHorizontal, Briefcase, Mail, Upload, Eye, ImageIcon, Unlock, ShieldCheck, MessageSquare, CornerUpLeft, Layers } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserCostSubmissions, useCostSubmissions, useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { useAppContext } from "@/context/AppContext";
import { useUser } from "@/context/user/UserContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUserProjects } from "@/hooks/useUserProjects";
import { AppRole } from "@/types";
import CostSubmissionHistory from "@/components/cost-submission/CostSubmissionHistory";
import UnifiedCostRequestForm from "@/components/cost-submission/UnifiedCostRequestForm";
import CostReconciliationForm from "@/components/cost-submission/CostReconciliationForm";
import CostDocumentUpload from "@/components/cost-submission/CostDocumentUpload";
import OutstandingAdvances from "@/components/cost-submission/OutstandingAdvances";
import type { SupportingDocument } from "@/types/cost-submission";
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
import { getStatesInHub, normalizeHubId } from '@/data/sudanStates';
import { getHubAccessInfo, isStateInAnyHub } from '@/utils/hubAccessControl';

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
}

const CostSubmission = () => {
  const navigate = useNavigate();
  const { currentUser, roles } = useAppContext();
  const { users } = useUser();
  const { projects: allProjects } = useProjectContext();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { toast } = useToast();
  
  // Check if user is admin or supervisor
  const isAdmin = roles?.includes('admin' as AppRole) || currentUser?.role === 'admin';
  const isSupervisor = roles?.includes('hubSupervisor' as AppRole) || 
                       roles?.includes('supervisor' as AppRole) ||
                       currentUser?.role === 'hubSupervisor' || 
                       currentUser?.role === 'supervisor';
  
  // Check if user is FOM or Coordinator (can submit operational costs)
  const isFOM = roles?.includes('Field Operation Manager (FOM)' as AppRole) ||
                roles?.includes('fom' as AppRole) ||
                currentUser?.role === 'Field Operation Manager (FOM)' ||
                currentUser?.role === 'fom' ||
                (currentUser?.role || '').toLowerCase() === 'fom';
  const isCoordinator = roles?.includes('Coordinator' as AppRole) || 
                        currentUser?.role === 'Coordinator' ||
                        currentUser?.role === 'coordinator';
  
  // Check if user is Country Director (can submit operational costs - approved by Admin → Super Admin)
  const isCountryDirector = roles?.includes('CountryDirector' as AppRole) || 
                            currentUser?.role === 'CountryDirector';
  
  // Check if user is Data Collector/Enumerator (can submit reimbursement requests)
  const isDataCollector = roles?.includes('DataCollector' as AppRole) || 
                          roles?.includes('Enumerator' as AppRole) ||
                          currentUser?.role === 'DataCollector' ||
                          currentUser?.role === 'datacollector' ||
                          currentUser?.role === 'Enumerator' ||
                          currentUser?.role === 'enumerator';
  
  const isSuperAdmin = isAdminOrSuperUser || 
    currentUser?.role === 'SuperAdmin' || currentUser?.role === 'superAdmin' || 
    currentUser?.role === 'super_admin' || currentUser?.role === 'Super Admin';
  
  const isFinanceAdmin = roles?.includes('finance_admin' as AppRole) || 
    currentUser?.role === 'finance_admin' || currentUser?.role === 'Finance Admin';

  const isDataTeam = roles?.includes('DataTeam' as AppRole) ||
    currentUser?.role === 'DataTeam' ||
    currentUser?.role === 'dataTeam' ||
    currentUser?.role === 'data_team' ||
    currentUser?.role === 'Data Team';

  const canSubmitOperationalCosts = isFOM || isCoordinator || isCountryDirector || isAdmin || isSupervisor || isAdminOrSuperUser || isDataTeam;
  const canReconcileAdvances = isCountryDirector || isAdmin || isAdminOrSuperUser;
  
  const canViewTeamSubmissions = isAdmin || isSupervisor || isSuperAdmin || isFinanceAdmin || isAdminOrSuperUser || isFOM || isCountryDirector;

  // Default to Submit Request tab for all users
  const [activeTab, setActiveTab] = useState<"submit" | "reconciliation" | "outstanding" | "history" | "payment_audit">("submit");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "under_review" | "approved" | "rejected" | "paid" | "reconciled">("all");
  const [showGuide, setShowGuide] = useState(false);
  const [operationalCosts, setOperationalCosts] = useState<OperationalCostSubmission[]>([]);
  const [operationalCostsLoading, setOperationalCostsLoading] = useState(true);
  
  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2 | 3;
    submission: OperationalCostSubmission | null;
  }>({ open: false, action: 'approve', tier: 1, submission: null });
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  const [approvalAttachments, setApprovalAttachments] = useState<File[]>([]);
  const pendingApprovalDocsRef = useRef<Array<{ url: string; filename: string }>>([]);

  const [groupApprovalDialog, setGroupApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2 | 3;
    groupId: string;
    groupTitle: string;
    submissions: OperationalCostSubmission[];
  }>({ open: false, action: 'approve', tier: 1, groupId: '', groupTitle: '', submissions: [] });
  const [groupApprovalNotes, setGroupApprovalNotes] = useState('');
  const [groupApprovalProcessing, setGroupApprovalProcessing] = useState(false);
  const [groupApprovalAttachments, setGroupApprovalAttachments] = useState<File[]>([]);

  const [viewingSubmission, setViewingSubmission] = useState<OperationalCostSubmission | null>(null);

  const [signatureModal, setSignatureModal] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    tier: 1 | 2 | 3;
    notes: string;
    isBypass?: boolean;
  }>({ open: false, submission: null, tier: 2, notes: '', isBypass: false });

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
  const [recallConfirm, setRecallConfirm] = useState<OperationalCostSubmission | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [markAsPaidDialog, setMarkAsPaidDialog] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    proofFile: File | null;
    proofPreviewUrl: string | null;
    notes: string;
    uploading: boolean;
  }>({ open: false, submission: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });

  const [selectedCostIds, setSelectedCostIds] = useState<Set<string>>(new Set());
  const [batchCostPayDialog, setBatchCostPayDialog] = useState<{
    open: boolean;
    submissions: OperationalCostSubmission[];
    proofFile: File | null;
    proofPreviewUrl: string | null;
    notes: string;
    uploading: boolean;
  }>({ open: false, submissions: [], proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });

  const [viewAdvanceDetails, setViewAdvanceDetails] = useState<OperationalCostSubmission | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (groupId: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return next;
  });
  const [editingItem, setEditingItem] = useState<OperationalCostSubmission | null>(null);
  const [editItemFields, setEditItemFields] = useState({ expense_category: '', amount_str: '', description: '', expense_date: '', vendor: '', reference_number: '', reason: '' });
  const [itemEditSubmitting, setItemEditSubmitting] = useState(false);
  const [sendBackDialog, setSendBackDialog] = useState<{ open: boolean; item: OperationalCostSubmission | null }>({ open: false, item: null });
  const [sendBackComment, setSendBackComment] = useState('');
  const [sendBackSubmitting, setSendBackSubmitting] = useState(false);
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

  useEffect(() => {
    const signedOps = operationalCosts.filter(oc => 
      oc.tier2_notes?.includes('[Signed:') && !sigCacheRef.current[oc.id]
    );
    signedOps.forEach(oc => fetchSignatureForSubmission(oc));
  }, [operationalCosts, fetchSignatureForSubmission]);

  const fetchOperationalCosts = useCallback(async () => {
    if (!currentUser?.id) return;
    setOperationalCostsLoading(true);
    try {
      const userRole = (currentUser.role || '').toLowerCase().replace(/[\s_-]/g, '');
      const isSuperAdminDirect = userRole === 'superadmin' || userRole === 'superadministrator';
      const isAdminDirect = userRole === 'admin' || userRole === 'administrator' || userRole === 'ict';
      const shouldFetchAll = canViewTeamSubmissions || isSuperAdmin || isSuperAdminDirect || isAdminDirect || isAdminOrSuperUser;

      let data: OperationalCostSubmission[] | null = null;
      let error: any = null;

      if (shouldFetchAll) {
        const rpcResult = await supabase.rpc('get_all_operational_cost_submissions');
        if (!rpcResult.error && rpcResult.data && (rpcResult.data as any[]).length > 0) {
          data = rpcResult.data as OperationalCostSubmission[];
          console.log(`[CostSubmission] RPC fetched ${(data || []).length} operational costs (role: ${currentUser.role})`);
        } else {
          if (rpcResult.error) {
            console.warn('[CostSubmission] RPC error, falling back:', rpcResult.error.message);
          } else {
            console.warn('[CostSubmission] RPC returned empty, trying direct query (role:', currentUser.role, ')');
          }
          const directResult = await supabase
            .from('operational_cost_submissions')
            .select('*')
            .order('created_at', { ascending: false });
          data = directResult.data as OperationalCostSubmission[];
          error = directResult.error;
          console.log(`[CostSubmission] Direct query fetched ${(data || []).length} records, error:`, error?.message || 'none');
        }
      } else {
        const result = await supabase
          .from('operational_cost_submissions')
          .select('*')
          .eq('submitted_by', currentUser.id)
          .order('created_at', { ascending: false });
        data = result.data as OperationalCostSubmission[];
        error = result.error;
      }

      if (error) {
        console.error('Error fetching operational costs:', error);
        setOperationalCosts([]);
      } else {
        console.log(`[CostSubmission] Total operational costs loaded: ${(data || []).length} (fetchAll: ${shouldFetchAll}, role: ${currentUser.role})`);
        setOperationalCosts((data as OperationalCostSubmission[]) || []);
      }
    } catch (err) {
      console.error('Error fetching operational costs:', err);
      setOperationalCosts([]);
    } finally {
      setOperationalCostsLoading(false);
    }
  }, [currentUser?.id, currentUser?.role, canViewTeamSubmissions, isSuperAdmin, isAdminOrSuperUser]);

  useEffect(() => {
    fetchOperationalCosts();
  }, [fetchOperationalCosts]);

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
  
  // Filter submissions for supervisors to show only their team's submissions
  const filterSubmissionsForSupervisor = (allSubs: typeof allSubmissionsQuery.submissions) => {
    if (isAdmin || isSuperAdmin || isAdminOrSuperUser) return allSubs; // Admins & Super Admins see all
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
  // Filter submissions to only show those from projects the user belongs to
  // Non-admin users with no project assignments see nothing (empty array)
  const submissions = useMemo(() => {
    if (isAdminOrSuperUser || isSuperAdmin) return supervisorFilteredSubmissions;
    if (userProjectIds.length === 0) return []; // No project memberships = no data
    return supervisorFilteredSubmissions.filter(s => 
      !s.projectId || userProjectIds.includes(s.projectId)
    );
  }, [supervisorFilteredSubmissions, userProjectIds, isAdminOrSuperUser, isSuperAdmin]);

  const filteredOperationalCosts = useMemo(() => {
    let filtered = operationalCosts;
    // Admins, Super Admins, FOM, and Country Directors see everything unfiltered
    if (!isAdminOrSuperUser && !isSuperAdmin && !isFOM && !isCountryDirector) {
      if (isSupervisor) {
        filtered = filtered.filter(o => {
          if (o.submitted_by === currentUser?.id) return true;
          if (teamMemberIds.length > 0 && teamMemberIds.includes(o.submitted_by)) return true;
          if (o.tier1_status === 'pending') return true;
          const submitterRole = (o.submitter_role || '').toLowerCase();
          if (submitterRole.includes('coordinator') || submitterRole.includes('enumerator') || submitterRole.includes('datacollector')) return true;
          return false;
        });
      } else if (!canViewTeamSubmissions) {
        filtered = filtered.filter(o => o.submitted_by === currentUser?.id);
      }
      if (userProjectIds.length > 0) {
        filtered = filtered.filter(o => !o.project_id || userProjectIds.includes(o.project_id));
      }
    }
    return filtered;
  }, [operationalCosts, isAdminOrSuperUser, isSuperAdmin, isFOM, isCountryDirector, isSupervisor, teamMemberIds, canViewTeamSubmissions, currentUser?.id, userProjectIds]);

  const isCoordinatorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase();
    return role.includes('coordinator');
  };

  const isSupervisorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase();
    return role.includes('supervisor') || role.includes('hubsupervisor');
  };

  // FOM/Country Director submissions only need ONE approval (admin/super admin), then go straight to Finance.
  const isFomSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase().replace(/[\s_-]/g, '');
    return role === 'fom' || role === 'fieldoperationmanager' || role === 'countrydirector';
  };

  const hasThreeTiers = (oc: OperationalCostSubmission): boolean => {
    return isCoordinatorSubmission(oc) || oc.tier3_status !== null;
  };

  const getOperationalDerivedStatus = (oc: OperationalCostSubmission): string => {
    if (oc.status === 'reconciled') return 'reconciled';
    if (oc.status === 'paid') return 'paid';
    if (oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.tier3_status === 'rejected' || oc.status === 'rejected') return 'rejected';
    if (oc.status === 'approved') return 'approved';
    // FOM/Country Director submissions: single-tier — T1 approval is sufficient
    if (isFomSubmission(oc)) {
      if (oc.tier1_status === 'approved') return 'approved';
      return 'pending';
    }
    if (hasThreeTiers(oc)) {
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && oc.tier3_status === 'approved') return 'approved';
      if (oc.tier1_status === 'approved' && (oc.tier2_status === 'pending' || oc.tier3_status === 'pending')) return 'under_review';
    } else {
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved') return 'approved';
      if (oc.tier1_status === 'approved' && oc.tier2_status === 'pending') return 'under_review';
    }
    if (oc.status === 'under_review') return 'under_review';
    return 'pending';
  };

  const canTier1Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    if (oc.submitted_by === currentUser?.id) return false;
    if (isSupervisorSubmission(oc)) {
      return isFOM || isCountryDirector;
    }
    if (isCoordinatorSubmission(oc)) {
      return isSupervisor;
    }
    return isFOM || isCountryDirector;
  };

  const canTier2Approve = (oc: OperationalCostSubmission): boolean => {
    // FOM submissions only need single-tier approval — T2 is never required
    if (isFomSubmission(oc)) return false;
    if (oc.tier1_status !== 'approved' || oc.tier2_status !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    if (oc.submitted_by === currentUser?.id) return false;
    if (isCoordinatorSubmission(oc)) {
      return isFOM || isCountryDirector;
    }
    return false;
  };

  const canTier3Approve = (oc: OperationalCostSubmission): boolean => {
    if (!hasThreeTiers(oc)) return false;
    if (oc.tier2_status !== 'approved') return false;
    if (oc.tier3_status !== 'pending' && oc.tier3_status !== null) return false;
    if (isSuperAdmin) return true;
    return isAdmin;
  };

  // ── FOM Direct Approval (Bypass) ──────────────────────────────────────────
  // FOM can skip pending intermediate tiers and directly push a submission
  // to final "approved" status (ready for Finance), bypassing the normal flow.
  const canFOMBypass = (oc: OperationalCostSubmission): boolean => {
    if (!isFOM && !isCountryDirector) return false;
    if (oc.submitted_by === currentUser?.id) return false;
    const derived = getOperationalDerivedStatus(oc);
    return derived !== 'approved' && derived !== 'paid' && derived !== 'reconciled' && derived !== 'rejected';
  };

  const openFOMBypassDialog = (oc: OperationalCostSubmission) => {
    const now = new Date().toISOString();
    const normalFlow = hasThreeTiers(oc)
      ? 'Tier 1 (Supervisor) → Tier 2 (FOM) → Tier 3 (Admin) → Finance'
      : 'Tier 1 (Supervisor) → Tier 2 (FOM/Admin) → Finance';
    const bypassNote = `[FOM Direct Approval — Bypass used by ${currentUser?.name || currentUser?.email} at ${now}. Normal flow: ${normalFlow}. FOM exercised authority to approve directly to Finance level.]`;
    setSignatureModal({
      open: true,
      submission: oc,
      tier: 2,
      notes: bypassNote,
      isBypass: true,
    });
    setApprovalProcessing(true);
  };

  const processFOMBypassApproval = async (
    submission: OperationalCostSubmission,
    notes: string,
    signatureData?: { signatureId: string; signatureHash: string; method: SignatureMethod; signedAt: string }
  ) => {
    if (!currentUser?.id) return;
    setApprovalProcessing(true);
    try {
      const now = new Date().toISOString();
      const sigSuffix = signatureData
        ? `\n[Signed: ${signatureData.method.toUpperCase()} | Hash: ${signatureData.signatureHash.substring(0, 12)}... | ID: ${signatureData.signatureId} | ${signatureData.signedAt}]`
        : '';
      const fullNote = (notes || '') + sigSuffix;

      const updates: Record<string, any> = {
        status: 'approved',
        // Approve ALL pending tiers simultaneously
        tier1_status: submission.tier1_status === 'approved' ? submission.tier1_status : 'approved',
        tier1_approved_by: submission.tier1_approved_by || currentUser.id,
        tier1_approved_at: submission.tier1_approved_at || now,
        tier1_notes: submission.tier1_notes || `[FOM Bypass — tier 1 auto-approved]${sigSuffix}`,
        tier2_status: 'approved',
        tier2_approved_by: currentUser.id,
        tier2_approved_at: now,
        tier2_notes: fullNote,
      };
      if (hasThreeTiers(submission)) {
        updates.tier3_status = 'approved';
        updates.tier3_approved_by = currentUser.id;
        updates.tier3_approved_at = now;
        updates.tier3_notes = `[FOM Bypass — tier 3 auto-approved]${sigSuffix}`;
      }

      const { data: updatedRows, error } = await supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('id', submission.id)
        .select('id');

      if (error) {
        console.error('[FOMBypass] Approval error:', error);
        toast({
          title: 'Bypass Approval Failed / فشل الموافقة المباشرة',
          description: error.message || 'Could not process the bypass approval. / تعذرت معالجة الموافقة المباشرة.',
          variant: 'destructive',
          duration: 8000,
        });
      } else if (!updatedRows || updatedRows.length === 0) {
        console.error('[FOMBypass] Update matched 0 rows — likely RLS issue.', { submissionId: submission.id, userRole: currentUser.role });
        toast({
          title: 'Permission Issue / مشكلة صلاحية',
          description: 'Your role may not have database-level permission for this bypass yet. Please contact the system administrator. / قد لا يمتلك دورك صلاحية قاعدة البيانات لهذا التجاوز بعد.',
          variant: 'destructive',
          duration: 10000,
        });
      } else {
        toast({
          title: 'Direct Approval Applied / تمت الموافقة المباشرة',
          description: `Submission approved directly to Finance level by ${currentUser?.name || 'FOM'}. Normal approval flow was bypassed. / تمت الموافقة على الطلب مباشرة إلى مستوى المالية من قِبل ${currentUser?.name || 'مدير العمليات الميدانية'}.`,
          duration: 6000,
        });

        // Notify the submitter that their submission was fully approved
        if (submission.submitted_by) {
          const bypassRefNum = submission.reference_number || submission.id.substring(0, 8).toUpperCase();
          const bypassAmountStr = `${submission.currency} ${(submission.amount_cents / 100).toLocaleString()}`;
          const bypassApproverName = (currentUser as any)?.name || (currentUser as any)?.fullName || 'FOM';
          NotificationTriggerService.send({
            userId: submission.submitted_by,
            title: 'Cost Submission Fully Approved / تمت الموافقة الكاملة على المطالبة',
            message: `Your cost submission "${bypassRefNum}" (${bypassAmountStr}) has been fully approved by ${bypassApproverName} and cleared for payment.`,
            type: 'success',
            category: 'financial',
            priority: 'high',
            link: '/cost-submission',
            sendEmail: true,
            emailActionLabel: 'View Submission',
          }).catch(console.warn);
        }

        await fetchOperationalCosts();
      }
    } catch (err) {
      console.error('[FOMBypass] Unexpected error:', err);
    } finally {
      setApprovalProcessing(false);
    }
  };

  const openApprovalDialog = (oc: OperationalCostSubmission, action: 'approve' | 'reject', tier: 1 | 2 | 3) => {
    setApprovalDialog({ open: true, action, tier, submission: oc });
    setApprovalNotes('');
  };

  const openGroupApprovalDialog = (
    groupId: string,
    groupTitle: string,
    submissions: OperationalCostSubmission[],
    action: 'approve' | 'reject',
    tier: 1 | 2 | 3
  ) => {
    setGroupApprovalDialog({ open: true, action, tier, groupId, groupTitle, submissions });
    setGroupApprovalNotes('');
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
    const { action, tier, groupId, submissions } = groupApprovalDialog;
    if (!submissions.length || !currentUser?.id || !groupId) return;
    setGroupApprovalProcessing(true);
    try {
      const now = new Date().toISOString();

      /* upload any approval attachments first */
      const newDocs = groupApprovalAttachments.length > 0
        ? await uploadApprovalFiles(groupApprovalAttachments, `group-${groupId.slice(0, 8)}`)
        : [];

      const updates: Record<string, any> = {};

      if (tier === 1) {
        updates.tier1_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier1_approved_by = currentUser.id;
        updates.tier1_approved_at = now;
        updates.tier1_notes = groupApprovalNotes || null;
        updates.status = action === 'approve' ? 'under_review' : 'rejected';
        if (action === 'reject') updates.rejection_reason = groupApprovalNotes || 'Rejected at Tier 1';
      } else if (tier === 2) {
        updates.tier2_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier2_approved_by = currentUser.id;
        updates.tier2_approved_at = now;
        updates.tier2_notes = groupApprovalNotes || null;
        const isFinal = !submissions.some(s => hasThreeTiers(s));
        updates.status = action === 'approve' ? (isFinal ? 'approved' : 'under_review') : 'rejected';
        if (action === 'reject') updates.rejection_reason = groupApprovalNotes || 'Rejected at Tier 2';
        else if (action === 'approve' && !isFinal) { updates.tier3_status = 'pending'; }
      } else if (tier === 3) {
        updates.tier3_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier3_approved_by = currentUser.id;
        updates.tier3_approved_at = now;
        updates.tier3_notes = groupApprovalNotes || null;
        updates.status = action === 'approve' ? 'approved' : 'rejected';
        if (action === 'reject') updates.rejection_reason = groupApprovalNotes || 'Rejected at Tier 3';
      }

      const tierStatusKey = `tier${tier}_status` as const;
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('request_group_id', groupId)
        .eq(tierStatusKey, 'pending');

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
        setGroupApprovalDialog(prev => ({ ...prev, open: false }));
        setGroupApprovalNotes('');
        setGroupApprovalAttachments([]);
        await fetchOperationalCosts();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setGroupApprovalProcessing(false);
    }
  };

  const isFinalTier = (oc: OperationalCostSubmission, tier: 1 | 2 | 3): boolean => {
    // FOM/Country Director submissions are single-tier — T1 is always final
    if (isFomSubmission(oc)) return tier === 1;
    if (hasThreeTiers(oc)) return tier === 3;
    return tier === 2;
  };

  const shouldRequireSignature = (_oc: OperationalCostSubmission, _tier: 1 | 2 | 3): boolean => {
    if (isSuperAdmin || isAdmin) return true;
    return isFinalTier(_oc, _tier);
  };

  const handleApprovalAction = async () => {
    const { action, tier, submission } = approvalDialog;
    if (!submission || !currentUser?.id) return;

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
        notes: approvalNotes,
      });
      setApprovalDialog({ open: false, action: 'approve', tier, submission: null });
      setApprovalProcessing(false);
      return;
    }

    await processApproval(action, tier, submission, approvalNotes, undefined, uploadedDocs);
    setApprovalAttachments([]);
    pendingApprovalDocsRef.current = [];
  };

  const processApproval = async (
    action: 'approve' | 'reject',
    tier: 1 | 2 | 3,
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
          // FOM/Country Director submissions: single-tier — T1 approval finalises the record
          if (isFomSubmission(submission)) {
            updates.tier2_status = 'approved';
            updates.tier2_approved_by = currentUser.id;
            updates.tier2_approved_at = new Date().toISOString();
            updates.tier2_notes = `[Auto-approved: single-tier FOM flow — T2 not required]`;
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
            updates.status = 'approved';
          } else {
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
          updates.status = 'approved';
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 3 / تم الرفض في المرحلة الثالثة';
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
        console.error('Approval error:', error);
        toast({
          title: "Action Failed / فشل الإجراء",
          description: error.message || "Could not process the approval action. Please try again. / تعذرت معالجة إجراء الموافقة. يرجى المحاولة مرة أخرى.",
          variant: "destructive",
          duration: 8000,
        });
      } else if (!updatedRows || updatedRows.length === 0) {
        console.error('[CostApproval] Update matched 0 rows. This is likely a database security policy (RLS) issue.', {
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
      } else {
        const tierArMap: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' };
        const tierAr = tierArMap[tier] || '';
        const submitterName = users.find(u => u.id === submission.submitted_by)?.name || 'the submitter';
        const refNum = submission.reference_number || submission.id.substring(0, 8).toUpperCase();
        const amountStr = `${submission.currency} ${(submission.amount_cents / 100).toLocaleString()}`;
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

        // Notify the submitter of the outcome
        if (submission.submitted_by) {
          const approverName = (currentUser as any)?.name || (currentUser as any)?.fullName || 'Reviewer';
          NotificationTriggerService.send({
            userId: submission.submitted_by,
            title: action === 'approve'
              ? isFinal
                ? 'Cost Submission Fully Approved / تمت الموافقة الكاملة على المطالبة'
                : `Cost Submission: Tier ${tier} Approved / تمت الموافقة على المرحلة ${tier}`
              : 'Cost Submission Rejected / تم رفض المطالبة',
            message: action === 'approve'
              ? isFinal
                ? `Your cost submission "${refNum}" (${amountStr}) has been fully approved by ${approverName} and cleared for payment.`
                : `Your cost submission "${refNum}" (${amountStr}) has been approved at Tier ${tier} by ${approverName} and moved to the next review stage.`
              : `Your cost submission "${refNum}" (${amountStr}) was rejected at Tier ${tier} by ${approverName}. Reason: ${notes || 'Not specified'}. You may edit and resubmit.`,
            type: action === 'approve' ? 'success' : 'error',
            category: 'financial',
            priority: action === 'approve' ? (isFinal ? 'high' : 'normal') : 'high',
            link: '/cost-submission',
            sendEmail: isFinal || action === 'reject',
            emailActionLabel: 'View Submission',
          }).catch(console.warn);
        }

        fetchOperationalCosts();
      }
    } catch (err) {
      console.error('Approval error:', err);
      toast({
        title: "Action Failed / فشل الإجراء",
        description: "An unexpected error occurred. Please try again. / حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setApprovalProcessing(false);
      setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null });
      setApprovalNotes('');
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
    const { submission, notes, tier, isBypass } = signatureModal;
    if (!submission) return;
    signatureCompletedRef.current = true;
    if (isBypass) {
      processFOMBypassApproval(submission, notes, signatureData);
    } else {
      const pendingDocs = pendingApprovalDocsRef.current;
      pendingApprovalDocsRef.current = [];
      setApprovalAttachments([]);
      processApproval('approve', tier, submission, notes, signatureData, pendingDocs);
    }
    setTimeout(() => {
      setSignatureModal({ open: false, submission: null, tier: 2, notes: '', isBypass: false });
    }, 100);
  };

  const handleDownloadCertificate = async (oc: OperationalCostSubmission) => {
    const submitter = users.find(u => u.id === oc.submitted_by);
    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
    const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;

    let signatureImageData: string | null = null;
    if (oc.tier2_notes) {
      const sigMatch = oc.tier2_notes.match(/ID:\s*(\S+?)(?:\s*\||$)/);
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

    if (!signatureImageData && oc.tier2_approved_by) {
      try {
        const { data: savedSigs } = await supabase
          .from('handwriting_signatures')
          .select('signature_image')
          .eq('user_id', oc.tier2_approved_by)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
          signatureImageData = savedSigs[0].signature_image;
        }
      } catch { /* no saved signature, continue without */ }
    }

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
        signatureImageData,
      },
    });

    toast({
      title: 'Confirmation Downloaded / تم تحميل التأكيد',
      description: 'The approval confirmation PDF has been saved to your device. / تم حفظ تأكيد الموافقة بصيغة PDF على جهازك.',
    });
  };

  const canEditSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canDeleteSubmission = (oc: OperationalCostSubmission): boolean => {
    if (isSuperAdmin) return true;
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'pending') return false;
    if (isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
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
      const changeNote = `[Admin edit by ${currentUser?.full_name || currentUser?.email || 'Admin'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}: ${editItemFields.reason}]`;
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

  const handleSendBack = async () => {
    if (!sendBackDialog.item || !sendBackComment.trim()) return;
    setSendBackSubmitting(true);
    try {
      const oc = sendBackDialog.item;
      const commentNote = `[Sent back by ${currentUser?.full_name || currentUser?.email || 'Approver'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}: ${sendBackComment}]`;
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
      }).in('id', allGroupIds);
      if (error) throw error;
      toast({ title: 'Sent back for revision', description: `${allGroupIds.length > 1 ? `${allGroupIds.length} items` : 'Request'} returned to the submitter.` });
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
    return isSuperAdmin || isAdmin;
  };

  const canMarkAsPaid = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'approved') return false;
    return isSuperAdmin || isAdmin || isFinanceAdmin;
  };

  const openMarkAsPaidDialog = (oc: OperationalCostSubmission) => {
    setMarkAsPaidDialog({ open: true, submission: oc, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
  };

  const handleMarkAsPaidProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setMarkAsPaidDialog(prev => ({ ...prev, proofFile: file, proofPreviewUrl: previewUrl }));
  };

  const handleConfirmMarkAsPaid = async () => {
    const { submission: oc, proofFile, notes } = markAsPaidDialog;
    if (!oc || !currentUser?.id) return;
    if (!proofFile) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Please attach a payment receipt before confirming. / يرجى إرفاق إيصال الدفع قبل التأكيد.", variant: "destructive" });
      return;
    }
    setMarkAsPaidDialog(prev => ({ ...prev, uploading: true }));
    setActionProcessing(true);
    try {
      let proofUrl: string | null = null;

      if (proofFile) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'file';
        const filePath = `payment-proofs/${timestamp}_${random}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from('mmp-files')
          .upload(filePath, proofFile, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(uploadErr.message);
        proofUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status: 'paid',
        paid_at: now,
        paid_by: currentUser.id,
        updated_at: now,
        ...(proofUrl ? { payment_proof_url: proofUrl, payment_proof_uploaded_at: now } : {}),
        ...(notes.trim() ? { payment_proof_notes: notes.trim() } : {}),
      };

      const { error } = await supabase
        .from('operational_cost_submissions')
        .update(updatePayload)
        .eq('id', oc.id);

      if (error) {
        toast({ title: "Failed / فشل", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Payment Sent / تم إرسال الدفعة",
          description: "Marked as paid. The recipient can now view the receipt and confirm in their Cost Submissions tab. / تم التحديد كمدفوع. يمكن للمستلم الآن الاطلاع على الإيصال والتأكيد."
        });
        // Notify the submitter
        const amount = (oc.amount_cents / 100).toLocaleString();
        NotificationTriggerService.send({
          userId: oc.submitted_by,
          title: 'Cost Submission Paid / تم صرف المطالبة',
          message: `Your cost submission "${oc.reference_number || oc.id.slice(0, 8)}" (${oc.currency} ${amount}) has been paid. Please confirm receipt in your Cost Submissions tab.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/cost-submission',
          sendEmail: true,
          emailActionLabel: 'View Submission',
        }).catch(console.error);
        setMarkAsPaidDialog({ open: false, submission: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
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
    setBatchCostPayDialog({ open: true, submissions: eligible, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
  };

  const handleBatchCostPayProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setBatchCostPayDialog(prev => ({ ...prev, proofFile: file, proofPreviewUrl: previewUrl }));
  };

  const handleConfirmBatchCostPay = async () => {
    const { submissions: subs, proofFile, notes } = batchCostPayDialog;
    if (!currentUser?.id || subs.length === 0) return;
    if (!proofFile) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Attach one receipt that covers all selected payments.", variant: "destructive" });
      return;
    }
    setBatchCostPayDialog(prev => ({ ...prev, uploading: true }));
    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'file';
      const filePath = `payment-proofs/batch_cost_${timestamp}_${random}.${extension}`;
      const { error: uploadErr } = await supabase.storage.from('mmp-files').upload(filePath, proofFile, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
      const proofUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
      const now = new Date().toISOString();

      let successCount = 0;
      let failCount = 0;
      for (const sub of subs) {
        const { error } = await supabase.from('operational_cost_submissions').update({
          status: 'paid',
          paid_at: now,
          paid_by: currentUser.id,
          updated_at: now,
          payment_proof_url: proofUrl,
          payment_proof_uploaded_at: now,
          ...(notes.trim() ? { payment_proof_notes: notes.trim() } : {}),
        }).eq('id', sub.id);
        if (error) { failCount++; } else { successCount++; }
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
        NotificationTriggerService.send({
          userId,
          title: isSingle
            ? 'Cost Submission Paid / تم صرف المطالبة'
            : `${items.length} Cost Submissions Paid / تم صرف ${items.length} مطالبات`,
          message: isSingle
            ? `Your cost submission "${items[0].ref}" (${currency} ${items[0].amount.toLocaleString()}) has been paid. Please confirm receipt in your Cost Submissions tab.`
            : `${items.length} of your cost submissions have been paid.\n\nTotal: ${currency} ${total.toLocaleString()}\n\n${breakdown}\n\nPlease confirm receipt in your Cost Submissions tab.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/cost-submission',
          sendEmail: true,
          emailActionLabel: 'View Submissions',
        }).catch(console.error);
      });

      toast({
        title: `Batch Payment Complete / اكتمل الدفع الجماعي`,
        description: `${successCount} submission${successCount > 1 ? 's' : ''} paid with one shared receipt${failCount > 0 ? ` · ${failCount} failed` : ''}.`,
      });
      setBatchCostPayDialog({ open: false, submissions: [], proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
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
    return isSuperAdmin || isAdmin;
  };

  const cachedRecipientsRef = useRef<Array<{ id: string; email: string; name: string; role: string }> | null>(null);
  const [ccContacts, setCcContacts] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);

  useEffect(() => {
    const preloadRecipients = async () => {
      try {
        const { data: financeUsers } = await supabase
          .from('profiles')
          .select('id, email, full_name, role')
          .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
          .eq('status', 'approved');
        cachedRecipientsRef.current = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
      } catch {}
    };
    preloadRecipients();
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

  const openPaymentRequestDialog = async (oc: OperationalCostSubmission) => {
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

  const openBulkCostEmailDialog = (forceSubmission?: OperationalCostSubmission) => {
    const allApproved = operationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved');
    const approvedSubs = forceSubmission
      ? [forceSubmission]
      : selectedCostIds.size > 0
        ? allApproved.filter(o => selectedCostIds.has(o.id))
        : allApproved;
    const totalSdg = approvedSubs.reduce((sum, oc) => {
      const cents = (oc as any).amount_cents || 0;
      const direct = (oc as any).total_amount || (oc as any).amount || 0;
      return sum + (cents > 0 ? cents / 100 : direct);
    }, 0);
    setBulkCostEmailDialog({ step: 'rate', open: true, usdRate: '', totalSdg, count: approvedSubs.length, approvedSubmissions: approvedSubs, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
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

      try {
        const pdfBase64 = generateBulkCostPDFBase64(bulkSubs, approverName, totalSdg, effectiveRate, userMap, projectMap);
        pdfAttachment = {
          base64: pdfBase64,
          filename: `PACT_Approved_Costs_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      } catch (pdfErr) {
        console.warn('[BulkEmail] PDF generation failed:', pdfErr);
      }

      try {
        const excelBase64 = await generateBulkCostExcelBase64(bulkSubs, approverName, effectiveRate, userMap, projectMap);
        excelAttachment = {
          base64: excelBase64,
          filename: `PACT_Approved_Costs_${new Date().toISOString().slice(0, 10)}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      } catch (xlErr) {
        console.warn('[BulkEmail] Excel generation failed:', xlErr);
      }

      const recalcTotalSdg = approvedSubmissions.reduce((sum, s) => {
        const fromCents = s.amount_cents && s.amount_cents > 0 ? s.amount_cents / 100 : 0;
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
      const totalAmount = (oc as any).total_amount || (oc as any).amount || (oc as any).amount_cents || 0;
      const requestId = oc.id?.slice(0, 8)?.toUpperCase() || 'N/A';

      let pdfAttachment: { base64: string; filename: string } | undefined;
      try {
        const tier1Approver = (oc as any).tier1_approved_by ? users?.find(u => u.id === (oc as any).tier1_approved_by) : null;
        const tier2Approver = (oc as any).tier2_approved_by ? users?.find(u => u.id === (oc as any).tier2_approved_by) : null;

        let signatureImageData: string | null = null;
        if ((oc as any).tier2_notes) {
          const sigMatch = ((oc as any).tier2_notes as string).match(/ID:\s*(\S+?)(?:\s*\||$)/);
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
            signatureImageData,
          },
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
        (oc as any).funding_type || 'advance',
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
      let query = supabase
        .from('operational_cost_submissions')
        .delete()
        .eq('id', deleteConfirm.id);

      if (!isSuperAdmin) {
        query = query.eq('tier1_status', 'pending').eq('tier2_status', 'pending');
      }

      const { error } = await query;

      if (error) {
        toast({ title: "Delete Failed / فشل الحذف", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Deleted / تم الحذف", description: "The submission has been deleted. / تم حذف الطلب." });
        fetchOperationalCosts();
      }
    } catch (err) {
      toast({ title: "Error / خطأ", description: "Failed to delete submission. / فشل في حذف الطلب.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
      setDeleteConfirm(null);
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

  return (
    <div className="container mx-auto p-6 max-w-7xl">
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
                {isSupervisor && !isAdmin && !isSuperAdmin && (
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300">
                    <Users className="h-3 w-3 mr-1" />
                    Supervisor View
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isAdmin || isSuperAdmin
                  ? "Review, approve, and track cost submissions from all team members"
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
                onClick={openBulkCostEmailDialog}
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

      <PageInfoBanner
        title="Cost Submission - Operational Expenses"
        description="This page is for submitting OPERATIONAL COSTS you have already spent during fieldwork -- things like transportation, accommodation, communication, supplies, and other work-related expenses (9 categories available). This is DIFFERENT from wallet withdrawals (taking money out of your wallet -- use My Wallet page) and transportation advances (getting money upfront before a trip -- use Down-Payment Approval page). Here you are requesting REIMBURSEMENT for expenses already incurred. Each submission goes through a two-tier approval before the amount is credited to your wallet."
        descriptionAr="هذه الصفحة مخصصة لتقديم التكاليف التشغيلية التي أنفقتها أثناء العمل الميداني -- مثل النقل، والإقامة، والاتصالات، والمستلزمات، وغيرها من المصاريف المتعلقة بالعمل (٩ فئات متاحة). هذه الصفحة مختلفة عن سحب المحفظة (سحب الأموال من محفظتك -- استخدم صفحة محفظتي) وعن السلف المسبقة للنقل (الحصول على أموال مقدماً قبل الرحلة -- استخدم صفحة الموافقة على الدفعات المقدمة). هنا أنت تطلب استرداد مصاريف تم إنفاقها بالفعل. كل طلب يمر بموافقة على مستويين قبل إضافة المبلغ إلى محفظتك."
        workflowSteps={[
          { step: 1, role: 'Field Staff', action: 'Submits expense (YOU ARE HERE)', description: 'Fill in cost details, select the expense category, attach receipts if needed, and submit for review.' },
          { step: 2, role: 'Supervisor', action: 'Reviews submission (Tier 1)', description: 'Your supervisor checks the expense is legitimate, then approves, rejects, or sends it back for edits.' },
          { step: 3, role: 'Admin', action: 'Final approval with signature (Tier 2)', description: 'Admin or Finance Admin gives final approval and signs digitally. An approval certificate PDF is generated.' },
          { step: 4, role: 'System', action: 'Credits your wallet', description: 'The approved amount is automatically added to your wallet balance. You can then request a withdrawal from the My Wallet page.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'موظف ميداني', action: 'يقدم المصروف (أنت هنا)', description: 'قم بملء تفاصيل التكلفة، واختر فئة المصروف، وأرفق الإيصالات إن لزم الأمر، ثم أرسل للمراجعة.' },
          { step: 2, role: 'المشرف', action: 'يراجع الطلب (المستوى الأول)', description: 'يتحقق مشرفك من صحة المصروف، ثم يوافق عليه أو يرفضه أو يعيده للتعديل.' },
          { step: 3, role: 'المدير', action: 'الموافقة النهائية مع التوقيع (المستوى الثاني)', description: 'يمنح المدير أو مدير المالية الموافقة النهائية ويوقّع رقمياً. يتم إنشاء شهادة موافقة بصيغة PDF.' },
          { step: 4, role: 'النظام', action: 'يُضيف رصيداً لمحفظتك', description: 'يُضاف المبلغ المعتمد تلقائياً إلى رصيد محفظتك. يمكنك بعدها طلب سحب من صفحة محفظتي.' },
        ]}
      />

      {/* Supervisor Hub Overview — only visible to supervisors (not admins) */}
      {isSupervisor && !isAdmin && !isSuperAdmin && (() => {
        const pendingTier1 = operationalCosts.filter(oc => canTier1Approve(oc));
        const totalPendingAmt = pendingTier1.reduce((s, oc) => s + oc.amount_cents / 100, 0);
        const submitterMap: Record<string, { name: string; count: number; total: number; currency: string }> = {};
        pendingTier1.forEach(oc => {
          const profile = users.find(u => u.id === oc.submitted_by);
          const name = (profile as any)?.fullName || (profile as any)?.full_name || (profile as any)?.name || oc.submitted_by || 'Unknown';
          if (!submitterMap[oc.submitted_by]) submitterMap[oc.submitted_by] = { name, count: 0, total: 0, currency: oc.currency };
          submitterMap[oc.submitted_by].count++;
          submitterMap[oc.submitted_by].total += oc.amount_cents / 100;
        });
        const submitters = Object.values(submitterMap).sort((a, b) => b.total - a.total);
        return (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-4 sm:p-5 mb-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Users className="h-4 w-4 text-white" />
              </div>
              <h2 className="font-semibold text-blue-900 dark:text-blue-100 text-sm sm:text-base">Hub Overview — Pending Your Approval</h2>
              {pendingTier1.length > 0 && (
                <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {pendingTier1.length}
                </span>
              )}
            </div>
            {pendingTier1.length === 0 ? (
              <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                All caught up — no pending Tier 1 approvals in your hub.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  {pendingTier1.length} submission{pendingTier1.length !== 1 ? 's' : ''} from {submitters.length} team member{submitters.length !== 1 ? 's' : ''} totalling <strong>SDG {totalPendingAmt.toLocaleString()}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  {submitters.map(s => (
                    <div key={s.name} className="flex items-center gap-1.5 bg-white dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg px-2.5 py-1.5 text-xs">
                      <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-blue-900 dark:text-blue-100 max-w-[100px] truncate">{s.name}</span>
                      <span className="text-blue-500 dark:text-blue-400 shrink-0">{s.count} × {s.currency} {s.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
                    <strong>Coordinator submits:</strong> Supervisor reviews.<br/>
                    <strong>Supervisor submits:</strong> FOM/Country Director reviews.
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الأولى: المنسق → المشرف | المشرف → مدير العمليات الميدانية
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h4 className="font-semibold text-sm">Tier 2 Review</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Coordinator:</strong> FOM/Country Director reviews.<br/>
                    <strong>Supervisor:</strong> Admin final approval (with signature).
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الثانية: المنسق → مدير العمليات | المشرف → المسؤول (موافقة نهائية مع التوقيع)
                  </p>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">4</div>
                    <h4 className="font-semibold text-sm">Tier 3 (Coordinators Only)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin/Super Admin gives final approval with digital signature. Only applies to Coordinator submissions (3-tier workflow).
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الثالثة (للمنسقين فقط): المسؤول يوافق نهائياً بالتوقيع الرقمي.
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
            {canSubmitOperationalCosts && (
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
            
            {/* Outstanding */}
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
            
            {/* Reconciliation */}
            <TabsTrigger 
              value="reconciliation" 
              data-testid="tab-reconciliation" 
              className="relative flex-1 min-w-[130px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Reconciliation</span>
              <span className="sm:hidden">Reconcile</span>
            </TabsTrigger>
            
            {/* History */}
            <TabsTrigger 
              value="history" 
              data-testid="tab-history" 
              className="relative flex-1 min-w-[140px] gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/25 data-[state=inactive]:text-slate-600 data-[state=inactive]:dark:text-slate-400 data-[state=inactive]:hover:bg-slate-200/50 data-[state=inactive]:dark:hover:bg-slate-700/50"
            >
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">
                {(isAdmin || isSuperAdmin) ? "All Submissions" : isSupervisor ? "Team" : "My Submissions"}
              </span>
              <span className="sm:hidden">History</span>
              {submissionStats.total > 0 && activeTab !== "history" && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0">
                  {submissionStats.total}
                </Badge>
              )}
            </TabsTrigger>

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
        {canSubmitOperationalCosts && (
          <TabsContent value="submit" className="space-y-4">
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
            <UnifiedCostRequestForm 
              key={editingSubmission?.id || 'new'}
              projects={projectsForForm}
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
                supporting_documents: editingSubmission.supporting_documents,
                status: editingSubmission.status,
              } : null}
              onCancelEdit={() => {
                setEditingSubmission(null);
                setActiveTab("history");
              }}
              onSuccess={() => {
                setEditingSubmission(null);
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
                  onClick={openBulkCostEmailDialog}
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
                  {(isAdmin || isSuperAdmin) ? "All Cost Submissions" : isSupervisor ? "Team Submissions" : "My Submissions"}
                </CardTitle>
              </div>
              <CardDescription>
                {(isAdmin || isSuperAdmin)
                  ? "Review and manage all cost submissions across the organization. Approve, reject, or request more information."
                  : isSupervisor
                    ? "Review cost submissions from your team members. Verify and forward for admin approval."
                    : "Track the status of your submitted costs and view approval history."
                }
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="status-filter-bar">
            {([
              { key: 'all', label: 'All', labelAr: 'الكل', count: filteredOperationalCosts.length, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
              { key: 'pending', label: 'Pending', labelAr: 'معلق', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
              { key: 'under_review', label: 'In Review', labelAr: 'قيد المراجعة', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
              { key: 'approved', label: 'Approved', labelAr: 'موافق', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length, color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
              { key: 'rejected', label: 'Rejected', labelAr: 'مرفوض', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length, color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
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

          {/* Batch Pay selection bar — visible only on the Approved tab when ≥1 payable submission exists */}
          {(() => {
            if (statusFilter !== 'approved') return null;
            const payableOcs = filteredOperationalCosts.filter(canMarkAsPaid);
            const selectedPayable = payableOcs.filter(oc => selectedCostIds.has(oc.id));
            if (payableOcs.length === 0) return null;
            return (
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (selectedPayable.length === payableOcs.length) {
                        setSelectedCostIds(prev => {
                          const next = new Set(prev);
                          payableOcs.forEach(oc => next.delete(oc.id));
                          return next;
                        });
                      } else {
                        setSelectedCostIds(prev => {
                          const next = new Set(prev);
                          payableOcs.forEach(oc => next.add(oc.id));
                          return next;
                        });
                      }
                    }}
                    data-testid="button-select-all-payable"
                  >
                    {selectedPayable.length === payableOcs.length ? 'Deselect All' : `Select All Approved (${payableOcs.length})`}
                  </Button>
                  {selectedPayable.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selectedPayable.length} selected · {selectedPayable[0].currency} {selectedPayable.reduce((s, oc) => s + oc.amount_cents / 100, 0).toLocaleString()} total
                    </span>
                  )}
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

            // Build ordered group list — items sharing request_group_id become one entry
            type OcGroup = { groupId: string | null; items: typeof statusFiltered };
            const ocGroups: OcGroup[] = [];
            const seenGroupIds = new Set<string>();
            for (const oc of statusFiltered) {
              const gid = oc.request_group_id ?? null;
              if (gid && seenGroupIds.has(gid)) continue;
              if (gid) {
                seenGroupIds.add(gid);
                ocGroups.push({ groupId: gid, items: statusFiltered.filter(o => o.request_group_id === gid) });
              } else {
                ocGroups.push({ groupId: null, items: [oc] });
              }
            }

            return statusFiltered.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">Operational Cost Requests</CardTitle>
                    <Badge variant="secondary">{ocGroups.length}</Badge>
                    {ocGroups.length !== statusFiltered.length && (
                      <span className="text-xs text-muted-foreground">({statusFiltered.length} items)</span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ocGroups.map(({ groupId, items: groupItems }) => {
                    const isMultiItem = groupItems.length > 1;

                    // GROUP HEADER (only for multi-item groups) — navy gradient with collapse/expand
                    const GroupHeader = isMultiItem ? (() => {
                      const totalCents = groupItems.reduce((s, o) => s + o.amount_cents, 0);
                      const currency = groupItems[0].currency;
                      const groupTitle = groupItems[0].request_title
                        || groupItems[0].description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '')
                        || 'Grouped Request';
                      const submitterName = users.find(u => u.id === groupItems[0].submitted_by)?.name || 'Unknown';
                      const linkedProjectName = groupItems[0].project_id ? allProjects.find(p => p.id === groupItems[0].project_id)?.name : null;
                      const projPalette = getProjectPalette(groupItems[0].project_id);
                      const groupApprovableTier: 1 | 2 | 3 | null =
                        groupItems.some(o => canTier1Approve(o)) ? 1 :
                        groupItems.some(o => canTier2Approve(o)) ? 2 :
                        groupItems.some(o => canTier3Approve(o)) ? 3 : null;
                      const approvedCnt = groupItems.filter(o => getOperationalDerivedStatus(o) === 'approved' || getOperationalDerivedStatus(o) === 'paid').length;
                      const rejectedCnt = groupItems.filter(o => getOperationalDerivedStatus(o) === 'rejected').length;
                      const pendingCnt = groupItems.length - approvedCnt - rejectedCnt;
                      const isExpanded = expandedGroups.has(groupId!);

                      return (
                        <div>
                          {/* Clickable navy header */}
                          <button
                            className="w-full text-left focus:outline-none"
                            onClick={() => toggleGroup(groupId!)}
                            data-testid={`button-group-toggle-${groupId}`}
                          >
                            <div
                              className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-4 py-3"
                              style={{ borderLeft: `4px solid ${projPalette.border}` }}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-none mt-0.5">
                                  <Layers className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <p className="font-semibold text-[14px] leading-snug text-white line-clamp-2">{groupTitle}</p>
                                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                    {linkedProjectName && (
                                      <span
                                        className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                                        style={{ backgroundColor: projPalette.bg, color: projPalette.text, border: `1px solid ${projPalette.border}40` }}
                                      >
                                        <Briefcase className="h-3 w-3" />{linkedProjectName}
                                      </span>
                                    )}
                                    {canViewTeamSubmissions && <span className="flex items-center gap-1 text-white/60"><Users className="h-3 w-3" />{submitterName}</span>}
                                    <span className="flex items-center gap-1 text-white/60"><Calendar className="h-3 w-3" />{format(new Date(groupItems[0].created_at), 'MMM d, yyyy')}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                                      <Layers className="h-2.5 w-2.5" /> {groupItems.length} expense items
                                    </span>
                                    {approvedCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/25 px-2 py-0.5 text-[10px] font-semibold text-green-300">
                                        <CheckCircle2 className="h-2.5 w-2.5" /> {approvedCnt} approved
                                      </span>
                                    )}
                                    {pendingCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                        <Clock className="h-2.5 w-2.5" /> {pendingCnt} pending
                                      </span>
                                    )}
                                    {rejectedCnt > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                                        <AlertCircle className="h-2.5 w-2.5" /> {rejectedCnt} rejected
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-none text-right space-y-1">
                                  <p className="font-bold text-base tabular-nums text-white">{currency} {(totalCents / 100).toLocaleString()}</p>
                                  <p className="text-[10px] text-white/50">Total</p>
                                  <div className="flex items-center justify-end gap-1 text-white/60 text-[11px] mt-1">
                                    {isExpanded
                                      ? <><ChevronDown className="h-4 w-4" /><span>Collapse</span></>
                                      : <><ChevronRight className="h-4 w-4" /><span>Expand</span></>
                                    }
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1 bg-[#0F2041] flex">
                              <div className="bg-green-400 transition-all duration-300" style={{ width: `${(approvedCnt / groupItems.length) * 100}%` }} />
                              <div className="bg-amber-400 transition-all duration-300" style={{ width: `${(pendingCnt / groupItems.length) * 100}%` }} />
                              <div className="bg-red-400 transition-all duration-300" style={{ width: `${(rejectedCnt / groupItems.length) * 100}%` }} />
                            </div>
                          </button>

                          {/* Approve All / Reject All — shown when expanded */}
                          {isExpanded && groupApprovableTier !== null && groupId && (
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F2041]/5 border-b border-[#1D3461]/10 flex-wrap">
                              <span className="text-[11px] text-muted-foreground italic flex-1">Review items individually below, or:</span>
                              <Button size="sm" className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => openGroupApprovalDialog(groupId, groupTitle, groupItems, 'approve', groupApprovableTier)}
                                data-testid={`button-group-approve-all-${groupId}`}>
                                <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve All T{groupApprovableTier}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-3 text-xs"
                                onClick={() => openGroupApprovalDialog(groupId, groupTitle, groupItems, 'reject', groupApprovableTier)}
                                data-testid={`button-group-reject-all-${groupId}`}>
                                <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject All
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })() : null;

                    const itemElements = groupItems.map((oc) => {
                    const catMeta = EXPENSE_CATEGORY_MAP[oc.expense_category];
                    const CatIcon = catMeta?.icon;
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                      under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                      approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                      rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                      paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
                      reconciled: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
                    };
                    const derivedStatus = getOperationalDerivedStatus(oc);
                    const pendingTierLabel = oc.tier1_status === 'pending' ? '1' : oc.tier2_status === 'pending' ? '2' : hasThreeTiers(oc) && oc.tier3_status === 'pending' ? '3' : '?';
                    const statusLabels: Record<string, string> = {
                      pending: `Pending (Tier ${pendingTierLabel}) / معلق (المرحلة ${pendingTierLabel})`,
                      under_review: `In Review (Tier ${pendingTierLabel}) / قيد المراجعة (المرحلة ${pendingTierLabel})`,
                      approved: 'Approved / تمت الموافقة',
                      rejected: 'Rejected / مرفوض',
                      paid: 'Paid / تم الدفع',
                      reconciled: 'Reconciled / مسوّى',
                    };
                    const submitterName = users.find(u => u.id === oc.submitted_by)?.name || 'Unknown';
                    const title = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';
                    const linkedProjectName = oc.project_id ? allProjects.find(p => p.id === oc.project_id)?.name : null;
                    const requestId = oc.reference_number || oc.id.substring(0, 8).toUpperCase();

                    const cleanTier1Notes = oc.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier2Notes = oc.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier3Notes = (oc as any).tier3_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
                    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
                    const tier3Approver = oc.tier3_approved_by ? users.find(u => u.id === oc.tier3_approved_by) : null;
                    const hasSig = oc.tier2_notes?.includes('[Signed:') || (oc as any).tier3_notes?.includes('[Signed:') || oc.tier1_notes?.includes('[Signed:');

                    return (
                      <div
                        key={oc.id}
                        className={`p-4 space-y-3 transition-colors ${selectedCostIds.has(oc.id) ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}
                        data-testid={`operational-cost-${oc.id}`}
                      >
                          {canMarkAsPaid(oc) && (
                            <div className="flex items-center gap-2 mb-1">
                              <Checkbox
                                id={`select-cost-${oc.id}`}
                                checked={selectedCostIds.has(oc.id)}
                                onCheckedChange={() => toggleCostSelection(oc.id)}
                                data-testid={`checkbox-select-cost-${oc.id}`}
                              />
                              <label htmlFor={`select-cost-${oc.id}`} className="text-xs text-muted-foreground cursor-pointer">Select for batch payment</label>
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  {CatIcon && <CatIcon className="h-3 w-3" />}
                                  {catMeta?.label || oc.expense_category}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1 font-medium">
                                  <FileText className="h-3 w-3" />
                                  ID: {requestId}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {oc.created_at ? format(new Date(oc.created_at), 'MMM d, yyyy') : 'N/A'}
                                </span>
                                {oc.vendor && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {oc.vendor}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className="font-bold text-lg tabular-nums" data-testid={`text-amount-${oc.id}`}>
                                {oc.currency} {(oc.amount_cents / 100).toLocaleString()}
                              </span>
                              <Badge className={`text-xs border-0 ${statusColors[derivedStatus] || statusColors.pending}`}>
                                {statusLabels[derivedStatus] || derivedStatus}
                              </Badge>
                              {/* Quick action buttons — visible at top of card for admins */}
                              {canMarkAsPaid(oc) && (
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={() => handleMarkAsPaid(oc)}
                                  disabled={actionProcessing}
                                  data-testid={`button-quick-mark-paid-${oc.id}`}
                                  className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <Wallet className="h-3 w-3 mr-1" />
                                  Mark Paid
                                </Button>
                              )}
                              {canRequestPayment(oc) && (
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => openPaymentRequestDialog(oc)}
                                  disabled={actionProcessing}
                                  data-testid={`button-quick-request-payment-${oc.id}`}
                                  className="h-7 px-2.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                  <Mail className="h-3 w-3 mr-1" />
                                  Send to Finance
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2" data-testid={`status-progress-${oc.id}`}>
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
                                return (
                                  <>
                                    {tierStatusBadge(oc.tier1_status, threeTier ? 'T1 Sup' : 'T1', `status-tier1-${oc.id}`)}
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    {tierStatusBadge(oc.tier2_status, threeTier ? 'T2 FOM' : 'T2', `status-tier2-${oc.id}`)}
                                    {threeTier && (
                                      <>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                        {tierStatusBadge(oc.tier3_status, 'T3 Admin', `status-tier3-${oc.id}`)}
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
                                </>
                              )}
                            </div>
                          </div>

                          {(cleanTier1Notes || cleanTier2Notes || oc.rejection_reason) && (
                            <div className="space-y-1.5 pt-1 border-t" data-testid={`notes-section-${oc.id}`}>
                              {cleanTier1Notes && (
                                <div className="flex items-start gap-2 text-xs" data-testid={`text-tier1-notes-${oc.id}`}>
                                  <span className="font-medium text-muted-foreground shrink-0 mt-px">T1:</span>
                                  <span className="text-muted-foreground">
                                    {cleanTier1Notes}
                                    {tier1Approver && (
                                      <span className="opacity-60"> — {tier1Approver.name || tier1Approver.email}</span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {cleanTier2Notes && (
                                <div className="flex items-start gap-2 text-xs" data-testid={`text-tier2-notes-${oc.id}`}>
                                  <span className="font-medium text-muted-foreground shrink-0 mt-px">T2:</span>
                                  <div className="text-muted-foreground">
                                    <span>
                                      {cleanTier2Notes}
                                      {tier2Approver && (
                                        <span className="opacity-60"> — {tier2Approver.name || tier2Approver.email}</span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {oc.rejection_reason && (
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
                                      <p className="text-red-500/80 dark:text-red-400/80 italic">
                                        You can edit and resubmit this request. / يمكنك تعديل الطلب وإعادة تقديمه.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
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
                                  <a
                                    key={idx}
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors max-w-[180px]"
                                    data-testid={`link-doc-${oc.id}-${idx}`}
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{doc.filename || `Document ${idx + 1}`}</span>
                                    <Eye className="h-3 w-3 shrink-0 opacity-60" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setViewingSubmission(oc)}
                              data-testid={`button-view-details-${oc.id}`}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View Details
                            </Button>
                            {canTier1Approve(oc) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => openApprovalDialog(oc, 'approve', 1)}
                                  data-testid={`button-tier1-approve-${oc.id}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                  Approve T1
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openApprovalDialog(oc, 'reject', 1)}
                                  data-testid={`button-tier1-reject-${oc.id}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {canTier2Approve(oc) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => openApprovalDialog(oc, 'approve', 2)}
                                  data-testid={`button-tier2-approve-${oc.id}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                  {hasThreeTiers(oc) ? 'Approve T2' : 'Final Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openApprovalDialog(oc, 'reject', 2)}
                                  data-testid={`button-tier2-reject-${oc.id}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {canTier3Approve(oc) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => openApprovalDialog(oc, 'approve', 3)}
                                  data-testid={`button-tier3-approve-${oc.id}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                  Final Approve T3
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openApprovalDialog(oc, 'reject', 3)}
                                  data-testid={`button-tier3-reject-${oc.id}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {canFOMBypass(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-violet-400 text-violet-700 hover:bg-violet-50 dark:border-violet-500 dark:text-violet-300 dark:hover:bg-violet-950"
                                onClick={() => openFOMBypassDialog(oc)}
                                disabled={approvalProcessing}
                                data-testid={`button-fom-bypass-${oc.id}`}
                                title="Skip the normal approval tiers and directly approve this submission to Finance level. Your signature is required."
                              >
                                <Unlock className="h-3.5 w-3.5 mr-1" />
                                Direct Approve
                              </Button>
                            )}
                            {getOperationalDerivedStatus(oc) === 'approved' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadCertificate(oc)}
                                data-testid={`button-download-certificate-${oc.id}`}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                PDF
                              </Button>
                            )}
                            {canRequestPayment(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPaymentRequestDialog(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-request-payment-${oc.id}`}
                              >
                                <Mail className="h-3.5 w-3.5 mr-1" />
                                Request Payment
                              </Button>
                            )}
                            {canMarkAsPaid(oc) && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleMarkAsPaid(oc)}
                                disabled={actionProcessing}
                                data-testid={`button-mark-paid-${oc.id}`}
                              >
                                <Wallet className="h-3.5 w-3.5 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                            {derivedStatus === 'paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveReconciliation(oc);
                                  setActiveTab("reconciliation");
                                }}
                                data-testid={`button-reconcile-${oc.id}`}
                              >
                                <Receipt className="h-3.5 w-3.5 mr-1" />
                                Reconcile
                              </Button>
                            )}
                            {(isSuperAdmin || isAdmin) && !['rejected', 'cancelled', 'reconciled'].includes(derivedStatus) && !canRequestPayment(oc) && !canMarkAsPaid(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openBulkCostEmailDialog(oc)}
                                data-testid={`button-send-finance-${oc.id}`}
                                className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              >
                                <Mail className="h-3.5 w-3.5 mr-1" />
                                Send to Finance
                              </Button>
                            )}
                            <div className="flex-1" />
                            {canEditSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditSubmission(oc)}
                                data-testid={`button-edit-submission-${oc.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                            )}
                            {canDeleteSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteConfirm(oc)}
                                data-testid={`button-delete-submission-${oc.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Delete
                              </Button>
                            )}
                            {canResubmitSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleEditSubmission(oc)}
                                data-testid={`button-resubmit-submission-${oc.id}`}
                              >
                                <SendHorizonal className="h-3.5 w-3.5 mr-1" />
                                Resubmit
                              </Button>
                            )}
                            {canRecallSubmission(oc) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRecallConfirm(oc)}
                                data-testid={`button-recall-submission-${oc.id}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                Recall
                              </Button>
                            )}
                          </div>
                      </div>
                    );
                    }); // end itemElements map

                    if (isMultiItem) {
                      return (
                        <div key={groupId} className="rounded-xl border border-[#1D3461]/20 shadow-sm overflow-hidden">
                          {GroupHeader}
                          {expandedGroups.has(groupId!) && (
                            <div className="divide-y">{itemElements}</div>
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
                                {canViewTeamSubmissions && <span className="flex items-center gap-1 text-white/60"><Users className="h-3 w-3" />{sSubmitter}</span>}
                                <span className="flex items-center gap-1 text-white/60"><Calendar className="h-3 w-3" />{format(new Date(soc.created_at), 'MMM d, yyyy')}</span>
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
              </CardContent>
            </Card>
            ) : !operationalCostsLoading ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-results">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No {statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} submissions found</p>
                <p className="text-xs">لا توجد طلبات {statusFilter !== 'all' ? 'بهذه الحالة' : ''}</p>
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
                                      {sub.payment_proof_url ? (
                                        <a
                                          href={sub.payment_proof_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                        >
                                          <Eye className="h-3 w-3" />View
                                        </a>
                                      ) : (
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
            const linkedProject = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
            const derivedStatus = oc.paid_at ? 'paid' : oc.reconciled_at ? 'reconciled' : oc.status;
            const cleanNote = (n: string | null) => n?.replace(/\[Signed:.*?\]/g, '').trim() || null;
            const pendingTierLabel = oc.tier1_status === 'pending' ? '1' : oc.tier2_status === 'pending' ? '2' : hasThreeTiers(oc) && oc.tier3_status === 'pending' ? '3' : '?';

            const statusColors: Record<string, string> = {
              pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
              under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
              rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
              paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
              reconciled: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
            };
            const statusLabels: Record<string, string> = {
              pending: `Pending (Tier ${pendingTierLabel}) / معلق (المرحلة ${pendingTierLabel})`,
              under_review: `In Review (Tier ${pendingTierLabel}) / قيد المراجعة (المرحلة ${pendingTierLabel})`,
              approved: 'Approved / تمت الموافقة',
              rejected: 'Rejected / مرفوض',
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
                        <p className="font-medium">{submitter?.name || submitter?.email || oc.submitted_by.slice(0, 8)}</p>
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
                      <div className="ml-3 border-l-2 border-dashed border-muted h-3" />
                      <ApprovalStep tier={2} tStatus={oc.tier2_status} tUser={t2User} tAt={oc.tier2_approved_at} tNotes={oc.tier2_notes} />
                      {hasThreeTiers(oc) && (
                        <>
                          <div className="ml-3 border-l-2 border-dashed border-muted h-3" />
                          <ApprovalStep tier={3} tStatus={oc.tier3_status} tUser={t3User} tAt={oc.tier3_approved_at} tNotes={oc.tier3_notes} />
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
                          <div className="px-3 py-2">
                            <a href={oc.payment_proof_url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" /> View Payment Proof
                            </a>
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
                          <a
                            key={idx}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            data-testid={`link-detail-doc-${oc.id}-${idx}`}
                          >
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="flex-1 text-sm text-blue-700 dark:text-blue-300 truncate">{doc.filename || `Document ${idx + 1}`}</span>
                            <Download className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* ── Footer action bar ── */}
                <div className="shrink-0 border-t px-5 py-3 flex items-center justify-between gap-2 bg-muted/20">
                  <Button variant="ghost" size="sm" onClick={() => setViewingSubmission(null)} data-testid="button-detail-close">
                    Close
                  </Button>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {(isSuperAdmin || isAdmin || canTier1Approve(oc) || canTier2Approve(oc) || canTier3Approve(oc)) && !oc.paid_at && !oc.reconciled_at && (
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
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve T3
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
                  ? `الموافقة - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier]}`
                  : `الرفض - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier]}`}
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
                      : `أنت على وشك الموافقة على هذا الطلب (ينتقل إلى المرحلة ${{ 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier + 1] || ''} للمراجعة).`
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
                            <a
                              key={idx}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors max-w-[200px]"
                              data-testid={`link-approval-doc-${idx}`}
                            >
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{doc.filename || `Document ${idx + 1}`}</span>
                              <Eye className="h-3 w-3 shrink-0 opacity-60" />
                            </a>
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
                        <span className="text-muted-foreground ml-1">(Tier {approvalDialog.tier} / المرحلة {{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier]})</span>
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
                  <Label htmlFor="approval-notes">
                    {approvalDialog.action === 'approve' ? 'Approval Notes *' : 'Reason for rejection *'}
                    <span dir="rtl" className="text-xs font-normal text-muted-foreground mr-2">
                      {approvalDialog.action === 'approve' ? '/ ملاحظات الموافقة *' : '/ سبب الرفض *'}
                    </span>
                  </Label>
                  <Textarea
                    id="approval-notes"
                    placeholder={approvalDialog.action === 'approve' ? 'Provide your approval justification... / اكتب مبرر الموافقة...' : 'Explain why this is being rejected... / اشرح سبب الرفض...'}
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    rows={3}
                    data-testid="input-approval-notes"
                  />
                  {!approvalNotes.trim() && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {approvalDialog.action === 'approve' ? 'Approval notes are required to proceed. / ملاحظات الموافقة مطلوبة للمتابعة.' : 'A rejection reason is required. / سبب الرفض مطلوب.'}
                    </p>
                  )}
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
              disabled={approvalProcessing || !approvalNotes.trim()}
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
            const tierLabel: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' };

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
                          {groupApprovalDialog.tier === 3
                            ? `All items will be fully approved and cleared for payment`
                            : `All items will advance to Tier ${groupApprovalDialog.tier + 1} review`}
                        </p>
                        <p className="opacity-80" dir="rtl">
                          {groupApprovalDialog.tier === 3
                            ? 'سيتم اعتماد جميع البنود نهائياً وتمهيدها للدفع'
                            : `ستنتقل جميع البنود إلى المرحلة التالية للمراجعة`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Notes / Reason */}
                  <div className="space-y-1.5">
                    <Label htmlFor="group-approval-notes">
                      {isApprove ? 'Approval Notes' : 'Reason for Rejection'}
                      {!isApprove && <span className="text-red-500 ml-0.5">*</span>}
                      <span dir="rtl" className="text-xs font-normal text-muted-foreground ml-2">
                        {isApprove ? '/ ملاحظات الموافقة' : '/ سبب الرفض *'}
                      </span>
                    </Label>
                    <Textarea
                      id="group-approval-notes"
                      placeholder={isApprove
                        ? 'Optional notes that will apply to all items...'
                        : 'Required — provide a clear reason. This will be shown to the submitter for all rejected items.'}
                      value={groupApprovalNotes}
                      onChange={e => setGroupApprovalNotes(e.target.value)}
                      className="min-h-[72px] resize-none"
                      data-testid="textarea-group-approval-notes"
                    />
                    {!isApprove && !groupApprovalNotes.trim() && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        A rejection reason is required / سبب الرفض مطلوب
                      </p>
                    )}
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
                    onClick={() => { setGroupApprovalDialog(prev => ({ ...prev, open: false })); setGroupApprovalNotes(''); setGroupApprovalAttachments([]); }}
                    disabled={groupApprovalProcessing}
                    data-testid="button-group-approval-cancel"
                  >
                    Cancel / إلغاء
                  </Button>
                  <Button
                    variant={isApprove ? 'default' : 'destructive'}
                    onClick={handleGroupApproval}
                    disabled={groupApprovalProcessing || (!isApprove && !groupApprovalNotes.trim())}
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

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => {
        if (!open && !paymentRequestDialog.sending) {
          setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
        }
      }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="dialog-payment-request-title">
              <Mail className="h-5 w-5" />
              Request Payment
              <span dir="rtl" className="text-sm font-normal text-muted-foreground">/ طلب دفع</span>
            </DialogTitle>
            <DialogDescription>
              Select who should receive the payment request email.
              <span dir="rtl" className="block text-xs mt-1">اختر من سيستلم بريد طلب الدفع.</span>
            </DialogDescription>
          </DialogHeader>

          {paymentRequestDialog.loading ? (
            <div className="flex items-center justify-center py-8">
              <Skeleton className="h-6 w-48" />
            </div>
          ) : paymentRequestDialog.availableRecipients.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              No finance/admin users found.
              <span dir="rtl" className="block text-xs mt-1">لم يتم العثور على مستخدمين في المالية/الإدارة.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="select-all-recipients"
                  checked={paymentRequestDialog.selectedRecipientIds.length === paymentRequestDialog.availableRecipients.length}
                  onCheckedChange={toggleAllPaymentRecipients}
                  data-testid="checkbox-select-all-recipients"
                />
                <Label htmlFor="select-all-recipients" className="text-sm font-medium cursor-pointer">
                  Select All ({paymentRequestDialog.availableRecipients.length})
                  <span dir="rtl" className="text-xs text-muted-foreground mr-2"> / تحديد الكل</span>
                </Label>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {paymentRequestDialog.availableRecipients.map(recipient => (
                  <div key={recipient.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate">
                    <Checkbox
                      id={`recipient-${recipient.id}`}
                      checked={paymentRequestDialog.selectedRecipientIds.includes(recipient.id)}
                      onCheckedChange={() => togglePaymentRecipient(recipient.id)}
                      data-testid={`checkbox-recipient-${recipient.id}`}
                    />
                    <Label htmlFor={`recipient-${recipient.id}`} className="flex-1 cursor-pointer">
                      <div className="text-sm font-medium">{recipient.name}</div>
                      <div className="text-xs text-muted-foreground">{recipient.email}</div>
                    </Label>
                    <Badge variant="secondary" className="text-xs">{recipient.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!paymentRequestDialog.loading && paymentRequestDialog.availableRecipients.length > 0 && (
            <div className="border-t pt-3">
              <EmailCCInput
                ccEmails={paymentRequestDialog.ccEmails}
                onChange={(emails) => setPaymentRequestDialog(prev => ({ ...prev, ccEmails: emails }))}
                contacts={ccContacts.filter(c => !paymentRequestDialog.selectedRecipientIds.includes(c.id))}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
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
              data-testid="button-payment-request-send"
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              {paymentRequestDialog.sending
                ? 'Sending... / جارٍ الإرسال...'
                : `Send to ${paymentRequestDialog.selectedRecipientIds.length} Recipient(s) / إرسال`}
            </Button>
          </DialogFooter>
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

                {/* Warning: no submissions */}
                {bulkCostEmailDialog.count === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      No approved submissions found. The email will be sent without payment details.
                      <span className="block mt-0.5 text-xs opacity-70">لا توجد طلبات موافق عليها.</span>
                    </p>
                  </div>
                )}

                {/* Submissions table */}
                {bulkCostEmailDialog.approvedSubmissions.length > 0 && (
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
                            const amtSdg = (sub.amount_cents || 0) > 0 ? (sub.amount_cents || 0) / 100 : ((sub as any).total_amount || (sub as any).amount || 0);
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

                {/* Exchange Rate Input */}
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
              </div>

              <div className="border-t px-6 py-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <Button type="button" variant="outline" onClick={() => setBulkCostEmailDialog(prev => ({ ...prev, open: false }))}>
                  Cancel / إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={proceedBulkToRecipients}
                  className="bg-[#0F2041] hover:bg-[#1D3461] text-white gap-1.5"
                  data-testid="button-bulk-next-recipients"
                >
                  Next: Choose Recipients
                  <ArrowRight className="h-3.5 w-3.5" />
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
                          <a
                            key={idx}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            data-testid={`link-detail-doc-${idx}`}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[160px] truncate">{doc.filename || `Document ${idx + 1}`}</span>
                            <Eye className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          </a>
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
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Payment Receipt / إيصال الدفع:
                          </p>
                          {oc.payment_proof_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <a href={oc.payment_proof_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={oc.payment_proof_url}
                                alt="Payment receipt"
                                className="max-h-32 rounded border border-purple-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ) : (
                            <a
                              href={oc.payment_proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 underline hover:no-underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              View Payment Receipt / عرض الإيصال
                            </a>
                          )}
                          {oc.payment_proof_notes && (
                            <p className="text-xs text-muted-foreground italic">"{oc.payment_proof_notes}"</p>
                          )}
                        </div>
                      )}
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
              const { submission: sub, notes, tier: modalTier, isBypass } = signatureModal;
              setSignatureModal({ open: false, submission: null, tier: 2, notes: '', isBypass: false });
              setApprovalProcessing(false);
              if (!isBypass && sub) {
                setApprovalNotes(notes);
                setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub });
              }
            }
          }}
          transaction={{
            id: signatureModal.submission.id,
            type: 'cost_submission',
            title: signatureModal.isBypass
              ? `FOM Direct Approval / الموافقة المباشرة من FOM — ${signatureModal.submission.expense_category.replace(/_/g, ' ')}`
              : `Tier ${signatureModal.tier} Approval / الموافقة المرحلة ${signatureModal.tier} - ${signatureModal.submission.expense_category.replace(/_/g, ' ')}`,
            description: signatureModal.isBypass
              ? `Bypassing normal approval flow. This will approve the submission directly to Finance level. / تجاوز تدفق الموافقة الاعتيادي. سيوافق على الطلب مباشرة إلى مستوى المالية.`
              : (signatureModal.submission.description || undefined),
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
            const { submission: sub, notes, tier: modalTier, isBypass } = signatureModal;
            setSignatureModal({ open: false, submission: null, tier: 2, notes: '', isBypass: false });
            setApprovalProcessing(false);
            if (!isBypass && sub) {
              setApprovalNotes(notes);
              setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub });
            }
          }}
        />
      )}

      {/* Mark as Paid dialog with optional payment proof upload */}
      <Dialog
        open={markAsPaidDialog.open}
        onOpenChange={(open) => {
          if (!open && !markAsPaidDialog.uploading) {
            if (markAsPaidDialog.proofPreviewUrl) URL.revokeObjectURL(markAsPaidDialog.proofPreviewUrl);
            setMarkAsPaidDialog({ open: false, submission: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              Mark as Paid / تحديد كمدفوع
            </DialogTitle>
            <DialogDescription>
              Attach a payment receipt before confirming. A receipt is required. / أرفق إيصال الدفع قبل التأكيد. الإيصال مطلوب.
            </DialogDescription>
          </DialogHeader>

          {markAsPaidDialog.submission && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium">{markAsPaidDialog.submission.expense_category.replace(/_/g, ' ')}</p>
                <p className="text-lg font-bold tabular-nums">
                  {markAsPaidDialog.submission.currency} {(markAsPaidDialog.submission.amount_cents / 100).toLocaleString()}
                </p>
                {markAsPaidDialog.submission.vendor && (
                  <p className="text-muted-foreground text-xs">Vendor: {markAsPaidDialog.submission.vendor}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Payment Receipt / إيصال الدفع <span className="text-red-500">*</span>
                </Label>
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-green-400 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleMarkAsPaidProofFileChange}
                    disabled={markAsPaidDialog.uploading}
                    data-testid="input-payment-proof"
                  />
                  {markAsPaidDialog.proofFile ? (
                    <div className="space-y-2">
                      {markAsPaidDialog.proofPreviewUrl ? (
                        <img
                          src={markAsPaidDialog.proofPreviewUrl}
                          alt="Receipt preview"
                          className="max-h-32 mx-auto rounded object-contain"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-8 w-8 text-red-500" />
                          <span>{markAsPaidDialog.proofFile.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Click to change / انقر للتغيير</p>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <p className="text-sm">Upload receipt image or PDF / ارفع صورة أو PDF</p>
                      <p className="text-xs opacity-60">Click to browse / انقر للتصفح</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Payment Notes / ملاحظات الدفع <span className="text-muted-foreground font-normal">(optional / اختياري)</span>
                </Label>
                <Textarea
                  value={markAsPaidDialog.notes}
                  onChange={(e) => setMarkAsPaidDialog(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Bank transfer ref: TXN123... / مثال: رقم التحويل: TXN123..."
                  className="resize-none h-20 text-sm"
                  disabled={markAsPaidDialog.uploading}
                  data-testid="input-payment-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (markAsPaidDialog.proofPreviewUrl) URL.revokeObjectURL(markAsPaidDialog.proofPreviewUrl);
                setMarkAsPaidDialog({ open: false, submission: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
              }}
              disabled={markAsPaidDialog.uploading}
              data-testid="button-cancel-mark-paid"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmMarkAsPaid}
              disabled={markAsPaidDialog.uploading}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-mark-paid"
            >
              {markAsPaidDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> {markAsPaidDialog.proofFile ? 'Uploading...' : 'Saving...'}</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-1.5" /> Confirm Payment / تأكيد الدفع</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Cost Pay — one shared receipt for multiple submissions */}
      <Dialog
        open={batchCostPayDialog.open}
        onOpenChange={(open) => {
          if (!open && !batchCostPayDialog.uploading) {
            if (batchCostPayDialog.proofPreviewUrl) URL.revokeObjectURL(batchCostPayDialog.proofPreviewUrl);
            setBatchCostPayDialog({ open: false, submissions: [], proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
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

          {batchCostPayDialog.submissions.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {batchCostPayDialog.submissions.length} Submission{batchCostPayDialog.submissions.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {batchCostPayDialog.submissions[0]?.currency} {batchCostPayDialog.submissions.reduce((s, sub) => s + sub.amount_cents / 100, 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Total covered by this single receipt</p>
              </div>

              {/* Breakdown */}
              <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                {batchCostPayDialog.submissions.map((sub) => {
                  const submitterName = users.find(u => u.id === sub.submitted_by)?.name || 'Unknown';
                  const ref = sub.reference_number || sub.id.slice(0, 8).toUpperCase();
                  return (
                    <div key={sub.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{sub.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || ref}</p>
                        <p className="text-xs text-muted-foreground">{submitterName} · Ref {ref}</p>
                      </div>
                      <span className="font-semibold tabular-nums shrink-0 ml-2">
                        {sub.currency} {(sub.amount_cents / 100).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Receipt upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Shared Receipt / الإيصال المشترك <span className="text-red-500">*</span>
                </Label>
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleBatchCostPayProofFileChange}
                    disabled={batchCostPayDialog.uploading}
                    data-testid="input-batch-cost-payment-proof"
                  />
                  {batchCostPayDialog.proofFile ? (
                    <div className="space-y-2">
                      {batchCostPayDialog.proofPreviewUrl ? (
                        <img src={batchCostPayDialog.proofPreviewUrl} alt="Receipt preview" className="max-h-32 mx-auto rounded object-contain" />
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-8 w-8 text-red-500" />
                          <span>{batchCostPayDialog.proofFile.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Click to change / انقر للتغيير</p>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <p className="text-sm">Upload the batch receipt (image or PDF)</p>
                      <p className="text-xs opacity-60">This one file links to all {batchCostPayDialog.submissions.length} submissions</p>
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
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (batchCostPayDialog.proofPreviewUrl) URL.revokeObjectURL(batchCostPayDialog.proofPreviewUrl);
                setBatchCostPayDialog({ open: false, submissions: [], proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
              }}
              disabled={batchCostPayDialog.uploading}
              data-testid="button-cancel-batch-cost-pay"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBatchCostPay}
              disabled={batchCostPayDialog.uploading || !batchCostPayDialog.proofFile}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-confirm-batch-cost-pay"
            >
              {batchCostPayDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Processing...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-1.5" /> Pay {batchCostPayDialog.submissions.length} Submission{batchCostPayDialog.submissions.length > 1 ? 's' : ''}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CostSubmission;
