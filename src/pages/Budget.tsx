import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '@/context/budget/BudgetContext';
import { useAppContextSelector } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { useUserProjects } from '@/hooks/useUserProjects';
import { useProjectContext } from '@/context/project/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Download,
  RefreshCw,
  PieChart,
  BarChart3,
  FileText,
  Zap,
  Wallet
} from 'lucide-react';
import { CreateProjectBudgetDialog } from '@/components/budget/CreateProjectBudgetDialog';
import { CreateMMPBudgetDialog } from '@/components/budget/CreateMMPBudgetDialog';
import { TopUpBudgetDialog } from '@/components/budget/TopUpBudgetDialog';
import { ProjectBudgetCard, MMPBudgetCard } from '@/components/budget/BudgetCard';
import { format } from 'date-fns';
import { BUDGET_STATUS_COLORS, BUDGET_ALERT_SEVERITY_COLORS } from '@/types/budget';
import { exportBudgetToPDF, exportBudgetToExcel, exportBudgetToCSV } from '@/utils/budget-export';
import type { BudgetExportData } from '@/utils/budget-export';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const BudgetPage = () => {
  const currentUser = useAppContextSelector((c) => c.currentUser);
  const hasGranularPermission = useAppContextSelector((c) => c.hasGranularPermission);
  const { toast } = useToast();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const {
    projectBudgets: allProjectBudgets,
    mmpBudgets: allMmpBudgets,
    budgetTransactions: allBudgetTransactions,
    budgetAlerts: allBudgetAlerts,
    stats,
    loading,
    refreshProjectBudgets,
    refreshMMPBudgets,
    refreshBudgetTransactions,
    refreshBudgetAlerts,
    acknowledgeAlert,
    dismissAlert,
  } = useBudget();

  const [activeTab, setActiveTab] = useState('overview');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const navigate = useNavigate();
  const { projects } = useProjectContext();

  const [selectedProjectIdOverview, setSelectedProjectIdOverview] = useState<string>('');
  const [selectedProjectIdProjects, setSelectedProjectIdProjects] = useState<string>('');

  const [actualSpendByProject, setActualSpendByProject] = useState<Record<string, { approved: number; paid: number; count: number }>>({});

  useEffect(() => {
    const fetchActualSpend = async () => {
      try {
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('project_id, amount_cents, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents');
        if (error) throw error;
        const grouped: Record<string, { approved: number; paid: number; count: number }> = {};
        (data || []).forEach((row: any) => {
          if (!row.project_id) return;
          if (!grouped[row.project_id]) grouped[row.project_id] = { approved: 0, paid: 0, count: 0 };
          const isApproved = row.tier1_status === 'approved' || row.tier2_status === 'approved' || row.paid_at || row.reconciled_at;
          const isPaid = row.paid_at || row.reconciled_at;
          const effectiveAmount = row.reconciled_at && row.reconciled_amount_cents != null
            ? row.reconciled_amount_cents
            : row.amount_cents;
          if (isApproved) {
            grouped[row.project_id].approved += effectiveAmount;
            grouped[row.project_id].count++;
          }
          if (isPaid) grouped[row.project_id].paid += effectiveAmount;
        });
        setActualSpendByProject(grouped);
      } catch (err) {
        console.error('Failed to fetch actual spend:', err);
      }
    };
    fetchActualSpend();
  }, []);

  const canManageBudgets = hasGranularPermission('finances', 'update') || 
                           currentUser?.role === 'admin' || 
                           currentUser?.role === 'fom';

  // PROJECT TEAM MEMBERSHIP FILTER
  // Filter budgets to only show projects the user belongs to (admins see all)
  const projectBudgets = useMemo(() => {
    if (isAdminOrSuperUser) return allProjectBudgets;
    if (userProjectIds.length === 0) return [];
    return allProjectBudgets.filter(pb => userProjectIds.includes(pb.projectId));
  }, [allProjectBudgets, userProjectIds, isAdminOrSuperUser]);

  const mmpBudgets = useMemo(() => {
    if (isAdminOrSuperUser) return allMmpBudgets;
    if (userProjectIds.length === 0) return [];
    return allMmpBudgets.filter(mb => mb.projectId && userProjectIds.includes(mb.projectId));
  }, [allMmpBudgets, userProjectIds, isAdminOrSuperUser]);

  const budgetTransactions = useMemo(() => {
    if (isAdminOrSuperUser) return allBudgetTransactions;
    if (userProjectIds.length === 0) return [];
    return allBudgetTransactions.filter(bt => bt.projectId && userProjectIds.includes(bt.projectId));
  }, [allBudgetTransactions, userProjectIds, isAdminOrSuperUser]);

  const budgetAlerts = useMemo(() => {
    if (isAdminOrSuperUser) return allBudgetAlerts;
    if (userProjectIds.length === 0) return [];
    // Filter alerts by matching their projectBudgetId to the filtered projectBudgets
    const userProjectBudgetIds = projectBudgets.map(pb => pb.id);
    const userMmpBudgetIds = mmpBudgets.map(mb => mb.id);
    return allBudgetAlerts.filter(ba => 
      (ba.projectBudgetId && userProjectBudgetIds.includes(ba.projectBudgetId)) ||
      (ba.mmpBudgetId && userMmpBudgetIds.includes(ba.mmpBudgetId))
    );
  }, [allBudgetAlerts, userProjectIds, isAdminOrSuperUser, projectBudgets, mmpBudgets]);

  const projectsWithoutBudgets = useMemo(() => {
    const projectIdsWithBudgets = new Set(projectBudgets.map(pb => pb.projectId));
    return projects.filter(p => !projectIdsWithBudgets.has(p.id));
  }, [projects, projectBudgets]);

  const selectedOverviewProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectIdOverview);
  }, [projects, selectedProjectIdOverview]);

  const selectedProjectsTabProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectIdProjects);
  }, [projects, selectedProjectIdProjects]);

  const handleRefresh = async () => {
    await Promise.all([
      refreshProjectBudgets(),
      refreshMMPBudgets(),
      refreshBudgetTransactions(),
      refreshBudgetAlerts(),
    ]);
  };

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const exportData: BudgetExportData = {
      projectBudgets,
      mmpBudgets,
      transactions: budgetTransactions,
      stats,
    };

    const timestamp = new Date().toISOString().split('T')[0];
    const baseFilename = `budget_report_${timestamp}`;

    try {
      switch (format) {
        case 'pdf':
          exportBudgetToPDF(exportData, `${baseFilename}.pdf`);
          toast({
            title: 'Export Successful',
            description: 'Budget report exported to PDF',
          });
          break;
        case 'excel':
          exportBudgetToExcel(exportData, `${baseFilename}.xlsx`);
          toast({
            title: 'Export Successful',
            description: 'Budget report exported to Excel',
          });
          break;
        case 'csv':
          exportBudgetToCSV(exportData, `${baseFilename}.csv`);
          toast({
            title: 'Export Successful',
            description: 'Budget report exported to CSV',
          });
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export budget report',
        variant: 'destructive',
      });
    }
  };

  const activeAlerts = budgetAlerts.filter(a => a.status === 'active');
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
  const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');

  const filteredProjectBudgets = filterStatus === 'all' 
    ? projectBudgets 
    : projectBudgets.filter(pb => pb.status === filterStatus);

  const filteredMMPBudgets = filterStatus === 'all' 
    ? mmpBudgets 
    : mmpBudgets.filter(mb => mb.status === filterStatus);

  const utilizationBreakdown = useMemo(() => {
    const breakdown: { [key: string]: { allocated: number; spent: number; count: number } } = {};
    
    mmpBudgets.forEach(mb => {
      Object.entries(mb.categoryBreakdown).forEach(([category, amount]) => {
        if (!breakdown[category]) {
          breakdown[category] = { allocated: 0, spent: 0, count: 0 };
        }
        breakdown[category].allocated += amount;
        breakdown[category].count++;
      });
    });

    budgetTransactions.filter(t => t.transactionType === 'spend' && t.category).forEach(t => {
      if (t.category && breakdown[t.category]) {
        breakdown[t.category].spent += t.amountCents;
      }
    });

    return breakdown;
  }, [mmpBudgets, budgetTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-blue-300/70">Synchronizing budget data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6" data-testid="page-budget">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Budget Management</h1>
            <p className="text-sm text-muted-foreground">
              Advanced Financial Control Center
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                data-testid="button-export"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem 
                onClick={() => handleExport('pdf')} 
                data-testid="menu-export-pdf"
              >
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExport('excel')} 
                data-testid="menu-export-excel"
              >
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExport('csv')} 
                data-testid="menu-export-csv"
              >
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/financial-operations')}
            data-testid="button-goto-financial-ops"
            className="border-blue-500/30 text-blue-300"
          >
            <DollarSign className="w-4 h-4 mr-1" />
            Financial Ops
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/cost-submission')}
            data-testid="button-goto-cost-submissions"
            className="border-green-500/30 text-green-300"
          >
            <FileText className="w-4 h-4 mr-1" />
            Cost Submissions
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="Budget Management - Spending Limits & Tracking"
        description="This page is for setting and monitoring BUDGETS -- the spending limits for each project and MMP (Monthly Monitoring Plan). It shows how much has been allocated vs. how much has actually been spent through cost submissions and site visits. This page does NOT handle payments or approvals -- it only tracks whether spending stays within limits. When costs are submitted and approved on other pages, the spending totals update here automatically."
        descriptionAr="هذه الصفحة مخصصة لتحديد ومراقبة الميزانيات -- حدود الإنفاق لكل مشروع وخطة المراقبة الشهرية. تعرض المبالغ المخصصة مقابل المبالغ المنفقة فعلياً من خلال طلبات التكاليف والزيارات الميدانية. هذه الصفحة لا تتعامل مع المدفوعات أو الموافقات -- إنما تتتبع فقط ما إذا كان الإنفاق ضمن الحدود المحددة. عند تقديم التكاليف واعتمادها في صفحات أخرى، تُحدَّث إجماليات الإنفاق هنا تلقائياً."
        workflowSteps={[
          { step: 1, role: 'Admin', action: 'Sets budget limits', description: 'Admin creates budget allocations for each project and MMP, defining how much can be spent.' },
          { step: 2, role: 'Field Staff', action: 'Submits costs elsewhere', description: 'As staff submit costs on the Cost Submission page and complete site visits, spending is tracked here against budgets.' },
          { step: 3, role: 'System', action: 'Monitors utilization', description: 'The system automatically calculates how much of each budget has been used and sends alerts when limits are near.' },
          { step: 4, role: 'Finance Admin', action: 'Reviews and adjusts', description: 'Finance reviews budget vs. actual spending, identifies variances, and adjusts allocations as needed.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير', action: 'يحدد حدود الميزانية', description: 'ينشئ المدير مخصصات الميزانية لكل مشروع وخطة مراقبة شهرية، محدداً المبلغ المسموح بإنفاقه.' },
          { step: 2, role: 'موظف ميداني', action: 'يقدم التكاليف في صفحات أخرى', description: 'عند تقديم الموظفين للتكاليف في صفحة تقديم التكاليف وإتمام الزيارات الميدانية، يُتتبع الإنفاق هنا مقابل الميزانيات.' },
          { step: 3, role: 'النظام', action: 'يراقب نسبة الاستخدام', description: 'يحسب النظام تلقائياً مقدار ما تم استخدامه من كل ميزانية ويُرسل تنبيهات عند اقتراب الحدود.' },
          { step: 4, role: 'مدير المالية', action: 'يراجع ويُعدّل', description: 'يراجع قسم المالية الميزانية مقابل الإنفاق الفعلي، ويحدد الفروقات، ويُعدّل المخصصات حسب الحاجة.' },
        ]}
      />

        {/* Alerts Section */}
        {activeAlerts.length > 0 && (
          <div className="grid gap-3">
            {criticalAlerts.map((alert) => (
              <Card key={alert.id} className="bg-gradient-to-r from-red-900/50 to-orange-900/50 border-red-500/40 backdrop-blur-xl shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 animate-pulse" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-200">{alert.title}</h4>
                    <p className="text-sm text-red-300/70">{alert.message}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id)} className="border-red-500/30 text-red-300">
                      Acknowledge
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissAlert(alert.id)} className="text-red-300">
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {warningAlerts.slice(0, 3).map((alert) => (
              <Card key={alert.id} className="bg-gradient-to-r from-yellow-900/50 to-orange-900/50 border-yellow-500/40 backdrop-blur-xl shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 animate-pulse" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-200">{alert.title}</h4>
                    <p className="text-sm text-yellow-300/70">{alert.message}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(alert.id)} className="text-yellow-300">
                    Dismiss
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GradientStatCard
          title="Total Budget"
          value={formatCurrency(stats?.totalBudget ? stats.totalBudget * 100 : 0)}
          subtitle={`Across ${projectBudgets.length} projects`}
          icon={Wallet}
          color="blue"
          data-testid="card-stat-total-budget"
        />

        <GradientStatCard
          title="Total Spent"
          value={formatCurrency(stats?.totalSpent ? stats.totalSpent * 100 : 0)}
          subtitle={`${stats?.utilizationRate?.toFixed(1)}% utilization`}
          icon={TrendingDown}
          color="purple"
          data-testid="card-stat-total-spent"
        />

        <GradientStatCard
          title="Remaining Budget"
          value={formatCurrency(stats?.totalRemaining ? stats.totalRemaining * 100 : 0)}
          subtitle="Available for allocation"
          icon={TrendingUp}
          color="green"
          data-testid="card-stat-remaining-budget"
        />

        <GradientStatCard
          title="Active MMPs"
          value={mmpBudgets.filter(mb => mb.status === 'active').length}
          subtitle={`${mmpBudgets.length} total MMP budgets`}
          icon={BarChart3}
          color="cyan"
          data-testid="card-stat-active-mmps"
        />
      </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 bg-gradient-to-r from-slate-900/80 to-blue-900/80 border border-blue-500/30 backdrop-blur-xl p-1">
            <TabsTrigger 
              value="overview" 
              data-testid="tab-overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300"
            >
              OVERVIEW
            </TabsTrigger>
            <TabsTrigger 
              value="projects" 
              data-testid="tab-projects"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300"
            >
              PROJECTS
            </TabsTrigger>
            <TabsTrigger 
              value="mmps" 
              data-testid="tab-mmps"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300"
            >
              MMP BUDGETS
            </TabsTrigger>
            <TabsTrigger 
              value="transactions" 
              data-testid="tab-transactions"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300"
            >
              TRANSACTIONS
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              data-testid="tab-analytics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300"
            >
              ANALYTICS
            </TabsTrigger>
          </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-blue-300">Budget Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectBudgets.length === 0 ? (
                <div className="text-center py-12">
                  <PieChart className="w-12 h-12 mx-auto text-blue-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-blue-200">No budgets yet</h3>
                  <p className="text-blue-300/70 mb-4">
                    Create your first project budget to start tracking expenditures
                  </p>
                  {canManageBudgets && (
                    <div className="flex flex-col items-center gap-3" data-testid="budget-project-selector-overview">
                      {projects.length === 0 ? (
                        <p className="text-sm text-blue-300/70">No projects available. Create a project first.</p>
                      ) : projectsWithoutBudgets.length === 0 ? (
                        <p className="text-sm text-blue-300/70">All projects already have budgets assigned.</p>
                      ) : (
                        <>
                          <Select value={selectedProjectIdOverview} onValueChange={setSelectedProjectIdOverview}>
                            <SelectTrigger className="w-64 border-blue-500/30 bg-slate-800/50" data-testid="select-project-overview">
                              <SelectValue placeholder="Select a project..." />
                            </SelectTrigger>
                            <SelectContent>
                              {projectsWithoutBudgets.map((project) => (
                                <SelectItem key={project.id} value={project.id} data-testid={`select-project-option-${project.id}`}>
                                  {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedOverviewProject && (
                            <CreateProjectBudgetDialog
                              projectId={selectedOverviewProject.id}
                              projectName={selectedOverviewProject.name}
                              onSuccess={() => setSelectedProjectIdOverview('')}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {projectBudgets.slice(0, 5).map((budget) => {
                    const utilizationPercent = budget.totalBudgetCents > 0
                      ? ((budget.spentBudgetCents / budget.totalBudgetCents) * 100)
                      : 0;

                    return (
                      <div key={budget.id} className="space-y-2 p-4 rounded-lg bg-gradient-to-r from-slate-800/50 to-blue-800/50 border border-blue-500/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-blue-200">Project Budget - FY {budget.fiscalYear}</p>
                            <p className="text-sm text-blue-300/70">
                              {budget.budgetPeriod.replace('_', ' ').toUpperCase()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{formatCurrency(budget.remainingBudgetCents)}</p>
                            <p className="text-sm text-blue-300/70">
                              of {formatCurrency(budget.totalBudgetCents)} remaining
                            </p>
                          </div>
                        </div>
                        <Progress value={utilizationPercent} className="h-2 bg-slate-700/50 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-blue-300/70">{utilizationPercent.toFixed(1)}% utilized</span>
                          <Badge 
                            variant={budget.status === 'active' ? 'default' : 'secondary'}
                            className={budget.status === 'active' ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-0' : 'bg-slate-700 text-slate-300'}
                          >
                            {budget.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-purple-300">Spending by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(utilizationBreakdown).map(([category, data]) => {
                  const utilizationPercent = data.allocated > 0 
                    ? (data.spent / data.allocated) * 100 
                    : 0;

                  return (
                    <div key={category} className="space-y-2 p-3 rounded-lg bg-gradient-to-r from-slate-800/50 to-purple-800/50 border border-purple-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize text-purple-200">
                          {category.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-purple-300/70">
                          {formatCurrency(data.spent)} / {formatCurrency(data.allocated)}
                        </span>
                      </div>
                      <Progress value={utilizationPercent} className="h-1.5 bg-slate-700/50 [&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-pink-500" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Actual Spend vs Budget - from Operational Cost Submissions */}
          {projectBudgets.length > 0 && (
            <Card className="bg-gradient-to-br from-slate-900/80 to-emerald-900/80 border-emerald-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-emerald-300 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Actual Spend vs Budget (Cost Submissions)
                </CardTitle>
                <p className="text-sm text-emerald-400/70">Approved operational cost submissions compared to budget allocations</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {projectBudgets.map(budget => {
                  const pid = budget.projectId;
                  const proj = projects.find(p => p.id === pid);
                  const actual = actualSpendByProject[pid];
                  const totalBudget = budget.totalBudgetCents;
                  const actualApproved = actual?.approved || 0;
                  const actualPaid = actual?.paid || 0;
                  const utilPct = totalBudget > 0 ? Math.min(100, (actualApproved / totalBudget) * 100) : 0;
                  const variance = totalBudget - actualApproved;

                  return (
                    <div key={budget.id} className="p-4 rounded-lg bg-gradient-to-r from-slate-800/50 to-emerald-800/30 border border-emerald-500/20 space-y-2" data-testid={`actual-vs-budget-${pid}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-emerald-200">{proj?.name || 'Unknown Project'}</span>
                        <div className="flex items-center gap-2">
                          {utilPct > 90 && (
                            <Badge className="bg-red-500/70 text-white border-0 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              High Utilization
                            </Badge>
                          )}
                          {actual?.count ? (
                            <Badge className="bg-emerald-500/30 text-emerald-300 border-emerald-500/30 text-xs">
                              {actual.count} approved submissions
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-400/50 border-emerald-500/20 text-xs">
                              No submissions yet
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Progress
                        value={utilPct}
                        className={`h-2 bg-slate-700/50 ${utilPct > 90 ? '[&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-rose-500' : utilPct > 70 ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-500' : '[&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-500'}`}
                      />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-emerald-400/60 block">Budget</span>
                          <span className="text-emerald-200 font-mono">{formatCurrency(totalBudget)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-400/60 block">Actual (Approved)</span>
                          <span className="text-emerald-200 font-mono">{formatCurrency(actualApproved)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-400/60 block">Paid Out</span>
                          <span className="text-green-300 font-mono">{formatCurrency(actualPaid)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-400/60 block">Variance</span>
                          <span className={`font-mono ${variance >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Project Budgets Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Project Budgets</h2>
              <p className="text-blue-300/70">Manage and track project budget allocations</p>
            </div>
            {canManageBudgets && (
              <div className="flex items-center gap-3" data-testid="budget-project-selector-projects">
                {projects.length === 0 ? (
                  <p className="text-sm text-blue-300/70">No projects available.</p>
                ) : projectsWithoutBudgets.length === 0 ? (
                  <p className="text-sm text-blue-300/70">All projects have budgets.</p>
                ) : (
                  <>
                    <Select value={selectedProjectIdProjects} onValueChange={setSelectedProjectIdProjects}>
                      <SelectTrigger className="w-64 border-blue-500/30 bg-slate-800/50" data-testid="select-project-projects-tab">
                        <SelectValue placeholder="Select a project..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projectsWithoutBudgets.map((project) => (
                          <SelectItem key={project.id} value={project.id} data-testid={`select-project-tab-option-${project.id}`}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProjectsTabProject && (
                      <CreateProjectBudgetDialog
                        projectId={selectedProjectsTabProject.id}
                        projectName={selectedProjectsTabProject.name}
                        onSuccess={() => setSelectedProjectIdProjects('')}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          
          {filteredProjectBudgets.length === 0 ? (
            <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DollarSign className="w-12 h-12 text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-blue-200">No project budgets found</h3>
                <p className="text-blue-300/70 text-center max-w-md">
                  Create your first project budget to start tracking and managing expenditures
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjectBudgets.map((budget) => (
                <ProjectBudgetCard
                  key={budget.id}
                  budget={budget}
                  projectName={`Project ${budget.fiscalYear}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* MMP Budgets Tab */}
        <TabsContent value="mmps" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">MMP Budgets</h2>
              <p className="text-purple-300/70">Track budget allocations for Monthly Monitoring Plans</p>
            </div>
          </div>
          
          {filteredMMPBudgets.length === 0 ? (
            <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="w-12 h-12 text-purple-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-purple-200">No MMP budgets found</h3>
                <p className="text-purple-300/70 text-center max-w-md">
                  Allocate budgets to MMPs to track site visit costs and manage field operations
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMMPBudgets.map((budget) => (
                <MMPBudgetCard
                  key={budget.id}
                  budget={budget}
                  mmpName={`MMP-${budget.mmpFileId.slice(0, 8)}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-cyan-300">Budget Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-cyan-500/20 hover:bg-cyan-500/5">
                    <TableHead className="text-cyan-300">Date</TableHead>
                    <TableHead className="text-cyan-300">Type</TableHead>
                    <TableHead className="text-cyan-300">Category</TableHead>
                    <TableHead className="text-cyan-300">Description</TableHead>
                    <TableHead className="text-right text-cyan-300">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetTransactions.length === 0 ? (
                    <TableRow className="border-cyan-500/20">
                      <TableCell colSpan={5} className="text-center text-cyan-300/70 py-12">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    budgetTransactions.slice(0, 50).map((txn) => (
                      <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`} className="border-cyan-500/20 hover:bg-cyan-500/5">
                        <TableCell className="text-cyan-100">{format(new Date(txn.createdAt), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="capitalize text-cyan-100">{txn.transactionType.replace('_', ' ')}</TableCell>
                        <TableCell className="capitalize text-cyan-100">{txn.category?.replace('_', ' ') || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate text-cyan-100">{txn.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <span className={txn.transactionType === 'spend' ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                            {txn.transactionType === 'spend' ? '-' : '+'}{formatCurrency(txn.amountCents)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-blue-300">Budget Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <PieChart className="w-16 h-16 mx-auto text-blue-400 mb-4" />
                  <p className="text-blue-300/70">
                    Chart visualization coming soon
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-purple-300">Spending Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 mx-auto text-purple-400 mb-4" />
                  <p className="text-purple-300/70">
                    Trend analysis coming soon
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BudgetPage;
