import { useState, useMemo } from 'react';
import { useBudget } from '@/context/budget/BudgetContext';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { useUserProjects } from '@/hooks/useUserProjects';
import { useMMP } from '@/context/mmp/MMPContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
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

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const BudgetPage = () => {
  const { currentUser, hasGranularPermission } = useAppContext();
  const { toast } = useToast();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { mmpFiles } = useMMP();
  const {
    projectBudgets,
    mmpBudgets,
    budgetTransactions,
    budgetAlerts,
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

  const canManageBudgets = hasGranularPermission('finances', 'update') || 
                           currentUser?.role === 'admin' || 
                           currentUser?.role === 'fom';

  // Filter project budgets by user's projects
  const filteredProjectBudgets = useMemo(() => {
    if (isAdminOrSuperUser) return projectBudgets;
    return projectBudgets.filter(budget => userProjectIds.includes(budget.projectId));
  }, [projectBudgets, userProjectIds, isAdminOrSuperUser]);

  // Filter MMP budgets by user's projects
  const filteredMmpBudgets = useMemo(() => {
    if (isAdminOrSuperUser) return mmpBudgets;
    return mmpBudgets.filter(budget => {
      const mmp = mmpFiles?.find(m => m.id === budget.mmpId);
      if (!mmp) return true;
      if (!mmp.projectId) return true;
      return userProjectIds.includes(mmp.projectId);
    });
  }, [mmpBudgets, mmpFiles, userProjectIds, isAdminOrSuperUser]);

  // Filter transactions by user's projects
  const filteredTransactions = useMemo(() => {
    if (isAdminOrSuperUser) return budgetTransactions;
    return budgetTransactions.filter(tx => {
      if (tx.projectId && userProjectIds.includes(tx.projectId)) return true;
      if (tx.mmpId) {
        const mmp = mmpFiles?.find(m => m.id === tx.mmpId);
        if (!mmp) return true;
        if (!mmp.projectId) return true;
        return userProjectIds.includes(mmp.projectId);
      }
      return true;
    });
  }, [budgetTransactions, mmpFiles, userProjectIds, isAdminOrSuperUser]);

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
      projectBudgets: filteredProjectBudgets,
      mmpBudgets: filteredMmpBudgets,
      transactions: filteredTransactions,
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

  const displayProjectBudgets = filterStatus === 'all' 
    ? filteredProjectBudgets 
    : filteredProjectBudgets.filter(pb => pb.status === filterStatus);

  const displayMmpBudgets = filterStatus === 'all' 
    ? filteredMmpBudgets 
    : filteredMmpBudgets.filter(mb => mb.status === filterStatus);

  const utilizationBreakdown = useMemo(() => {
    const breakdown: { [key: string]: { allocated: number; spent: number; count: number } } = {};
    
    filteredMmpBudgets.forEach(mb => {
      Object.entries(mb.categoryBreakdown).forEach(([category, amount]) => {
        if (!breakdown[category]) {
          breakdown[category] = { allocated: 0, spent: 0, count: 0 };
        }
        breakdown[category].allocated += amount;
        breakdown[category].count++;
      });
    });

    filteredTransactions.filter(t => t.transactionType === 'spend' && t.category).forEach(t => {
      if (t.category && breakdown[t.category]) {
        breakdown[t.category].spent += t.amountCents;
      }
    });

    return breakdown;
  }, [filteredMmpBudgets, filteredTransactions]);

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
        </div>
      </div>

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
          subtitle={`Across ${filteredProjectBudgets.length} projects`}
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
          value={filteredMmpBudgets.filter(mb => mb.status === 'active').length}
          subtitle={`${filteredMmpBudgets.length} total MMP budgets`}
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
              {filteredProjectBudgets.length === 0 ? (
                <div className="text-center py-12">
                  <PieChart className="w-12 h-12 mx-auto text-blue-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-blue-200">No budgets yet</h3>
                  <p className="text-blue-300/70 mb-4">
                    Create your first project budget to start tracking expenditures
                  </p>
                  {canManageBudgets && (
                    <CreateProjectBudgetDialog
                      projectId="placeholder"
                      projectName="Select Project"
                    />
                  )}
                </div>
              ) : (
                <>
                  {filteredProjectBudgets.slice(0, 5).map((budget) => {
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
        </TabsContent>

        {/* Project Budgets Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Project Budgets</h2>
              <p className="text-blue-300/70">Manage and track project budget allocations</p>
            </div>
            {canManageBudgets && (
              <CreateProjectBudgetDialog
                projectId="placeholder"
                projectName="Select Project"
              />
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
          
          {filteredMmpBudgets.length === 0 ? (
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
              {filteredMmpBudgets.map((budget) => (
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
                  {filteredTransactions.length === 0 ? (
                    <TableRow className="border-cyan-500/20">
                      <TableCell colSpan={5} className="text-center text-cyan-300/70 py-12">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.slice(0, 50).map((txn) => (
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
