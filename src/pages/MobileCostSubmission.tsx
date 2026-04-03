import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useUserCostSubmissions, useCostSubmissions } from "@/context/costApproval/CostSubmissionContext";
import { useAppContext } from "@/context/AppContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { useUser } from "@/context/user/UserContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUserProjects } from "@/hooks/useUserProjects";
import { AppRole } from "@/types";
import UnifiedCostRequestForm from "@/components/cost-submission/UnifiedCostRequestForm";
import CostDocumentUpload from "@/components/cost-submission/CostDocumentUpload";
import OutstandingAdvances from "@/components/cost-submission/OutstandingAdvances";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { MobileStatsCard } from "@/components/mobile/MobileStatsCard";
import { supabase } from "@/integrations/supabase/client";
import { ensureValidSession } from "@/lib/session-health";
import { format } from "date-fns";
import { SignatureConfirmationModal } from "@/components/signatures/SignatureConfirmationModal";
import type { SignatureMethod } from "@/types/signature";
import { generateApprovalCertificatePdf, generateApprovalCertificateBase64 } from "@/utils/approvalCertificatePdf";
import { exportSubmissionsToExcel, exportSubmissionsToPDF, exportOutstandingToExcel, exportOutstandingToPDF, exportReconciledToExcel, exportReconciledToPDF } from "@/utils/costSubmissionExport";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";
import { EmailNotificationService } from "@/services/email-notification.service";
import { EmailCCInput } from "@/components/EmailCCInput";
import { generateFinancialStatementPdf, type StatementRow, type StatementConfig } from "@/utils/financialStatementPdf";
import { generateFinancialStatementExcel } from "@/utils/financialStatementExcel";
import type { SupportingDocument } from "@/types/cost-submission";
import { ChevronLeft, Clock, CheckCircle, XCircle, AlertCircle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, ThumbsUp, ThumbsDown, ArrowRight, Calendar, MapPin, Building2, FolderOpen, Hash, Paperclip, Download, Pencil, Trash2, RotateCcw, SendHorizonal, FileSpreadsheet, FileDown, Info, RefreshCw, CircleDollarSign, ClipboardCheck, HelpCircle, Wallet, Ticket, Gift, Wifi, GraduationCap, Car, Package, Printer, Coffee, MoreHorizontal, Briefcase, Mail, ChevronDown, ChevronUp, Eye } from "lucide-react";

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
}

const STATUS_AR_MAP_OC: Record<string, string> = {
  pending: 'قيد الانتظار',
  under_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  paid: 'مدفوع',
  reconciled: 'مسوّى',
  all: 'الكل',
};

const MobileCostSubmission = () => {
  const navigate = useNavigate();
  const { currentUser, roles } = useAppContext();
  const { hasAnyRole, isSuperAdmin: isSuperAdminFn } = useAuthorization();
  const { users } = useUser();
  const { projects: allProjects } = useProjectContext();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { toast } = useToast();

  const isAdmin = hasAnyRole(['admin', 'ict']);
  const isSupervisor = hasAnyRole(['supervisor']);
  const isFOM = hasAnyRole(['fom']);
  const isCoordinator = hasAnyRole(['coordinator']);
  const isCountryDirector = hasAnyRole(['countryDirector']);
  const isDataCollector = hasAnyRole(['dataCollector']);
  const isSuperAdmin = isAdminOrSuperUser || isSuperAdminFn();
  const isFinanceAdmin = hasAnyRole(['financialAdmin']);

  const canSubmitOperationalCosts = isFOM || isCoordinator || isCountryDirector || isAdmin || isSupervisor || isAdminOrSuperUser;
  const canReconcileAdvances = isCountryDirector || isAdmin || isAdminOrSuperUser;
  const canViewTeamSubmissions = isAdmin || isSupervisor || isSuperAdmin || isFinanceAdmin || isAdminOrSuperUser || isFOM || isCountryDirector;

  const [activeTab, setActiveTab] = useState<"submit" | "reconciliation" | "outstanding" | "history">("submit");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "under_review" | "approved" | "rejected" | "paid" | "reconciled">("all");
  const [operationalCosts, setOperationalCosts] = useState<OperationalCostSubmission[]>([]);
  const [operationalCostsLoading, setOperationalCostsLoading] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2 | 3;
    submission: OperationalCostSubmission | null;
  }>({ open: false, action: 'approve', tier: 1, submission: null });
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalProcessing, setApprovalProcessing] = useState(false);

  const [signatureModal, setSignatureModal] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    tier: 1 | 2 | 3;
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

  const [editingSubmission, setEditingSubmission] = useState<OperationalCostSubmission | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OperationalCostSubmission | null>(null);
  const [recallConfirm, setRecallConfirm] = useState<OperationalCostSubmission | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [viewAdvanceDetails, setViewAdvanceDetails] = useState<OperationalCostSubmission | null>(null);
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
        if (!rpcResult.error) {
          data = rpcResult.data as OperationalCostSubmission[];
        } else {
          const directResult = await supabase
            .from('operational_cost_submissions')
            .select('*')
            .order('created_at', { ascending: false });
          data = directResult.data as OperationalCostSubmission[];
          error = directResult.error;
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
        setOperationalCosts([]);
      } else {
        setOperationalCosts((data as OperationalCostSubmission[]) || []);
      }
    } catch {
      setOperationalCosts([]);
    } finally {
      setOperationalCostsLoading(false);
    }
  }, [currentUser?.id, currentUser?.role, canViewTeamSubmissions, isSuperAdmin, isAdminOrSuperUser]);

  useEffect(() => {
    fetchOperationalCosts();
  }, [fetchOperationalCosts]);

  const allSubmissionsQuery = useCostSubmissions(canViewTeamSubmissions);
  const userSubmissionsQuery = useUserCostSubmissions(canViewTeamSubmissions ? '' : (currentUser?.id || ''));

  const getTeamMemberIds = (): string[] => {
    if (isAdmin) return [];
    if (isSupervisor && currentUser) {
      const hubId = currentUser.hubId;
      const stateId = currentUser.stateId;
      if (hubId) {
        return users.filter(u => u.hubId === hubId && u.id !== currentUser.id).map(u => u.id);
      } else if (stateId) {
        return users.filter(u => u.stateId === stateId && u.id !== currentUser.id).map(u => u.id);
      }
    }
    return [];
  };

  const teamMemberIds = getTeamMemberIds();

  const filterSubmissionsForSupervisor = (allSubs: typeof allSubmissionsQuery.submissions) => {
    if (isAdmin || isSuperAdmin || isAdminOrSuperUser) return allSubs;
    if (isSupervisor && teamMemberIds.length > 0) {
      return allSubs?.filter(s => teamMemberIds.includes(s.submittedBy)) || [];
    }
    return allSubs || [];
  };

  const { submissions: rawSubmissions, isLoading } = canViewTeamSubmissions ? 
    { submissions: allSubmissionsQuery.submissions || [], isLoading: allSubmissionsQuery.isLoading } :
    { submissions: userSubmissionsQuery.submissions || [], isLoading: userSubmissionsQuery.isLoading };

  const supervisorFilteredSubmissions = canViewTeamSubmissions 
    ? filterSubmissionsForSupervisor(rawSubmissions)
    : rawSubmissions;

  const submissions = useMemo(() => {
    if (isAdminOrSuperUser || isSuperAdmin) return supervisorFilteredSubmissions;
    if (userProjectIds.length === 0) return [];
    return supervisorFilteredSubmissions.filter(s => 
      !s.projectId || userProjectIds.includes(s.projectId)
    );
  }, [supervisorFilteredSubmissions, userProjectIds, isAdminOrSuperUser, isSuperAdmin]);

  const filteredOperationalCosts = useMemo(() => {
    let filtered = operationalCosts;
    if (!isAdminOrSuperUser && !isSuperAdmin) {
      if (isSupervisor && teamMemberIds.length > 0) {
        filtered = filtered.filter(o => teamMemberIds.includes(o.submitted_by) || o.submitted_by === currentUser?.id);
      } else if (!canViewTeamSubmissions) {
        filtered = filtered.filter(o => o.submitted_by === currentUser?.id);
      }
      if (userProjectIds.length > 0) {
        filtered = filtered.filter(o => !o.project_id || userProjectIds.includes(o.project_id));
      }
    }
    return filtered;
  }, [operationalCosts, isAdminOrSuperUser, isSuperAdmin, isSupervisor, teamMemberIds, canViewTeamSubmissions, currentUser?.id, userProjectIds]);

  const isCoordinatorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase();
    return role.includes('coordinator');
  };

  const isSupervisorSubmission = (oc: OperationalCostSubmission): boolean => {
    const role = (oc.submitter_role || '').toLowerCase();
    return role.includes('supervisor') || role.includes('hubsupervisor');
  };

  const hasThreeTiers = (oc: OperationalCostSubmission): boolean => {
    return isCoordinatorSubmission(oc) || oc.tier3_status !== null;
  };

  const getOperationalDerivedStatus = (oc: OperationalCostSubmission): string => {
    if (oc.status === 'reconciled') return 'reconciled';
    if (oc.status === 'paid') return 'paid';
    if (oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.tier3_status === 'rejected' || oc.status === 'rejected') return 'rejected';
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
    if (isSupervisorSubmission(oc)) return isFOM || isCountryDirector;
    if (isCoordinatorSubmission(oc)) return isSupervisor;
    return isFOM || isCountryDirector;
  };

  const canTier2Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'approved' || oc.tier2_status !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    if (oc.submitted_by === currentUser?.id) return false;
    if (isCoordinatorSubmission(oc)) return isFOM || isCountryDirector;
    return false;
  };

  const canTier3Approve = (oc: OperationalCostSubmission): boolean => {
    if (!hasThreeTiers(oc)) return false;
    if (oc.tier2_status !== 'approved' || oc.tier3_status !== 'pending') return false;
    if (isSuperAdmin) return true;
    return isAdmin;
  };

  const isFinalTier = (oc: OperationalCostSubmission, tier: 1 | 2 | 3): boolean => {
    if (hasThreeTiers(oc)) return tier === 3;
    return tier === 2;
  };

  const shouldRequireSignature = (_oc: OperationalCostSubmission, _tier: 1 | 2 | 3): boolean => {
    if (isSuperAdmin || isAdmin) return true;
    return isFinalTier(_oc, _tier);
  };

  const openApprovalDialog = (oc: OperationalCostSubmission, action: 'approve' | 'reject', tier: 1 | 2 | 3) => {
    setApprovalDialog({ open: true, action, tier, submission: oc });
    setApprovalNotes('');
  };

  const handleApprovalAction = async () => {
    const { action, tier, submission } = approvalDialog;
    if (!submission || !currentUser?.id) return;
    if (shouldRequireSignature(submission, tier) && action === 'approve') {
      setApprovalProcessing(true);
      setSignatureModal({ open: true, submission, tier, notes: approvalNotes });
      setApprovalDialog({ open: false, action: 'approve', tier, submission: null });
      return;
    }
    await processApproval(action, tier, submission, approvalNotes);
  };

  const processApproval = async (
    action: 'approve' | 'reject',
    tier: 1 | 2 | 3,
    submission: OperationalCostSubmission,
    notes: string,
    signatureData?: { signatureId: string; signatureHash: string; method: SignatureMethod; signedAt: string }
  ) => {
    if (!currentUser?.id) return;
    const session = await ensureValidSession();
    if (!session.success) return;
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
          updates.status = 'under_review';
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
          updates.status = isFinal ? 'approved' : 'under_review';
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

      const { data: updatedRows, error } = await supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('id', submission.id)
        .select('id');

      if (error) {
        toast({ title: "Action Failed / فشل الإجراء", description: error.message, variant: "destructive", duration: 8000 });
      } else if (!updatedRows || updatedRows.length === 0) {
        toast({ title: "Update Blocked / تم حظر التحديث", description: "Database security policy may be blocking this update.", variant: "destructive", duration: 12000 });
        fetchOperationalCosts();
      } else {
        const tierArMap: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' };
        const tierAr = tierArMap[tier] || '';
        const submitterName = users.find(u => u.id === submission.submitted_by)?.name || 'the submitter';
        const refNum = submission.reference_number || submission.id.substring(0, 8).toUpperCase();
        const amountStr = `${submission.currency} ${(submission.amount_cents / 100).toLocaleString()}`;

        if (action === 'reject') {
          toast({ title: `Rejected (Tier ${tier}) / تم الرفض (المرحلة ${tierAr})`, description: `"${refNum}" (${amountStr}) rejected. / تم رفض "${refNum}".`, variant: "destructive", duration: 8000 });
        } else if (isFinal && signatureData) {
          toast({ title: "Approved & Signed / تمت الموافقة والتوقيع", description: `"${refNum}" (${amountStr}) by ${submitterName} approved with signature. / تمت الموافقة.`, duration: 8000 });
        } else {
          toast({ title: `Approved (Tier ${tier}) / تمت الموافقة (المرحلة ${tierAr})`, description: `"${refNum}" (${amountStr}) approved. / تمت الموافقة.`, duration: 8000 });
        }
        fetchOperationalCosts();
      }
    } catch {
      toast({ title: "Action Failed / فشل الإجراء", description: "An unexpected error occurred.", variant: "destructive" });
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
    const { submission, notes, tier } = signatureModal;
    if (!submission) return;
    signatureCompletedRef.current = true;
    processApproval('approve', tier, submission, notes, signatureData);
    setTimeout(() => {
      setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
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
          const { data: sigRow } = await supabase.from('document_signatures').select('signature_data, signature_method, signer_id').eq('id', sigMatch[1]).single();
          if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) signatureImageData = sigRow.signature_data;
          if (!signatureImageData && sigRow?.signer_id) {
            try {
              const { data: savedSigs } = await supabase.from('handwriting_signatures').select('signature_image').eq('user_id', sigRow.signer_id).eq('is_active', true).order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1);
              if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) signatureImageData = savedSigs[0].signature_image;
            } catch { /* continue */ }
          }
        } catch { /* continue */ }
      }
    }
    if (!signatureImageData && oc.tier2_approved_by) {
      try {
        const { data: savedSigs } = await supabase.from('handwriting_signatures').select('signature_image').eq('user_id', oc.tier2_approved_by).eq('is_active', true).order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1);
        if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) signatureImageData = savedSigs[0].signature_image;
      } catch { /* continue */ }
    }

    await generateApprovalCertificatePdf({
      submission: { id: oc.id, expense_category: oc.expense_category, amount_cents: oc.amount_cents, currency: oc.currency, description: oc.description, expense_date: oc.expense_date, vendor: oc.vendor, reference_number: oc.reference_number, submitted_at: oc.submitted_at, created_at: oc.created_at, supporting_documents: oc.supporting_documents },
      submitter: { name: submitter?.name || submitter?.email || 'Unknown', email: submitter?.email || '', role: oc.submitter_role },
      project: project ? { name: project.name } : null,
      tier1: { approverName: tier1Approver?.name || tier1Approver?.email || 'Unknown', approverEmail: tier1Approver?.email, status: oc.tier1_status || 'approved', approvedAt: oc.tier1_approved_at || '', notes: oc.tier1_notes },
      tier2: { approverName: tier2Approver?.name || tier2Approver?.email || 'Unknown', approverEmail: tier2Approver?.email, status: oc.tier2_status || 'approved', approvedAt: oc.tier2_approved_at || '', notes: oc.tier2_notes, signatureImageData },
    });
    toast({ title: 'Certificate Downloaded / تم التحميل', description: 'PDF saved. / تم الحفظ.' });
  };

  const canEditSubmission = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canDeleteSubmission = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canResubmitSubmission = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds !== 'rejected') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canRecallSubmission = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds === 'paid' || ds === 'reconciled') return false;
    if (ds !== 'under_review' && ds !== 'approved') return false;
    return isSuperAdmin || isAdmin;
  };

  const canMarkAsPaid = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds !== 'approved') return false;
    return isSuperAdmin || isAdmin || isFinanceAdmin;
  };

  const canRequestPayment = (oc: OperationalCostSubmission): boolean => {
    const ds = getOperationalDerivedStatus(oc);
    if (ds !== 'approved') return false;
    return isSuperAdmin || isAdmin || isFinanceAdmin;
  };

  const handleMarkAsPaid = async (oc: OperationalCostSubmission) => {
    if (!currentUser?.id) return;
    const session = await ensureValidSession();
    if (!session.success) return;
    setActionProcessing(true);
    try {
      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = { status: 'paid', paid_at: now, updated_at: now };
      try { updatePayload.paid_by = currentUser.id; } catch { /* field may not exist */ }
      let { error } = await supabase.from('operational_cost_submissions').update(updatePayload).eq('id', oc.id);
      if (error?.message?.includes('paid_by')) {
        const { paid_by, ...safePayload } = updatePayload as any;
        const fallback = await supabase.from('operational_cost_submissions').update({ ...safePayload, description: `${oc.description || ''}\n[Paid by: ${currentUser.id}]` }).eq('id', oc.id);
        error = fallback.error;
      }
      if (error) {
        toast({ title: "Failed / فشل", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Marked as Paid / تم التحديد كمدفوع", description: "Payment recorded. / تم تسجيل الدفع." });
        fetchOperationalCosts();
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to mark as paid.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
    }
  };

  const cachedRecipientsRef = useRef<Array<{ id: string; email: string; name: string; role: string }> | null>(null);
  const [ccContacts, setCcContacts] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);

  useEffect(() => {
    const preloadRecipients = async () => {
      try {
        const { data: financeUsers } = await supabase.from('profiles').select('id, email, full_name, role').in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator']).eq('status', 'approved');
        cachedRecipientsRef.current = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
      } catch {}
    };
    preloadRecipients();
    supabase.from('profiles').select('id, email, full_name, role').eq('status', 'approved').not('email', 'is', null).then(({ data }) => {
      if (data) {
        setCcContacts(data.filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role || '' })));
      }
    });
  }, []);

  const openPaymentRequestDialog = async (oc: OperationalCostSubmission) => {
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, submission: oc, loading: false, selectedRecipientIds: cached.map(r => r.id), ccEmails: [], availableRecipients: cached }));
      supabase.from('profiles').select('id, email, full_name, role').in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator']).eq('status', 'approved').then(({ data }) => {
        if (data) {
          const fresh = data.filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
          cachedRecipientsRef.current = fresh;
          setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
        }
      });
    } else {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, submission: oc, loading: true, selectedRecipientIds: [], ccEmails: [], availableRecipients: [] }));
      try {
        const { data: financeUsers } = await supabase.from('profiles').select('id, email, full_name, role').in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator']).eq('status', 'approved');
        const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
        cachedRecipientsRef.current = recipients;
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map((r: any) => r.id), loading: false }));
      } catch {
        setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
        toast({ title: "Error / خطأ", description: "Failed to load recipients.", variant: "destructive" });
      }
    }
  };

  const togglePaymentRecipient = (id: string) => {
    setPaymentRequestDialog(prev => ({ ...prev, selectedRecipientIds: prev.selectedRecipientIds.includes(id) ? prev.selectedRecipientIds.filter(r => r !== id) : [...prev.selectedRecipientIds, id] }));
  };

  const toggleAllPaymentRecipients = () => {
    setPaymentRequestDialog(prev => ({ ...prev, selectedRecipientIds: prev.selectedRecipientIds.length === prev.availableRecipients.length ? [] : prev.availableRecipients.map(r => r.id) }));
  };

  const handleSendPaymentRequest = async () => {
    const { submission: oc, selectedRecipientIds, availableRecipients, ccEmails } = paymentRequestDialog;
    if (!oc || !currentUser?.id || selectedRecipientIds.length === 0) return;
    setPaymentRequestDialog(prev => ({ ...prev, sending: true }));
    try {
      const selectedRecipients = availableRecipients.filter(r => selectedRecipientIds.includes(r.id)).map(r => ({ email: r.email, name: r.name }));
      const submitterProfile = users?.find(u => u.id === (oc as any).submitted_by);
      const submitterName = (submitterProfile as any)?.fullName || (submitterProfile as any)?.full_name || (submitterProfile as any)?.name || 'Unknown';
      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Approver';
      const approverEmail = currentUser.email || '';
      const project = (oc as any).project_id ? allProjects?.find(p => p.id === (oc as any).project_id) : null;
      const projectName = project?.name || 'N/A';
      const totalAmount = (oc as any).amount_cents || 0;
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
              const { data: sigRow } = await supabase.from('document_signatures').select('signature_data, signer_id').eq('id', sigMatch[1]).single();
              if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) signatureImageData = sigRow.signature_data;
              if (!signatureImageData && sigRow?.signer_id) {
                const { data: savedSigs } = await supabase.from('handwriting_signatures').select('signature_image').eq('user_id', sigRow.signer_id).eq('is_active', true).order('is_default', { ascending: false }).limit(1);
                if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) signatureImageData = savedSigs[0].signature_image;
              }
            } catch { /* continue */ }
          }
        }
        pdfAttachment = await generateApprovalCertificateBase64({
          submission: { id: oc.id, expense_category: (oc as any).expense_category || 'general', amount_cents: (oc as any).amount_cents || 0, currency: (oc as any).currency || 'SDG', description: oc.description, expense_date: (oc as any).expense_date, vendor: (oc as any).vendor, reference_number: (oc as any).reference_number, submitted_at: (oc as any).submitted_at, created_at: (oc as any).created_at, supporting_documents: (oc as any).supporting_documents },
          submitter: { name: (submitterProfile as any)?.name || (submitterProfile as any)?.email || 'Unknown', email: (submitterProfile as any)?.email || '', role: (oc as any).submitter_role },
          project: project ? { name: project.name } : null,
          tier1: { approverName: (tier1Approver as any)?.name || 'Unknown', approverEmail: (tier1Approver as any)?.email, status: (oc as any).tier1_status || 'approved', approvedAt: (oc as any).tier1_approved_at || '', notes: (oc as any).tier1_notes },
          tier2: { approverName: (tier2Approver as any)?.name || 'Unknown', approverEmail: (tier2Approver as any)?.email, status: (oc as any).tier2_status || 'approved', approvedAt: (oc as any).tier2_approved_at || '', notes: (oc as any).tier2_notes, signatureImageData },
        });
      } catch { /* continue without PDF */ }

      const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
        selectedRecipients, approverName, approverEmail, submitterName,
        (oc as any).title || oc.description || 'Operational Cost', requestId,
        (oc as any).expense_category || 'general', totalAmount,
        (oc as any).funding_type || 'advance', projectName,
        (oc as any).currency || 'SDG', '', '/cost-submission',
        pdfAttachment, undefined,
        ccEmails.length > 0 ? ccEmails : undefined
      );

      if (result.success) {
        toast({ title: "Payment Request Sent / تم إرسال طلب الدفع", description: `Sent to ${selectedRecipients.length} recipient(s).` });
      } else {
        toast({ title: "Email Failed / فشل الإرسال", description: result.error || "Could not send.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to send payment request.", variant: "destructive" });
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
    const session = await ensureValidSession();
    if (!session.success) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase.from('operational_cost_submissions').delete().eq('id', deleteConfirm.id).eq('tier1_status', 'pending').eq('tier2_status', 'pending');
      if (error) {
        toast({ title: "Delete Failed / فشل الحذف", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Deleted / تم الحذف", description: "Submission deleted. / تم حذف الطلب." });
        fetchOperationalCosts();
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to delete.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
      setDeleteConfirm(null);
    }
  };

  const handleRecallSubmission = async () => {
    if (!recallConfirm) return;
    const session = await ensureValidSession();
    if (!session.success) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase.from('operational_cost_submissions').update({
        status: 'pending', tier1_status: 'pending', tier1_approved_by: null, tier1_approved_at: null, tier1_notes: null,
        tier2_status: 'pending', tier2_approved_by: null, tier2_approved_at: null, tier2_notes: null,
        rejection_reason: null, updated_at: new Date().toISOString(),
      }).eq('id', recallConfirm.id);
      if (error) {
        toast({ title: "Recall Failed / فشل الاسترجاع", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Recalled / تم الاسترجاع", description: "Submission recalled to pending. / تم الاسترجاع." });
        fetchOperationalCosts();
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to recall.", variant: "destructive" });
    } finally {
      setActionProcessing(false);
      setRecallConfirm(null);
    }
  };

  const handleOperationalStatementExport = (type: 'pdf' | 'excel') => {
    try {
      const statusFiltered = statusFilter === 'all' ? filteredOperationalCosts : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
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
        const projectName = oc.project_id ? (allProjects?.find(p => p.id === oc.project_id)?.name || '') : '';
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
    } catch {
      toast({ title: "Export Error / خطأ في التصدير", description: "Failed to generate statement.", variant: "destructive" });
    }
  };

  const submissionStats = {
    total: submissions.length + filteredOperationalCosts.length,
    pending: submissions.filter(s => s.status === 'pending').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length,
    underReview: submissions.filter(s => s.status === 'under_review').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length,
    approved: submissions.filter(s => s.status === 'approved').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length,
    paid: submissions.filter(s => s.status === 'paid').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid').length,
    reconciled: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'reconciled').length,
  };

  const availableProjects = useMemo(() => {
    if (isAdminOrSuperUser) return allProjects;
    if (userProjectIds.length === 0) return [];
    return allProjects.filter(p => userProjectIds.includes(p.id));
  }, [allProjects, userProjectIds, isAdminOrSuperUser]);

  const projectsForForm = availableProjects.map(p => ({
    id: p.id,
    name: p.name,
    budgetRemaining: (p as any).budgetRemaining
  }));

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    reconciled: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  };

  const tabItems = [
    ...(canSubmitOperationalCosts ? [{ id: 'submit', label: 'Submit', icon: <Receipt className="h-4 w-4" /> }] : []),
    { id: 'outstanding', label: 'Outstanding', icon: <CircleDollarSign className="h-4 w-4" />, badge: submissionStats.approved > 0 ? submissionStats.approved : undefined },
    { id: 'reconciliation', label: 'Reconcile', icon: <RefreshCw className="h-4 w-4" /> },
    { id: 'history', label: 'History', icon: <ClipboardCheck className="h-4 w-4" />, badge: submissionStats.total > 0 ? submissionStats.total : undefined },
  ];

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" data-testid="text-page-title">
              {canViewTeamSubmissions ? "Cost Approval" : "Cost Submission"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {isAdmin || isSuperAdmin ? "Review & approve all submissions" : isSupervisor ? "Review team submissions" : "Submit & track costs"}
            </p>
          </div>
          {(isAdmin || isSuperAdmin) && (
            <Badge variant="outline" className="shrink-0 text-xs">
              <Shield className="h-3 w-3 mr-1" />
              {isSuperAdmin ? 'Super' : 'Admin'}
            </Badge>
          )}
        </div>

        <PageInfoBanner
          title="Cost Submission - Operational Expenses"
          description="Submit operational costs for reimbursement. Each submission goes through a two-tier approval before the amount is credited."
          descriptionAr="قدم التكاليف التشغيلية للاسترداد. كل طلب يمر بموافقة على مستويين قبل إضافة المبلغ."
          workflowSteps={[
            { step: 1, role: 'Field Staff', action: 'Submits expense', description: 'Fill in cost details and submit.' },
            { step: 2, role: 'Supervisor', action: 'Reviews (Tier 1)', description: 'Supervisor approves or rejects.' },
            { step: 3, role: 'Admin', action: 'Final approval (Tier 2)', description: 'Admin gives final approval with signature.' },
            { step: 4, role: 'System', action: 'Credits wallet', description: 'Amount added to your wallet.' },
          ]}
          workflowStepsAr={[
            { step: 1, role: 'موظف ميداني', action: 'يقدم المصروف', description: 'املأ التفاصيل وأرسل.' },
            { step: 2, role: 'المشرف', action: 'يراجع (المستوى 1)', description: 'المشرف يوافق أو يرفض.' },
            { step: 3, role: 'المدير', action: 'الموافقة النهائية (المستوى 2)', description: 'المدير يوافق بالتوقيع.' },
            { step: 4, role: 'النظام', action: 'يُضيف للمحفظة', description: 'يُضاف المبلغ لمحفظتك.' },
          ]}
        />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <MobileStatsCard title="Pending" value={submissionStats.pending} subtitle="Awaiting review" icon={<Clock className="h-4 w-4" />} variant="compact" />
          <MobileStatsCard title="In Review" value={submissionStats.underReview} subtitle="Being processed" icon={<AlertCircle className="h-4 w-4" />} variant="compact" />
          <MobileStatsCard title="Approved" value={submissionStats.approved} subtitle="Ready for payment" icon={<CheckCircle className="h-4 w-4" />} variant="compact" />
          <MobileStatsCard title="Rejected" value={submissionStats.rejected} subtitle="Declined" icon={<XCircle className="h-4 w-4" />} variant="compact" />
          <MobileStatsCard title="Paid" value={submissionStats.paid} subtitle="Completed" icon={<DollarSign className="h-4 w-4" />} variant="compact" />
          <MobileStatsCard title="Total" value={submissionStats.total} subtitle="All submissions" icon={<FileText className="h-4 w-4" />} variant="compact" />
        </div>
      </div>

      <div className="px-4 mt-3 mb-3">
        <MobileTabBar
          tabs={tabItems}
          activeTab={activeTab}
          onChange={(id) => {
            if (id !== 'reconciliation') {
              setActiveReconciliation(null);
              setReconcileActualAmount('');
              setReconcileNotes('');
              setReconcileReceipts([]);
              setReconcileReceiptAmounts({});
            }
            setActiveTab(id as any);
          }}
          variant="pills"
        />
      </div>

      <div className="px-4">
        {activeTab === 'submit' && canSubmitOperationalCosts && (
          <div className="space-y-3" data-testid="tab-content-submit">
            {editingSubmission && (
              <Alert className="mb-3">
                <Pencil className="h-4 w-4" />
                <AlertTitle>{editingSubmission.status === 'rejected' ? 'Editing Rejected Submission' : 'Editing Pending Submission'}</AlertTitle>
                <AlertDescription className="text-xs">
                  {editingSubmission.status === 'rejected' ? 'Make changes and resubmit.' : 'Update details below.'}
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
              onCancelEdit={() => { setEditingSubmission(null); setActiveTab("history"); }}
              onSuccess={() => { setEditingSubmission(null); fetchOperationalCosts(); setActiveTab("history"); }}
            />
          </div>
        )}

        {activeTab === 'outstanding' && (
          <div className="space-y-3" data-testid="tab-content-outstanding">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-amber-600" />
                  Outstanding Advances
                </h2>
                <p className="text-xs text-muted-foreground">Advances pending reconciliation</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-outstanding">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem data-testid="button-export-outstanding-excel" onClick={() => {
                    const approvedOps = operationalCosts.filter(oc => getOperationalDerivedStatus(oc) === 'approved');
                    if (approvedOps.length === 0) { toast({ title: "No Data", description: "No outstanding advances.", variant: "destructive" }); return; }
                    exportOutstandingToExcel(approvedOps, users);
                    toast({ title: "Excel Exported", description: `${approvedOps.length} exported.` });
                  }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="button-export-outstanding-pdf" onClick={() => {
                    const approvedOps = operationalCosts.filter(oc => getOperationalDerivedStatus(oc) === 'approved');
                    if (approvedOps.length === 0) { toast({ title: "No Data", description: "No outstanding advances.", variant: "destructive" }); return; }
                    exportOutstandingToPDF(approvedOps, users);
                    toast({ title: "PDF Exported", description: `${approvedOps.length} exported.` });
                  }}>
                    <FileDown className="h-4 w-4 mr-2" />PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <OutstandingAdvances
              requests={(() => {
                const approvedOps = operationalCosts.filter(oc => getOperationalDerivedStatus(oc) === 'approved');
                return approvedOps.map(oc => {
                  const submitter = users.find(u => u.id === oc.submitted_by);
                  const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
                  return {
                    id: oc.id, requestType: 'advance' as const, projectId: oc.project_id || '', projectName: project?.name || 'General',
                    budgetLineCategory: (oc.expense_category || 'other') as any,
                    submittedBy: oc.submitted_by, submitterName: submitter?.name || submitter?.email || 'Unknown', submitterRole: oc.submitter_role || undefined,
                    submittedAt: oc.submitted_at || oc.created_at, requestedAmountCents: oc.amount_cents, currency: oc.currency || 'SDG',
                    title: oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled', description: oc.description || '',
                    justification: '', justificationDocuments: [], status: 'disbursed' as const,
                    tier1Status: 'approved' as const, tier1ReviewedBy: oc.tier1_approved_by || undefined, tier1ReviewedAt: oc.tier1_approved_at || undefined, tier1Notes: oc.tier1_notes || undefined,
                    tier2Status: 'approved' as const, tier2ReviewedBy: oc.tier2_approved_by || undefined, tier2ReviewedAt: oc.tier2_approved_at || undefined, tier2Notes: oc.tier2_notes || undefined,
                    approvedAmountCents: oc.amount_cents, disbursedAmountCents: oc.amount_cents, disbursedAt: oc.tier2_approved_at || oc.created_at,
                    balanceStatus: 'open' as const, balanceCents: oc.amount_cents, reconciliationDocuments: [],
                    hubId: oc.hub_id || undefined, createdAt: oc.created_at, updatedAt: oc.updated_at,
                  };
                });
              })()}
              onReconcile={(request) => {
                const oc = operationalCosts.find(o => o.id === request.id);
                if (oc) { setActiveReconciliation(oc); setReconcileActualAmount(''); setReconcileNotes(''); setActiveTab("reconciliation"); }
              }}
              onViewDetails={(request) => {
                const oc = operationalCosts.find(o => o.id === request.id);
                if (oc) setViewAdvanceDetails(oc);
              }}
            />
          </div>
        )}

        {activeTab === 'reconciliation' && (
          <div className="space-y-3" data-testid="tab-content-reconciliation">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-purple-600" />
                Reconciliation
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-reconciliation">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const reconciledOps = operationalCosts.filter(oc => oc.status === 'reconciled');
                    if (reconciledOps.length === 0) { toast({ title: "No Data", variant: "destructive" }); return; }
                    exportReconciledToExcel(reconciledOps, users);
                    toast({ title: "Excel Exported" });
                  }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const reconciledOps = operationalCosts.filter(oc => oc.status === 'reconciled');
                    if (reconciledOps.length === 0) { toast({ title: "No Data", variant: "destructive" }); return; }
                    exportReconciledToPDF(reconciledOps, users);
                    toast({ title: "PDF Exported" });
                  }}>
                    <FileDown className="h-4 w-4 mr-2" />PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {activeReconciliation ? (() => {
              const submitter = users.find(u => u.id === activeReconciliation.submitted_by);
              const project = activeReconciliation.project_id ? allProjects.find(p => p.id === activeReconciliation.project_id) : null;
              const advanceAmount = activeReconciliation.amount_cents / 100;
              const actualSpent = parseFloat(reconcileActualAmount) || 0;
              const difference = advanceAmount - actualSpent;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 text-xs">
                      Active Reconciliation
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => { setActiveReconciliation(null); setReconcileReceiptAmounts({}); setReconcileActualAmount(''); setReconcileNotes(''); setReconcileReceipts([]); }} data-testid="button-cancel-reconciliation">
                      <XCircle className="h-3 w-3 mr-1" />Cancel
                    </Button>
                  </div>

                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{activeReconciliation.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground">{submitter?.name || 'Unknown'} &middot; {project?.name || 'General'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-amber-600">{activeReconciliation.currency} {advanceAmount.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">Advance / السلفة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{activeReconciliation.expense_date ? format(new Date(activeReconciliation.expense_date), 'MMM d, yyyy') : 'N/A'}</span>
                        <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{activeReconciliation.expense_category}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-semibold">Transfer Receipts / إيصالات <span className="text-red-500">*</span></Label>
                      <p className="text-xs text-muted-foreground mb-2">Upload receipts and enter amounts.</p>
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
                        <p className="text-xs text-red-500 mt-1">At least one receipt required. / مطلوب إيصال واحد على الأقل.</p>
                      )}
                    </div>

                    {reconcileReceipts.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Receipt Amounts / مبالغ الإيصالات</Label>
                        {reconcileReceipts.map((receipt, idx) => (
                          <div key={receipt.url} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30" data-testid={`receipt-amount-row-${idx}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{receipt.filename}</p>
                              <p className="text-[10px] text-muted-foreground">Receipt {idx + 1}</p>
                            </div>
                            <div className="relative w-28 shrink-0">
                              <Input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                value={reconcileReceiptAmounts[receipt.url] || ''}
                                onChange={(e) => {
                                  const newAmounts = { ...reconcileReceiptAmounts, [receipt.url]: e.target.value };
                                  setReconcileReceiptAmounts(newAmounts);
                                  const total = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(newAmounts[r.url] || '0') || 0), 0);
                                  setReconcileActualAmount(total > 0 ? total.toString() : '');
                                }}
                                data-testid={`input-receipt-amount-${idx}`}
                              />
                            </div>
                          </div>
                        ))}
                        {reconcileReceipts.length > 1 && (
                          <div className="flex items-center justify-between p-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
                            <span className="text-xs font-semibold">Total / الإجمالي:</span>
                            <span className="text-sm font-bold">{activeReconciliation.currency} {actualSpent.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <Card>
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm font-medium">Balance Summary / ملخص الرصيد</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Advance / السلفة:</span>
                          <span>{activeReconciliation.currency} {advanceAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Spent / المنفق:</span>
                          <span>{activeReconciliation.currency} {actualSpent.toLocaleString()}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold">
                          <span>{difference >= 0 ? 'To Return / للإرجاع:' : 'Overspent / تجاوز:'}</span>
                          <span className={difference >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {activeReconciliation.currency} {Math.abs(difference).toLocaleString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-2">
                      <Label htmlFor="reconcile-notes">Notes / ملاحظات</Label>
                      <Textarea
                        id="reconcile-notes"
                        placeholder="Describe how funds were used..."
                        value={reconcileNotes}
                        onChange={(e) => setReconcileNotes(e.target.value)}
                        rows={3}
                        data-testid="input-reconcile-notes"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setActiveReconciliation(null); setReconcileReceiptAmounts({}); setReconcileActualAmount(''); setReconcileNotes(''); setReconcileReceipts([]); }} data-testid="button-reconcile-cancel">
                        Cancel / إلغاء
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={!reconcileActualAmount || parseFloat(reconcileActualAmount) < 0 || !reconcileNotes.trim() || reconcileReceipts.length === 0 || reconcileProcessing || reconcileReceipts.some(r => !reconcileReceiptAmounts[r.url] || parseFloat(reconcileReceiptAmounts[r.url]) <= 0)}
                        onClick={async () => {
                          if (!activeReconciliation) return;
                          if (reconcileReceipts.length === 0) { toast({ title: "Receipt Required", variant: "destructive" }); return; }
                          const hasEmptyAmounts = reconcileReceipts.some(r => !reconcileReceiptAmounts[r.url] || parseFloat(reconcileReceiptAmounts[r.url]) <= 0);
                          if (hasEmptyAmounts) { toast({ title: "Missing Amounts", variant: "destructive" }); return; }
                          setReconcileProcessing(true);
                          try {
                            const actual = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(reconcileReceiptAmounts[r.url] || '0') || 0), 0) * 100;
                            const diff = activeReconciliation.amount_cents - actual;
                            const receiptBreakdown = reconcileReceipts.map((r) => `${r.filename}: ${activeReconciliation.currency} ${parseFloat(reconcileReceiptAmounts[r.url] || '0').toLocaleString()}`).join(' | ');
                            const descUpdate = `${activeReconciliation.description || ''}\n[RECONCILED] Actual: ${activeReconciliation.currency} ${(actual/100).toLocaleString()} | Balance: ${activeReconciliation.currency} ${(diff/100).toLocaleString()} | Notes: ${reconcileNotes.trim()} | Receipts (${reconcileReceipts.length}): ${receiptBreakdown}`;
                            const existingDocs = Array.isArray(activeReconciliation.supporting_documents) ? activeReconciliation.supporting_documents : [];
                            const allDocs = [...existingDocs, ...reconcileReceipts.map((r) => ({ ...r, description: `Reconciliation receipt: ${r.filename} - Amount: ${activeReconciliation.currency} ${parseFloat(reconcileReceiptAmounts[r.url] || '0').toLocaleString()}` }))];
                            const receiptTotal = reconcileReceipts.reduce((sum, r) => sum + (parseFloat(reconcileReceiptAmounts[r.url] || '0') || 0), 0);
                            const reconciliationNotesWithBreakdown = reconcileReceipts.length > 1
                              ? `${reconcileNotes.trim()}\n\n--- Receipt Breakdown ---\n${reconcileReceipts.map((r, idx) => `${idx + 1}. ${r.filename}: ${activeReconciliation.currency} ${parseFloat(reconcileReceiptAmounts[r.url] || '0').toLocaleString()}`).join('\n')}\nTotal: ${activeReconciliation.currency} ${receiptTotal.toLocaleString()}`
                              : reconcileNotes.trim();

                            const { error } = await supabase.from('operational_cost_submissions').update({
                              status: 'reconciled', description: descUpdate, supporting_documents: allDocs,
                              reconciled_at: new Date().toISOString(), reconciled_by: currentUser?.id,
                              reconciled_amount_cents: actual, reconciliation_notes: reconciliationNotesWithBreakdown,
                              updated_at: new Date().toISOString(),
                            }).eq('id', activeReconciliation.id);

                            if (error) {
                              toast({ title: "Reconciliation Failed", description: error.message, variant: "destructive" });
                            } else {
                              toast({ title: "Reconciled Successfully / تمت التسوية", description: `${reconcileReceipts.length} receipt(s) submitted.`, duration: 8000 });
                              setActiveReconciliation(null); setReconcileActualAmount(''); setReconcileNotes(''); setReconcileReceipts([]); setReconcileReceiptAmounts({});
                              fetchOperationalCosts();
                            }
                          } catch {
                            toast({ title: "Error", description: "Failed to reconcile.", variant: "destructive" });
                          } finally {
                            setReconcileProcessing(false);
                          }
                        }}
                        data-testid="button-submit-reconciliation"
                      >
                        {reconcileProcessing ? 'Processing...' : `Submit (${reconcileReceipts.length} receipt${reconcileReceipts.length !== 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="space-y-3">
                <Alert className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
                  <Info className="h-4 w-4 text-purple-600" />
                  <AlertTitle className="text-purple-800 dark:text-purple-200 text-sm">How Reconciliation Works</AlertTitle>
                  <AlertDescription className="text-purple-700 dark:text-purple-300 text-xs mt-1">
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Go to "Outstanding" tab</li>
                      <li>Click "Reconcile" on an advance</li>
                      <li>Upload receipts and enter amounts</li>
                      <li>Submit reconciliation</li>
                    </ol>
                  </AlertDescription>
                </Alert>
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium mb-1">No Active Reconciliation</p>
                  <p className="text-xs mb-3">Select an outstanding advance to begin.</p>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("outstanding")} data-testid="button-go-outstanding">
                    <CircleDollarSign className="h-4 w-4 mr-1" />View Outstanding
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3" data-testid="tab-content-history">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-semibold" data-testid="text-history-title">
                {(isAdmin || isSuperAdmin) ? "All Submissions" : isSupervisor ? "Team" : "My Submissions"}
              </h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={fetchOperationalCosts} disabled={operationalCostsLoading} data-testid="button-refresh-operational">
                  <RefreshCw className={`h-4 w-4 ${operationalCostsLoading ? 'animate-spin' : ''}`} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-export-history">
                      <Download className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem data-testid="button-export-history-excel" onClick={() => {
                      const sf = statusFilter === 'all' ? filteredOperationalCosts : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
                      if (sf.length === 0) { toast({ title: "No Data", variant: "destructive" }); return; }
                      exportSubmissionsToExcel(sf, users, `Cost Submissions (${statusFilter})`, `cost-submissions-${statusFilter}`);
                      toast({ title: "Excel Exported" });
                    }}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="button-export-history-pdf" onClick={() => {
                      const sf = statusFilter === 'all' ? filteredOperationalCosts : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
                      if (sf.length === 0) { toast({ title: "No Data", variant: "destructive" }); return; }
                      exportSubmissionsToPDF(sf, users, `Cost Submissions (${statusFilter})`, statusFilter, `cost-submissions-${statusFilter}`);
                      toast({ title: "PDF Exported" });
                    }}>
                      <FileDown className="h-4 w-4 mr-2" />PDF
                    </DropdownMenuItem>
                    <Separator />
                    <DropdownMenuItem onClick={() => handleOperationalStatementExport('pdf')}>
                      <CircleDollarSign className="h-4 w-4 mr-2" />Statement PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleOperationalStatementExport('excel')}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />Statement Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide" data-testid="status-filter-bar">
              {([
                { key: 'all', label: 'All', count: filteredOperationalCosts.length },
                { key: 'pending', label: 'Pending', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length },
                { key: 'under_review', label: 'Review', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length },
                { key: 'approved', label: 'Approved', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length },
                { key: 'rejected', label: 'Rejected', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length },
                { key: 'paid', label: 'Paid', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid').length },
                { key: 'reconciled', label: 'Reconciled', count: filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'reconciled').length },
              ] as const).map(f => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={statusFilter === f.key ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(f.key)}
                  className={`whitespace-nowrap text-xs shrink-0 ${statusFilter !== f.key && f.count === 0 ? 'opacity-50' : ''}`}
                  data-testid={`button-filter-${f.key}`}
                >
                  {f.label}
                  {f.count > 0 && <span className="ml-1 text-[10px] font-bold">{f.count}</span>}
                </Button>
              ))}
            </div>

            {operationalCostsLoading && filteredOperationalCosts.length === 0 && (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            )}

            {(() => {
              const statusFiltered = statusFilter === 'all' ? filteredOperationalCosts : filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === statusFilter);
              if (statusFiltered.length === 0 && !operationalCostsLoading) {
                return (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-results">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No {statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} submissions found</p>
                    <p className="text-xs" dir="rtl">لا توجد طلبات</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {statusFiltered.map((oc) => {
                    const catMeta = EXPENSE_CATEGORY_MAP[oc.expense_category];
                    const CatIcon = catMeta?.icon;
                    const derivedStatus = getOperationalDerivedStatus(oc);
                    const pendingTierLabel = oc.tier1_status === 'pending' ? '1' : oc.tier2_status === 'pending' ? '2' : hasThreeTiers(oc) && oc.tier3_status === 'pending' ? '3' : '?';
                    const statusLabels: Record<string, string> = {
                      pending: `Pending T${pendingTierLabel}`, under_review: `Review T${pendingTierLabel}`,
                      approved: 'Approved', rejected: 'Rejected', paid: 'Paid', reconciled: 'Reconciled',
                    };
                    const submitterName = users.find(u => u.id === oc.submitted_by)?.name || 'Unknown';
                    const title = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';
                    const isExpanded = expandedItemId === oc.id;

                    const cleanTier1Notes = oc.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier2Notes = oc.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
                    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
                    const tier3Approver = oc.tier3_approved_by ? users.find(u => u.id === oc.tier3_approved_by) : null;

                    return (
                      <Card key={oc.id} className="overflow-visible" data-testid={`operational-cost-${oc.id}`}>
                        <button
                          className="w-full text-left p-3 touch-manipulation"
                          onClick={() => setExpandedItemId(isExpanded ? null : oc.id)}
                          data-testid={`button-expand-${oc.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-semibold text-sm truncate" data-testid={`text-title-${oc.id}`}>{title}</span>
                                {CatIcon && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    <CatIcon className="h-3 w-3" />
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                {canViewTeamSubmissions && <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{submitterName}</span>}
                                <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{oc.created_at ? format(new Date(oc.created_at), 'MMM d') : 'N/A'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="font-bold text-sm tabular-nums" data-testid={`text-amount-${oc.id}`}>
                                {oc.currency} {(oc.amount_cents / 100).toLocaleString()}
                              </span>
                              <Badge className={`text-[10px] border-0 ${statusColors[derivedStatus] || statusColors.pending}`}>
                                {statusLabels[derivedStatus] || derivedStatus}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 mt-2">
                            {(() => {
                              const tierBadge = (status: string | null, label: string) => (
                                <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                  : status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                  : 'bg-muted text-muted-foreground'
                                }`}>
                                  {status === 'approved' ? <CheckCircle className="h-2.5 w-2.5" /> : status === 'rejected' ? <XCircle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                                  <span>{label}</span>
                                </div>
                              );
                              const threeTier = hasThreeTiers(oc);
                              return (
                                <>
                                  {tierBadge(oc.tier1_status, 'T1')}
                                  <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                  {tierBadge(oc.tier2_status, 'T2')}
                                  {threeTier && (
                                    <>
                                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                      {tierBadge(oc.tier3_status, 'T3')}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                            <div className="flex-1" />
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-3 border-t pt-3">
                            {(cleanTier1Notes || cleanTier2Notes || oc.rejection_reason) && (
                              <div className="space-y-1.5">
                                {cleanTier1Notes && (
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">T1:</span> {cleanTier1Notes}
                                    {tier1Approver && <span className="opacity-60"> — {tier1Approver.name}</span>}
                                  </div>
                                )}
                                {cleanTier2Notes && (
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">T2:</span> {cleanTier2Notes}
                                    {tier2Approver && <span className="opacity-60"> — {tier2Approver.name}</span>}
                                  </div>
                                )}
                                {oc.rejection_reason && (
                                  <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                                    <div className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
                                      <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-semibold">Rejection: "{oc.rejection_reason}"</p>
                                        <p className="text-red-500/80 italic mt-0.5">You can edit and resubmit.</p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                              {canTier1Approve(oc) && (
                                <>
                                  <Button size="sm" onClick={() => openApprovalDialog(oc, 'approve', 1)} data-testid={`button-tier1-approve-${oc.id}`}>
                                    <ThumbsUp className="h-3 w-3 mr-1" />Approve T1
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openApprovalDialog(oc, 'reject', 1)} data-testid={`button-tier1-reject-${oc.id}`}>
                                    <ThumbsDown className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                </>
                              )}
                              {canTier2Approve(oc) && (
                                <>
                                  <Button size="sm" onClick={() => openApprovalDialog(oc, 'approve', 2)} data-testid={`button-tier2-approve-${oc.id}`}>
                                    <ThumbsUp className="h-3 w-3 mr-1" />{hasThreeTiers(oc) ? 'Approve T2' : 'Final Approve'}
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openApprovalDialog(oc, 'reject', 2)} data-testid={`button-tier2-reject-${oc.id}`}>
                                    <ThumbsDown className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                </>
                              )}
                              {canTier3Approve(oc) && (
                                <>
                                  <Button size="sm" onClick={() => openApprovalDialog(oc, 'approve', 3)} data-testid={`button-tier3-approve-${oc.id}`}>
                                    <ThumbsUp className="h-3 w-3 mr-1" />Final T3
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openApprovalDialog(oc, 'reject', 3)} data-testid={`button-tier3-reject-${oc.id}`}>
                                    <ThumbsDown className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                </>
                              )}
                              {getOperationalDerivedStatus(oc) === 'approved' && (
                                <Button size="sm" variant="outline" onClick={() => handleDownloadCertificate(oc)} data-testid={`button-download-certificate-${oc.id}`}>
                                  <Download className="h-3 w-3 mr-1" />PDF
                                </Button>
                              )}
                              {canRequestPayment(oc) && (
                                <Button size="sm" variant="outline" onClick={() => openPaymentRequestDialog(oc)} disabled={actionProcessing} data-testid={`button-request-payment-${oc.id}`}>
                                  <Mail className="h-3 w-3 mr-1" />Pay Request
                                </Button>
                              )}
                              {canMarkAsPaid(oc) && (
                                <Button size="sm" onClick={() => handleMarkAsPaid(oc)} disabled={actionProcessing} data-testid={`button-mark-paid-${oc.id}`}>
                                  <Wallet className="h-3 w-3 mr-1" />Mark Paid
                                </Button>
                              )}
                              {derivedStatus === 'paid' && (
                                <Button size="sm" variant="outline" onClick={() => { setActiveReconciliation(oc); setActiveTab("reconciliation"); }} data-testid={`button-reconcile-${oc.id}`}>
                                  <Receipt className="h-3 w-3 mr-1" />Reconcile
                                </Button>
                              )}
                              {canEditSubmission(oc) && (
                                <Button size="sm" variant="outline" onClick={() => handleEditSubmission(oc)} data-testid={`button-edit-submission-${oc.id}`}>
                                  <Pencil className="h-3 w-3 mr-1" />Edit
                                </Button>
                              )}
                              {canDeleteSubmission(oc) && (
                                <Button size="sm" variant="destructive" onClick={() => setDeleteConfirm(oc)} data-testid={`button-delete-submission-${oc.id}`}>
                                  <Trash2 className="h-3 w-3 mr-1" />Delete
                                </Button>
                              )}
                              {canResubmitSubmission(oc) && (
                                <Button size="sm" onClick={() => handleEditSubmission(oc)} data-testid={`button-resubmit-submission-${oc.id}`}>
                                  <SendHorizonal className="h-3 w-3 mr-1" />Resubmit
                                </Button>
                              )}
                              {canRecallSubmission(oc) && (
                                <Button size="sm" variant="outline" onClick={() => setRecallConfirm(oc)} data-testid={`button-recall-submission-${oc.id}`}>
                                  <RotateCcw className="h-3 w-3 mr-1" />Recall
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <Dialog open={approvalDialog.open} onOpenChange={(open) => {
        if (!open) { setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null }); setApprovalNotes(''); }
      }}>
        <DialogContent className="max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle data-testid="dialog-approval-title">
              {approvalDialog.action === 'approve' ? `Tier ${approvalDialog.tier} Approval` : `Tier ${approvalDialog.tier} Rejection`}
              <span dir="rtl" className="block text-xs font-normal text-muted-foreground mt-0.5">
                {approvalDialog.action === 'approve' ? `الموافقة - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier]}` : `الرفض - المرحلة ${{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة' }[approvalDialog.tier]}`}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {approvalDialog.action === 'approve'
                ? approvalDialog.submission && isFinalTier(approvalDialog.submission, approvalDialog.tier) ? 'Final approval with signature.' : 'Approve to move to next tier.'
                : 'Please provide a rejection reason.'}
            </DialogDescription>
          </DialogHeader>
          {approvalDialog.submission && (() => {
            const sub = approvalDialog.submission;
            const submitter = users.find(u => u.id === sub.submitted_by);
            const amountValue = sub.amount_cents / 100;
            return (
              <div className="space-y-3 py-1">
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{sub.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">{submitter?.name || 'Unknown'} ({sub.submitter_role || 'N/A'})</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-base">{sub.currency} {amountValue.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{sub.expense_category?.replace(/_/g, ' ')}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{sub.expense_date ? format(new Date(sub.expense_date), 'MMM d, yyyy') : 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{approvalDialog.action === 'approve' ? 'Approval Notes / ملاحظات الموافقة' : 'Rejection Reason / سبب الرفض'} {approvalDialog.action === 'reject' && <span className="text-red-500">*</span>}</Label>
                  <Textarea value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder={approvalDialog.action === 'approve' ? 'Optional notes...' : 'Enter reason for rejection...'} rows={3} data-testid="input-approval-notes" />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null }); setApprovalNotes(''); }} disabled={approvalProcessing} data-testid="button-approval-cancel">Cancel</Button>
            <Button
              variant={approvalDialog.action === 'reject' ? 'destructive' : 'default'}
              onClick={handleApprovalAction}
              disabled={approvalProcessing || (approvalDialog.action === 'reject' && !approvalNotes.trim())}
              data-testid="button-approval-confirm"
            >
              {approvalProcessing ? 'Processing...' : approvalDialog.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-delete-title">Delete Submission<span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">حذف الطلب</span></AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
              {deleteConfirm && <span className="block mt-1 font-medium">{deleteConfirm.currency} {(deleteConfirm.amount_cents / 100).toLocaleString()} - {deleteConfirm.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSubmission(); }} disabled={actionProcessing} data-testid="button-delete-confirm">
              {actionProcessing ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recallConfirm} onOpenChange={(open) => !open && setRecallConfirm(null)}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-recall-title">Recall Submission<span dir="rtl" className="block text-sm font-normal text-muted-foreground mt-0.5">استرجاع الطلب</span></AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all approvals.
              {recallConfirm && <span className="block mt-1 font-medium">{recallConfirm.currency} {(recallConfirm.amount_cents / 100).toLocaleString()}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionProcessing} data-testid="button-recall-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRecallSubmission(); }} disabled={actionProcessing} data-testid="button-recall-confirm">
              {actionProcessing ? 'Recalling...' : 'Recall to Pending'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => {
        if (!open && !paymentRequestDialog.sending) setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false });
      }}>
        <DialogContent className="max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="dialog-payment-request-title">
              <Mail className="h-4 w-4" />Request Payment
            </DialogTitle>
            <DialogDescription className="text-xs">Select who should receive the payment request email.</DialogDescription>
          </DialogHeader>
          {paymentRequestDialog.loading ? (
            <div className="flex items-center justify-center py-6"><Skeleton className="h-6 w-48" /></div>
          ) : paymentRequestDialog.availableRecipients.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-xs">No finance/admin users found.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox id="select-all-recipients" checked={paymentRequestDialog.selectedRecipientIds.length === paymentRequestDialog.availableRecipients.length} onCheckedChange={toggleAllPaymentRecipients} data-testid="checkbox-select-all-recipients" />
                <Label htmlFor="select-all-recipients" className="text-sm cursor-pointer">Select All ({paymentRequestDialog.availableRecipients.length})</Label>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {paymentRequestDialog.availableRecipients.map(recipient => (
                  <div key={recipient.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate">
                    <Checkbox id={`recipient-${recipient.id}`} checked={paymentRequestDialog.selectedRecipientIds.includes(recipient.id)} onCheckedChange={() => togglePaymentRecipient(recipient.id)} data-testid={`checkbox-recipient-${recipient.id}`} />
                    <Label htmlFor={`recipient-${recipient.id}`} className="flex-1 cursor-pointer">
                      <div className="text-xs font-medium">{recipient.name}</div>
                      <div className="text-[10px] text-muted-foreground">{recipient.email}</div>
                    </Label>
                    <Badge variant="secondary" className="text-[10px]">{recipient.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!paymentRequestDialog.loading && paymentRequestDialog.availableRecipients.length > 0 && (
            <div className="border-t pt-2">
              <EmailCCInput ccEmails={paymentRequestDialog.ccEmails} onChange={(emails) => setPaymentRequestDialog(prev => ({ ...prev, ccEmails: emails }))} contacts={ccContacts.filter(c => !paymentRequestDialog.selectedRecipientIds.includes(c.id))} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentRequestDialog({ open: false, submission: null, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false })} disabled={paymentRequestDialog.sending} data-testid="button-payment-request-cancel">Cancel</Button>
            <Button onClick={handleSendPaymentRequest} disabled={paymentRequestDialog.sending || paymentRequestDialog.selectedRecipientIds.length === 0} data-testid="button-payment-request-send">
              <Mail className="h-3 w-3 mr-1" />{paymentRequestDialog.sending ? 'Sending...' : `Send (${paymentRequestDialog.selectedRecipientIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewAdvanceDetails} onOpenChange={(open) => !open && setViewAdvanceDetails(null)}>
        <DialogContent className="max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Advance Details</DialogTitle>
          </DialogHeader>
          {viewAdvanceDetails && (() => {
            const oc = viewAdvanceDetails;
            const submitter = users.find(u => u.id === oc.submitted_by);
            const project = oc.project_id ? allProjects.find(p => p.id === oc.project_id) : null;
            const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
            const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm">{oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</h3>
                    <p className="text-xs text-muted-foreground">{oc.reference_number}</p>
                  </div>
                  <Badge className={oc.status === 'reconciled' ? 'bg-teal-100 text-teal-800' : oc.status === 'paid' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}>
                    {oc.status === 'reconciled' ? 'Reconciled' : oc.status === 'paid' ? 'Paid' : 'Approved'}
                  </Badge>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Amount</p><p className="font-bold text-base">{oc.currency} {(oc.amount_cents / 100).toLocaleString()}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><FolderOpen className="h-3 w-3" />Category</p><p className="font-medium">{EXPENSE_CATEGORY_MAP[oc.expense_category]?.label || oc.expense_category}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Submitted By</p><p className="font-medium">{submitter?.name || 'Unknown'}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />Project</p><p className="font-medium">{project?.name || 'General'}</p></div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-semibold text-xs flex items-center gap-1"><Shield className="h-3 w-3" />Approval Timeline</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      <span>T1: {tier1Approver?.name || 'N/A'} {oc.tier1_approved_at && `— ${format(new Date(oc.tier1_approved_at), 'MMM d')}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-blue-500 shrink-0" />
                      <span>T2: {tier2Approver?.name || 'N/A'} {oc.tier2_approved_at && `— ${format(new Date(oc.tier2_approved_at), 'MMM d')}`}</span>
                    </div>
                    {oc.paid_at && (
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3 w-3 text-purple-500 shrink-0" />
                        <span>Paid: {format(new Date(oc.paid_at), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                    {oc.reconciled_at && (
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-3 w-3 text-teal-500 shrink-0" />
                        <span>Reconciled: {format(new Date(oc.reconciled_at), 'MMM d, yyyy')}</span>
                        {oc.reconciled_amount_cents != null && (
                          <span className="text-muted-foreground">({oc.currency} {(oc.reconciled_amount_cents / 100).toLocaleString()})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAdvanceDetails(null)} data-testid="button-close-details">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signatureModal.submission && (
        <SignatureConfirmationModal
          open={signatureModal.open}
          onOpenChange={(open) => {
            if (!open) {
              if (signatureCompletedRef.current) { signatureCompletedRef.current = false; return; }
              const { submission: sub, notes, tier: modalTier } = signatureModal;
              setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
              setApprovalProcessing(false);
              if (sub) { setApprovalNotes(notes); setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub }); }
            }
          }}
          transaction={{
            id: signatureModal.submission.id,
            type: 'cost_submission',
            title: `Tier ${signatureModal.tier} Approval - ${signatureModal.submission.expense_category.replace(/_/g, ' ')}`,
            description: signatureModal.submission.description || undefined,
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
            if (sub) { setApprovalNotes(notes); setApprovalDialog({ open: true, action: 'approve', tier: modalTier, submission: sub }); }
          }}
        />
      )}
    </div>
  );
};

export default MobileCostSubmission;
