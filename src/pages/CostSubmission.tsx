import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Clock, CheckCircle, XCircle, AlertCircle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, ThumbsUp, ThumbsDown, ArrowRight, Calendar, MapPin, Building2, FolderOpen, Hash, Paperclip, Download, Pencil, Trash2, RotateCcw, SendHorizonal } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUserCostSubmissions, useCostSubmissions, useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { useAppContext } from "@/context/AppContext";
import { useUser } from "@/context/user/UserContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUserProjects } from "@/hooks/useUserProjects";
import { AppRole } from "@/types";
import CostSubmissionHistory from "@/components/cost-submission/CostSubmissionHistory";
import UnifiedCostRequestForm from "@/components/cost-submission/UnifiedCostRequestForm";
import CostReconciliationForm from "@/components/cost-submission/CostReconciliationForm";
import OutstandingAdvances from "@/components/cost-submission/OutstandingAdvances";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  Info, 
  RefreshCw, 
  CircleDollarSign,
  ClipboardCheck,
  HelpCircle
} from "lucide-react";
import { SignatureConfirmationModal } from "@/components/signatures/SignatureConfirmationModal";
import type { SignatureMethod } from "@/types/signature";
import { generateApprovalCertificatePdf } from "@/utils/approvalCertificatePdf";

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
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
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
                currentUser?.role === 'Field Operation Manager (FOM)';
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
  
  // All roles can submit operational costs EXCEPT Data Collectors/Enumerators
  // Includes: FOM, Coordinator, Country Director, Admin, Super Admin, Supervisor
  const canSubmitOperationalCosts = isFOM || isCoordinator || isCountryDirector || isAdmin || isSupervisor || isAdminOrSuperUser;
  
  // Admins and supervisors can see team submissions and approval status
  const canViewTeamSubmissions = isAdmin || isSupervisor || isCountryDirector;
  
  const isSuperAdmin = isAdminOrSuperUser || 
    currentUser?.role === 'SuperAdmin' || currentUser?.role === 'superAdmin' || 
    currentUser?.role === 'super_admin' || currentUser?.role === 'Super Admin';

  // Default to Submit Request tab for all users
  const [activeTab, setActiveTab] = useState<"submit" | "reconciliation" | "outstanding" | "history">("submit");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "under_review" | "approved" | "rejected" | "paid">("all");
  const [showGuide, setShowGuide] = useState(false);
  const [operationalCosts, setOperationalCosts] = useState<OperationalCostSubmission[]>([]);
  const [operationalCostsLoading, setOperationalCostsLoading] = useState(true);
  
  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    tier: 1 | 2;
    submission: OperationalCostSubmission | null;
  }>({ open: false, action: 'approve', tier: 1, submission: null });
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  
  const [signatureModal, setSignatureModal] = useState<{
    open: boolean;
    submission: OperationalCostSubmission | null;
    tier: 1 | 2;
    notes: string;
  }>({ open: false, submission: null, tier: 2, notes: '' });

  const [editingSubmission, setEditingSubmission] = useState<OperationalCostSubmission | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OperationalCostSubmission | null>(null);
  const [recallConfirm, setRecallConfirm] = useState<OperationalCostSubmission | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [viewAdvanceDetails, setViewAdvanceDetails] = useState<OperationalCostSubmission | null>(null);
  const [activeReconciliation, setActiveReconciliation] = useState<OperationalCostSubmission | null>(null);
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [reconcileActualAmount, setReconcileActualAmount] = useState('');
  const [reconcileProcessing, setReconcileProcessing] = useState(false);

  const fetchOperationalCosts = useCallback(async () => {
    if (!currentUser?.id) return;
    setOperationalCostsLoading(true);
    try {
      let query = supabase
        .from('operational_cost_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!canViewTeamSubmissions) {
        query = query.eq('submitted_by', currentUser.id);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching operational costs:', error);
        setOperationalCosts([]);
      } else {
        setOperationalCosts((data as OperationalCostSubmission[]) || []);
      }
    } catch (err) {
      console.error('Error fetching operational costs:', err);
      setOperationalCosts([]);
    } finally {
      setOperationalCostsLoading(false);
    }
  }, [currentUser?.id, canViewTeamSubmissions]);

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
      // Hub supervisors see submissions from their hub's team members
      const hubId = currentUser.hubId;
      const stateId = currentUser.stateId;
      
      if (hubId) {
        // Filter team members by hub_id
        return users
          .filter(u => u.hubId === hubId && u.id !== currentUser.id)
          .map(u => u.id);
      } else if (stateId) {
        // Fallback: Filter by state
        return users
          .filter(u => u.stateId === stateId && u.id !== currentUser.id)
          .map(u => u.id);
      }
    }
    return [];
  };
  
  const teamMemberIds = getTeamMemberIds();
  
  // Filter submissions for supervisors to show only their team's submissions
  const filterSubmissionsForSupervisor = (allSubs: typeof allSubmissionsQuery.submissions) => {
    if (isAdmin) return allSubs; // Admins see all
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
    if (isAdminOrSuperUser) return supervisorFilteredSubmissions;
    if (userProjectIds.length === 0) return []; // No project memberships = no data
    return supervisorFilteredSubmissions.filter(s => 
      !s.projectId || userProjectIds.includes(s.projectId)
    );
  }, [supervisorFilteredSubmissions, userProjectIds, isAdminOrSuperUser]);

  const filteredOperationalCosts = useMemo(() => {
    let filtered = operationalCosts;
    if (!isAdminOrSuperUser) {
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
  }, [operationalCosts, isAdminOrSuperUser, isSupervisor, teamMemberIds, canViewTeamSubmissions, currentUser?.id, userProjectIds]);

  const getOperationalDerivedStatus = (oc: OperationalCostSubmission): string => {
    if (oc.status === 'paid') return 'paid';
    if (oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.status === 'rejected') return 'rejected';
    if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved') return 'approved';
    if (oc.tier1_status === 'approved' && oc.tier2_status === 'pending') return 'under_review';
    if (oc.status === 'under_review') return 'under_review';
    return 'pending';
  };

  const canTier1Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'pending') return false;
    if (isSuperAdmin) return true;
    if (oc.submitted_by === currentUser?.id) return false;
    return isSupervisor || isFOM || isAdmin;
  };

  const canTier2Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'approved' || oc.tier2_status !== 'pending') return false;
    if (isSuperAdmin) return true;
    return isAdmin;
  };

  const openApprovalDialog = (oc: OperationalCostSubmission, action: 'approve' | 'reject', tier: 1 | 2) => {
    setApprovalDialog({ open: true, action, tier, submission: oc });
    setApprovalNotes('');
  };

  const handleApprovalAction = async () => {
    const { action, tier, submission } = approvalDialog;
    if (!submission || !currentUser?.id) return;
    
    if (tier === 2 && action === 'approve') {
      setApprovalProcessing(true);
      setSignatureModal({
        open: true,
        submission,
        tier: 2,
        notes: approvalNotes,
      });
      setApprovalDialog({ open: false, action: 'approve', tier: 2, submission: null });
      return;
    }
    
    await processApproval(action, tier, submission, approvalNotes);
  };

  const processApproval = async (
    action: 'approve' | 'reject',
    tier: 1 | 2,
    submission: OperationalCostSubmission,
    notes: string,
    signatureData?: { signatureId: string; signatureHash: string; method: SignatureMethod; signedAt: string }
  ) => {
    if (!currentUser?.id) return;
    
    setApprovalProcessing(true);
    try {
      const updates: Record<string, any> = {};
      
      if (tier === 1) {
        updates.tier1_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier1_approved_by = currentUser.id;
        updates.tier1_approved_at = new Date().toISOString();
        updates.tier1_notes = notes || null;
        if (action === 'approve') {
          updates.status = 'under_review';
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 1 / تم الرفض في المرحلة الأولى';
        }
      } else {
        updates.tier2_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier2_approved_by = currentUser.id;
        updates.tier2_approved_at = new Date().toISOString();
        updates.tier2_notes = notes || null;
        if (action === 'approve') {
          updates.status = 'approved';
          if (signatureData) {
            updates.tier2_notes = `${notes || ''}\n[Signed: ${signatureData.method.toUpperCase()} | Hash: ${signatureData.signatureHash.substring(0, 12)}... | ID: ${signatureData.signatureId} | ${signatureData.signedAt}]`;
          }
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = notes || 'Rejected at Tier 2 / تم الرفض في المرحلة الثانية';
        }
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
        const tierAr = tier === 1 ? 'الأولى' : 'الثانية';
        toast({
          title: action === 'approve' ? "Approved & Signed / تمت الموافقة والتوقيع" : "Rejected / تم الرفض",
          description: tier === 2 && action === 'approve' && signatureData
            ? `Final approval completed with digital signature (${signatureData.method}). / تمت الموافقة النهائية بالتوقيع الرقمي.`
            : `Tier ${tier} ${action === 'approve' ? 'approval' : 'rejection'} completed successfully. / المرحلة ${tierAr} ${action === 'approve' ? 'تمت الموافقة' : 'تم الرفض'} بنجاح.`,
          duration: 5000,
        });
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

  const handleSignatureComplete = (signatureData: {
    signatureId: string;
    signatureHash: string;
    method: SignatureMethod;
    signedAt: string;
  }) => {
    const { submission, notes } = signatureModal;
    if (!submission) return;
    processApproval('approve', 2, submission, notes, signatureData);
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
            .select('signature_data')
            .eq('id', sigMatch[1])
            .single();
          if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) {
            signatureImageData = sigRow.signature_data;
          }
        } catch { /* signature fetch failed, continue without */ }
      }
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
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'pending') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canResubmitSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus !== 'rejected') return false;
    if (isSuperAdmin || isAdmin) return true;
    return oc.submitted_by === currentUser?.id;
  };

  const canRecallSubmission = (oc: OperationalCostSubmission): boolean => {
    const derivedStatus = getOperationalDerivedStatus(oc);
    if (derivedStatus === 'paid') return false;
    if (derivedStatus !== 'under_review' && derivedStatus !== 'approved') return false;
    return isSuperAdmin || isAdmin;
  };

  const handleEditSubmission = (oc: OperationalCostSubmission) => {
    setEditingSubmission(oc);
    setActiveTab("submit");
  };

  const handleDeleteSubmission = async () => {
    if (!deleteConfirm) return;
    setActionProcessing(true);
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .delete()
        .eq('id', deleteConfirm.id)
        .eq('tier1_status', 'pending')
        .eq('tier2_status', 'pending');

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

  const submissionStats = {
    total: submissions.length + filteredOperationalCosts.length,
    pending: submissions.filter(s => s.status === 'pending').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'pending').length,
    underReview: submissions.filter(s => s.status === 'under_review').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'under_review').length,
    approved: submissions.filter(s => s.status === 'approved').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'rejected').length,
    paid: submissions.filter(s => s.status === 'paid').length + filteredOperationalCosts.filter(o => getOperationalDerivedStatus(o) === 'paid').length
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
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                {canViewTeamSubmissions ? "Cost Approval & Tracking" : "Cost Submission"}
                {isAdmin && (
                  <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border-purple-300">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin View
                  </Badge>
                )}
                {isSupervisor && !isAdmin && (
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300">
                    <Users className="h-3 w-3 mr-1" />
                    Supervisor View
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isAdmin 
                  ? "Review, approve, and track cost submissions from all team members"
                  : isSupervisor
                    ? "Review and approve cost submissions from your team members"
                    : "Submit actual costs for completed site visits and track approval status"
                }
              </p>
            </div>
          </div>
        </div>
      </div>

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
              <h4 className="font-semibold text-sm mb-3 text-blue-800 dark:text-blue-200">Two-Tier Approval Process</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <h4 className="font-semibold text-sm">Submit Request</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose Advance (get funds first) or Reimbursement (already paid). Select expense category, enter amount, attach documents, and submit.
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <h4 className="font-semibold text-sm">Tier 1: Supervisor Review</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hub Supervisor or FOM reviews the submission, verifies details and documents. They can approve, reject, or request changes.
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الأولى: مراجعة المشرف - يقوم مشرف المركز أو مدير العمليات الميدانية بمراجعة الطلب والتحقق من التفاصيل والمستندات.
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h4 className="font-semibold text-sm">Tier 2: Admin Approval</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin or Super Admin performs final approval and authorizes payment. Both tiers must approve before payment proceeds.
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    المرحلة الثانية: موافقة المسؤول - يقوم المسؤول أو المسؤول الأعلى بالموافقة النهائية وتفويض الدفع. يجب موافقة المرحلتين قبل الدفع.
                  </p>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">4</div>
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
              <p className="text-xs text-muted-foreground mb-1"><strong>عملية الموافقة:</strong> المرحلة الأولى (المشرف) ← المرحلة الثانية (المسؤول) ← الدفع</p>
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
                {isAdmin ? "All Submissions" : isSupervisor ? "Team" : isCountryDirector ? "Overview" : "My Submissions"}
              </span>
              <span className="sm:hidden">History</span>
              {submissionStats.total > 0 && activeTab !== "history" && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0">
                  {submissionStats.total}
                </Badge>
              )}
            </TabsTrigger>
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
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-purple-600" />
                <CardTitle>Advance Reconciliation</CardTitle>
              </div>
              <CardDescription>
                Reconcile advance payments by submitting receipts and accounting for all funds received.
                <span dir="rtl" className="block text-xs mt-0.5">تسوية المدفوعات المسبقة عن طريق تقديم الإيصالات وحساب جميع الأموال المستلمة.</span>
              </CardDescription>
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
                      <Button variant="outline" size="sm" onClick={() => setActiveReconciliation(null)} data-testid="button-cancel-reconciliation">
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

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="actual-amount">Actual Amount Spent / المبلغ الفعلي المنفق</Label>
                          <div className="relative">
                            <Input
                              id="actual-amount"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={reconcileActualAmount}
                              onChange={(e) => setReconcileActualAmount(e.target.value)}
                              data-testid="input-actual-amount"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              {activeReconciliation.currency}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-lg border p-3 space-y-2">
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
                          {difference >= 0 && actualSpent > 0 && (
                            <p className="text-xs text-green-600">Return the unused amount to finance. / أعد المبلغ غير المستخدم للمالية.</p>
                          )}
                          {difference < 0 && (
                            <p className="text-xs text-red-600">Submit a reimbursement request for the overspent amount. / قدم طلب تعويض عن المبلغ الزائد.</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reconcile-notes">Notes & Receipt Description / ملاحظات ووصف الإيصال</Label>
                        <Textarea
                          id="reconcile-notes"
                          placeholder="Describe how the funds were used, list receipts collected..."
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
                        onClick={() => setActiveReconciliation(null)}
                        data-testid="button-reconcile-cancel"
                      >
                        Cancel / إلغاء
                      </Button>
                      <Button
                        disabled={!reconcileActualAmount || parseFloat(reconcileActualAmount) < 0 || !reconcileNotes.trim() || reconcileProcessing}
                        onClick={async () => {
                          if (!activeReconciliation) return;
                          setReconcileProcessing(true);
                          try {
                            const actual = parseFloat(reconcileActualAmount) * 100;
                            const diff = activeReconciliation.amount_cents - actual;
                            const reconciliationData = {
                              actual_spent_cents: actual,
                              balance_cents: diff,
                              balance_status: diff === 0 ? 'settled' : diff > 0 ? 'refund_due' : 'overspent',
                              reconciliation_notes: reconcileNotes.trim(),
                              reconciled_at: new Date().toISOString(),
                              reconciled_by: currentUser?.id,
                            };
                            const descUpdate = `${activeReconciliation.description || ''}\n[RECONCILED] Actual: ${activeReconciliation.currency} ${(actual/100).toLocaleString()} | Balance: ${activeReconciliation.currency} ${(diff/100).toLocaleString()} | ${reconcileNotes.trim()}`;
                            const { error } = await supabase
                              .from('operational_cost_submissions')
                              .update({
                                status: 'reconciled',
                                description: descUpdate,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', activeReconciliation.id);

                            if (error) {
                              toast({ title: "Reconciliation Failed / فشلت التسوية", description: error.message, variant: "destructive" });
                            } else {
                              toast({ title: "Reconciled / تمت التسوية", description: `Advance reconciled successfully. Balance: ${activeReconciliation.currency} ${Math.abs(diff/100).toLocaleString()} ${diff > 0 ? '(to return)' : diff < 0 ? '(overspent)' : '(settled)'}` });
                              setActiveReconciliation(null);
                              setReconcileActualAmount('');
                              setReconcileNotes('');
                              fetchOperationalCosts();
                            }
                          } catch {
                            toast({ title: "Error / خطأ", description: "Failed to reconcile. Please try again.", variant: "destructive" });
                          } finally {
                            setReconcileProcessing(false);
                          }
                        }}
                        data-testid="button-submit-reconciliation"
                      >
                        {reconcileProcessing ? 'Processing... / جارٍ المعالجة...' : 'Submit Reconciliation / تقديم التسوية'}
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
                        <li>Go to <strong>"Outstanding"</strong> tab to see advances pending reconciliation</li>
                        <li>Click <strong>"Reconcile"</strong> on an advance to start the process</li>
                        <li>Enter the actual amount spent and describe how funds were used</li>
                        <li>If you spent less, return the unused amount to finance</li>
                        <li>If you overspent, submit a reimbursement request for the difference</li>
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
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-amber-600" />
                <CardTitle>Outstanding Advances</CardTitle>
              </div>
              <CardDescription>
                View all advance payments that are pending reconciliation. Track amounts received vs. spent and due dates for submitting receipts.
              </CardDescription>
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
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-slate-600" />
                <CardTitle>
                  {isAdmin ? "All Cost Submissions" : isSupervisor ? "Team Submissions" : isCountryDirector ? "Submissions Overview" : "My Submissions"}
                </CardTitle>
              </div>
              <CardDescription>
                {isAdmin 
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
          </div>

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
            return statusFiltered.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">Operational Cost Requests</CardTitle>
                    <Badge variant="secondary">{statusFiltered.length}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statusFiltered.map((oc) => {
                    const categoryLabels: Record<string, string> = {
                      permits: 'Permits & Licenses',
                      incentives: 'Incentives & Allowances',
                      communications: 'Internet & Comms',
                      training: 'Training',
                      transport: 'Transportation',
                      general_transport: 'Transportation',
                      equipment: 'Equipment & Supplies',
                      printing: 'Printing & Stationery',
                      meetings: 'Meetings',
                      office_admin: 'Office Admin',
                      other: 'Other'
                    };
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                      under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                      approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                      rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                      paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
                    };
                    const derivedStatus = getOperationalDerivedStatus(oc);
                    const statusLabels: Record<string, string> = {
                      pending: 'Pending (Tier 1) / معلق (المرحلة ١)',
                      under_review: 'Under Review (Tier 2) / قيد المراجعة (المرحلة ٢)',
                      approved: 'Approved / تمت الموافقة',
                      rejected: 'Rejected / مرفوض',
                      paid: 'Paid / تم الدفع',
                    };
                    const submitterName = users.find(u => u.id === oc.submitted_by)?.name || 'Unknown';
                    const title = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';

                    const cleanTier1Notes = oc.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const cleanTier2Notes = oc.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '';
                    const tier1Approver = oc.tier1_approved_by ? users.find(u => u.id === oc.tier1_approved_by) : null;
                    const tier2Approver = oc.tier2_approved_by ? users.find(u => u.id === oc.tier2_approved_by) : null;
                    const hasSig = oc.tier2_notes?.includes('[Signed:');

                    return (
                      <div
                        key={oc.id}
                        className="rounded-md border bg-background p-4 space-y-3"
                        data-testid={`operational-cost-${oc.id}`}
                      >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-base truncate" data-testid={`text-title-${oc.id}`}>{title}</span>
                                <Badge variant="outline" className="text-xs">
                                  {categoryLabels[oc.expense_category] || oc.expense_category}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                {canViewTeamSubmissions && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {submitterName}
                                  </span>
                                )}
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
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="font-bold text-lg tabular-nums" data-testid={`text-amount-${oc.id}`}>
                                {oc.currency} {(oc.amount_cents / 100).toLocaleString()}
                              </span>
                              <Badge className={`text-xs border-0 ${statusColors[derivedStatus] || statusColors.pending}`}>
                                {statusLabels[derivedStatus] || derivedStatus}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center gap-2" data-testid={`status-progress-${oc.id}`}>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <div
                                data-testid={`status-tier1-${oc.id}`}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                oc.tier1_status === 'approved'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                  : oc.tier1_status === 'rejected'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                    : 'bg-muted text-muted-foreground'
                              }`}>
                                {oc.tier1_status === 'approved' ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : oc.tier1_status === 'rejected' ? (
                                  <XCircle className="h-3 w-3" />
                                ) : (
                                  <Clock className="h-3 w-3" />
                                )}
                                <span>T1</span>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <div
                                data-testid={`status-tier2-${oc.id}`}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                oc.tier2_status === 'approved'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                  : oc.tier2_status === 'rejected'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                    : 'bg-muted text-muted-foreground'
                              }`}>
                                {oc.tier2_status === 'approved' ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : oc.tier2_status === 'rejected' ? (
                                  <XCircle className="h-3 w-3" />
                                ) : (
                                  <Clock className="h-3 w-3" />
                                )}
                                <span>T2</span>
                              </div>
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
                                  <span className="text-muted-foreground">
                                    {cleanTier2Notes}
                                    {tier2Approver && (
                                      <span className="opacity-60"> — {tier2Approver.name || tier2Approver.email}</span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {oc.rejection_reason && (
                                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400" data-testid={`text-rejection-${oc.id}`}>
                                  <XCircle className="h-3 w-3 shrink-0 mt-px" />
                                  <span>{oc.rejection_reason}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
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
                                  Final Approve
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
                            {oc.tier1_status === 'approved' && oc.tier2_status === 'approved' && (
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
      </Tabs>

      <Dialog open={approvalDialog.open} onOpenChange={(open) => {
        if (!open) {
          setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null });
          setApprovalNotes('');
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
                  ? `الموافقة - المرحلة ${approvalDialog.tier === 1 ? 'الأولى' : 'الثانية'}`
                  : `الرفض - المرحلة ${approvalDialog.tier === 1 ? 'الأولى' : 'الثانية'}`}
              </span>
            </DialogTitle>
            <DialogDescription>
              {approvalDialog.action === 'approve'
                ? `You are about to approve this submission${approvalDialog.tier === 2 ? ' (final approval - clears for payment)' : ' (moves to Tier 2 Admin review)'}.`
                : 'You are about to reject this submission. Please provide a reason.'}
              <span dir="rtl" className="block text-xs mt-1">
                {approvalDialog.action === 'approve'
                  ? approvalDialog.tier === 2
                    ? 'أنت على وشك الموافقة على هذا الطلب (الموافقة النهائية - تمهيد للدفع).'
                    : 'أنت على وشك الموافقة على هذا الطلب (ينتقل إلى المرحلة الثانية لمراجعة المسؤول).'
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
                        <span className="truncate">{linkedProject.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span>{docCount} document{docCount !== 1 ? 's' : ''} attached</span>
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
                        <span className="text-muted-foreground ml-1">(Tier {approvalDialog.tier} / المرحلة {approvalDialog.tier === 1 ? 'الأولى' : 'الثانية'})</span>
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
                    {approvalDialog.action === 'approve'
                      ? approvalDialog.tier === 1
                        ? 'This submission will move to Tier 2 (Admin/Super Admin) for final approval before payment can be processed.'
                        : 'This submission will be marked as fully approved and cleared for payment processing. Your digital signature will be required to finalize.'
                      : approvalDialog.tier === 1
                        ? 'This submission will be rejected and sent back to the submitter. They will see your rejection reason and can resubmit if needed.'
                        : 'This submission will be rejected at the final stage. The submitter and Tier 1 approver will be notified of the rejection.'}
                  </p>
                  <p dir="rtl" className="text-xs text-blue-700 dark:text-blue-300 mt-1.5 border-t border-blue-200 dark:border-blue-800 pt-1.5">
                    {approvalDialog.action === 'approve'
                      ? approvalDialog.tier === 1
                        ? 'سينتقل هذا الطلب إلى المرحلة الثانية (المسؤول / المسؤول الأعلى) للموافقة النهائية قبل معالجة الدفع.'
                        : 'سيتم اعتماد هذا الطلب بشكل نهائي وتمهيده للدفع. سيتطلب توقيعك الرقمي لإتمام العملية.'
                      : approvalDialog.tier === 1
                        ? 'سيتم رفض هذا الطلب وإعادته إلى مقدم الطلب. سيرى سبب الرفض ويمكنه إعادة التقديم.'
                        : 'سيتم رفض هذا الطلب في المرحلة النهائية. سيتم إخطار مقدم الطلب والمراجع في المرحلة الأولى.'}
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
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null })}
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
                ? (approvalDialog.tier === 2 ? 'Sign & Approve / توقيع وموافقة' : 'Confirm Approval / تأكيد الموافقة') 
                : 'Confirm Rejection / تأكيد الرفض'}
            </Button>
          </DialogFooter>
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
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                    Approved / معتمد
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
                    <p className="font-medium">{oc.expense_category}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Submitted By / مقدم من</p>
                    <p className="font-medium">{submitter?.name || submitter?.email || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{oc.submitter_role}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Project / المشروع</p>
                    <p className="font-medium">{project?.name || 'General'}</p>
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
                        "{oc.tier2_notes.replace(/\s*\[SIG:.*?\]\s*/g, '').replace(/\s*Method:.*$/g, '').trim()}"
                      </p>
                    )}
                  </div>
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
              const { submission: sub, notes } = signatureModal;
              setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
              setApprovalProcessing(false);
              if (sub) {
                setApprovalNotes(notes);
                setApprovalDialog({ open: true, action: 'approve', tier: 2, submission: sub });
              }
            }
          }}
          transaction={{
            id: signatureModal.submission.id,
            type: 'cost_submission',
            title: `Tier 2 Final Approval / الموافقة النهائية المرحلة ٢ - ${signatureModal.submission.expense_category.replace(/_/g, ' ')}`,
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
            const { submission: sub, notes } = signatureModal;
            setSignatureModal({ open: false, submission: null, tier: 2, notes: '' });
            setApprovalProcessing(false);
            if (sub) {
              setApprovalNotes(notes);
              setApprovalDialog({ open: true, action: 'approve', tier: 2, submission: sub });
            }
          }}
        />
      )}
    </div>
  );
};

export default CostSubmission;
