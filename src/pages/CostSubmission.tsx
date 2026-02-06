import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Clock, CheckCircle, XCircle, AlertCircle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, ThumbsUp, ThumbsDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  submitted_by: string;
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
    if (oc.submitted_by === currentUser?.id) return false;
    return isSupervisor || isFOM || isAdmin || isSuperAdmin;
  };

  const canTier2Approve = (oc: OperationalCostSubmission): boolean => {
    if (oc.tier1_status !== 'approved' || oc.tier2_status !== 'pending') return false;
    return isAdmin || isSuperAdmin;
  };

  const openApprovalDialog = (oc: OperationalCostSubmission, action: 'approve' | 'reject', tier: 1 | 2) => {
    setApprovalDialog({ open: true, action, tier, submission: oc });
    setApprovalNotes('');
  };

  const handleApprovalAction = async () => {
    const { action, tier, submission } = approvalDialog;
    if (!submission || !currentUser?.id) return;
    
    setApprovalProcessing(true);
    try {
      const updates: Record<string, any> = {};
      
      if (tier === 1) {
        updates.tier1_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier1_approved_by = currentUser.id;
        updates.tier1_approved_at = new Date().toISOString();
        updates.tier1_notes = approvalNotes || null;
        if (action === 'approve') {
          updates.status = 'under_review';
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = approvalNotes || 'Rejected at Tier 1';
        }
      } else {
        updates.tier2_status = action === 'approve' ? 'approved' : 'rejected';
        updates.tier2_approved_by = currentUser.id;
        updates.tier2_approved_at = new Date().toISOString();
        updates.tier2_notes = approvalNotes || null;
        if (action === 'approve') {
          updates.status = 'approved';
        } else {
          updates.status = 'rejected';
          updates.rejection_reason = approvalNotes || 'Rejected at Tier 2';
        }
      }

      let query = supabase
        .from('operational_cost_submissions')
        .update(updates)
        .eq('id', submission.id);
      
      if (tier === 1) {
        query = query.eq('tier1_status', 'pending');
      } else {
        query = query.eq('tier1_status', 'approved').eq('tier2_status', 'pending');
      }

      const { error } = await query;

      if (error) {
        console.error('Approval error:', error);
        toast({
          title: "Action Failed",
          description: error.message || "Could not process the approval action. Please try again.",
          variant: "destructive",
          duration: 8000,
        });
      } else {
        toast({
          title: action === 'approve' ? "Approved" : "Rejected",
          description: `Tier ${tier} ${action === 'approve' ? 'approval' : 'rejection'} completed successfully.`,
          duration: 5000,
        });
        fetchOperationalCosts();
      }
    } catch (err) {
      console.error('Approval error:', err);
      toast({
        title: "Action Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setApprovalProcessing(false);
      setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null });
      setApprovalNotes('');
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
              <AlertTitle className="text-amber-800 dark:text-amber-200">This is NOT for Site Visit Transportation</AlertTitle>
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
                  <p className="text-xs text-muted-foreground">Hub Supervisor (Tier 1), Admin / Super Admin (Tier 2)</p>
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
                </div>
                
                <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-slate-800 border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h4 className="font-semibold text-sm">Tier 2: Admin Approval</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin or Super Admin performs final approval and authorizes payment. Both tiers must approve before payment proceeds.
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
                هذه الصفحة مخصصة لتقديم <strong>التكاليف التشغيلية الميدانية</strong> مثل التصاريح، التدريب، الاتصالات، المعدات، والاجتماعات. هذه الصفحة <strong>ليست</strong> لتكاليف النقل الخاصة بزيارات المواقع.
              </p>
              <p className="text-xs text-muted-foreground mb-1"><strong>من يمكنه الاستخدام:</strong> مدير العمليات الميدانية، المنسق، المدير القطري، المشرف، المسؤول</p>
              <p className="text-xs text-muted-foreground mb-1"><strong>عملية الموافقة:</strong> المرحلة الأولى (المشرف) ← المرحلة الثانية (المسؤول) ← الدفع</p>
              <p className="text-xs text-muted-foreground"><strong>نوع الطلب:</strong> سلفة (استلام الأموال مقدماً ثم التسوية) أو استرداد (بعد الدفع من أموالك)</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
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
              {submissionStats.pending > 0 && activeTab !== "outstanding" && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0">
                  {submissionStats.pending}
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
            <UnifiedCostRequestForm 
              projects={projectsForForm}
              onSuccess={() => {
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
                Return unused amounts or request additional funds if you overspent.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
                <Info className="h-4 w-4 text-purple-600" />
                <AlertTitle className="text-purple-800 dark:text-purple-200">How Reconciliation Works</AlertTitle>
                <AlertDescription className="text-purple-700 dark:text-purple-300 text-sm mt-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <strong>"Outstanding"</strong> tab to see advances pending reconciliation</li>
                    <li>Click <strong>"Reconcile"</strong> on an advance to start the process</li>
                    <li>Upload receipts and document how funds were spent</li>
                    <li>If you spent less, indicate the amount to return</li>
                    <li>If you overspent, submit a reimbursement request for the difference</li>
                  </ol>
                </AlertDescription>
              </Alert>
              
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">No Active Reconciliation</h3>
                <p className="mb-4">Select an outstanding advance to begin reconciliation.</p>
                <Button 
                  variant="outline" 
                  onClick={() => setActiveTab("outstanding")}
                  data-testid="button-go-outstanding"
                >
                  <CircleDollarSign className="h-4 w-4 mr-2" />
                  View Outstanding Advances
                </Button>
              </div>
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
                requests={[]}
                onReconcile={(request) => {
                  toast({
                    title: 'Reconciliation Started',
                    description: `Starting reconciliation for advance of ${request.currency} ${((request.requestedAmountCents || 0) / 100).toLocaleString()}`,
                  });
                  setActiveTab("reconciliation");
                }}
                onViewDetails={(request) => {
                  toast({
                    title: 'Advance Details',
                    description: `Viewing details for request: ${request.title}`,
                  });
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

          {/* Operational Cost Submissions */}
          {operationalCostsLoading && filteredOperationalCosts.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          )}
          {filteredOperationalCosts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">Operational Cost Requests</CardTitle>
                    <Badge variant="secondary">{filteredOperationalCosts.length}</Badge>
                  </div>
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
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredOperationalCosts.map((oc) => {
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
                      pending: 'Pending (Tier 1)',
                      under_review: 'Under Review (Tier 2)',
                      approved: 'Approved',
                      rejected: 'Rejected',
                      paid: 'Paid',
                    };
                    const submitterName = users.find(u => u.id === oc.submitted_by)?.name || 'Unknown';
                    const title = oc.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled';

                    return (
                      <div
                        key={oc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-background hover-elevate"
                        data-testid={`operational-cost-${oc.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{title}</span>
                            <Badge variant="outline" className="text-xs">
                              {categoryLabels[oc.expense_category] || oc.expense_category}
                            </Badge>
                            <Badge className={`text-xs border-0 ${statusColors[derivedStatus] || statusColors.pending}`}>
                              {statusLabels[derivedStatus] || derivedStatus}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                            {canViewTeamSubmissions && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {submitterName}
                              </span>
                            )}
                            <span>{oc.created_at ? format(new Date(oc.created_at), 'MMM d, yyyy') : 'N/A'}</span>
                            {oc.vendor && <span>Vendor: {oc.vendor}</span>}
                          </div>
                          {oc.tier1_notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Tier 1 Notes:</span> {oc.tier1_notes}
                            </p>
                          )}
                          {oc.tier2_notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Tier 2 Notes:</span> {oc.tier2_notes}
                            </p>
                          )}
                          {oc.rejection_reason && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              <span className="font-medium">Rejection Reason:</span> {oc.rejection_reason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-right">
                            <div className="font-bold text-lg">{oc.currency} {(oc.amount_cents / 100).toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">
                              {oc.tier1_status === 'approved' ? 'Tier 1 Approved' : ''}
                              {oc.tier2_status === 'approved' ? ' / Tier 2 Approved' : ''}
                            </div>
                          </div>
                          {canTier1Approve(oc) && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openApprovalDialog(oc, 'approve', 1)}
                                data-testid={`button-tier1-approve-${oc.id}`}
                              >
                                <ThumbsUp className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openApprovalDialog(oc, 'reject', 1)}
                                data-testid={`button-tier1-reject-${oc.id}`}
                              >
                                <ThumbsDown className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {canTier2Approve(oc) && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openApprovalDialog(oc, 'approve', 2)}
                                data-testid={`button-tier2-approve-${oc.id}`}
                              >
                                <ThumbsUp className="h-4 w-4 mr-1" />
                                Final Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openApprovalDialog(oc, 'reject', 2)}
                                data-testid={`button-tier2-reject-${oc.id}`}
                              >
                                <ThumbsDown className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="dialog-approval-title">
              {approvalDialog.action === 'approve' 
                ? `Tier ${approvalDialog.tier} Approval` 
                : `Tier ${approvalDialog.tier} Rejection`}
            </DialogTitle>
            <DialogDescription>
              {approvalDialog.action === 'approve'
                ? `You are about to approve this submission${approvalDialog.tier === 2 ? ' (final approval - clears for payment)' : ' (moves to Tier 2 review)'}.`
                : 'You are about to reject this submission. Please provide a reason.'}
            </DialogDescription>
          </DialogHeader>
          {approvalDialog.submission && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{approvalDialog.submission.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Untitled'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {users.find(u => u.id === approvalDialog.submission?.submitted_by)?.name || 'Unknown'} - {approvalDialog.submission.expense_category}
                  </p>
                </div>
                <div className="font-bold">
                  {approvalDialog.submission.currency} {(approvalDialog.submission.amount_cents / 100).toLocaleString()}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approval-notes">
                  {approvalDialog.action === 'approve' ? 'Notes (optional)' : 'Reason for rejection *'}
                </Label>
                <Textarea
                  id="approval-notes"
                  placeholder={approvalDialog.action === 'approve' ? 'Add any notes...' : 'Explain why this is being rejected...'}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={3}
                  data-testid="input-approval-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApprovalDialog({ open: false, action: 'approve', tier: 1, submission: null })}
              disabled={approvalProcessing}
              data-testid="button-approval-cancel"
            >
              Cancel
            </Button>
            <Button
              variant={approvalDialog.action === 'approve' ? 'default' : 'destructive'}
              onClick={handleApprovalAction}
              disabled={approvalProcessing || (approvalDialog.action === 'reject' && !approvalNotes.trim())}
              data-testid="button-approval-confirm"
            >
              {approvalProcessing ? 'Processing...' : approvalDialog.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CostSubmission;
