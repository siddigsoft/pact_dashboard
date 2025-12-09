import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from './NotificationTriggerService';
import type { BudgetAlert } from '@/types/budget';
import type { AppRole } from '@/types/roles';

const BUDGET_NOTIFICATION_ROLES: AppRole[] = [
  'SuperAdmin',
  'Admin',
  'SeniorOperationsLead',
  'ProjectManager',
  'FinancialAdmin',
  'Field Operation Manager (FOM)',
];

export interface BudgetNotificationOptions {
  projectId?: string;
  projectName: string;
  mmpId?: string;
  mmpName?: string;
  utilizationPercentage: number;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  triggeredBy?: string;
}

export interface EscalationRequest {
  requestId: string;
  requestType: 'expense_approval' | 'budget_override' | 'cost_submission';
  amount: number;
  shortfall: number;
  projectId: string;
  projectName: string;
  mmpId?: string;
  requestedBy: string;
  requestedByName: string;
  reason: string;
}

async function getSeniorOperationsLeadUsers(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'SeniorOperationsLead');

    if (error) {
      console.error('Error fetching Senior Operations Lead users:', error);
      return [];
    }

    return (data || []).map(user => user.id);
  } catch (error) {
    console.error('Error fetching Senior Operations Lead users:', error);
    return [];
  }
}

async function getFinanceApprovers(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['FinancialAdmin', 'Admin', 'SuperAdmin', 'SeniorOperationsLead']);

    if (error) {
      console.error('Error fetching finance approvers:', error);
      return [];
    }

    return (data || []).map(user => user.id);
  } catch (error) {
    console.error('Error fetching finance approvers:', error);
    return [];
  }
}

async function getProjectManagers(projectId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('project_team_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('role', 'ProjectManager');

    if (error) {
      console.error('Error fetching project managers:', error);
      return [];
    }

    return (data || []).map(member => member.user_id);
  } catch (error) {
    console.error('Error fetching project managers:', error);
    return [];
  }
}

export const BudgetNotificationService = {
  async send80PercentThresholdAlert(options: BudgetNotificationOptions): Promise<number> {
    const { projectId, projectName, mmpName, utilizationPercentage, budgetAmount, spentAmount, remainingAmount } = options;

    const recipients = new Set<string>();
    
    if (projectId) {
      const projectManagers = await getProjectManagers(projectId);
      projectManagers.forEach(id => recipients.add(id));
    }

    const seniorLeads = await getSeniorOperationsLeadUsers();
    seniorLeads.forEach(id => recipients.add(id));

    const financeApprovers = await getFinanceApprovers();
    financeApprovers.forEach(id => recipients.add(id));

    const recipientArray = Array.from(recipients);
    
    if (recipientArray.length === 0) {
      console.log('No recipients found for 80% threshold alert');
      return 0;
    }

    const contextName = mmpName ? `MMP "${mmpName}"` : `Project "${projectName}"`;
    const message = `${contextName} has reached ${utilizationPercentage.toFixed(1)}% budget utilization. ` +
      `Spent: ${spentAmount.toLocaleString()} SDG / Budget: ${budgetAmount.toLocaleString()} SDG. ` +
      `Remaining: ${remainingAmount.toLocaleString()} SDG. Review and plan accordingly.`;

    return await NotificationTriggerService.sendBulk(recipientArray, {
      title: 'Budget 80% Threshold Alert',
      message,
      type: 'warning',
      category: 'financial',
      priority: 'high',
      link: '/budget',
    });
  },

  async sendBudgetExceededAlert(options: BudgetNotificationOptions): Promise<number> {
    const { projectId, projectName, mmpName, utilizationPercentage, budgetAmount, spentAmount } = options;

    const recipients = new Set<string>();
    
    if (projectId) {
      const projectManagers = await getProjectManagers(projectId);
      projectManagers.forEach(id => recipients.add(id));
    }

    const seniorLeads = await getSeniorOperationsLeadUsers();
    seniorLeads.forEach(id => recipients.add(id));

    const financeApprovers = await getFinanceApprovers();
    financeApprovers.forEach(id => recipients.add(id));

    const recipientArray = Array.from(recipients);
    
    if (recipientArray.length === 0) {
      return 0;
    }

    const contextName = mmpName ? `MMP "${mmpName}"` : `Project "${projectName}"`;
    const overspend = spentAmount - budgetAmount;

    return await NotificationTriggerService.sendBulk(recipientArray, {
      title: 'CRITICAL: Budget Exceeded',
      message: `${contextName} has exceeded its budget by ${overspend.toLocaleString()} SDG (${utilizationPercentage.toFixed(1)}% utilization). Immediate action required.`,
      type: 'error',
      category: 'financial',
      priority: 'urgent',
      link: '/budget',
    });
  },

  async sendEscalationToSeniorOps(request: EscalationRequest): Promise<number> {
    const seniorLeads = await getSeniorOperationsLeadUsers();
    
    if (seniorLeads.length === 0) {
      console.warn('No Senior Operations Lead users found for escalation');
      const admins = await getFinanceApprovers();
      if (admins.length === 0) return 0;
      
      return await NotificationTriggerService.sendBulk(admins, {
        title: 'Escalated: Over-Budget Approval Required',
        message: `An expense of ${request.amount.toLocaleString()} SDG for "${request.projectName}" requires approval. ` +
          `Budget shortfall: ${request.shortfall.toLocaleString()} SDG. Requested by: ${request.requestedByName}. ` +
          `Reason: ${request.reason}`,
        type: 'warning',
        category: 'approvals',
        priority: 'urgent',
        link: '/finance-approval',
      });
    }

    return await NotificationTriggerService.sendBulk(seniorLeads, {
      title: 'Escalated: Over-Budget Approval Required',
      message: `An expense of ${request.amount.toLocaleString()} SDG for "${request.projectName}" exceeds available budget. ` +
        `Shortfall: ${request.shortfall.toLocaleString()} SDG. Submitted by: ${request.requestedByName}. ` +
        `Reason: ${request.reason}. Your override approval is required.`,
      type: 'warning',
      category: 'approvals',
      priority: 'urgent',
      link: '/finance-approval',
    });
  },

  async sendApprovalResult(
    userId: string,
    approved: boolean,
    amount: number,
    projectName: string,
    approverName?: string
  ): Promise<boolean> {
    return await NotificationTriggerService.send({
      userId,
      title: approved ? 'Over-Budget Request Approved' : 'Over-Budget Request Rejected',
      message: approved
        ? `Your expense request of ${amount.toLocaleString()} SDG for "${projectName}" has been approved by ${approverName || 'Senior Operations Lead'}.`
        : `Your expense request of ${amount.toLocaleString()} SDG for "${projectName}" has been rejected. Please contact your supervisor for details.`,
      type: approved ? 'success' : 'error',
      category: 'financial',
      priority: 'high',
      link: '/cost-submission',
    });
  },

  async checkAndTriggerThresholdAlerts(
    budgetId: string,
    budgetType: 'project' | 'mmp'
  ): Promise<void> {
    try {
      const tableName = budgetType === 'project' ? 'project_budgets' : 'mmp_budgets';
      const { data: budget, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', budgetId)
        .single();

      if (error || !budget) {
        console.error('Error fetching budget for threshold check:', error);
        return;
      }

      const allocated = parseInt(budget.total_budget_cents || budget.allocated_budget_cents || '0');
      const spent = parseInt(budget.spent_budget_cents || '0');
      
      if (allocated === 0) return;

      const utilization = (spent / allocated) * 100;

      const { data: existingAlerts } = await supabase
        .from('budget_alerts')
        .select('alert_type, threshold_percentage')
        .eq(budgetType === 'project' ? 'project_budget_id' : 'mmp_budget_id', budgetId)
        .in('status', ['active', 'acknowledged']);

      const alertedThresholds = new Set(
        (existingAlerts || []).map(a => a.threshold_percentage)
      );

      if (utilization >= 100 && !alertedThresholds.has(100)) {
        await this.createAndSendAlert(budgetId, budgetType, 'budget_exceeded', 'critical', 100, budget);
      } else if (utilization >= 80 && utilization < 100 && !alertedThresholds.has(80)) {
        await this.createAndSendAlert(budgetId, budgetType, 'threshold_reached', 'warning', 80, budget);
      } else if (utilization >= 70 && utilization < 80 && !alertedThresholds.has(70)) {
        await this.createAndSendAlert(budgetId, budgetType, 'low_budget', 'info', 70, budget);
      }
    } catch (error) {
      console.error('Error checking threshold alerts:', error);
    }
  },

  async createAndSendAlert(
    budgetId: string,
    budgetType: 'project' | 'mmp',
    alertType: BudgetAlert['alertType'],
    severity: BudgetAlert['severity'],
    thresholdPercentage: number,
    budget: Record<string, unknown>
  ): Promise<void> {
    const allocated = parseInt((budget.total_budget_cents || budget.allocated_budget_cents || '0') as string);
    const spent = parseInt((budget.spent_budget_cents || '0') as string);
    const remaining = allocated - spent;
    const utilization = allocated > 0 ? (spent / allocated) * 100 : 0;

    const titleMap: Record<BudgetAlert['alertType'], string> = {
      budget_exceeded: 'Budget Exceeded',
      threshold_reached: '80% Budget Threshold Reached',
      low_budget: 'Budget Running Low',
      overspending: 'Overspending Detected',
    };

    const { error: insertError } = await supabase
      .from('budget_alerts')
      .insert({
        [budgetType === 'project' ? 'project_budget_id' : 'mmp_budget_id']: budgetId,
        alert_type: alertType,
        severity,
        threshold_percentage: thresholdPercentage,
        title: titleMap[alertType],
        message: `Budget at ${utilization.toFixed(1)}% utilization. Remaining: ${(remaining / 100).toLocaleString()} SDG`,
        status: 'active',
      });

    if (insertError) {
      console.error('Error creating budget alert:', insertError);
      return;
    }

    const projectId = budget.project_id as string | undefined;
    let projectName = 'Unknown Project';
    
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();
      
      if (project) {
        projectName = project.name;
      }
    }

    const options: BudgetNotificationOptions = {
      projectId,
      projectName,
      mmpName: budgetType === 'mmp' ? (budget.mmp_file_id as string) : undefined,
      utilizationPercentage: utilization,
      budgetAmount: allocated / 100,
      spentAmount: spent / 100,
      remainingAmount: remaining / 100,
    };

    if (alertType === 'budget_exceeded') {
      await this.sendBudgetExceededAlert(options);
    } else if (alertType === 'threshold_reached' && thresholdPercentage === 80) {
      await this.send80PercentThresholdAlert(options);
    }
  },
};

export default BudgetNotificationService;
