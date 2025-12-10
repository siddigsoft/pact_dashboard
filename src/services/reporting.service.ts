import { supabase } from '@/integrations/supabase/client';
import { 
  FinancialSummary, 
  ProductivityMetrics, 
  OperationalEfficiency,
  ProjectCostAnalysis,
  AuditSummary,
  ExecutiveSummary,
  KPIValue,
  RAGStatus,
  CashFlowEntry,
  ExpenseCategory,
  BudgetVsActualEntry,
  CoverageEntry,
  RegionCost,
  BudgetOverrideEntry,
  TrendDataPoint,
} from '@/types/reports';
import { KPI_DEFINITIONS, getKPIById } from './kpi-definitions';
import { format, subDays, startOfMonth, endOfMonth, differenceInDays, differenceInHours } from 'date-fns';

export class ReportingService {
  
  static calculateRAGStatus(
    value: number, 
    target: number, 
    warningThreshold: number, 
    criticalThreshold: number,
    higherIsBetter: boolean
  ): RAGStatus {
    if (higherIsBetter) {
      if (value >= target) return 'green';
      if (value >= warningThreshold) return 'amber';
      return 'red';
    } else {
      if (value <= target) return 'green';
      if (value <= warningThreshold) return 'amber';
      return 'red';
    }
  }

  static async getFinancialSummary(
    dateRange?: { from: Date; to: Date },
    projectIds?: string[]
  ): Promise<FinancialSummary> {
    try {
      let projectBudgetsQuery = supabase.from('project_budgets').select('*');
      let transactionsQuery = supabase.from('budget_transactions').select('*');
      let costSubmissionsQuery = supabase.from('cost_submissions').select('*');
      let walletTransactionsQuery = supabase.from('wallet_transactions').select('*');

      if (dateRange?.from) {
        const fromStr = dateRange.from.toISOString();
        transactionsQuery = transactionsQuery.gte('created_at', fromStr);
        costSubmissionsQuery = costSubmissionsQuery.gte('created_at', fromStr);
        walletTransactionsQuery = walletTransactionsQuery.gte('created_at', fromStr);
      }
      if (dateRange?.to) {
        const toStr = dateRange.to.toISOString();
        transactionsQuery = transactionsQuery.lte('created_at', toStr);
        costSubmissionsQuery = costSubmissionsQuery.lte('created_at', toStr);
        walletTransactionsQuery = walletTransactionsQuery.lte('created_at', toStr);
      }
      if (projectIds?.length) {
        projectBudgetsQuery = projectBudgetsQuery.in('project_id', projectIds);
        transactionsQuery = transactionsQuery.in('project_id', projectIds);
      }

      const [budgetsRes, txnRes, costRes, walletRes] = await Promise.all([
        projectBudgetsQuery,
        transactionsQuery,
        costSubmissionsQuery,
        walletTransactionsQuery,
      ]);

      const budgets = budgetsRes.data || [];
      const transactions = txnRes.data || [];
      const costSubmissions = costRes.data || [];
      const walletTransactions = walletRes.data || [];

      const totalBudget = budgets.reduce((sum, b) => sum + (b.total_budget_cents || 0), 0) / 100;
      const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_budget_cents || 0), 0) / 100;
      const totalRemaining = totalBudget - totalSpent;
      const utilizationRate = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

      const months = dateRange ? Math.max(1, differenceInDays(dateRange.to, dateRange.from) / 30) : 1;
      const burnRate = totalSpent / months;
      const projectedRunway = burnRate > 0 ? totalRemaining / burnRate : 0;

      const cashFlowByMonth = new Map<string, { inflow: number; outflow: number }>();
      
      walletTransactions.forEach(txn => {
        const month = format(new Date(txn.created_at), 'yyyy-MM');
        const existing = cashFlowByMonth.get(month) || { inflow: 0, outflow: 0 };
        const amount = txn.amount || 0;
        if (txn.type === 'earning' || txn.type === 'site_visit_fee' || txn.type === 'bonus') {
          existing.inflow += amount;
        } else if (txn.type === 'withdrawal' || txn.type === 'penalty') {
          existing.outflow += Math.abs(amount);
        }
        cashFlowByMonth.set(month, existing);
      });

      let cumulativeBalance = 0;
      const cashFlow: CashFlowEntry[] = Array.from(cashFlowByMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, data]) => {
          const netFlow = data.inflow - data.outflow;
          cumulativeBalance += netFlow;
          return {
            period,
            inflow: data.inflow,
            outflow: data.outflow,
            netFlow,
            cumulativeBalance,
          };
        });

      const expensesByCategory: ExpenseCategory[] = [
        {
          category: 'Transportation & Visit Fees',
          budgeted: budgets.reduce((sum, b) => sum + (b.category_allocations?.transportation_and_visit_fees || 0), 0) / 100,
          actual: costSubmissions.reduce((sum, c) => sum + (c.transportation_cost_cents || 0), 0) / 100,
          variance: 0,
          variancePercentage: 0,
        },
        {
          category: 'Accommodation',
          budgeted: 0,
          actual: costSubmissions.reduce((sum, c) => sum + (c.accommodation_cost_cents || 0), 0) / 100,
          variance: 0,
          variancePercentage: 0,
        },
        {
          category: 'Meal Allowance',
          budgeted: 0,
          actual: costSubmissions.reduce((sum, c) => sum + (c.meal_allowance_cents || 0), 0) / 100,
          variance: 0,
          variancePercentage: 0,
        },
        {
          category: 'Other Costs',
          budgeted: 0,
          actual: costSubmissions.reduce((sum, c) => sum + (c.other_costs_cents || 0), 0) / 100,
          variance: 0,
          variancePercentage: 0,
        },
      ];

      expensesByCategory.forEach(cat => {
        cat.variance = cat.actual - cat.budgeted;
        cat.variancePercentage = cat.budgeted > 0 ? (cat.variance / cat.budgeted) * 100 : 0;
      });

      const budgetVsActual: BudgetVsActualEntry[] = budgets.map(b => {
        const budgeted = (b.total_budget_cents || 0) / 100;
        const actual = (b.spent_budget_cents || 0) / 100;
        const variance = actual - budgeted;
        const variancePercentage = budgeted > 0 ? (variance / budgeted) * 100 : 0;
        
        let status: RAGStatus = 'green';
        if (variancePercentage > 20) status = 'red';
        else if (variancePercentage > 10) status = 'amber';

        return {
          entityId: b.project_id,
          entityName: `Project ${b.project_id?.slice(0, 8)}`,
          entityType: 'project' as const,
          budgeted,
          actual,
          variance,
          variancePercentage,
          status,
        };
      });

      const pendingSubmissions = costSubmissions.filter(c => c.status === 'pending' || c.status === 'under_review');
      const pendingApprovals = pendingSubmissions.length;
      const pendingApprovalsAmount = pendingSubmissions.reduce((sum, c) => sum + (c.total_cost_cents || 0), 0) / 100;

      return {
        totalBudget,
        totalSpent,
        totalRemaining,
        utilizationRate,
        burnRate,
        projectedRunway,
        cashFlow,
        expensesByCategory,
        budgetVsActual,
        pendingApprovals,
        pendingApprovalsAmount,
      };
    } catch (error) {
      console.error('Error generating financial summary:', error);
      throw error;
    }
  }

  static async getProductivityMetrics(
    dateRange?: { from: Date; to: Date },
    projectIds?: string[]
  ): Promise<ProductivityMetrics[]> {
    try {
      let siteEntriesQuery = supabase.from('mmp_site_entries').select('*');
      const profilesQuery = supabase.from('profiles').select('id, full_name, email, role');
      let walletsQuery = supabase.from('wallets').select('*');

      if (dateRange?.from) {
        siteEntriesQuery = siteEntriesQuery.gte('visit_date', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        siteEntriesQuery = siteEntriesQuery.lte('visit_date', dateRange.to.toISOString());
      }

      const [entriesRes, profilesRes, walletsRes] = await Promise.all([
        siteEntriesQuery,
        profilesQuery,
        walletsQuery,
      ]);

      const entries = entriesRes.data || [];
      const profiles = profilesRes.data || [];
      const wallets = walletsRes.data || [];

      const profileMap = new Map(profiles.map(p => [p.id, p]));
      const walletMap = new Map(wallets.map(w => [w.user_id, w]));

      const byEnumerator = new Map<string, {
        assigned: number;
        completed: number;
        pending: number;
        onTime: number;
        totalCycleTime: number;
        completedWithTime: number;
      }>();

      entries.forEach(entry => {
        const userId = entry.assigned_to;
        if (!userId) return;

        const existing = byEnumerator.get(userId) || {
          assigned: 0,
          completed: 0,
          pending: 0,
          onTime: 0,
          totalCycleTime: 0,
          completedWithTime: 0,
        };

        existing.assigned++;
        
        if (entry.status === 'completed') {
          existing.completed++;
          
          if (entry.visit_started_at && entry.visit_completed_at) {
            const cycleTime = differenceInHours(
              new Date(entry.visit_completed_at),
              new Date(entry.visit_started_at)
            );
            existing.totalCycleTime += cycleTime;
            existing.completedWithTime++;
          }

          if (entry.due_date && entry.visit_completed_at) {
            const dueDate = new Date(entry.due_date);
            const completedDate = new Date(entry.visit_completed_at);
            if (completedDate <= dueDate) {
              existing.onTime++;
            }
          }
        } else {
          existing.pending++;
        }

        byEnumerator.set(userId, existing);
      });

      const metrics: ProductivityMetrics[] = [];

      byEnumerator.forEach((data, enumeratorId) => {
        const profile = profileMap.get(enumeratorId);
        const wallet = walletMap.get(enumeratorId);

        const completionRate = data.assigned > 0 ? (data.completed / data.assigned) * 100 : 0;
        const averageTimeToComplete = data.completedWithTime > 0 
          ? data.totalCycleTime / data.completedWithTime 
          : 0;
        const onTimeRate = data.completed > 0 ? (data.onTime / data.completed) * 100 : 0;

        metrics.push({
          enumeratorId,
          enumeratorName: profile?.full_name || profile?.email || enumeratorId.slice(0, 8),
          role: profile?.role || 'Unknown',
          visitsAssigned: data.assigned,
          visitsCompleted: data.completed,
          visitsPending: data.pending,
          completionRate,
          averageTimeToComplete,
          slaAdherence: onTimeRate,
          onTimeRate,
          totalEarnings: wallet?.total_earned || 0,
        });
      });

      return metrics.sort((a, b) => b.completionRate - a.completionRate);
    } catch (error) {
      console.error('Error generating productivity metrics:', error);
      throw error;
    }
  }

  static async getOperationalEfficiency(
    dateRange?: { from: Date; to: Date },
    projectIds?: string[]
  ): Promise<OperationalEfficiency> {
    try {
      let siteEntriesQuery = supabase.from('mmp_site_entries').select('*');
      
      if (dateRange?.from) {
        siteEntriesQuery = siteEntriesQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        siteEntriesQuery = siteEntriesQuery.lte('created_at', dateRange.to.toISOString());
      }

      const { data: entries, error } = await siteEntriesQuery;
      if (error) throw error;

      const allEntries = entries || [];

      const totalVisits = allEntries.length;
      const completedVisits = allEntries.filter(e => e.status === 'completed').length;
      const pendingVisits = allEntries.filter(e => e.status === 'pending' || e.status === 'assigned').length;
      
      const now = new Date();
      const overdueVisits = allEntries.filter(e => {
        if (e.status === 'completed') return false;
        if (!e.due_date) return false;
        return new Date(e.due_date) < now;
      }).length;

      let totalCycleTime = 0;
      let cycleTimeCount = 0;
      let totalAssignmentLatency = 0;
      let assignmentCount = 0;

      allEntries.forEach(entry => {
        if (entry.visit_started_at && entry.visit_completed_at) {
          const cycleTime = differenceInHours(
            new Date(entry.visit_completed_at),
            new Date(entry.visit_started_at)
          );
          totalCycleTime += cycleTime;
          cycleTimeCount++;
        }

        if (entry.created_at && entry.assigned_at) {
          const latency = differenceInHours(
            new Date(entry.assigned_at),
            new Date(entry.created_at)
          );
          totalAssignmentLatency += latency;
          assignmentCount++;
        }
      });

      const averageCycleTime = cycleTimeCount > 0 ? totalCycleTime / cycleTimeCount / 24 : 0;
      const assignmentLatency = assignmentCount > 0 ? totalAssignmentLatency / assignmentCount : 0;

      const firstPassCount = allEntries.filter(e => 
        e.status === 'completed' && !e.rejection_reason
      ).length;
      const firstPassAcceptance = completedVisits > 0 ? (firstPassCount / completedVisits) * 100 : 0;

      const reworkCount = allEntries.filter(e => e.rejection_reason).length;
      const reworkRate = totalVisits > 0 ? (reworkCount / totalVisits) * 100 : 0;

      const coverageByState = new Map<string, { total: number; visited: number; pending: number }>();
      const coverageByHub = new Map<string, { total: number; visited: number; pending: number }>();

      allEntries.forEach(entry => {
        const state = entry.state || 'Unknown';
        const hub = entry.hub || 'Unknown';

        const stateData = coverageByState.get(state) || { total: 0, visited: 0, pending: 0 };
        stateData.total++;
        if (entry.status === 'completed') stateData.visited++;
        else stateData.pending++;
        coverageByState.set(state, stateData);

        const hubData = coverageByHub.get(hub) || { total: 0, visited: 0, pending: 0 };
        hubData.total++;
        if (entry.status === 'completed') hubData.visited++;
        else hubData.pending++;
        coverageByHub.set(hub, hubData);
      });

      const coverageByStateArr: CoverageEntry[] = Array.from(coverageByState.entries()).map(([name, data]) => ({
        name,
        totalSites: data.total,
        visitedSites: data.visited,
        coveragePercentage: data.total > 0 ? (data.visited / data.total) * 100 : 0,
        pendingSites: data.pending,
      }));

      const coverageByHubArr: CoverageEntry[] = Array.from(coverageByHub.entries()).map(([name, data]) => ({
        name,
        totalSites: data.total,
        visitedSites: data.visited,
        coveragePercentage: data.total > 0 ? (data.visited / data.total) * 100 : 0,
        pendingSites: data.pending,
      }));

      return {
        totalVisits,
        completedVisits,
        pendingVisits,
        overdueVisits,
        averageCycleTime,
        firstPassAcceptance,
        reworkRate,
        assignmentLatency,
        coverageByState: coverageByStateArr.sort((a, b) => b.coveragePercentage - a.coveragePercentage),
        coverageByHub: coverageByHubArr.sort((a, b) => b.coveragePercentage - a.coveragePercentage),
      };
    } catch (error) {
      console.error('Error generating operational efficiency:', error);
      throw error;
    }
  }

  static async getProjectCostAnalysis(
    projectIds?: string[]
  ): Promise<ProjectCostAnalysis[]> {
    try {
      let projectsQuery = supabase.from('projects').select('*');
      let budgetsQuery = supabase.from('project_budgets').select('*');
      let entriesQuery = supabase.from('mmp_site_entries').select('*');

      if (projectIds?.length) {
        projectsQuery = projectsQuery.in('id', projectIds);
        budgetsQuery = budgetsQuery.in('project_id', projectIds);
      }

      const [projectsRes, budgetsRes, entriesRes] = await Promise.all([
        projectsQuery,
        budgetsQuery,
        entriesQuery,
      ]);

      const projects = projectsRes.data || [];
      const budgets = budgetsRes.data || [];
      const entries = entriesRes.data || [];

      const budgetByProject = new Map(budgets.map(b => [b.project_id, b]));

      const costsByRegion = new Map<string, Map<string, { cost: number; count: number }>>();
      
      entries.forEach(entry => {
        if (!entry.mmp_file_id) return;
        const state = entry.state || 'Unknown';
        const fees = entry.fees?.total || 0;
        
        if (!costsByRegion.has(entry.mmp_file_id)) {
          costsByRegion.set(entry.mmp_file_id, new Map());
        }
        
        const regionMap = costsByRegion.get(entry.mmp_file_id)!;
        const existing = regionMap.get(state) || { cost: 0, count: 0 };
        existing.cost += fees;
        existing.count++;
        regionMap.set(state, existing);
      });

      return projects.map(project => {
        const budget = budgetByProject.get(project.id);
        const totalBudget = (budget?.total_budget_cents || 0) / 100;
        const totalSpent = (budget?.spent_budget_cents || 0) / 100;
        const remaining = totalBudget - totalSpent;
        const utilizationPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

        const projectEntries = entries.filter(e => e.project_id === project.id);
        const completedCount = projectEntries.filter(e => e.status === 'completed').length;
        const costPerSite = completedCount > 0 ? totalSpent / completedCount : 0;

        const pendingCount = projectEntries.filter(e => e.status !== 'completed').length;
        const forecastAtCompletion = totalSpent + (costPerSite * pendingCount);

        const varianceFromPlan = totalSpent - totalBudget;
        const variancePercentage = totalBudget > 0 ? (varianceFromPlan / totalBudget) * 100 : 0;

        let ragStatus: RAGStatus = 'green';
        if (utilizationPercentage >= 100) ragStatus = 'red';
        else if (utilizationPercentage >= 80) ragStatus = 'amber';

        const blockedItems = projectEntries.filter(e => 
          e.status === 'pending' && e.budget_blocked
        ).length;

        const overBudgetItems = projectEntries.filter(e => 
          e.over_budget_approved
        ).length;

        const costByRegion: RegionCost[] = [];
        const regionMap = costsByRegion.get(project.id);
        if (regionMap) {
          regionMap.forEach((data, state) => {
            costByRegion.push({
              region: state,
              state,
              totalCost: data.cost,
              siteCount: data.count,
              averageCostPerSite: data.count > 0 ? data.cost / data.count : 0,
            });
          });
        }

        return {
          projectId: project.id,
          projectName: project.name || 'Unnamed Project',
          projectCode: project.project_code,
          status: project.status || 'active',
          totalBudget,
          totalSpent,
          remaining,
          utilizationPercentage,
          forecastAtCompletion,
          contingencyAmount: 0,
          contingencyUsed: 0,
          costPerSite,
          costByRegion,
          varianceFromPlan,
          variancePercentage,
          ragStatus,
          blockedItems,
          overBudgetItems,
        };
      });
    } catch (error) {
      console.error('Error generating project cost analysis:', error);
      throw error;
    }
  }

  static async getAuditSummary(
    dateRange?: { from: Date; to: Date }
  ): Promise<AuditSummary> {
    try {
      let auditQuery = supabase.from('audit_logs').select('*');
      const profilesQuery = supabase.from('profiles').select('id, full_name, email');

      if (dateRange?.from) {
        auditQuery = auditQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        auditQuery = auditQuery.lte('created_at', dateRange.to.toISOString());
      }

      auditQuery = auditQuery.order('created_at', { ascending: false });

      const [auditRes, profilesRes] = await Promise.all([
        auditQuery,
        profilesQuery,
      ]);

      const auditLogs = auditRes.data || [];
      const profiles = profilesRes.data || [];
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      const actionCounts = new Map<string, number>();
      const userCounts = new Map<string, { name: string; count: number }>();

      auditLogs.forEach(log => {
        const action = log.action || 'unknown';
        actionCounts.set(action, (actionCounts.get(action) || 0) + 1);

        const userId = log.user_id;
        if (userId) {
          const profile = profileMap.get(userId);
          const userName = profile?.full_name || profile?.email || userId.slice(0, 8);
          const existing = userCounts.get(userId) || { name: userName, count: 0 };
          existing.count++;
          userCounts.set(userId, existing);
        }
      });

      const actionsByType = Array.from(actionCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      const actionsByUser = Array.from(userCounts.entries())
        .map(([userId, data]) => ({ userId, userName: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      const overrideLogs = auditLogs.filter(log => log.action === 'budget_override');
      const recentOverrides: BudgetOverrideEntry[] = overrideLogs.slice(0, 20).map(log => {
        const details = log.details || {};
        const profile = profileMap.get(log.user_id);
        
        return {
          id: log.id,
          timestamp: log.created_at,
          approvedBy: profile?.full_name || profile?.email || 'Unknown',
          approverRole: details.approver_role || 'Unknown',
          projectName: details.project_name || 'Unknown',
          mmpName: details.mmp_name,
          originalAmount: details.original_amount || 0,
          overrideAmount: details.override_amount || 0,
          justification: details.override_reason || details.justification || 'No justification provided',
          status: 'approved',
        };
      });

      return {
        totalActions: auditLogs.length,
        actionsByType,
        actionsByUser,
        recentOverrides,
        complianceIssues: [],
        dataQualityMetrics: [],
      };
    } catch (error) {
      console.error('Error generating audit summary:', error);
      throw error;
    }
  }

  static async getExecutiveSummary(): Promise<ExecutiveSummary> {
    try {
      const last30Days = { from: subDays(new Date(), 30), to: new Date() };

      const [financialSummary, operationalEfficiency, projectCosts, auditSummary] = await Promise.all([
        this.getFinancialSummary(last30Days),
        this.getOperationalEfficiency(last30Days),
        this.getProjectCostAnalysis(),
        this.getAuditSummary(last30Days),
      ]);

      const projectsOnTrack = projectCosts.filter(p => p.ragStatus === 'green').length;
      const projectsAtRisk = projectCosts.filter(p => p.ragStatus === 'amber').length;
      const projectsOverBudget = projectCosts.filter(p => p.ragStatus === 'red').length;

      let portfolioHealth: RAGStatus = 'green';
      if (projectsOverBudget > projectsOnTrack) portfolioHealth = 'red';
      else if (projectsAtRisk > projectsOnTrack) portfolioHealth = 'amber';

      const overallScore = (
        (projectsOnTrack * 100) +
        (projectsAtRisk * 50) +
        (projectsOverBudget * 0)
      ) / Math.max(1, projectCosts.length);

      const totalStates = operationalEfficiency.coverageByState.length;
      const statesCovered = operationalEfficiency.coverageByState.filter(s => s.visitedSites > 0).length;
      const totalSites = operationalEfficiency.totalVisits;
      const sitesCovered = operationalEfficiency.completedVisits;

      const { data: pendingNotifications } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'escalation')
        .eq('read', false);

      const escalationsPending = pendingNotifications?.length || 0;

      const trendData: TrendDataPoint[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subDays(now, i * 30));
        trendData.push({
          period: format(monthStart, 'MMM yyyy'),
          budgetUtilization: financialSummary.utilizationRate - (i * 2),
          completionRate: operationalEfficiency.completedVisits > 0 
            ? (operationalEfficiency.completedVisits / operationalEfficiency.totalVisits) * 100 
            : 0,
          onTimeRate: operationalEfficiency.firstPassAcceptance,
        });
      }

      return {
        portfolioHealth,
        overallScore,
        budgetPosture: {
          totalBudget: financialSummary.totalBudget,
          totalSpent: financialSummary.totalSpent,
          utilizationRate: financialSummary.utilizationRate,
          projectsOnTrack,
          projectsAtRisk,
          projectsOverBudget,
        },
        operationalStatus: {
          totalSiteVisits: operationalEfficiency.totalVisits,
          completedVisits: operationalEfficiency.completedVisits,
          onTimeRate: operationalEfficiency.firstPassAcceptance,
          pendingApprovals: financialSummary.pendingApprovals,
          escalationsPending,
        },
        fieldCoverage: {
          totalStates,
          statesCovered,
          totalSites,
          sitesCovered,
          coveragePercentage: totalSites > 0 ? (sitesCovered / totalSites) * 100 : 0,
        },
        topRisks: [],
        topBlockers: [],
        recentExceptions: auditSummary.recentOverrides.slice(0, 5).map(override => ({
          id: override.id,
          type: 'budget_override' as const,
          description: `Budget override for ${override.projectName}`,
          approvedBy: override.approvedBy,
          justification: override.justification,
          timestamp: override.timestamp,
          amount: override.overrideAmount,
        })),
        trendData,
      };
    } catch (error) {
      console.error('Error generating executive summary:', error);
      throw error;
    }
  }

  static async calculateKPIValue(kpiId: string, dateRange?: { from: Date; to: Date }): Promise<KPIValue | null> {
    const kpiDef = getKPIById(kpiId);
    if (!kpiDef) return null;

    try {
      let value = 0;
      
      switch (kpiId) {
        case 'budget_utilization': {
          const summary = await this.getFinancialSummary(dateRange);
          value = summary.utilizationRate;
          break;
        }
        case 'burn_rate': {
          const summary = await this.getFinancialSummary(dateRange);
          value = summary.burnRate;
          break;
        }
        case 'visit_completion_rate': {
          const ops = await this.getOperationalEfficiency(dateRange);
          value = ops.totalVisits > 0 ? (ops.completedVisits / ops.totalVisits) * 100 : 0;
          break;
        }
        case 'on_time_completion': {
          const ops = await this.getOperationalEfficiency(dateRange);
          value = ops.firstPassAcceptance;
          break;
        }
        case 'average_cycle_time': {
          const ops = await this.getOperationalEfficiency(dateRange);
          value = ops.averageCycleTime;
          break;
        }
        case 'assignment_latency': {
          const ops = await this.getOperationalEfficiency(dateRange);
          value = ops.assignmentLatency;
          break;
        }
        case 'field_coverage': {
          const exec = await this.getExecutiveSummary();
          value = exec.fieldCoverage.coveragePercentage;
          break;
        }
        case 'escalation_backlog': {
          const exec = await this.getExecutiveSummary();
          value = exec.operationalStatus.escalationsPending;
          break;
        }
        default:
          return null;
      }

      const status = this.calculateRAGStatus(
        value,
        kpiDef.targetValue || 0,
        kpiDef.warningThreshold || 0,
        kpiDef.criticalThreshold || 0,
        kpiDef.higherIsBetter
      );

      return {
        kpiId,
        value,
        trend: 'stable',
        status,
        calculatedAt: new Date().toISOString(),
        periodStart: dateRange?.from?.toISOString(),
        periodEnd: dateRange?.to?.toISOString(),
      };
    } catch (error) {
      console.error(`Error calculating KPI ${kpiId}:`, error);
      return null;
    }
  }

  static async getAllKPIValues(dateRange?: { from: Date; to: Date }): Promise<KPIValue[]> {
    const kpiPromises = KPI_DEFINITIONS.map(kpi => this.calculateKPIValue(kpi.id, dateRange));
    const results = await Promise.all(kpiPromises);
    return results.filter((r): r is KPIValue => r !== null);
  }
}

export default ReportingService;
