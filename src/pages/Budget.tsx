import { useState, useMemo } from 'react';
import { useBudget } from '@/context/budget/BudgetContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
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
import { format } from 'date-fns';
import { BUDGET_STATUS_COLORS, BUDGET_ALERT_SEVERITY_COLORS } from '@/types/budget';

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
          <Button variant="outline" size="sm" data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Project Budgets</CardTitle>
              {canManageBudgets && (
                <CreateProjectBudgetDialog
                  projectId="placeholder"
                  projectName="Select Project"
                />
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Total Budget</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjectBudgets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No project budgets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProjectBudgets.map((budget) => {
                      const utilizationPercent = budget.totalBudgetCents > 0
                        ? ((budget.spentBudgetCents / budget.totalBudgetCents) * 100)
                        : 0;

                      return (
                        <TableRow key={budget.id} data-testid={`row-project-budget-${budget.id}`}>
                          <TableCell className="font-medium">FY {budget.fiscalYear}</TableCell>
                          <TableCell className="capitalize">{budget.budgetPeriod.replace('_', ' ')}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.totalBudgetCents)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.allocatedBudgetCents)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.spentBudgetCents)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(budget.remainingBudgetCents)}</TableCell>
                          <TableCell>
                            <Badge variant={budget.status === 'active' ? 'default' : 'secondary'}>
                              {budget.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={utilizationPercent} className="h-1.5 w-16" />
                              <span className="text-sm">{utilizationPercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MMP Budgets Tab */}
        <TabsContent value="mmps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>MMP Budgets</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MMP</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-center">Sites</TableHead>
                    <TableHead className="text-right">Avg/Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMMPBudgets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No MMP budgets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMMPBudgets.map((budget) => {
                      const utilizationPercent = budget.allocatedBudgetCents > 0
                        ? ((budget.spentBudgetCents / budget.allocatedBudgetCents) * 100)
                        : 0;

                      return (
                        <TableRow key={budget.id} data-testid={`row-mmp-budget-${budget.id}`}>
                          <TableCell className="font-medium">MMP-{budget.mmpFileId.slice(0, 8)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.allocatedBudgetCents)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.spentBudgetCents)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(budget.remainingBudgetCents)}</TableCell>
                          <TableCell className="text-center">
                            {budget.completedSites}/{budget.totalSites}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.averageCostPerSiteCents)}</TableCell>
                          <TableCell>
                            <Badge variant={budget.status === 'active' ? 'default' : 'secondary'}>
                              {budget.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={utilizationPercent} className="h-1.5 w-16" />
                              <span className="text-sm">{utilizationPercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManageBudgets && (
                              <TopUpBudgetDialog
                                budgetId={budget.id}
                                budgetName={`MMP-${budget.mmpFileId.slice(0, 8)}`}
                                currentBalance={budget.remainingBudgetCents / 100}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
