import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  FileText,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import type { ProjectBudget, MMPBudget } from '@/types/budget';
import { BUDGET_STATUS_COLORS } from '@/types/budget';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

interface ProjectBudgetCardProps {
  budget: ProjectBudget;
  projectName?: string;
  onClick?: () => void;
}

export function ProjectBudgetCard({ budget, projectName, onClick }: ProjectBudgetCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const utilizationRate = budget.totalBudgetCents > 0
    ? (budget.spentBudgetCents / budget.totalBudgetCents) * 100
    : 0;

  const statusColor = BUDGET_STATUS_COLORS[budget.status] || 'default';
  const isOverBudget = budget.spentBudgetCents > budget.totalBudgetCents;
  const isNearLimit = utilizationRate >= 80 && utilizationRate < 100;

  return (
    <>
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer transition-all group"
        onClick={() => setDetailsOpen(true)}
        data-testid={`budget-card-${budget.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base line-clamp-1">
                {projectName || `Budget ${budget.budgetPeriod}`}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                FY {budget.fiscalYear} • {budget.budgetPeriod}
              </p>
            </div>
            <Badge variant={statusColor as any}>
              {budget.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget Amount */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">
                {formatCurrency(budget.remainingBudgetCents)}
              </span>
              <span className="text-sm text-muted-foreground">
                of {formatCurrency(budget.totalBudgetCents)}
              </span>
            </div>
            <Progress 
              value={utilizationRate} 
              className={`h-2 ${isOverBudget ? 'bg-destructive/20' : isNearLimit ? 'bg-yellow-500/20' : ''}`}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{utilizationRate.toFixed(1)}% utilized</span>
              <span>Spent: {formatCurrency(budget.spentBudgetCents)}</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Allocated</p>
                <p className="text-sm font-semibold">{formatCurrency(budget.allocatedBudgetCents)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOverBudget ? (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold">{isOverBudget ? 'Over' : 'On Track'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {projectName || 'Project Budget'} Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3">
              <Badge variant={statusColor as any} className="text-sm">
                {budget.status}
              </Badge>
              {isOverBudget && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Over Budget
                </Badge>
              )}
              {isNearLimit && !isOverBudget && (
                <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
                  <AlertTriangle className="w-3 h-3" />
                  Near Limit
                </Badge>
              )}
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Total Budget
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(budget.totalBudgetCents)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-muted-foreground" />
                    Total Spent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(budget.spentBudgetCents)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {utilizationRate.toFixed(1)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    Remaining
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(budget.remainingBudgetCents)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Allocated
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(budget.allocatedBudgetCents)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Budget Utilization</span>
                <span className="text-sm text-muted-foreground">{utilizationRate.toFixed(1)}%</span>
              </div>
              <Progress value={utilizationRate} className="h-3" />
            </div>

            {/* Period Information */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Budget Period</p>
                <p className="font-semibold capitalize">{budget.budgetPeriod}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fiscal Year</p>
                <p className="font-semibold">{budget.fiscalYear}</p>
              </div>
              {budget.periodStartDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                  <p className="font-semibold">
                    {format(new Date(budget.periodStartDate), 'MMM dd, yyyy')}
                  </p>
                </div>
              )}
              {budget.periodEndDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">End Date</p>
                  <p className="font-semibold">
                    {format(new Date(budget.periodEndDate), 'MMM dd, yyyy')}
                  </p>
                </div>
              )}
            </div>

            {/* Category Allocations */}
            {budget.categoryAllocations && (
              <div>
                <h4 className="font-semibold mb-3">Category Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(budget.categoryAllocations).map(([key, value]) => {
                    const amount = typeof value === 'number' ? value : 0;
                    if (amount === 0) return null;
                    const displayName = 
                      key === 'transportation_and_visit_fees' ? 'Transportation and Visit Fees' :
                      key === 'permit_fee' ? 'Permit Fee' :
                      key === 'internet_and_communication_fees' ? 'Internet & Communication Fees' :
                      key.replace(/_/g, ' ');
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{displayName}</span>
                        <span className="font-semibold">{formatCurrency(amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {budget.budgetNotes && (
              <div>
                <h4 className="font-semibold mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground">{budget.budgetNotes}</p>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t">
              <span>Created: {format(new Date(budget.createdAt), 'MMM dd, yyyy')}</span>
              <span>Updated: {format(new Date(budget.updatedAt), 'MMM dd, yyyy')}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface MMPBudgetCardProps {
  budget: MMPBudget;
  mmpName?: string;
  onClick?: () => void;
}

export function MMPBudgetCard({ budget, mmpName, onClick }: MMPBudgetCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const utilizationRate = budget.allocatedBudgetCents > 0
    ? (budget.spentBudgetCents / budget.allocatedBudgetCents) * 100
    : 0;

  const statusColor = BUDGET_STATUS_COLORS[budget.status] || 'default';
  const isOverBudget = budget.spentBudgetCents > budget.allocatedBudgetCents;
  const isNearLimit = utilizationRate >= 80 && utilizationRate < 100;
  const avgCostPerSite = budget.completedSites > 0
    ? budget.spentBudgetCents / budget.completedSites
    : budget.averageCostPerSiteCents || 0;

  return (
    <>
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer transition-all"
        onClick={() => setDetailsOpen(true)}
        data-testid={`mmp-budget-card-${budget.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base line-clamp-1">
                {mmpName || 'MMP Budget'}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {budget.totalSites} sites • {budget.completedSites} completed
              </p>
            </div>
            <Badge variant={statusColor as any}>
              {budget.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget Amount */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">
                {formatCurrency(budget.remainingBudgetCents)}
              </span>
              <span className="text-sm text-muted-foreground">
                of {formatCurrency(budget.allocatedBudgetCents)}
              </span>
            </div>
            <Progress 
              value={utilizationRate} 
              className={`h-2 ${isOverBudget ? 'bg-destructive/20' : isNearLimit ? 'bg-yellow-500/20' : ''}`}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{utilizationRate.toFixed(1)}% utilized</span>
              <span>Avg/site: {formatCurrency(avgCostPerSite)}</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="text-sm font-semibold">
                  {budget.totalSites > 0 ? Math.round((budget.completedSites / budget.totalSites) * 100) : 0}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOverBudget ? (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold">{isOverBudget ? 'Over' : 'On Track'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog - Similar structure to ProjectBudgetCard */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {mmpName || 'MMP Budget'} Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <Badge variant={statusColor as any}>{budget.status}</Badge>
              {isOverBudget && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Over Budget
                </Badge>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Allocated</p>
                  <p className="text-xl font-bold">{formatCurrency(budget.allocatedBudgetCents)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Spent</p>
                  <p className="text-xl font-bold">{formatCurrency(budget.spentBudgetCents)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-xl font-bold">{formatCurrency(budget.remainingBudgetCents)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Progress */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Utilization</span>
                <span className="text-sm text-muted-foreground">{utilizationRate.toFixed(1)}%</span>
              </div>
              <Progress value={utilizationRate} className="h-3" />
            </div>

            {/* Site Info */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Sites</p>
                <p className="text-xl font-bold">{budget.totalSites}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-xl font-bold">{budget.completedSites}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Avg Cost/Site</p>
                <p className="text-lg font-bold">{formatCurrency(avgCostPerSite)}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            {budget.categoryBreakdown && (
              <div>
                <h4 className="font-semibold mb-3">Category Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(budget.categoryBreakdown).map(([key, value]) => {
                    const amount = typeof value === 'number' ? value : 0;
                    if (amount === 0) return null;
                    const displayName = 
                      key === 'transportation_and_visit_fees' ? 'Transportation and Visit Fees' :
                      key === 'permit_fee' ? 'Permit Fee' :
                      key === 'internet_and_communication_fees' ? 'Internet & Communication Fees' :
                      key.replace(/_/g, ' ');
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{displayName}</span>
                        <span className="font-semibold">{formatCurrency(amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
