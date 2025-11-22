import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DollarSign, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import type { MMPBudget, ProjectBudget } from '@/types/budget';

interface BudgetStatusBadgeProps {
  budget: MMPBudget | ProjectBudget | null;
  variant?: 'compact' | 'detailed';
}

export function BudgetStatusBadge({ budget, variant = 'compact' }: BudgetStatusBadgeProps) {
  if (!budget) {
    return null;
  }

  const utilizationPercent = budget.allocatedBudgetCents > 0
    ? (budget.spentBudgetCents / budget.allocatedBudgetCents) * 100
    : 0;

  const getBadgeColor = () => {
    if (budget.status === 'exceeded') return 'destructive';
    if (utilizationPercent >= 100) return 'destructive';
    if (utilizationPercent >= 80) return 'default';
    return 'secondary';
  };

  const getIcon = () => {
    if (budget.status === 'exceeded' || utilizationPercent >= 100) {
      return <AlertTriangle className="w-3 h-3" />;
    }
    if (utilizationPercent >= 80) {
      return <TrendingUp className="w-3 h-3" />;
    }
    return <CheckCircle2 className="w-3 h-3" />;
  };

  const getStatusText = () => {
    if (budget.status === 'exceeded') return 'Over Budget';
    if (utilizationPercent >= 100) return 'Budget Exhausted';
    if (utilizationPercent >= 80) return 'Budget Warning';
    return 'Budget OK';
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-SD', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={getBadgeColor()} className="gap-1" data-testid="badge-budget-status">
              {getIcon()}
              {utilizationPercent.toFixed(0)}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p className="font-semibold">{getStatusText()}</p>
              <p>Spent: {formatCurrency(budget.spentBudgetCents)}</p>
              <p>Budget: {formatCurrency(budget.allocatedBudgetCents)}</p>
              <p>Remaining: {formatCurrency(budget.remainingBudgetCents)}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded-md" data-testid="budget-status-detailed">
      <DollarSign className="w-4 h-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">{getStatusText()}</span>
          <span className="text-xs text-muted-foreground">{utilizationPercent.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {formatCurrency(budget.spentBudgetCents)} / {formatCurrency(budget.allocatedBudgetCents)}
          </span>
        </div>
      </div>
      <Badge variant={getBadgeColor()} className="gap-1">
        {getIcon()}
        {formatCurrency(budget.remainingBudgetCents)} left
      </Badge>
    </div>
  );
}
