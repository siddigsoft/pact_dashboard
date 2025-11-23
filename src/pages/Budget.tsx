import { useState, useMemo } from 'react';
import { useBudget } from '@/context/budget/BudgetContext';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Zap
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
    <div className="relative min-h-screen">
      {/* Cyber Background with Animated Grid */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative space-y-6 p-6" data-testid="page-budget">
        {/* Cyber Header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-gradient-to-r from-slate-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/50">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
                    Budget Management
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 animate-pulse">
                      <Zap className="w-3 h-3 mr-1" />
                      ACTIVE
                    </Badge>
                  </h1>
                  <p className="text-blue-300/80 mt-1 text-lg">
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
                  className="bg-gradient-to-r from-slate-900/50 to-blue-900/50 border-blue-500/30 text-blue-300 hover:border-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all backdrop-blur-xl"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  REFRESH
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      data-testid="button-export"
                      className="bg-gradient-to-r from-slate-900/50 to-purple-900/50 border-purple-500/30 text-purple-300 hover:border-purple-400 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all backdrop-blur-xl"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      EXPORT
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-900/95 border-purple-500/30 backdrop-blur-xl">
                    <DropdownMenuItem 
                      onClick={() => handleExport('pdf')} 
                      data-testid="menu-export-pdf"
                      className="text-purple-300 focus:bg-purple-500/20 focus:text-purple-200"
                    >
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleExport('excel')} 
                      data-testid="menu-export-excel"
                      className="text-purple-300 focus:bg-purple-500/20 focus:text-purple-200"
                    >
                      Export as Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleExport('csv')} 
                      data-testid="menu-export-csv"
                      className="text-purple-300 focus:bg-purple-500/20 focus:text-purple-200"
                    >
                      Export as CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-blue-300">Total Budget</CardTitle>
              <DollarSign className="w-5 h-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{formatCurrency(stats?.totalBudget ? stats.totalBudget * 100 : 0)}</div>
              <p className="text-xs text-blue-300/70 mt-1">
                Across {projectBudgets.length} projects
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-purple-300">Total Spent</CardTitle>
              <TrendingDown className="w-5 h-5 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{formatCurrency(stats?.totalSpent ? stats.totalSpent * 100 : 0)}</div>
              <p className="text-xs text-purple-300/70 mt-1">
                {stats?.utilizationRate?.toFixed(1)}% utilization
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-green-900/80 border-green-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-green-300">Remaining</CardTitle>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{formatCurrency(stats?.totalRemaining ? stats.totalRemaining * 100 : 0)}</div>
              <p className="text-xs text-green-300/70 mt-1">
                Available for allocation
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-cyan-300">Active MMPs</CardTitle>
              <BarChart3 className="w-5 h-5 text-cyan-400 animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{mmpBudgets.filter(mb => mb.status === 'active').length}</div>
              <p className="text-xs text-cyan-300/70 mt-1">
                {mmpBudgets.length} total MMP budgets
              </p>
            </CardContent>
          </Card>
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
          <Card>
            <CardHeader>
              <CardTitle>Budget Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectBudgets.length === 0 ? (
                <div className="text-center py-12">
                  <PieChart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No budgets yet</h3>
                  <p className="text-muted-foreground mb-4">
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
                  {projectBudgets.slice(0, 5).map((budget) => {
                    const utilizationPercent = budget.totalBudgetCents > 0
                      ? ((budget.spentBudgetCents / budget.totalBudgetCents) * 100)
                      : 0;

                    return (
                      <div key={budget.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Project Budget - FY {budget.fiscalYear}</p>
                            <p className="text-sm text-muted-foreground">
                              {budget.budgetPeriod.replace('_', ' ').toUpperCase()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(budget.remainingBudgetCents)}</p>
                            <p className="text-sm text-muted-foreground">
                              of {formatCurrency(budget.totalBudgetCents)} remaining
                            </p>
                          </div>
                        </div>
                        <Progress value={utilizationPercent} className="h-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{utilizationPercent.toFixed(1)}% utilized</span>
                          <Badge variant={budget.status === 'active' ? 'default' : 'secondary'}>
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
          <Card>
            <CardHeader>
              <CardTitle>Spending by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(utilizationBreakdown).map(([category, data]) => {
                  const utilizationPercent = data.allocated > 0 
                    ? (data.spent / data.allocated) * 100 
                    : 0;

                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">
                          {category.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(data.spent)} / {formatCurrency(data.allocated)}
                        </span>
                      </div>
                      <Progress value={utilizationPercent} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Budgets Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Project Budgets</h2>
              <p className="text-muted-foreground">Manage and track project budget allocations</p>
            </div>
            {canManageBudgets && (
              <CreateProjectBudgetDialog
                projectId="placeholder"
                projectName="Select Project"
              />
            )}
          </div>
          
          {filteredProjectBudgets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DollarSign className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No project budgets found</h3>
                <p className="text-muted-foreground text-center max-w-md">
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">MMP Budgets</h2>
              <p className="text-muted-foreground">Track budget allocations for Monthly Monitoring Plans</p>
            </div>
          </div>
          
          {filteredMMPBudgets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No MMP budgets found</h3>
                <p className="text-muted-foreground text-center max-w-md">
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
          <Card>
            <CardHeader>
              <CardTitle>Budget Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    budgetTransactions.slice(0, 50).map((txn) => (
                      <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`}>
                        <TableCell>{format(new Date(txn.createdAt), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="capitalize">{txn.transactionType.replace('_', ' ')}</TableCell>
                        <TableCell className="capitalize">{txn.category?.replace('_', ' ') || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{txn.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <span className={txn.transactionType === 'spend' ? 'text-red-600' : 'text-green-600'}>
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
            <Card>
              <CardHeader>
                <CardTitle>Budget Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <PieChart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Chart visualization coming soon
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Trend analysis coming soon
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default BudgetPage;
