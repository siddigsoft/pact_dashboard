import { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import {
  checkBudgetRestriction,
  checkProjectBudgetRestriction,
  canOverrideBudgetRestriction,
  type BudgetRestrictionResult,
  type BudgetThresholdConfig,
} from '@/services/budget-restriction.service';
import { BudgetNotificationService } from '@/services/budget-notification.service';
import type { AppRole } from '@/types/roles';

const DEFAULT_THRESHOLDS: BudgetThresholdConfig = {
  warningThreshold: 70,
  criticalThreshold: 80,
  autoBlockThreshold: 100,
};

export interface UseBudgetRestrictionReturn {
  checkRestriction: (
    mmpFileId: string,
    amountCents: number
  ) => Promise<BudgetRestrictionResult>;
  checkProjectRestriction: (
    projectId: string,
    amountCents: number
  ) => Promise<BudgetRestrictionResult>;
  canOverride: boolean;
  isChecking: boolean;
  lastResult: BudgetRestrictionResult | null;
  triggerThresholdAlerts: (budgetId: string, budgetType: 'project' | 'mmp') => Promise<void>;
  escalateToSeniorOps: (request: {
    requestId: string;
    requestType: 'expense_approval' | 'budget_override' | 'cost_submission';
    amount: number;
    shortfall: number;
    projectId: string;
    projectName: string;
    mmpId?: string;
    reason: string;
  }) => Promise<number>;
}

export function useBudgetRestriction(
  thresholds: BudgetThresholdConfig = DEFAULT_THRESHOLDS
): UseBudgetRestrictionReturn {
  const { currentUser, roles } = useAppContext();
  const [isChecking, setIsChecking] = useState(false);
  const [lastResult, setLastResult] = useState<BudgetRestrictionResult | null>(null);

  const userRole: AppRole = (currentUser?.role as AppRole) || 'DataCollector';
  const canOverride = canOverrideBudgetRestriction(userRole);

  const checkRestriction = useCallback(
    async (mmpFileId: string, amountCents: number): Promise<BudgetRestrictionResult> => {
      setIsChecking(true);
      try {
        const result = await checkBudgetRestriction(mmpFileId, amountCents, thresholds);
        setLastResult(result);
        
        if (result.alerts.length > 0) {
          const criticalAlert = result.alerts.find(a => a.severity === 'critical');
          const warningAlert = result.alerts.find(a => a.severity === 'warning');
          
          if (criticalAlert && result.budgetDetails.allocated > 0) {
            await BudgetNotificationService.sendBudgetExceededAlert({
              mmpId: mmpFileId,
              projectName: 'MMP Budget',
              utilizationPercentage: result.budgetDetails.utilizationPercentage,
              budgetAmount: result.budgetDetails.allocated,
              spentAmount: result.budgetDetails.spent,
              remainingAmount: result.budgetDetails.remaining,
            });
          } else if (warningAlert && result.budgetDetails.utilizationPercentage >= 80) {
            await BudgetNotificationService.send80PercentThresholdAlert({
              mmpId: mmpFileId,
              projectName: 'MMP Budget',
              utilizationPercentage: result.budgetDetails.utilizationPercentage,
              budgetAmount: result.budgetDetails.allocated,
              spentAmount: result.budgetDetails.spent,
              remainingAmount: result.budgetDetails.remaining,
            });
          }
        }
        
        return result;
      } finally {
        setIsChecking(false);
      }
    },
    [thresholds]
  );

  const checkProjectRestriction = useCallback(
    async (projectId: string, amountCents: number): Promise<BudgetRestrictionResult> => {
      setIsChecking(true);
      try {
        const result = await checkProjectBudgetRestriction(projectId, amountCents, thresholds);
        setLastResult(result);
        
        if (result.alerts.length > 0) {
          const criticalAlert = result.alerts.find(a => a.severity === 'critical');
          const warningAlert = result.alerts.find(a => a.severity === 'warning');
          
          if (criticalAlert && result.budgetDetails.allocated > 0) {
            await BudgetNotificationService.sendBudgetExceededAlert({
              projectId,
              projectName: 'Project Budget',
              utilizationPercentage: result.budgetDetails.utilizationPercentage,
              budgetAmount: result.budgetDetails.allocated,
              spentAmount: result.budgetDetails.spent,
              remainingAmount: result.budgetDetails.remaining,
            });
          } else if (warningAlert && result.budgetDetails.utilizationPercentage >= 80) {
            await BudgetNotificationService.send80PercentThresholdAlert({
              projectId,
              projectName: 'Project Budget',
              utilizationPercentage: result.budgetDetails.utilizationPercentage,
              budgetAmount: result.budgetDetails.allocated,
              spentAmount: result.budgetDetails.spent,
              remainingAmount: result.budgetDetails.remaining,
            });
          }
        }
        
        return result;
      } finally {
        setIsChecking(false);
      }
    },
    [thresholds]
  );

  const triggerThresholdAlerts = useCallback(
    async (budgetId: string, budgetType: 'project' | 'mmp'): Promise<void> => {
      await BudgetNotificationService.checkAndTriggerThresholdAlerts(budgetId, budgetType);
    },
    []
  );

  const escalateToSeniorOps = useCallback(
    async (request: {
      requestId: string;
      requestType: 'expense_approval' | 'budget_override' | 'cost_submission';
      amount: number;
      shortfall: number;
      projectId: string;
      projectName: string;
      mmpId?: string;
      reason: string;
    }): Promise<number> => {
      if (!currentUser) return 0;

      return await BudgetNotificationService.sendEscalationToSeniorOps({
        ...request,
        requestedBy: currentUser.id,
        requestedByName: currentUser.name || currentUser.email || 'Unknown User',
      });
    },
    [currentUser]
  );

  return {
    checkRestriction,
    checkProjectRestriction,
    canOverride,
    isChecking,
    lastResult,
    triggerThresholdAlerts,
    escalateToSeniorOps,
  };
}

export default useBudgetRestriction;
