import { useState, useEffect, useMemo } from 'react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DollarSign,
  Award,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Wallet,
  FileText,
  BarChart3,
  FolderKanban,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { useCostSubmissions } from '@/context/costApproval/CostSubmissionContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { useWallet } from '@/context/wallet/WalletContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useUser } from '@/context/user/UserContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { WorkflowRail } from '@/components/financial/WorkflowRail';
import { GradientStatCard, GRADIENT_PRESETS } from '@/components/dashboard/GradientStatCard';
import { PageLoader } from '@/components/ui/loading-badge';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import { ConsolidatedFinancialTab } from '@/components/financial/ConsolidatedFinancialTab';

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
};

interface OpCostRow {
  id: string;
  project_id: string | null;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: string;
  tier1_status: string | null;
  tier2_status: string | null;
  paid_at: string | null;
  reconciled_at: string | null;
  reconciled_amount_cents: number | null;
  created_at: string;
}

const getOpDerivedStatus = (oc: OpCostRow): string => {
  if (oc.reconciled_at) return 'reconciled';
  if (oc.paid_at) return 'paid';
  if (oc.tier2_status === 'approved') return 'approved';
  if (oc.tier2_status === 'rejected' || oc.tier1_status === 'rejected') return 'rejected';
  if (oc.tier1_status === 'approved') return 'under_review';
  return 'pending';
};

const FinancialOperations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canManageFinances } = useAuthorization();
  const [activeTab, setActiveTab] = useState('consolidated');

  const { submissions: costSubmissions, isLoading: submissionsLoading } = useCostSubmissions();
  const { userClassifications, feeStructures, loading: classificationsLoading } = useClassification();
  const { loading: walletLoading } = useWallet();
  const { projectBudgets } = useBudget();
  const { projects } = useProjectContext();
  const { users } = useUser();

  const [opCosts, setOpCosts] = useState<OpCostRow[]>([]);
  const [opCostsLoaded, setOpCostsLoaded] = useState(false);

  useEffect(() => {
    const fetchOpCosts = async () => {
      try {
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('id, project_id, expense_category, amount_cents, currency, description, submitted_by, submitted_at, status, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents, created_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setOpCosts((data as OpCostRow[]) || []);
      } catch (err) {
        console.error('Failed to fetch operational costs:', err);
      } finally {
        setOpCostsLoaded(true);
      }
    };
    fetchOpCosts();
  }, []);

  const projectCostBreakdown = useMemo(() => {
    const grouped: Record<string, { projectId: string; projectName: string; totalSubmitted: number; totalApproved: number; totalPaid: number; count: number; pendingCount: number }> = {};
    opCosts.forEach(oc => {
      const pid = oc.project_id || '__general__';
      if (!grouped[pid]) {
        const proj = projects.find(p => p.id === pid);
        grouped[pid] = { projectId: pid, projectName: proj?.name || (pid === '__general__' ? 'General / Unlinked' : 'Unknown Project'), totalSubmitted: 0, totalApproved: 0, totalPaid: 0, count: 0, pendingCount: 0 };
      }
      const status = getOpDerivedStatus(oc);
      grouped[pid].count++;
      grouped[pid].totalSubmitted += oc.amount_cents;
      if (['approved', 'paid', 'reconciled'].includes(status)) grouped[pid].totalApproved += oc.amount_cents;
      if (['paid', 'reconciled'].includes(status)) grouped[pid].totalPaid += oc.amount_cents;
      if (['pending', 'under_review'].includes(status)) grouped[pid].pendingCount++;
    });
    return Object.values(grouped).sort((a, b) => b.totalSubmitted - a.totalSubmitted);
  }, [opCosts, projects]);

  const budgetVsActual = useMemo(() => {
    return projectBudgets.map(budget => {
      const pid = (budget as any).projectId || (budget as any).project_id;
      const proj = projects.find(p => p.id === pid);
      const costData = projectCostBreakdown.find(pc => pc.projectId === pid);
      const totalBudgetCents = (budget as any).totalBudgetCents || (budget as any).total_budget_cents || 0;
      const actualSpend = costData?.totalApproved || 0;
      const utilization = totalBudgetCents > 0 ? (actualSpend / totalBudgetCents) * 100 : 0;
      return {
        projectId: pid,
        projectName: proj?.name || 'Unknown',
        budgetCents: totalBudgetCents,
        actualSpendCents: actualSpend,
        paidCents: costData?.totalPaid || 0,
        varianceCents: totalBudgetCents - actualSpend,
        utilization: Math.min(utilization, 100),
        submissionCount: costData?.count || 0,
        pendingCount: costData?.pendingCount || 0,
      };
    }).sort((a, b) => b.utilization - a.utilization);
  }, [projectBudgets, projectCostBreakdown, projects]);

  const recentPaidCosts = useMemo(() => {
    return opCosts
      .filter(oc => oc.paid_at || oc.reconciled_at)
      .sort((a, b) => {
        const dateA = a.paid_at || a.reconciled_at || a.created_at;
        const dateB = b.paid_at || b.reconciled_at || b.created_at;
        return dateB.localeCompare(dateA);
      })
      .slice(0, 20);
  }, [opCosts]);

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || userId.slice(0, 8);
  };

  const safeFormatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try { const d = parseISO(dateStr); return isValid(d) ? format(d, 'dd MMM yyyy') : '-'; } catch { return '-'; }
  };

  const canAccess = canManageFinances();

  if (!canAccess) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertDescription>
            Access Denied: You do not have permission to view Financial Operations. This page is restricted to administrators and financial admins.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLoading = submissionsLoading || classificationsLoading || walletLoading;

  const totalSubmissions = costSubmissions?.length || 0;
  const pendingCount = costSubmissions?.filter(s => s.status === 'pending').length || 0;
  const approvedCount = costSubmissions?.filter(s => s.status === 'approved').length || 0;
  const rejectedCount = costSubmissions?.filter(s => s.status === 'rejected').length || 0;
  const paidCount = costSubmissions?.filter(s => s.status === 'paid').length || 0;

  const totalPendingAmount = costSubmissions
    ?.filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + (s.totalCostCents || 0), 0) || 0;

  const totalApprovedAmount = costSubmissions
    ?.filter(s => s.status === 'approved')
    .reduce((sum, s) => sum + (s.totalCostCents || 0), 0) || 0;

  const totalPaidAmount = costSubmissions
    ?.filter(s => s.status === 'paid')
    .reduce((sum, s) => sum + (s.paidAmountCents || s.totalCostCents || 0), 0) || 0;

  const approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;

  const levelASubmissions = costSubmissions?.filter(s => s.classificationLevel === 'A').length || 0;
  const levelBSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'B').length || 0;
  const levelCSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'C').length || 0;

  if (isLoading) {
    return <PageLoader message="Loading Financial Operations..." />;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-financial-ops-title">
            <DollarSign className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            Financial Operations
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Unified dashboard for cost management and approvals
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => navigate('/cost-submission')}
          data-testid="button-new-submission"
        >
          <Receipt className="h-4 w-4 mr-2" />
          New Submission
        </Button>
      </div>

      <PageInfoBanner
        title="Financial Operations"
        description="This is the central hub for all operational costs. View transportation costs, operational cost submissions, and a consolidated financial overview across all projects. Use this page to track spending, compare costs, and generate reports."
        workflowSteps={[
          { step: 1, role: 'Field Staff', action: 'Submits costs', description: 'Data collectors and supervisors submit operational or transportation costs through the Cost Submission page.' },
          { step: 2, role: 'Supervisor', action: 'Reviews (Tier 1)', description: 'Supervisors review and approve/reject cost submissions from their team members.' },
          { step: 3, role: 'Admin', action: 'Final Approval (Tier 2)', description: 'Admin or Finance Admin gives final approval on supervisor-approved requests.' },
          { step: 4, role: 'Finance Admin', action: 'Processes Payment', description: 'Finance processes the approved request and releases funds to the staff member\'s wallet.' },
          { step: 5, role: 'System', action: 'Credits Wallet', description: 'The system automatically credits the approved amount to the staff member\'s wallet, deducting any advance payments.' },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:w-full h-auto p-1 gap-1">
            <TabsTrigger value="consolidated" className="text-xs md:text-sm px-3" data-testid="tab-consolidated">Consolidated</TabsTrigger>
            <TabsTrigger value="overview" className="text-xs md:text-sm px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs md:text-sm px-3" data-testid="tab-workflow">Workflow</TabsTrigger>
            <TabsTrigger value="classifications" className="text-xs md:text-sm px-3" data-testid="tab-classifications">Classifications</TabsTrigger>
            <TabsTrigger value="budget" className="text-xs md:text-sm px-3" data-testid="tab-budget">Budget</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs md:text-sm px-3" data-testid="tab-payments">Payments</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="consolidated">
          <ConsolidatedFinancialTab
            opCosts={opCosts}
            costSubmissions={costSubmissions || []}
            totalPendingAmount={totalPendingAmount}
            totalApprovedAmount={totalApprovedAmount}
            totalPaidAmount={totalPaidAmount}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <GradientStatCard
              title="Pending"
              value={pendingCount}
              subtitle={formatCurrency(totalPendingAmount / 100, 'SDG')}
              icon={Clock}
              gradient={GRADIENT_PRESETS.blue}
              onClick={() => setActiveTab('workflow')}
              testId="card-pending-approvals"
            />
            <GradientStatCard
              title="Approved & Paid"
              value={approvedCount + paidCount}
              subtitle={`${approvalRate}% rate`}
              icon={CheckCircle}
              gradient={GRADIENT_PRESETS.green}
              testId="card-approved"
            />
            <GradientStatCard
              title="Classified Users"
              value={userClassifications?.length || 0}
              subtitle={`${feeStructures?.length || 0} fee structures`}
              icon={Users}
              gradient={GRADIENT_PRESETS.purple}
              onClick={() => setActiveTab('classifications')}
              testId="card-classifications"
            />
            <GradientStatCard
              title="Total Paid"
              value={formatCurrency(totalPaidAmount / 100, 'SDG')}
              subtitle={`${paidCount} payments`}
              icon={Wallet}
              gradient={GRADIENT_PRESETS.red}
              onClick={() => setActiveTab('payments')}
              testId="card-payments"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  Submission Workflow Status
                </CardTitle>
                <CardDescription>Current state of cost submissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      Pending Review
                    </span>
                    <Badge variant="secondary">{pendingCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (pendingCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Approved
                    </span>
                    <Badge variant="secondary">{approvedCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (approvedCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Paid
                    </span>
                    <Badge variant="secondary">{paidCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (paidCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Rejected
                    </span>
                    <Badge variant="secondary">{rejectedCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (rejectedCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Submissions by Classification
                </CardTitle>
                <CardDescription>Cost distribution across levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Level A (Senior)
                    </span>
                    <Badge variant="secondary">{levelASubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelASubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Level B (Regular)
                    </span>
                    <Badge variant="secondary">{levelBSubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelBSubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      Level C (Junior)
                    </span>
                    <Badge variant="secondary">{levelCSubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelCSubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {projectCostBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-muted-foreground" />
                  Spending by Project
                </CardTitle>
                <CardDescription>Top projects by operational cost submissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {projectCostBreakdown.slice(0, 5).map(pc => {
                  const maxAmount = projectCostBreakdown[0]?.totalSubmitted || 1;
                  return (
                    <div key={pc.projectId} className="flex items-center gap-3" data-testid={`project-cost-${pc.projectId}`}>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-sm font-medium min-w-[140px] text-left justify-start truncate"
                        onClick={() => pc.projectId !== '__general__' && navigate(`/projects/${pc.projectId}`)}
                        data-testid={`link-overview-project-${pc.projectId}`}
                      >
                        {pc.projectName}
                      </Button>
                      <div className="flex-1">
                        <Progress value={(pc.totalSubmitted / maxAmount) * 100} className="h-2" />
                      </div>
                      <span className="font-mono text-sm min-w-[100px] text-right">{formatCurrency(pc.totalSubmitted / 100)}</span>
                      {pc.pendingCount > 0 && (
                        <Badge variant="secondary" className="text-xs">{pc.pendingCount} pending</Badge>
                      )}
                    </div>
                  );
                })}
                {projectCostBreakdown.length > 5 && (
                  <p className="text-muted-foreground text-xs text-center pt-2">+ {projectCostBreakdown.length - 5} more projects</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Navigate to detailed views</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/cost-approval')}
                  data-testid="button-review-pending"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Review Pending</div>
                      <div className="text-xs text-muted-foreground">{pendingCount} awaiting review</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/classifications')}
                  data-testid="button-manage-classifications"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Award className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Manage Classifications</div>
                      <div className="text-xs text-muted-foreground">{userClassifications?.length} users</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/finance')}
                  data-testid="button-view-payments"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">View Payments</div>
                      <div className="text-xs text-muted-foreground">{paidCount} transactions</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/budget')}
                  data-testid="button-view-budgets"
                >
                  <div className="flex items-center gap-3 w-full">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Budget Overview</div>
                      <div className="text-xs text-muted-foreground">{projectBudgets?.length || 0} budgets</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Cost Approval Workflow</h2>
                <p className="text-muted-foreground">Review and approve cost submissions in the workflow pipeline</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/cost-submission')}
                data-testid="button-new-submission-workflow"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                New Submission
              </Button>
            </div>
            <WorkflowRail
              onNavigateToSubmission={(id) => {
                toast({
                  title: 'Viewing Submission',
                  description: `Opening details for submission ${id.slice(0, 8)}...`,
                });
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="classifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Classification Impact on Costs</CardTitle>
              <CardDescription>View full classifications page for detailed management</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/classifications')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Classifications Page
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Budget vs Actual Spend
              </CardTitle>
              <CardDescription>Compare project budgets against actual operational cost submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {budgetVsActual.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No project budgets found. Create budgets on the Budget page to see comparisons.</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate('/budget')} data-testid="button-goto-budget">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Budget Page
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {budgetVsActual.map(item => (
                    <Card key={item.projectId} data-testid={`budget-vs-actual-${item.projectId}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Button
                            variant="link"
                            className="font-semibold p-0 h-auto"
                            onClick={() => item.projectId !== '__general__' && navigate(`/projects/${item.projectId}`)}
                            data-testid={`link-project-${item.projectId}`}
                          >
                            <FolderKanban className="h-4 w-4 mr-1.5" />
                            {item.projectName}
                          </Button>
                          <div className="flex items-center gap-2">
                            {item.utilization > 90 && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Over 90%
                              </Badge>
                            )}
                            <Badge variant="secondary">
                              {item.submissionCount} submissions
                            </Badge>
                          </div>
                        </div>
                        <Progress
                          value={item.utilization}
                          className="h-2"
                        />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">Budget</span>
                            <span className="font-mono font-medium">{formatCurrency(item.budgetCents / 100)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Actual Spend</span>
                            <span className="text-green-600 dark:text-green-400 font-mono font-medium">{formatCurrency(item.actualSpendCents / 100)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Variance</span>
                            <span className={`font-mono font-medium ${item.varianceCents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {item.varianceCents >= 0 ? '+' : ''}{formatCurrency(item.varianceCents / 100)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Utilization</span>
                            <span className="font-mono font-medium">{item.utilization.toFixed(1)}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-muted-foreground">Total Paid</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => oc.paid_at || oc.reconciled_at).reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-muted-foreground">Awaiting Payment</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => getOpDerivedStatus(oc) === 'approved').reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs text-muted-foreground">Reconciled</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => oc.reconciled_at).reduce((s, oc) => s + (oc.reconciled_amount_cents || oc.amount_cents), 0) / 100)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                    Recent Payments
                  </CardTitle>
                  <CardDescription>Most recent paid and reconciled cost submissions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')} data-testid="button-view-all-submissions">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    All Submissions
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/finance')} data-testid="button-view-finance-detail">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Finance Details
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentPaidCosts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No payments recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Paid To</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPaidCosts.map(oc => {
                        const proj = oc.project_id ? projects.find(p => p.id === oc.project_id) : null;
                        const isReconciled = !!oc.reconciled_at;
                        return (
                          <TableRow key={oc.id} data-testid={`row-payment-${oc.id}`}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {safeFormatDate(oc.paid_at || oc.reconciled_at)}
                            </TableCell>
                            <TableCell>
                              {proj ? (
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm"
                                  onClick={() => navigate(`/projects/${proj.id}`)}
                                  data-testid={`link-payment-project-${oc.id}`}
                                >
                                  {proj.name}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-sm">General</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {(oc.expense_category || '').replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-sm">{getUserName(oc.submitted_by)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">
                              {formatCurrency(oc.amount_cents / 100)}
                            </TableCell>
                            <TableCell>
                              {isReconciled ? (
                                <Badge variant="secondary">Reconciled</Badge>
                              ) : (
                                <Badge variant="default">Paid</Badge>
                              )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialOperations;
