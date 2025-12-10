import { supabase } from '@/integrations/supabase/client';
import { ReportingService } from './reporting.service';
import { REPORT_DEFINITIONS, getReportById } from './kpi-definitions';
import {
  exportFinancialSummaryPDF,
  exportProductivityMetricsPDF,
  exportOperationalEfficiencyPDF,
  exportProjectCostAnalysisPDF,
  exportAuditSummaryPDF,
  exportExecutiveSummaryPDF,
  exportToExcel,
  exportToCSV,
} from '@/utils/report-export';
import type { ReportFormat, ReportFrequency, ScheduledReport } from '@/types/reports';
import { format as formatDate, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns';

export interface ScheduledReportConfig {
  reportId: string;
  frequency: ReportFrequency;
  format: ReportFormat;
  recipientRoles: string[];
  enabled: boolean;
}

const DEFAULT_SCHEDULED_REPORTS: ScheduledReportConfig[] = [
  {
    reportId: 'executive_summary',
    frequency: 'weekly',
    format: 'pdf',
    recipientRoles: ['SuperAdmin', 'Admin', 'SeniorOperationsLead'],
    enabled: true,
  },
  {
    reportId: 'financial_summary',
    frequency: 'weekly',
    format: 'pdf',
    recipientRoles: ['SuperAdmin', 'Admin', 'SeniorOperationsLead', 'FinanceApprover'],
    enabled: true,
  },
  {
    reportId: 'operational_efficiency',
    frequency: 'daily',
    format: 'excel',
    recipientRoles: ['SuperAdmin', 'Admin', 'SeniorOperationsLead', 'FOM'],
    enabled: true,
  },
  {
    reportId: 'enumerator_productivity',
    frequency: 'weekly',
    format: 'excel',
    recipientRoles: ['SuperAdmin', 'Admin', 'SeniorOperationsLead', 'ProjectManager', 'Supervisor'],
    enabled: true,
  },
  {
    reportId: 'audit_trail',
    frequency: 'monthly',
    format: 'excel',
    recipientRoles: ['SuperAdmin', 'Admin'],
    enabled: true,
  },
  {
    reportId: 'override_log',
    frequency: 'weekly',
    format: 'pdf',
    recipientRoles: ['SuperAdmin', 'Admin', 'SeniorOperationsLead'],
    enabled: true,
  },
];

export class ScheduledReportsService {
  private static getDateRangeForFrequency(frequency: ReportFrequency): { from: Date; to: Date } {
    const now = new Date();
    const to = endOfDay(now);
    
    switch (frequency) {
      case 'daily':
        return { from: startOfDay(subDays(now, 1)), to };
      case 'weekly':
        return { from: startOfDay(subWeeks(now, 1)), to };
      case 'monthly':
        return { from: startOfDay(subMonths(now, 1)), to };
      case 'quarterly':
        return { from: startOfDay(subMonths(now, 3)), to };
      default:
        return { from: startOfDay(subDays(now, 30)), to };
    }
  }

  static async generateReport(
    reportId: string,
    format: ReportFormat,
    dateRange?: { from: Date; to: Date }
  ): Promise<{ success: boolean; filename?: string; error?: string }> {
    try {
      const range = dateRange || this.getDateRangeForFrequency('monthly');
      const timestamp = format === 'pdf' ? '' : `_${formatDate(new Date(), 'yyyy-MM-dd')}`;
      let filename = '';

      switch (reportId) {
        case 'financial_summary':
        case 'expense_breakdown':
        case 'cash_flow':
        case 'budget_vs_actual': {
          const data = await ReportingService.getFinancialSummary(range);
          filename = `financial_summary${timestamp}`;
          
          if (format === 'pdf') {
            await exportFinancialSummaryPDF(data, range, `${filename}.pdf`);
          } else if (format === 'excel') {
            const excelData = [
              { Metric: 'Total Budget', Value: data.totalBudget },
              { Metric: 'Total Spent', Value: data.totalSpent },
              { Metric: 'Remaining', Value: data.totalRemaining },
              { Metric: 'Utilization Rate (%)', Value: data.utilizationRate },
              { Metric: 'Burn Rate', Value: data.burnRate },
              { Metric: 'Pending Approvals', Value: data.pendingApprovals },
              { Metric: 'Pending Amount', Value: data.pendingApprovalsAmount },
            ];
            exportToExcel(excelData, 'Financial Summary', `${filename}.xlsx`);
          } else {
            exportToCSV([
              { Metric: 'Total Budget', Value: data.totalBudget },
              { Metric: 'Total Spent', Value: data.totalSpent },
              { Metric: 'Utilization Rate', Value: data.utilizationRate },
            ], `${filename}.csv`);
          }
          break;
        }

        case 'enumerator_productivity':
        case 'team_performance': {
          const data = await ReportingService.getProductivityMetrics(range);
          filename = `productivity_metrics${timestamp}`;
          
          if (format === 'pdf') {
            await exportProductivityMetricsPDF(data, range, `${filename}.pdf`);
          } else if (format === 'excel') {
            const excelData = data.map(m => ({
              'Enumerator': m.enumeratorName,
              'Role': m.role,
              'Assigned': m.visitsAssigned,
              'Completed': m.visitsCompleted,
              'Pending': m.visitsPending,
              'Completion Rate (%)': m.completionRate.toFixed(1),
              'On-Time Rate (%)': m.onTimeRate.toFixed(1),
              'SLA Adherence (%)': m.slaAdherence.toFixed(1),
              'Total Earnings': m.totalEarnings,
            }));
            exportToExcel(excelData, 'Productivity', `${filename}.xlsx`);
          } else {
            exportToCSV(data.map(m => ({
              Enumerator: m.enumeratorName,
              Role: m.role,
              Assigned: m.visitsAssigned,
              Completed: m.visitsCompleted,
              CompletionRate: m.completionRate,
            })), `${filename}.csv`);
          }
          break;
        }

        case 'operational_efficiency':
        case 'coverage_analysis': {
          const data = await ReportingService.getOperationalEfficiency(range);
          filename = `operational_efficiency${timestamp}`;
          
          if (format === 'pdf') {
            await exportOperationalEfficiencyPDF(data, range, `${filename}.pdf`);
          } else if (format === 'excel') {
            const summaryData = [
              { Metric: 'Total Visits', Value: data.totalVisits },
              { Metric: 'Completed', Value: data.completedVisits },
              { Metric: 'Pending', Value: data.pendingVisits },
              { Metric: 'Overdue', Value: data.overdueVisits },
              { Metric: 'Avg Cycle Time (Days)', Value: data.averageCycleTime.toFixed(1) },
              { Metric: 'First Pass Rate (%)', Value: data.firstPassAcceptance.toFixed(1) },
              { Metric: 'Rework Rate (%)', Value: data.reworkRate.toFixed(1) },
            ];
            exportToExcel(summaryData, 'Efficiency', `${filename}.xlsx`);
          } else {
            exportToCSV([
              { Metric: 'Total Visits', Value: data.totalVisits },
              { Metric: 'Completed', Value: data.completedVisits },
              { Metric: 'Completion Rate', Value: (data.completedVisits / data.totalVisits * 100).toFixed(1) },
            ], `${filename}.csv`);
          }
          break;
        }

        case 'project_cost_analysis':
        case 'cost_per_region':
        case 'forecast_report': {
          const data = await ReportingService.getProjectCostAnalysis();
          filename = `project_cost_analysis${timestamp}`;
          
          if (format === 'pdf') {
            await exportProjectCostAnalysisPDF(data, `${filename}.pdf`);
          } else if (format === 'excel') {
            const excelData = data.map(p => ({
              'Project': p.projectName,
              'Code': p.projectCode || '-',
              'Status': p.status,
              'Total Budget': p.totalBudget,
              'Spent': p.totalSpent,
              'Remaining': p.remaining,
              'Utilization (%)': p.utilizationPercentage.toFixed(1),
              'Variance (%)': p.variancePercentage.toFixed(1),
              'Cost Per Site': p.costPerSite.toFixed(0),
              'RAG Status': p.ragStatus.toUpperCase(),
            }));
            exportToExcel(excelData, 'Project Costs', `${filename}.xlsx`);
          } else {
            exportToCSV(data.map(p => ({
              Project: p.projectName,
              Budget: p.totalBudget,
              Spent: p.totalSpent,
              Utilization: p.utilizationPercentage,
              Status: p.ragStatus,
            })), `${filename}.csv`);
          }
          break;
        }

        case 'audit_trail':
        case 'override_log':
        case 'compliance_dashboard': {
          const data = await ReportingService.getAuditSummary(range);
          filename = `audit_summary${timestamp}`;
          
          if (format === 'pdf') {
            await exportAuditSummaryPDF(data, range, `${filename}.pdf`);
          } else if (format === 'excel') {
            const actionsData = data.actionsByType.map(a => ({
              'Action Type': a.type,
              'Count': a.count,
            }));
            exportToExcel(actionsData, 'Audit Actions', `${filename}.xlsx`);
          } else {
            exportToCSV(data.actionsByType.map(a => ({
              ActionType: a.type,
              Count: a.count,
            })), `${filename}.csv`);
          }
          break;
        }

        case 'executive_summary':
        case 'portfolio_health':
        case 'escalation_summary': {
          const data = await ReportingService.getExecutiveSummary();
          filename = `executive_summary${timestamp}`;
          
          if (format === 'pdf') {
            await exportExecutiveSummaryPDF(data, `${filename}.pdf`);
          } else if (format === 'excel') {
            const excelData = [
              { Metric: 'Portfolio Health', Value: data.portfolioHealth.toUpperCase() },
              { Metric: 'Overall Score', Value: data.overallScore.toFixed(0) + '%' },
              { Metric: 'Total Budget', Value: data.budgetPosture.totalBudget },
              { Metric: 'Total Spent', Value: data.budgetPosture.totalSpent },
              { Metric: 'Utilization Rate', Value: data.budgetPosture.utilizationRate.toFixed(1) + '%' },
              { Metric: 'Projects On Track', Value: data.budgetPosture.projectsOnTrack },
              { Metric: 'Projects At Risk', Value: data.budgetPosture.projectsAtRisk },
              { Metric: 'Projects Over Budget', Value: data.budgetPosture.projectsOverBudget },
              { Metric: 'Total Site Visits', Value: data.operationalStatus.totalSiteVisits },
              { Metric: 'Completed Visits', Value: data.operationalStatus.completedVisits },
              { Metric: 'Pending Escalations', Value: data.operationalStatus.escalationsPending },
            ];
            exportToExcel(excelData, 'Executive Summary', `${filename}.xlsx`);
          }
          break;
        }

        default:
          return { success: false, error: `Unknown report ID: ${reportId}` };
      }

      return { success: true, filename };
    } catch (error) {
      console.error(`Error generating report ${reportId}:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  static async sendScheduledReportNotification(
    reportName: string,
    recipientIds: string[],
    filename: string
  ): Promise<void> {
    try {
      const notifications = recipientIds.map(userId => ({
        user_id: userId,
        type: 'report_generated',
        title: `Scheduled Report: ${reportName}`,
        message: `Your scheduled report "${reportName}" has been generated and is ready for download.`,
        data: { filename, reportName },
        read: false,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) {
        console.error('Error sending report notifications:', error);
      }
    } catch (error) {
      console.error('Error in sendScheduledReportNotification:', error);
    }
  }

  static async runScheduledReports(frequency: ReportFrequency): Promise<void> {
    const reportsToRun = DEFAULT_SCHEDULED_REPORTS.filter(
      r => r.enabled && r.frequency === frequency
    );

    for (const config of reportsToRun) {
      const reportDef = getReportById(config.reportId);
      if (!reportDef) continue;

      const result = await this.generateReport(config.reportId, config.format);
      
      if (result.success && result.filename) {
        const { data: recipients } = await supabase
          .from('profiles')
          .select('id')
          .in('role', config.recipientRoles);

        if (recipients?.length) {
          await this.sendScheduledReportNotification(
            reportDef.name,
            recipients.map(r => r.id),
            result.filename
          );
        }
      }
    }
  }

  static getAvailableScheduledReports(): ScheduledReportConfig[] {
    return DEFAULT_SCHEDULED_REPORTS;
  }

  static getReportScheduleInfo(): { reportName: string; frequency: string; enabled: boolean }[] {
    return DEFAULT_SCHEDULED_REPORTS.map(config => {
      const reportDef = getReportById(config.reportId);
      return {
        reportName: reportDef?.name || config.reportId,
        frequency: config.frequency,
        enabled: config.enabled,
      };
    });
  }
}

export default ScheduledReportsService;
