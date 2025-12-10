import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
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

function transformProjectBudgetFromDB(data: any): ProjectBudget {
  return {
    id: data.id,
    projectId: data.project_id,
    totalBudgetCents: parseInt(data.total_budget_cents || 0),
    allocatedBudgetCents: parseInt(data.allocated_budget_cents || 0),
    spentBudgetCents: parseInt(data.spent_budget_cents || 0),
    remainingBudgetCents: parseInt(data.remaining_budget_cents || 0),
    budgetPeriod: data.budget_period,
    periodStartDate: data.period_start_date,
    periodEndDate: data.period_end_date,
    categoryAllocations: data.category_allocations || {
      site_visits: 0,
      transportation: 0,
      accommodation: 0,
      meals: 0,
      equipment: 0,
      other: 0,
    },
    status: data.status,
    approvedBy: data.approved_by,
    approvedAt: data.approved_at,
    fiscalYear: data.fiscal_year,
    budgetNotes: data.budget_notes,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformMMPBudgetFromDB(data: any): MMPBudget {
  return {
    id: data.id,
    mmpFileId: data.mmp_file_id,
    projectBudgetId: data.project_budget_id,
    allocatedBudgetCents: parseInt(data.allocated_budget_cents || 0),
    spentBudgetCents: parseInt(data.spent_budget_cents || 0),
    remainingBudgetCents: parseInt(data.remaining_budget_cents || 0),
    totalSites: data.total_sites || 0,
    budgetedSites: data.budgeted_sites || 0,
    completedSites: data.completed_sites || 0,
    averageCostPerSiteCents: parseInt(data.average_cost_per_site_cents || 0),
    categoryBreakdown: data.category_breakdown || {
      site_visit_fees: 0,
      transportation: 0,
      accommodation: 0,
      meals: 0,
      other: 0,
    },
    sourceType: data.source_type,
    parentBudgetId: data.parent_budget_id,
    status: data.status,
    budgetNotes: data.budget_notes,
    allocatedBy: data.allocated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformBudgetTransactionFromDB(data: any): BudgetTransaction {
  return {
    id: data.id,
    projectBudgetId: data.project_budget_id,
    mmpBudgetId: data.mmp_budget_id,
    siteVisitId: data.site_visit_id,
    walletTransactionId: data.wallet_transaction_id,
    transactionType: data.transaction_type,
    amountCents: parseInt(data.amount_cents),
    currency: data.currency,
    category: data.category,
    balanceBeforeCents: data.balance_before_cents ? parseInt(data.balance_before_cents) : undefined,
    balanceAfterCents: data.balance_after_cents ? parseInt(data.balance_after_cents) : undefined,
    description: data.description,
    metadata: data.metadata,
    referenceNumber: data.reference_number,
    requiresApproval: data.requires_approval,
    approvedBy: data.approved_by,
    approvedAt: data.approved_at,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

function transformBudgetAlertFromDB(data: any): BudgetAlert {
  return {
    id: data.id,
    projectBudgetId: data.project_budget_id,
    mmpBudgetId: data.mmp_budget_id,
    alertType: data.alert_type,
    severity: data.severity,
    thresholdPercentage: data.threshold_percentage,
    title: data.title,
    message: data.message,
    status: data.status,
    acknowledgedBy: data.acknowledged_by,
    acknowledgedAt: data.acknowledged_at,
    metadata: data.metadata,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at,
  };
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [projectBudgets, setProjectBudgets] = useState<ProjectBudget[]>([]);
  const [mmpBudgets, setMMPBudgets] = useState<MMPBudget[]>([]);
  const [budgetTransactions, setBudgetTransactions] = useState<BudgetTransaction[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [stats, setStats] = useState<BudgetStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProjectBudgets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_budgets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjectBudgets((data || []).map(transformProjectBudgetFromDB));
    } catch (error: any) {
      console.error('Failed to fetch project budgets:', error);
    }
  }, []);

  const refreshMMPBudgets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('mmp_budgets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMMPBudgets((data || []).map(transformMMPBudgetFromDB));
    } catch (error: any) {
      console.error('Failed to fetch MMP budgets:', error);
    }
  }, []);

  const refreshBudgetTransactions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('budget_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setBudgetTransactions((data || []).map(transformBudgetTransactionFromDB));
    } catch (error: any) {
      console.error('Failed to fetch budget transactions:', error);
    }
  }, []);

  const refreshBudgetAlerts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('budget_alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBudgetAlerts((data || []).map(transformBudgetAlertFromDB));
    } catch (error: any) {
      console.error('Failed to fetch budget alerts:', error);
    }
  }, []);

  const createProjectBudget = async (input: CreateProjectBudgetInput): Promise<ProjectBudget | null> => {
    try {
      const { data, error } = await supabase
        .from('project_budgets')
        .insert({
          project_id: input.projectId,
          total_budget_cents: input.totalBudgetCents,
          budget_period: input.budgetPeriod,
          period_start_date: input.periodStartDate,
          period_end_date: input.periodEndDate,
          category_allocations: input.categoryAllocations,
          fiscal_year: input.fiscalYear,
          budget_notes: input.budgetNotes,
          created_by: currentUser?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Project budget created successfully',
      });

      await refreshProjectBudgets();
      return transformProjectBudgetFromDB(data);
    } catch (error: any) {
      console.error('Failed to create project budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project budget',
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateProjectBudget = async (id: string, updates: Partial<ProjectBudget>) => {
    try {
      const dbUpdates: any = {
        updated_by: currentUser?.id,
        updated_at: new Date().toISOString(),
      };

      if (updates.totalBudgetCents !== undefined) dbUpdates.total_budget_cents = updates.totalBudgetCents;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.budgetNotes) dbUpdates.budget_notes = updates.budgetNotes;
      if (updates.categoryAllocations) dbUpdates.category_allocations = updates.categoryAllocations;

      const { error } = await supabase
        .from('project_budgets')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Project budget updated successfully',
      });

      await refreshProjectBudgets();
    } catch (error: any) {
      console.error('Failed to update project budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project budget',
        variant: 'destructive',
      });
    }
  };

  const deleteProjectBudget = async (id: string) => {
    try {
      const { error } = await supabase
        .from('project_budgets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Project budget deleted successfully',
      });

      await refreshProjectBudgets();
    } catch (error: any) {
      console.error('Failed to delete project budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete project budget',
        variant: 'destructive',
      });
    }
  };

  const createMMPBudget = async (input: CreateMMPBudgetInput): Promise<MMPBudget | null> => {
    try {
      const { data, error } = await supabase
        .from('mmp_budgets')
        .insert({
          mmp_file_id: input.mmpFileId,
          project_budget_id: input.projectBudgetId,
          allocated_budget_cents: input.allocatedBudgetCents,
          total_sites: input.totalSites,
          budgeted_sites: input.totalSites,
          category_breakdown: input.categoryBreakdown,
          source_type: input.sourceType || 'project_allocation',
          budget_notes: input.budgetNotes,
          allocated_by: currentUser?.id,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      if (input.projectBudgetId) {
        const { error: txnError } = await supabase
          .from('budget_transactions')
          .insert({
            project_budget_id: input.projectBudgetId,
            mmp_budget_id: data.id,
            transaction_type: 'allocation',
            amount_cents: input.allocatedBudgetCents,
            currency: 'SDG',
            description: `Budget allocated to MMP`,
            created_by: currentUser?.id,
          });

        if (txnError) console.error('Failed to create allocation transaction:', txnError);

        const { data: projectBudget, error: fetchError } = await supabase
          .from('project_budgets')
          .select('allocated_budget_cents')
          .eq('id', input.projectBudgetId)
          .single();

        if (!fetchError && projectBudget) {
          const { error: updateError } = await supabase
            .from('project_budgets')
            .update({
              allocated_budget_cents: parseInt(projectBudget.allocated_budget_cents) + input.allocatedBudgetCents,
            })
            .eq('id', input.projectBudgetId);

          if (updateError) console.error('Failed to update project budget:', updateError);
        }
      }

      toast({
        title: 'Success',
        description: 'MMP budget created successfully',
      });

      await Promise.all([refreshMMPBudgets(), refreshProjectBudgets(), refreshBudgetTransactions()]);
      return transformMMPBudgetFromDB(data);
    } catch (error: any) {
      console.error('Failed to create MMP budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create MMP budget',
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateMMPBudget = async (id: string, updates: Partial<MMPBudget>) => {
    try {
      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.allocatedBudgetCents !== undefined) dbUpdates.allocated_budget_cents = updates.allocatedBudgetCents;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.budgetNotes) dbUpdates.budget_notes = updates.budgetNotes;
      if (updates.completedSites !== undefined) dbUpdates.completed_sites = updates.completedSites;

      const { error } = await supabase
        .from('mmp_budgets')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      await refreshMMPBudgets();
    } catch (error: any) {
      console.error('Failed to update MMP budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update MMP budget',
        variant: 'destructive',
      });
    }
  };

  const topUpMMPBudget = async (input: TopUpBudgetInput) => {
    try {
      const budget = mmpBudgets.find(b => b.id === input.budgetId);
      if (!budget) throw new Error('Budget not found');

      const { error: updateError } = await supabase
        .from('mmp_budgets')
        .update({
          allocated_budget_cents: budget.allocatedBudgetCents + input.amountCents,
        })
        .eq('id', input.budgetId);

      if (updateError) throw updateError;

      const { error: txnError } = await supabase
        .from('budget_transactions')
        .insert({
          mmp_budget_id: input.budgetId,
          transaction_type: 'top_up',
          amount_cents: input.amountCents,
          currency: 'SDG',
          category: input.category,
          description: input.reason,
          created_by: currentUser?.id,
        });

      if (txnError) throw txnError;

      toast({
        title: 'Success',
        description: 'Budget topped up successfully',
      });

      await Promise.all([refreshMMPBudgets(), refreshBudgetTransactions()]);
    } catch (error: any) {
      console.error('Failed to top up budget:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to top up budget',
        variant: 'destructive',
      });
    }
  };

  const recordBudgetSpend = async (
    mmpBudgetId: string,
    amountCents: number,
    category: string,
    description?: string
  ) => {
    try {
      const budget = mmpBudgets.find(b => b.id === mmpBudgetId);
      if (!budget) throw new Error('Budget not found');

      const { error: updateError } = await supabase
        .from('mmp_budgets')
        .update({
          spent_budget_cents: budget.spentBudgetCents + amountCents,
        })
        .eq('id', mmpBudgetId);

      if (updateError) throw updateError;

      const { error: txnError } = await supabase
        .from('budget_transactions')
        .insert({
          mmp_budget_id: mmpBudgetId,
          transaction_type: 'spend',
          amount_cents: amountCents,
          currency: 'SDG',
          category: category,
          description: description,
          balance_before_cents: budget.remainingBudgetCents,
          balance_after_cents: budget.remainingBudgetCents - amountCents,
          created_by: currentUser?.id,
        });

      if (txnError) throw txnError;

      await Promise.all([refreshMMPBudgets(), refreshBudgetTransactions(), refreshBudgetAlerts()]);
    } catch (error: any) {
      console.error('Failed to record budget spend:', error);
      throw error;
    }
  };

  const getProjectBudget = (projectId: string): ProjectBudget | null => {
    return projectBudgets.find(b => b.projectId === projectId) || null;
  };

  const getMMPBudget = (mmpFileId: string): MMPBudget | null => {
    return mmpBudgets.find(b => b.mmpFileId === mmpFileId) || null;
  };

  const getProjectBudgetSummary = async (projectId: string): Promise<ProjectBudgetSummary | null> => {
    try {
      const { data, error } = await supabase
        .from('project_budget_summary')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Failed to fetch project budget summary:', error);
      return null;
    }
  };

  const getMMPBudgetSummary = async (mmpFileId: string): Promise<MMPBudgetSummary | null> => {
    try {
      const { data, error } = await supabase
        .from('mmp_budget_summary')
        .select('*')
        .eq('mmp_file_id', mmpFileId)
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Failed to fetch MMP budget summary:', error);
      return null;
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('budget_alerts')
        .update({
          status: 'acknowledged',
          acknowledged_by: currentUser?.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) throw error;
      await refreshBudgetAlerts();
    } catch (error: any) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('budget_alerts')
        .update({
          status: 'dismissed',
          acknowledged_by: currentUser?.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) throw error;
      await refreshBudgetAlerts();
    } catch (error: any) {
      console.error('Failed to dismiss alert:', error);
    }
  };

  useEffect(() => {
    if (currentUser) {
      Promise.all([
        refreshProjectBudgets(),
        refreshMMPBudgets(),
        refreshBudgetTransactions(),
        refreshBudgetAlerts(),
      ]).finally(() => setLoading(false));
    }
  }, [currentUser, refreshProjectBudgets, refreshMMPBudgets, refreshBudgetTransactions, refreshBudgetAlerts]);

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('budget_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budgets' }, () => {
        refreshProjectBudgets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mmp_budgets' }, () => {
        refreshMMPBudgets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_transactions' }, () => {
        refreshBudgetTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_alerts' }, () => {
        refreshBudgetAlerts();
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
  }, [currentUser, refreshProjectBudgets, refreshMMPBudgets, refreshBudgetTransactions, refreshBudgetAlerts]);

  useEffect(() => {
    const totalBudget = projectBudgets.reduce((sum, b) => sum + b.totalBudgetCents, 0);
    const totalAllocated = projectBudgets.reduce((sum, b) => sum + b.allocatedBudgetCents, 0);
    const totalSpent = projectBudgets.reduce((sum, b) => sum + b.spentBudgetCents, 0);
    const totalRemaining = projectBudgets.reduce((sum, b) => sum + b.remainingBudgetCents, 0);

    setStats({
      totalBudget: totalBudget / 100,
      totalAllocated: totalAllocated / 100,
      totalSpent: totalSpent / 100,
      totalRemaining: totalRemaining / 100,
      utilizationRate: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      averageCostPerSite: mmpBudgets.length > 0 ? mmpBudgets.reduce((sum, b) => sum + b.averageCostPerSiteCents, 0) / mmpBudgets.length / 100 : 0,
      projectedOverspend: 0,
      burnRate: 0,
    });
  }, [projectBudgets, mmpBudgets]);

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
