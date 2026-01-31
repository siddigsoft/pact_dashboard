import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Plus, Clock, CheckCircle, XCircle, AlertCircle, Sparkles, DollarSign, FileText, Users, Shield, Receipt, Briefcase, Wallet } from "lucide-react";
import { useUserCostSubmissions, useCostSubmissions, useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { useAppContext } from "@/context/AppContext";
import { useUser } from "@/context/user/UserContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUserProjects } from "@/hooks/useUserProjects";
import { AppRole } from "@/types";
import CostSubmissionHistory from "@/components/cost-submission/CostSubmissionHistory";
import OperationalCostForm from "@/components/cost-submission/OperationalCostForm";
import CostRequestForm from "@/components/cost-submission/CostRequestForm";
import CostReconciliationForm from "@/components/cost-submission/CostReconciliationForm";
import OutstandingAdvances from "@/components/cost-submission/OutstandingAdvances";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Info, 
  RefreshCw, 
  CircleDollarSign,
  ClipboardCheck,
  HelpCircle
} from "lucide-react";

const CostSubmission = () => {
  const navigate = useNavigate();
  const { currentUser, roles } = useAppContext();
  const { users } = useUser();
  const { projects: allProjects } = useProjectContext();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { toast } = useToast();
  const [isBudgetSubmitting, setIsBudgetSubmitting] = useState(false);
  
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
  
  // Country Directors, FOM, Coordinators, and Admins can submit operational costs
  const canSubmitOperationalCosts = isFOM || isCoordinator || isCountryDirector || isAdmin;
  
  // Admins and supervisors can see team submissions and approval status
  const canViewTeamSubmissions = isAdmin || isSupervisor || isCountryDirector;
  
  // Determine default tab based on role
  const getDefaultTab = () => {
    if (canViewTeamSubmissions) return "history";
    if (canSubmitOperationalCosts) return "operational";
    return "budget"; // Default to advance/reimburse for field staff
  };
  
  const [activeTab, setActiveTab] = useState<"operational" | "budget" | "reconciliation" | "outstanding" | "history">(getDefaultTab());
  const [showGuide, setShowGuide] = useState(false);

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

  const submissionStats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    underReview: submissions.filter(s => s.status === 'under_review').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
    paid: submissions.filter(s => s.status === 'paid').length
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

  // Handle budget request submission
  const handleBudgetRequestSubmit = async (data: any) => {
    setIsBudgetSubmitting(true);
    try {
      // TODO: Integrate with backend service when enhanced_cost_requests table is available
      console.log('Budget request submitted:', data);
      toast({
        title: data.requestType === 'advance' ? 'Advance Request Submitted' : 'Reimbursement Request Submitted',
        description: `Your ${data.requestType} request for ${data.currency} ${data.requestedAmount?.toLocaleString()} has been submitted for approval.`,
      });
      setActiveTab("history");
    } catch (error) {
      console.error('Error submitting budget request:', error);
      toast({
        title: 'Submission Failed',
        description: 'There was an error submitting your request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsBudgetSubmitting(false);
    }
  };

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
              <CardTitle className="text-base text-blue-800 dark:text-blue-200">Cost Submission Process Guide</CardTitle>
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
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Step 1: Submit */}
              <div className="flex flex-col p-4 rounded-lg bg-white dark:bg-slate-800 border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                  <h4 className="font-semibold">Submit Costs</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Submit site visit costs, operational expenses, or request advances/reimbursements with supporting documents.
                </p>
              </div>
              
              {/* Step 2: Review */}
              <div className="flex flex-col p-4 rounded-lg bg-white dark:bg-slate-800 border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <h4 className="font-semibold">Supervisor Review</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your supervisor reviews and verifies the submission. They may request additional information or approve/reject.
                </p>
              </div>
              
              {/* Step 3: Approval */}
              <div className="flex flex-col p-4 rounded-lg bg-white dark:bg-slate-800 border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">3</div>
                  <h4 className="font-semibold">Admin Approval</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Admin performs final approval and authorizes payment. Digital signature may be required for certain amounts.
                </p>
              </div>
              
              {/* Step 4: Reconciliation */}
              <div className="flex flex-col p-4 rounded-lg bg-white dark:bg-slate-800 border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">4</div>
                  <h4 className="font-semibold">Reconciliation</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  For advances: Submit receipts to reconcile. Return unused funds or request additional if overspent.
                </p>
              </div>
            </div>
            
            <Alert className="mt-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Important Notes</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li><strong>Site Visit Costs:</strong> Submit after completing a field visit with transportation and per diem details</li>
                  <li><strong>Operational Costs:</strong> For permits, training, communications, and other field operation expenses</li>
                  <li><strong>Advance Payments:</strong> Request funds before activities - must be reconciled with receipts after</li>
                  <li><strong>Reimbursements:</strong> Get refunded for expenses you already paid from personal funds</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList className="flex-wrap gap-1">
          {/* Operational Costs */}
          {canSubmitOperationalCosts && (
            <TabsTrigger value="operational" data-testid="tab-operational" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Operational</span>
              <span className="sm:hidden">Ops</span>
            </TabsTrigger>
          )}
          
          {/* Advance/Reimburse */}
          <TabsTrigger value="budget" data-testid="tab-budget" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Advance/Reimburse</span>
            <span className="sm:hidden">Advance</span>
          </TabsTrigger>
          
          {/* Reconciliation */}
          <TabsTrigger value="reconciliation" data-testid="tab-reconciliation" className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Reconciliation</span>
            <span className="sm:hidden">Reconcile</span>
          </TabsTrigger>
          
          {/* Outstanding Advances */}
          <TabsTrigger value="outstanding" data-testid="tab-outstanding" className="gap-1.5">
            <CircleDollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Outstanding</span>
            <span className="sm:hidden">Due</span>
          </TabsTrigger>
          
          {/* History */}
          <TabsTrigger value="history" data-testid="tab-history" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isAdmin ? "All Submissions" : isSupervisor ? "Team" : isCountryDirector ? "Overview" : "My Submissions"}
            </span>
            <span className="sm:hidden">History</span>
          </TabsTrigger>
        </TabsList>

        {/* Operational Costs Tab */}
        {canSubmitOperationalCosts && (
          <TabsContent value="operational" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Operational Expense Submission</CardTitle>
                </div>
                <CardDescription>
                  Submit operational expenses for permits, training, communications, and other field operation costs. 
                  Requires two-tier approval (Supervisor/FOM → Admin).
                </CardDescription>
              </CardHeader>
            </Card>
            <OperationalCostForm 
              onSuccess={() => setActiveTab("history")}
            />
          </TabsContent>
        )}

        {/* Advance/Reimburse Tab */}
        <TabsContent value="budget" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-indigo-600" />
                <CardTitle>Advance Payment & Reimbursement</CardTitle>
              </div>
              <CardDescription>
                Request advance funds for planned activities or submit reimbursement claims for expenses you've already paid. 
                Advances must be reconciled with receipts after spending.
              </CardDescription>
            </CardHeader>
          </Card>
          <CostRequestForm 
            projects={projectsForForm}
            onSubmit={handleBudgetRequestSubmit}
            onCancel={() => setActiveTab("history")}
            isSubmitting={isBudgetSubmitting}
          />
        </TabsContent>

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
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          ) : (
            <CostSubmissionHistory submissions={submissions} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CostSubmission;
