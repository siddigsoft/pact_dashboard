import { createContext, useContext, useRef, useEffect, ReactNode, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { useUser } from '@/features/user/context/UserContext';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import {
  useProjectBudgetsQuery,
  useMMPBudgetsQuery,
  useBudgetTransactionsQuery,
  useBudgetAlertsQuery,
  useInvalidateBudgetQueries,
} from './budgetQueries';
import {
  createProjectBudget as dbCreateProjectBudget,
  updateProjectBudget as dbUpdateProjectBudget,
  deleteProjectBudget as dbDeleteProjectBudget,
  createMMPBudget as dbCreateMMPBudget,
  updateMMPBudget as dbUpdateMMPBudget,
  topUpMMPBudget as dbTopUpMMPBudget,
  recordBudgetSpend as dbRecordBudgetSpend,
  acknowledgeAlert as dbAcknowledgeAlert,
  dismissAlert as dbDismissAlert,
  getProjectBudgetSummary as dbGetProjectBudgetSummary,
  getMMPBudgetSummary as dbGetMMPBudgetSummary,
} from '@/features/budget/repository/budgetRepository';
import type {
  ProjectBudget,
  MMPBudget,
  BudgetTransaction,
  BudgetAlert,
  ProjectBudgetSummary,
  MMPBudgetSummary,
  BudgetStats,
  CreateProjectBudgetInput,
  CreateMMPBudgetInput,
  TopUpBudgetInput,
} from '@/types/budget';

interface BudgetContextType {
  projectBudgets: ProjectBudget[];
  mmpBudgets: MMPBudget[];
  budgetTransactions: BudgetTransaction[];
  budgetAlerts: BudgetAlert[];
  stats: BudgetStats | null;
  loading: boolean;

  refreshProjectBudgets: () => Promise<void>;
  refreshMMPBudgets: () => Promise<void>;
  refreshBudgetTransactions: () => Promise<void>;
  refreshBudgetAlerts: () => Promise<void>;

  createProjectBudget: (input: CreateProjectBudgetInput) => Promise<ProjectBudget | null>;
  updateProjectBudget: (id: string, updates: Partial<ProjectBudget>) => Promise<void>;
  deleteProjectBudget: (id: string) => Promise<void>;

  createMMPBudget: (input: CreateMMPBudgetInput) => Promise<MMPBudget | null>;
  updateMMPBudget: (id: string, updates: Partial<MMPBudget>) => Promise<void>;
  topUpMMPBudget: (input: TopUpBudgetInput) => Promise<void>;

  getProjectBudget: (projectId: string) => ProjectBudget | null;
  getMMPBudget: (mmpFileId: string) => MMPBudget | null;
  getProjectBudgetSummary: (projectId: string) => Promise<ProjectBudgetSummary | null>;
  getMMPBudgetSummary: (mmpFileId: string) => Promise<MMPBudgetSummary | null>;

  recordBudgetSpend: (mmpBudgetId: string, amountCents: number, category: string, description?: string) => Promise<void>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  dismissAlert: (alertId: string) => Promise<void>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const invalidate = useInvalidateBudgetQueries();

  const projectBudgetsQuery = useProjectBudgetsQuery(!!currentUser);
  const mmpBudgetsQuery = useMMPBudgetsQuery(!!currentUser);
  const transactionsQuery = useBudgetTransactionsQuery(!!currentUser);
  const alertsQuery = useBudgetAlertsQuery(!!currentUser);

  const projectBudgets = projectBudgetsQuery.data ?? [];
  const mmpBudgets = mmpBudgetsQuery.data ?? [];
  const budgetTransactions = transactionsQuery.data ?? [];
  const budgetAlerts = alertsQuery.data ?? [];

  const loading = projectBudgetsQuery.isLoading || mmpBudgetsQuery.isLoading ||
    transactionsQuery.isLoading || alertsQuery.isLoading;

  const stats: BudgetStats | null = useMemo(() => {
    const totalBudget = projectBudgets.reduce((sum, b) => sum + b.totalBudgetCents, 0);
    const totalAllocated = projectBudgets.reduce((sum, b) => sum + b.allocatedBudgetCents, 0);
    const totalSpent = projectBudgets.reduce((sum, b) => sum + b.spentBudgetCents, 0);
    const totalRemaining = projectBudgets.reduce((sum, b) => sum + b.remainingBudgetCents, 0);
    return {
      totalBudget: totalBudget / 100,
      totalAllocated: totalAllocated / 100,
      totalSpent: totalSpent / 100,
      totalRemaining: totalRemaining / 100,
      utilizationRate: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      averageCostPerSite: mmpBudgets.length > 0 ? mmpBudgets.reduce((sum, b) => sum + b.averageCostPerSiteCents, 0) / mmpBudgets.length / 100 : 0,
      projectedOverspend: 0,
      burnRate: 0,
    };
  }, [projectBudgets, mmpBudgets]);

  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const refreshProjectBudgets = async () => invalidate.invalidateProjectBudgets();
  const refreshMMPBudgets = async () => invalidate.invalidateMMPBudgets();
  const refreshBudgetTransactions = async () => invalidate.invalidateTransactions();
  const refreshBudgetAlerts = async () => invalidate.invalidateAlerts();

  const createProjectBudget = async (input: CreateProjectBudgetInput): Promise<ProjectBudget | null> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return null;
    }

    try {
      const result = await withTimeout(
        dbCreateProjectBudget(input, currentUser!.id),
        15000,
        'Create project budget timed out',
      );
      toast({ title: 'Success', description: 'Project budget created successfully' });
      await refreshProjectBudgets();
      return result;
    } catch (error: any) {
      console.error('Failed to create project budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create project budget', variant: 'destructive' });
      return null;
    }
  };

  const updateProjectBudget = async (id: string, updates: Partial<ProjectBudget>) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        dbUpdateProjectBudget(id, updates, currentUser!.id),
        15000,
        'Update project budget timed out',
      );
      toast({ title: 'Success', description: 'Project budget updated successfully' });
      await refreshProjectBudgets();
    } catch (error: any) {
      console.error('Failed to update project budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update project budget', variant: 'destructive' });
    }
  };

  const deleteProjectBudget = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(dbDeleteProjectBudget(id), 15000, 'Delete project budget timed out');
      toast({ title: 'Success', description: 'Project budget deleted successfully' });
      await refreshProjectBudgets();
    } catch (error: any) {
      console.error('Failed to delete project budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to delete project budget', variant: 'destructive' });
    }
  };

  const createMMPBudget = async (input: CreateMMPBudgetInput): Promise<MMPBudget | null> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return null;
    }

    try {
      const result = await withTimeout(
        dbCreateMMPBudget(input, currentUser!.id),
        15000,
        'Create MMP budget timed out',
      );
      toast({ title: 'Success', description: 'MMP budget created successfully' });
      await Promise.all([refreshMMPBudgets(), refreshProjectBudgets(), refreshBudgetTransactions()]);
      return result;
    } catch (error: any) {
      console.error('Failed to create MMP budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create MMP budget', variant: 'destructive' });
      return null;
    }
  };

  const updateMMPBudget = async (id: string, updates: Partial<MMPBudget>) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(dbUpdateMMPBudget(id, updates), 15000, 'Update MMP budget timed out');
      await refreshMMPBudgets();
    } catch (error: any) {
      console.error('Failed to update MMP budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update MMP budget', variant: 'destructive' });
    }
  };

  const topUpMMPBudget = async (input: TopUpBudgetInput) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      const budget = mmpBudgets.find(b => b.id === input.budgetId);
      if (!budget) throw new Error('Budget not found');

      await withTimeout(
        dbTopUpMMPBudget(input, budget.allocatedBudgetCents, currentUser!.id),
        15000,
        'Top up budget timed out',
      );
      toast({ title: 'Success', description: 'Budget topped up successfully' });
      await Promise.all([refreshMMPBudgets(), refreshBudgetTransactions()]);
    } catch (error: any) {
      console.error('Failed to top up budget:', error);
      toast({ title: 'Error', description: error.message || 'Failed to top up budget', variant: 'destructive' });
    }
  };

  const recordBudgetSpend = async (
    mmpBudgetId: string,
    amountCents: number,
    category: string,
    description?: string,
  ) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      throw new Error(session.error || 'Session expired');
    }

    try {
      const budget = mmpBudgets.find(b => b.id === mmpBudgetId);
      if (!budget) throw new Error('Budget not found');

      await withTimeout(
        dbRecordBudgetSpend(mmpBudgetId, budget, amountCents, category, description, currentUser!.id),
        15000,
        'Record budget spend timed out',
      );
      await Promise.all([refreshMMPBudgets(), refreshBudgetTransactions(), refreshBudgetAlerts()]);
    } catch (error: any) {
      console.error('Failed to record budget spend:', error);
      throw error;
    }
  };

  const getProjectBudget = (projectId: string): ProjectBudget | null =>
    projectBudgets.find(b => b.projectId === projectId) || null;

  const getMMPBudget = (mmpFileId: string): MMPBudget | null =>
    mmpBudgets.find(b => b.mmpFileId === mmpFileId) || null;

  const getProjectBudgetSummary = async (projectId: string): Promise<ProjectBudgetSummary | null> => {
    try {
      return await dbGetProjectBudgetSummary(projectId);
    } catch (error: any) {
      console.error('Failed to fetch project budget summary:', error);
      return null;
    }
  };

  const getMMPBudgetSummary = async (mmpFileId: string): Promise<MMPBudgetSummary | null> => {
    try {
      return await dbGetMMPBudgetSummary(mmpFileId);
    } catch (error: any) {
      console.error('Failed to fetch MMP budget summary:', error);
      return null;
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(dbAcknowledgeAlert(alertId, currentUser!.id), 15000, 'Acknowledge alert timed out');
      await refreshBudgetAlerts();
    } catch (error: any) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const dismissAlert = async (alertId: string) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(dbDismissAlert(alertId, currentUser!.id), 15000, 'Dismiss alert timed out');
      await refreshBudgetAlerts();
    } catch (error: any) {
      console.error('Failed to dismiss alert:', error);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('budget_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budgets' }, () => {
        invalidateRef.current.invalidateProjectBudgets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mmp_budgets' }, () => {
        invalidateRef.current.invalidateMMPBudgets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_transactions' }, () => {
        invalidateRef.current.invalidateTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_alerts' }, () => {
        invalidateRef.current.invalidateAlerts();
      });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Budget real-time subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Budget real-time subscription error - Check if replication is enabled in Supabase');
      } else if (status === 'TIMED_OUT') {
        console.warn('⏱️ Budget real-time subscription timed out');
      } else {
        console.log('Budget subscription status:', status);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const value: BudgetContextType = {
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
    createProjectBudget,
    updateProjectBudget,
    deleteProjectBudget,
    createMMPBudget,
    updateMMPBudget,
    topUpMMPBudget,
    getProjectBudget,
    getMMPBudget,
    getProjectBudgetSummary,
    getMMPBudgetSummary,
    recordBudgetSpend,
    acknowledgeAlert,
    dismissAlert,
  };

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget() {
  const context = useContext(BudgetContext);
  if (context === undefined) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
}
