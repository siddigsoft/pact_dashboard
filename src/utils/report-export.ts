import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type {
  FinancialSummary,
  ProductivityMetrics,
  OperationalEfficiency,
  ProjectCostAnalysis,
  AuditSummary,
  ExecutiveSummary,
  ReportFormat,
} from '@/types/reports';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const formatDate = (date: string | Date): string => {
  return format(new Date(date), 'MMM dd, yyyy');
};

const getRAGColor = (status: string): [number, number, number] => {
  switch (status) {
    case 'green': return [39, 174, 96];
    case 'amber': return [243, 156, 18];
    case 'red': return [231, 76, 60];
    default: return [149, 165, 166];
  }
};

export async function exportFinancialSummaryPDF(
  data: FinancialSummary,
  dateRange?: { from: Date; to: Date },
  filename: string = 'financial_summary.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Summary Report', 14, yPos);
  
  if (dateRange) {
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`, 14, yPos);
  }

  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Budget Overview', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Budget', formatCurrency(data.totalBudget)],
      ['Total Spent', formatCurrency(data.totalSpent)],
      ['Remaining', formatCurrency(data.totalRemaining)],
      ['Utilization Rate', formatPercent(data.utilizationRate)],
      ['Monthly Burn Rate', formatCurrency(data.burnRate)],
      ['Projected Runway (Months)', data.projectedRunway.toFixed(1)],
      ['Pending Approvals', data.pendingApprovals.toString()],
      ['Pending Amount', formatCurrency(data.pendingApprovalsAmount)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  if (data.expensesByCategory.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Expenses by Category', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Budgeted', 'Actual', 'Variance', 'Variance %']],
      body: data.expensesByCategory.map(cat => [
        cat.category,
        formatCurrency(cat.budgeted),
        formatCurrency(cat.actual),
        formatCurrency(cat.variance),
        formatPercent(cat.variancePercentage),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  if (data.budgetVsActual.length > 0 && yPos < 220) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Budget vs Actual by Entity', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Entity', 'Type', 'Budgeted', 'Actual', 'Variance', 'Status']],
      body: data.budgetVsActual.slice(0, 10).map(item => [
        item.entityName,
        item.entityType,
        formatCurrency(item.budgeted),
        formatCurrency(item.actual),
        formatPercent(item.variancePercentage),
        item.status.toUpperCase(),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
    });
  }

  doc.save(filename);
}

export async function exportProductivityMetricsPDF(
  data: ProductivityMetrics[],
  dateRange?: { from: Date; to: Date },
  filename: string = 'productivity_metrics.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Enumerator Productivity Report', 14, yPos);
  
  if (dateRange) {
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`, 14, yPos);
  }

  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  const totalAssigned = data.reduce((sum, m) => sum + m.visitsAssigned, 0);
  const totalCompleted = data.reduce((sum, m) => sum + m.visitsCompleted, 0);
  const avgCompletionRate = data.length > 0 
    ? data.reduce((sum, m) => sum + m.completionRate, 0) / data.length 
    : 0;
  const avgOnTimeRate = data.length > 0 
    ? data.reduce((sum, m) => sum + m.onTimeRate, 0) / data.length 
    : 0;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Enumerators', data.length.toString()],
      ['Total Visits Assigned', totalAssigned.toString()],
      ['Total Visits Completed', totalCompleted.toString()],
      ['Average Completion Rate', formatPercent(avgCompletionRate)],
      ['Average On-Time Rate', formatPercent(avgOnTimeRate)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Individual Performance', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Name', 'Role', 'Assigned', 'Completed', 'Completion %', 'On-Time %', 'Earnings']],
    body: data.slice(0, 30).map(m => [
      m.enumeratorName,
      m.role,
      m.visitsAssigned.toString(),
      m.visitsCompleted.toString(),
      formatPercent(m.completionRate),
      formatPercent(m.onTimeRate),
      formatCurrency(m.totalEarnings),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [52, 73, 94] },
    styles: { fontSize: 9 },
  });

  doc.save(filename);
}

export async function exportOperationalEfficiencyPDF(
  data: OperationalEfficiency,
  dateRange?: { from: Date; to: Date },
  filename: string = 'operational_efficiency.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Operational Efficiency Report', 14, yPos);
  
  if (dateRange) {
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`, 14, yPos);
  }

  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Key Metrics', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Site Visits', data.totalVisits.toString()],
      ['Completed Visits', data.completedVisits.toString()],
      ['Pending Visits', data.pendingVisits.toString()],
      ['Overdue Visits', data.overdueVisits.toString()],
      ['Average Cycle Time (Days)', data.averageCycleTime.toFixed(1)],
      ['First Pass Acceptance Rate', formatPercent(data.firstPassAcceptance)],
      ['Rework Rate', formatPercent(data.reworkRate)],
      ['Assignment Latency (Hours)', data.assignmentLatency.toFixed(1)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  if (data.coverageByState.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Coverage by State', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['State', 'Total Sites', 'Visited', 'Pending', 'Coverage %']],
      body: data.coverageByState.slice(0, 15).map(s => [
        s.name,
        s.totalSites.toString(),
        s.visitedSites.toString(),
        s.pendingSites.toString(),
        formatPercent(s.coveragePercentage),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
    });
  }

  doc.save(filename);
}

export async function exportProjectCostAnalysisPDF(
  data: ProjectCostAnalysis[],
  filename: string = 'project_cost_analysis.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Project Cost Analysis Report', 14, yPos);
  
  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  const totalBudget = data.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalSpent = data.reduce((sum, p) => sum + p.totalSpent, 0);
  const projectsOnTrack = data.filter(p => p.ragStatus === 'green').length;
  const projectsAtRisk = data.filter(p => p.ragStatus === 'amber').length;
  const projectsOverBudget = data.filter(p => p.ragStatus === 'red').length;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Portfolio Summary', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Projects', data.length.toString()],
      ['Total Budget', formatCurrency(totalBudget)],
      ['Total Spent', formatCurrency(totalSpent)],
      ['Projects On Track (Green)', projectsOnTrack.toString()],
      ['Projects At Risk (Amber)', projectsAtRisk.toString()],
      ['Projects Over Budget (Red)', projectsOverBudget.toString()],
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Project Details', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Project', 'Budget', 'Spent', 'Remaining', 'Utilization', 'Variance', 'Status']],
    body: data.map(p => [
      p.projectName.slice(0, 20),
      formatCurrency(p.totalBudget),
      formatCurrency(p.totalSpent),
      formatCurrency(p.remaining),
      formatPercent(p.utilizationPercentage),
      formatPercent(p.variancePercentage),
      p.ragStatus.toUpperCase(),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [52, 73, 94] },
    styles: { fontSize: 9 },
  });

  doc.save(filename);
}

export async function exportAuditSummaryPDF(
  data: AuditSummary,
  dateRange?: { from: Date; to: Date },
  filename: string = 'audit_summary.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit Summary Report', 14, yPos);
  
  if (dateRange) {
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`, 14, yPos);
  }

  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit Activity Summary', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Action Type', 'Count']],
    body: data.actionsByType.slice(0, 15).map(a => [a.type, a.count.toString()]),
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  if (data.recentOverrides.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Recent Budget Overrides', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Approved By', 'Project', 'Amount', 'Justification']],
      body: data.recentOverrides.slice(0, 15).map(o => [
        formatDate(o.timestamp),
        o.approvedBy,
        o.projectName.slice(0, 15),
        formatCurrency(o.overrideAmount),
        o.justification.slice(0, 30) + (o.justification.length > 30 ? '...' : ''),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      styles: { fontSize: 9 },
    });
  }

  doc.save(filename);
}

export async function exportExecutiveSummaryPDF(
  data: ExecutiveSummary,
  filename: string = 'executive_summary.pdf'
): Promise<void> {
  const doc = new jsPDF();
  let yPos = 20;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('PACT Field Operations System', 14, yPos);
  doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
  
  yPos += 15;
  doc.setFontSize(22);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary Report', 14, yPos);
  
  yPos += 15;
  doc.setDrawColor(200);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  const healthColor = getRAGColor(data.portfolioHealth);
  doc.setFillColor(healthColor[0], healthColor[1], healthColor[2]);
  doc.rect(14, yPos, 60, 25, 'F');
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.text('Portfolio Health', 20, yPos + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.portfolioHealth.toUpperCase(), 20, yPos + 20);

  doc.setFillColor(41, 128, 185);
  doc.rect(80, yPos, 60, 25, 'F');
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Overall Score', 86, yPos + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.overallScore.toFixed(0)}%`, 86, yPos + 20);

  doc.setFillColor(52, 73, 94);
  doc.rect(146, yPos, 60, 25, 'F');
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Escalations', 152, yPos + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.operationalStatus.escalationsPending.toString(), 152, yPos + 20);

  yPos += 35;
  doc.setTextColor(0);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Budget Posture', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Budget', formatCurrency(data.budgetPosture.totalBudget)],
      ['Total Spent', formatCurrency(data.budgetPosture.totalSpent)],
      ['Utilization Rate', formatPercent(data.budgetPosture.utilizationRate)],
      ['Projects On Track', data.budgetPosture.projectsOnTrack.toString()],
      ['Projects At Risk', data.budgetPosture.projectsAtRisk.toString()],
      ['Projects Over Budget', data.budgetPosture.projectsOverBudget.toString()],
    ],
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Operational Status', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total Site Visits', data.operationalStatus.totalSiteVisits.toString()],
      ['Completed Visits', data.operationalStatus.completedVisits.toString()],
      ['On-Time Rate', formatPercent(data.operationalStatus.onTimeRate)],
      ['Pending Approvals', data.operationalStatus.pendingApprovals.toString()],
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 73, 94] },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Field Coverage', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: [
      ['Total States', data.fieldCoverage.totalStates.toString()],
      ['States Covered', data.fieldCoverage.statesCovered.toString()],
      ['Total Sites', data.fieldCoverage.totalSites.toString()],
      ['Sites Covered', data.fieldCoverage.sitesCovered.toString()],
      ['Coverage Percentage', formatPercent(data.fieldCoverage.coveragePercentage)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [39, 174, 96] },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  doc.save(filename);
}

export function exportToExcel(
  data: any[],
  sheetName: string,
  filename: string
): void {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export function exportToCSV(
  data: any[],
  filename: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export function exportMultiSheetExcel(
  sheets: { name: string; data: any[] }[],
  filename: string
): void {
  const workbook = XLSX.utils.book_new();
  
  sheets.forEach(sheet => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });
  
  XLSX.writeFile(workbook, filename);
}
