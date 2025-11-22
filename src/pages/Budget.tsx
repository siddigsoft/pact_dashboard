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
  BarChart3
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
        <div className="text-sm text-muted-foreground">Loading budget data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-budget">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Budget Management</h1>
          <p className="text-muted-foreground">Track and manage project budgets and expenditures</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('pdf')} data-testid="menu-export-pdf">
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')} data-testid="menu-export-excel">
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')} data-testid="menu-export-csv">
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
            <Card key={alert.id} className="border-destructive bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-destructive">{alert.title}</h4>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id)}>
                    Acknowledge
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissAlert(alert.id)}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {warningAlerts.slice(0, 3).map((alert) => (
            <Card key={alert.id} className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">{alert.title}</h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">{alert.message}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(alert.id)}>
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalBudget ? stats.totalBudget * 100 : 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {projectBudgets.length} projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalSpent ? stats.totalSpent * 100 : 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.utilizationRate?.toFixed(1)}% utilization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalRemaining ? stats.totalRemaining * 100 : 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Available for allocation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active MMPs</CardTitle>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mmpBudgets.filter(mb => mb.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {mmpBudgets.length} total MMP budgets
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">Project Budgets</TabsTrigger>
          <TabsTrigger value="mmps" data-testid="tab-mmps">MMP Budgets</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
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
  );
};

export default BudgetPage;
