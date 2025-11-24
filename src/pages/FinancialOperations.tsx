import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  BarChart3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useCostSubmissions, usePendingCostApprovals } from '@/context/costApproval/CostSubmissionContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { useWallet } from '@/context/wallet/WalletContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { WorkflowRail } from '@/components/financial/WorkflowRail';
import { GradientStatCard, GRADIENT_PRESETS } from '@/components/dashboard/GradientStatCard';
import { PageLoader } from '@/components/ui/loading-badge';

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
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

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Navigate to detailed views</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <Card>
            <CardHeader>
              <CardTitle>Budget vs Actual Tracking</CardTitle>
              <CardDescription>Project and MMP budget analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Budget tracking dashboard coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Tracker</CardTitle>
              <CardDescription>Wallet transactions and payout requests</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/finance')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Payment Details
              </Button>
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
