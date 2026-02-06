import { useState, useEffect, useMemo } from 'react';
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
  XCircle,
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
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useCostSubmissions, usePendingCostApprovals } from '@/context/costApproval/CostSubmissionContext';
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
  const { currentUser } = useAppContext();
  const { canManageFinances } = useAuthorization();
  const [activeTab, setActiveTab] = useState('overview');

  // Data hooks
  const { submissions: costSubmissions, isLoading: submissionsLoading } = useCostSubmissions();
  const { approvals: pendingApprovals, isLoading: approvalsLoading } = usePendingCostApprovals();
  const { userClassifications, feeStructures, loading: classificationsLoading } = useClassification();
  const { loading: walletLoading } = useWallet();
  const { projectBudgets } = useBudget();
  const { projects } = useProjectContext();
  const { users } = useUser();

  const [opCosts, setOpCosts] = useState<OpCostRow[]>([]);
  const [opCostsLoading, setOpCostsLoading] = useState(true);

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
        setOpCostsLoading(false);
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

  // Authorization check
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

  const isLoading = submissionsLoading || approvalsLoading || classificationsLoading || walletLoading;

  // Calculate key metrics
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

  // Classification breakdown
  const levelASubmissions = costSubmissions?.filter(s => s.classificationLevel === 'A').length || 0;
  const levelBSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'B').length || 0;
  const levelCSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'C').length || 0;

  if (isLoading) {
    return <PageLoader message="Loading Financial Operations..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950 relative overflow-hidden">
      {/* Animated Tech Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_right,#4f46e510_1px,transparent_1px),linear-gradient(to_bottom,#4f46e510_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse opacity-20"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse opacity-20 animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500 rounded-full blur-3xl animate-pulse opacity-20 animation-delay-4000"></div>
      </div>

      <div className="container mx-auto p-6 space-y-6 relative z-10">
        {/* Vibrant Animated Header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl blur-xl opacity-50 animate-pulse"></div>
          <div className="relative bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-pink-600/90 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3 drop-shadow-lg">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
                    <DollarSign className="h-8 w-8 text-white" />
                  </div>
                  Financial Operations
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 animate-pulse">
                    LIVE
                  </Badge>
                </h1>
                <p className="text-white/90 mt-2 text-lg font-medium">
                  Unified dashboard for cost approvals, classifications, and payments
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/classifications')}
                  data-testid="button-view-classifications"
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20"
                >
                  <Award className="h-4 w-4 mr-2" />
                  Classifications
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/finance')}
                  data-testid="button-view-finance"
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Finance Details
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/budget')}
                  data-testid="button-view-budget"
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Budget Dashboard
                </Button>
                <Button
                  onClick={() => navigate('/cost-submission')}
                  data-testid="button-new-submission"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/50"
                >
                  New Submission
                </Button>
              </div>
            </div>
          </div>
        </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GradientStatCard
          title="Pending Approvals"
          value={pendingCount}
          subtitle={`${formatCurrency(totalPendingAmount / 100, 'SDG')} total`}
          icon={Clock}
          gradient={GRADIENT_PRESETS.blue}
          onClick={() => setActiveTab('workflow')}
          testId="card-pending-approvals"
        />

        <GradientStatCard
          title="Approved & Paid"
          value={approvedCount + paidCount}
          subtitle={`${approvalRate}% approval rate`}
          icon={CheckCircle}
          gradient={GRADIENT_PRESETS.green}
          onClick={() => setActiveTab('workflow')}
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
          title="Total Paid Out"
          value={paidCount}
          subtitle={`${formatCurrency(totalPaidAmount / 100, 'SDG')} paid`}
          icon={Wallet}
          gradient={GRADIENT_PRESETS.red}
          onClick={() => setActiveTab('payments')}
          testId="card-payments"
        />
      </div>

        {/* Colorful Tabs Section */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="relative">
            <TabsList className="grid w-full grid-cols-5 bg-gradient-to-r from-slate-800/90 to-slate-900/90 backdrop-blur-xl border border-white/10 p-2 h-auto gap-2">
              <TabsTrigger 
                value="overview" 
                data-testid="tab-overview"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-600 data-[state=active]:text-white text-white/70 hover:text-white border-0"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="workflow" 
                data-testid="tab-workflow"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white text-white/70 hover:text-white border-0"
              >
                Workflow
              </TabsTrigger>
              <TabsTrigger 
                value="classifications" 
                data-testid="tab-classifications"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600 data-[state=active]:text-white text-white/70 hover:text-white border-0"
              >
                Classifications
              </TabsTrigger>
              <TabsTrigger 
                value="budget" 
                data-testid="tab-budget"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-600 data-[state=active]:text-white text-white/70 hover:text-white border-0"
              >
                Budget
              </TabsTrigger>
              <TabsTrigger 
                value="payments" 
                data-testid="tab-payments"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white text-white/70 hover:text-white border-0"
              >
                Payments
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Colorful Workflow Status Card */}
                <Card className="bg-gradient-to-br from-slate-900/90 to-blue-900/90 backdrop-blur-xl border-blue-500/30 shadow-xl shadow-blue-500/20">
                  <CardHeader className="border-b border-white/10 pb-4">
                    <CardTitle className="text-white flex items-center gap-2">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <BarChart3 className="h-5 w-5 text-blue-400" />
                      </div>
                      Submission Workflow Status
                    </CardTitle>
                    <CardDescription className="text-white/70">Current state of cost submissions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                          Pending Review
                        </span>
                        <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 font-bold">
                          {pendingCount}
                        </Badge>
                      </div>
                      <Progress value={totalSubmissions > 0 ? (pendingCount / totalSubmissions) * 100 : 0} className="h-3 bg-orange-950/50 [&>*]:bg-gradient-to-r [&>*]:from-orange-500 [&>*]:to-amber-600" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          Approved
                        </span>
                        <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 font-bold">
                          {approvedCount}
                        </Badge>
                      </div>
                      <Progress value={totalSubmissions > 0 ? (approvedCount / totalSubmissions) * 100 : 0} className="h-3 bg-green-950/50 [&>*]:bg-gradient-to-r [&>*]:from-green-500 [&>*]:to-emerald-600" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          Paid
                        </span>
                        <Badge className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-0 font-bold">
                          {paidCount}
                        </Badge>
                      </div>
                      <Progress value={totalSubmissions > 0 ? (paidCount / totalSubmissions) * 100 : 0} className="h-3 bg-blue-950/50 [&>*]:bg-gradient-to-r [&>*]:from-blue-500 [&>*]:to-cyan-600" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                          Rejected
                        </span>
                        <Badge className="bg-gradient-to-r from-red-500 to-rose-600 text-white border-0 font-bold">
                          {rejectedCount}
                        </Badge>
                      </div>
                      <Progress value={totalSubmissions > 0 ? (rejectedCount / totalSubmissions) * 100 : 0} className="h-3 bg-red-950/50 [&>*]:bg-gradient-to-r [&>*]:from-red-500 [&>*]:to-rose-600" />
                    </div>
                  </CardContent>
                </Card>

                {/* Colorful Classification Breakdown Card */}
                <Card className="bg-gradient-to-br from-slate-900/90 to-purple-900/90 backdrop-blur-xl border-purple-500/30 shadow-xl shadow-purple-500/20">
                  <CardHeader className="border-b border-white/10 pb-4">
                    <CardTitle className="text-white flex items-center gap-2">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Users className="h-5 w-5 text-purple-400" />
                      </div>
                      Submissions by Classification
                    </CardTitle>
                    <CardDescription className="text-white/70">Cost distribution across levels</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          Level A (Senior)
                        </span>
                        <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 font-bold shadow-lg shadow-green-500/30">
                          {levelASubmissions}
                        </Badge>
                      </div>
                      <Progress 
                        value={totalSubmissions > 0 ? (levelASubmissions / totalSubmissions) * 100 : 0} 
                        className="h-3 bg-green-950/50 [&>*]:bg-gradient-to-r [&>*]:from-green-500 [&>*]:to-emerald-600"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          Level B (Regular)
                        </span>
                        <Badge className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-0 font-bold shadow-lg shadow-blue-500/30">
                          {levelBSubmissions}
                        </Badge>
                      </div>
                      <Progress 
                        value={totalSubmissions > 0 ? (levelBSubmissions / totalSubmissions) * 100 : 0} 
                        className="h-3 bg-blue-950/50 [&>*]:bg-gradient-to-r [&>*]:from-blue-500 [&>*]:to-cyan-600"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/90 flex items-center gap-2">
                          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                          Level C (Junior)
                        </span>
                        <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 font-bold shadow-lg shadow-orange-500/30">
                          {levelCSubmissions}
                        </Badge>
                      </div>
                      <Progress 
                        value={totalSubmissions > 0 ? (levelCSubmissions / totalSubmissions) * 100 : 0} 
                        className="h-3 bg-orange-950/50 [&>*]:bg-gradient-to-r [&>*]:from-orange-500 [&>*]:to-amber-600"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

          {/* Project Cost Breakdown */}
          {projectCostBreakdown.length > 0 && (
            <Card className="bg-gradient-to-br from-slate-900/90 to-cyan-900/90 backdrop-blur-xl border-cyan-500/30 shadow-xl shadow-cyan-500/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-white flex items-center gap-2">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <FolderKanban className="h-5 w-5 text-cyan-400" />
                  </div>
                  Spending by Project
                </CardTitle>
                <CardDescription className="text-white/70">Top projects by operational cost submissions</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {projectCostBreakdown.slice(0, 5).map(pc => {
                  const maxAmount = projectCostBreakdown[0]?.totalSubmitted || 1;
                  return (
                    <div key={pc.projectId} className="flex items-center gap-3" data-testid={`project-cost-${pc.projectId}`}>
                      <Button
                        variant="link"
                        className="text-white/90 p-0 h-auto text-sm font-medium min-w-[140px] text-left justify-start truncate"
                        onClick={() => pc.projectId !== '__general__' && navigate(`/projects/${pc.projectId}`)}
                        data-testid={`link-overview-project-${pc.projectId}`}
                      >
                        {pc.projectName}
                      </Button>
                      <div className="flex-1">
                        <Progress value={(pc.totalSubmitted / maxAmount) * 100} className="h-2 bg-white/10 [&>*]:bg-gradient-to-r [&>*]:from-cyan-500 [&>*]:to-blue-500" />
                      </div>
                      <span className="text-white font-mono text-sm min-w-[100px] text-right">{formatCurrency(pc.totalSubmitted / 100)}</span>
                      {pc.pendingCount > 0 && (
                        <Badge className="bg-orange-500/70 text-white border-0 text-xs">{pc.pendingCount} pending</Badge>
                      )}
                    </div>
                  );
                })}
                {projectCostBreakdown.length > 5 && (
                  <p className="text-white/50 text-xs text-center pt-2">+ {projectCostBreakdown.length - 5} more projects</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
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
                    <Clock className="h-5 w-5 text-orange-600" />
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
                    <Award className="h-5 w-5 text-purple-600" />
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
                    <Wallet className="h-5 w-5 text-blue-600" />
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
                    <TrendingUp className="h-5 w-5 text-green-600" />
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

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Cost Approval Workflow</h2>
                <p className="text-muted-foreground">Review and approve cost submissions in the workflow pipeline</p>
              </div>
              <Button
                variant="outline"
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

        {/* Classifications Tab */}
        <TabsContent value="classifications" className="space-y-4">
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

        {/* Budget Tab */}
        <TabsContent value="budget" className="space-y-4">
          <Card className="bg-gradient-to-br from-slate-900/90 to-pink-900/90 backdrop-blur-xl border-pink-500/30 shadow-xl">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <div className="p-2 bg-pink-500/20 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-pink-400" />
                </div>
                Budget vs Actual Spend
              </CardTitle>
              <CardDescription className="text-white/70">Compare project budgets against actual operational cost submissions</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {budgetVsActual.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-white/30" />
                  <p className="text-white/60">No project budgets found. Create budgets on the Budget page to see comparisons.</p>
                  <Button variant="outline" className="mt-4 bg-white/10 border-white/30 text-white" onClick={() => navigate('/budget')} data-testid="button-goto-budget">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Budget Page
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {budgetVsActual.map(item => (
                    <div key={item.projectId} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3" data-testid={`budget-vs-actual-${item.projectId}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Button
                          variant="link"
                          className="text-white font-semibold p-0 h-auto hover:text-pink-300"
                          onClick={() => item.projectId !== '__general__' && navigate(`/projects/${item.projectId}`)}
                          data-testid={`link-project-${item.projectId}`}
                        >
                          <FolderKanban className="h-4 w-4 mr-1.5" />
                          {item.projectName}
                        </Button>
                        <div className="flex items-center gap-2">
                          {item.utilization > 90 && (
                            <Badge className="bg-red-500/80 text-white border-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Over 90%
                            </Badge>
                          )}
                          <Badge className="bg-white/10 text-white border-white/20">
                            {item.submissionCount} submissions
                          </Badge>
                        </div>
                      </div>
                      <Progress
                        value={item.utilization}
                        className={`h-3 ${item.utilization > 90 ? '[&>*]:bg-gradient-to-r [&>*]:from-red-500 [&>*]:to-rose-600' : item.utilization > 70 ? '[&>*]:bg-gradient-to-r [&>*]:from-amber-500 [&>*]:to-orange-600' : '[&>*]:bg-gradient-to-r [&>*]:from-green-500 [&>*]:to-emerald-600'} bg-white/10`}
                      />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-white/60 block text-xs">Budget</span>
                          <span className="text-white font-mono font-medium">{formatCurrency(item.budgetCents / 100)}</span>
                        </div>
                        <div>
                          <span className="text-white/60 block text-xs">Actual Spend</span>
                          <span className="text-green-400 font-mono font-medium">{formatCurrency(item.actualSpendCents / 100)}</span>
                        </div>
                        <div>
                          <span className="text-white/60 block text-xs">Variance</span>
                          <span className={`font-mono font-medium ${item.varianceCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.varianceCents >= 0 ? '+' : ''}{formatCurrency(item.varianceCents / 100)}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/60 block text-xs">Utilization</span>
                          <span className="text-white font-mono font-medium">{item.utilization.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-green-600/90 to-emerald-700/90 border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-white/80" />
                  <span className="text-xs text-white/70">Total Paid</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(opCosts.filter(oc => oc.paid_at || oc.reconciled_at).reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-600/90 to-cyan-700/90 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-white/80" />
                  <span className="text-xs text-white/70">Awaiting Payment</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(opCosts.filter(oc => getOpDerivedStatus(oc) === 'approved').reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-600/90 to-pink-700/90 border-purple-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-white/80" />
                  <span className="text-xs text-white/70">Reconciled</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(opCosts.filter(oc => oc.reconciled_at).reduce((s, oc) => s + (oc.reconciled_amount_cents || oc.amount_cents), 0) / 100)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gradient-to-br from-slate-900/90 to-green-900/90 backdrop-blur-xl border-green-500/30 shadow-xl">
            <CardHeader className="border-b border-white/10 pb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-white flex items-center gap-2">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Wallet className="h-5 w-5 text-green-400" />
                  </div>
                  Recent Payments
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="bg-white/10 border-white/30 text-white" onClick={() => navigate('/cost-submission')} data-testid="button-view-all-submissions">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    All Submissions
                  </Button>
                  <Button variant="outline" size="sm" className="bg-white/10 border-white/30 text-white" onClick={() => navigate('/finance')} data-testid="button-view-finance-detail">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Finance Details
                  </Button>
                </div>
              </div>
              <CardDescription className="text-white/70">Most recent paid and reconciled cost submissions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentPaidCosts.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Wallet className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No payments recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-white/70">Date</TableHead>
                        <TableHead className="text-white/70">Project</TableHead>
                        <TableHead className="text-white/70">Category</TableHead>
                        <TableHead className="text-white/70">Paid To</TableHead>
                        <TableHead className="text-white/70 text-right">Amount</TableHead>
                        <TableHead className="text-white/70">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPaidCosts.map(oc => {
                        const proj = oc.project_id ? projects.find(p => p.id === oc.project_id) : null;
                        const isReconciled = !!oc.reconciled_at;
                        return (
                          <TableRow key={oc.id} className="border-white/10" data-testid={`row-payment-${oc.id}`}>
                            <TableCell className="text-white/90 text-sm whitespace-nowrap">
                              {safeFormatDate(oc.paid_at || oc.reconciled_at)}
                            </TableCell>
                            <TableCell>
                              {proj ? (
                                <Button
                                  variant="link"
                                  className="text-blue-300 p-0 h-auto text-sm"
                                  onClick={() => navigate(`/projects/${proj.id}`)}
                                  data-testid={`link-payment-project-${oc.id}`}
                                >
                                  {proj.name}
                                </Button>
                              ) : (
                                <span className="text-white/50 text-sm">General</span>
                              )}
                            </TableCell>
                            <TableCell className="text-white/80 text-sm capitalize">
                              {(oc.expense_category || '').replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-white/80 text-sm">{getUserName(oc.submitted_by)}</TableCell>
                            <TableCell className="text-right text-white font-mono text-sm font-medium">
                              {formatCurrency(oc.amount_cents / 100)}
                            </TableCell>
                            <TableCell>
                              <Badge className={isReconciled ? 'bg-purple-500/80 text-white border-0' : 'bg-green-500/80 text-white border-0'}>
                                {isReconciled ? 'Reconciled' : 'Paid'}
                              </Badge>
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
      </div>
    </div>
  );
};

export default FinancialOperations;
