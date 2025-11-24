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
      {/* Holographic Budget Card */}
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity"></div>
        <Card
          className="relative bg-gradient-to-br from-slate-900/90 via-blue-900/80 to-purple-900/90 backdrop-blur-xl border border-blue-500/30 hover-elevate active-elevate-2 cursor-pointer transition-all shadow-[0_0_30px_rgba(59,130,246,0.2)]"
          onClick={() => setDetailsOpen(true)}
          data-testid={`budget-card-${budget.id}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base line-clamp-1 text-cyan-100">
                  {projectName || `Budget ${budget.budgetPeriod}`}
                </CardTitle>
                <p className="text-sm text-cyan-300/60 mt-1">
                  FY {budget.fiscalYear} • {budget.budgetPeriod}
                </p>
              </div>
              <Badge 
                variant={statusColor as any}
                className="bg-gradient-to-r from-blue-600/90 to-purple-600/90 text-white border-blue-400/50 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              >
                {budget.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Budget Amount */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                  {formatCurrency(budget.remainingBudgetCents)}
                </span>
                <span className="text-sm text-cyan-300/50">
                  of {formatCurrency(budget.totalBudgetCents)}
                </span>
              </div>
              <div className="relative h-2 bg-slate-800/50 rounded-full overflow-hidden border border-blue-500/20">
                <div 
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    isOverBudget 
                      ? 'bg-gradient-to-r from-red-500 to-pink-500' 
                      : isNearLimit 
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500' 
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                  } shadow-[0_0_10px_currentColor]`}
                  style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-cyan-300/70">
                <span>{utilizationRate.toFixed(1)}% utilized</span>
                <span>Spent: {formatCurrency(budget.spentBudgetCents)}</span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-500/20">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-cyan-400" />
                <div>
                  <p className="text-xs text-cyan-300/50">Allocated</p>
                  <p className="text-sm font-semibold text-cyan-200">{formatCurrency(budget.allocatedBudgetCents)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOverBudget ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
                <div>
                  <p className="text-xs text-cyan-300/50">Status</p>
                  <p className={`text-sm font-semibold ${isOverBudget ? 'text-red-300' : 'text-green-300'}`}>
                    {isOverBudget ? 'Over' : 'On Track'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-100">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
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
              <div className="p-4 bg-gradient-to-br from-blue-900/30 to-cyan-900/30 backdrop-blur-sm border border-blue-500/30 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-cyan-200">Total Budget</span>
                </div>
                <p className="text-2xl font-bold text-cyan-100">{formatCurrency(budget.totalBudgetCents)}</p>
              </div>

              <div className="p-4 bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border border-purple-500/30 rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-200">Total Spent</span>
                </div>
                <p className="text-2xl font-bold text-purple-100">{formatCurrency(budget.spentBudgetCents)}</p>
                <p className="text-xs text-purple-300/70 mt-1">
                  {utilizationRate.toFixed(1)}% of total
                </p>
              </div>

              <div className="p-4 bg-gradient-to-br from-green-900/30 to-cyan-900/30 backdrop-blur-sm border border-green-500/30 rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-200">Remaining</span>
                </div>
                <p className="text-2xl font-bold text-green-100">{formatCurrency(budget.remainingBudgetCents)}</p>
              </div>

              <div className="p-4 bg-gradient-to-br from-cyan-900/30 to-blue-900/30 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-cyan-200">Allocated</span>
                </div>
                <p className="text-2xl font-bold text-cyan-100">{formatCurrency(budget.allocatedBudgetCents)}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-cyan-200">Budget Utilization</span>
                <span className="text-sm text-cyan-300/70">{utilizationRate.toFixed(1)}%</span>
              </div>
              <div className="relative h-3 bg-slate-800/50 rounded-full overflow-hidden border border-blue-500/20">
                <div 
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Period Information */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 backdrop-blur-sm border border-blue-500/30 rounded-lg">
              <div>
                <p className="text-xs text-cyan-300/50 mb-1">Budget Period</p>
                <p className="font-semibold text-cyan-200 capitalize">{budget.budgetPeriod}</p>
              </div>
              <div>
                <p className="text-xs text-cyan-300/50 mb-1">Fiscal Year</p>
                <p className="font-semibold text-cyan-200">{budget.fiscalYear}</p>
              </div>
              {budget.periodStartDate && (
                <div>
                  <p className="text-xs text-cyan-300/50 mb-1">Start Date</p>
                  <p className="font-semibold text-cyan-200">
                    {format(new Date(budget.periodStartDate), 'MMM dd, yyyy')}
                  </p>
                </div>
              )}
              {budget.periodEndDate && (
                <div>
                  <p className="text-xs text-cyan-300/50 mb-1">End Date</p>
                  <p className="font-semibold text-cyan-200">
                    {format(new Date(budget.periodEndDate), 'MMM dd, yyyy')}
                  </p>
                </div>
              )}
            </div>

            {/* Category Allocations */}
            {budget.categoryAllocations && (
              <div>
                <h4 className="font-semibold mb-3 text-cyan-100">Category Breakdown</h4>
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
                        <span className="text-sm text-cyan-200">{displayName}</span>
                        <span className="font-semibold text-cyan-100">{formatCurrency(amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {budget.budgetNotes && (
              <div>
                <h4 className="font-semibold mb-2 text-cyan-100">Notes</h4>
                <p className="text-sm text-cyan-300/70">{budget.budgetNotes}</p>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center justify-between text-xs text-cyan-300/50 pt-4 border-t border-blue-500/20">
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
      {/* Holographic MMP Budget Card */}
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity"></div>
        <Card
          className="relative bg-gradient-to-br from-slate-900/90 via-purple-900/80 to-blue-900/90 backdrop-blur-xl border border-purple-500/30 hover-elevate active-elevate-2 cursor-pointer transition-all shadow-[0_0_30px_rgba(168,85,247,0.2)]"
          onClick={() => setDetailsOpen(true)}
          data-testid={`mmp-budget-card-${budget.id}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base line-clamp-1 text-purple-100">
                  {mmpName || 'MMP Budget'}
                </CardTitle>
                <p className="text-sm text-purple-300/60 mt-1">
                  {budget.totalSites} sites • {budget.completedSites} completed
                </p>
              </div>
              <Badge 
                variant={statusColor as any}
                className="bg-gradient-to-r from-purple-600/90 to-blue-600/90 text-white border-purple-400/50 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
              >
                {budget.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Budget Amount */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">
                  {formatCurrency(budget.remainingBudgetCents)}
                </span>
                <span className="text-sm text-purple-300/50">
                  of {formatCurrency(budget.allocatedBudgetCents)}
                </span>
              </div>
              <div className="relative h-2 bg-slate-800/50 rounded-full overflow-hidden border border-purple-500/20">
                <div 
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    isOverBudget 
                      ? 'bg-gradient-to-r from-red-500 to-pink-500' 
                      : isNearLimit 
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500' 
                      : 'bg-gradient-to-r from-purple-500 to-cyan-500'
                  } shadow-[0_0_10px_currentColor]`}
                  style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-purple-300/70">
                <span>{utilizationRate.toFixed(1)}% utilized</span>
                <span>Avg/site: {formatCurrency(avgCostPerSite)}</span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-500/20">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="text-xs text-purple-300/50">Progress</p>
                  <p className="text-sm font-semibold text-purple-200">
                    {budget.totalSites > 0 ? Math.round((budget.completedSites / budget.totalSites) * 100) : 0}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOverBudget ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
                <div>
                  <p className="text-xs text-purple-300/50">Status</p>
                  <p className={`text-sm font-semibold ${isOverBudget ? 'text-red-300' : 'text-green-300'}`}>
                    {isOverBudget ? 'Over' : 'On Track'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog - Similar structure to ProjectBudgetCard */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 via-purple-950 to-blue-950 border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-100">
              <FileText className="w-5 h-5 text-purple-400" />
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
              <div className="p-4 bg-gradient-to-br from-purple-900/30 to-cyan-900/30 backdrop-blur-sm border border-purple-500/30 rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <p className="text-sm text-purple-300/70">Allocated</p>
                <p className="text-xl font-bold text-purple-100">{formatCurrency(budget.allocatedBudgetCents)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-cyan-900/30 to-blue-900/30 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <p className="text-sm text-cyan-300/70">Spent</p>
                <p className="text-xl font-bold text-cyan-100">{formatCurrency(budget.spentBudgetCents)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-900/30 to-purple-900/30 backdrop-blur-sm border border-green-500/30 rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                <p className="text-sm text-green-300/70">Remaining</p>
                <p className="text-xl font-bold text-green-100">{formatCurrency(budget.remainingBudgetCents)}</p>
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-purple-200">Utilization</span>
                <span className="text-sm text-purple-300/70">{utilizationRate.toFixed(1)}%</span>
              </div>
              <div className="relative h-3 bg-slate-800/50 rounded-full overflow-hidden border border-purple-500/20">
                <div 
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                  style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Site Info */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-to-r from-purple-900/20 to-cyan-900/20 backdrop-blur-sm border border-purple-500/30 rounded-lg">
              <div>
                <p className="text-xs text-purple-300/50 mb-1">Total Sites</p>
                <p className="text-xl font-bold text-purple-100">{budget.totalSites}</p>
              </div>
              <div>
                <p className="text-xs text-purple-300/50 mb-1">Completed</p>
                <p className="text-xl font-bold text-purple-100">{budget.completedSites}</p>
              </div>
              <div>
                <p className="text-xs text-purple-300/50 mb-1">Avg Cost/Site</p>
                <p className="text-lg font-bold text-purple-100">{formatCurrency(avgCostPerSite)}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            {budget.categoryBreakdown && (
              <div>
                <h4 className="font-semibold mb-3 text-purple-100">Category Breakdown</h4>
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
                        <span className="text-sm text-purple-200">{displayName}</span>
                        <span className="font-semibold text-purple-100">{formatCurrency(amount)}</span>
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
