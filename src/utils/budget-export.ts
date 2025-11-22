import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { ProjectBudget, MMPBudget, BudgetTransaction } from '@/types/budget';

const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-SD', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export interface BudgetExportData {
  projectBudgets: ProjectBudget[];
  mmpBudgets: MMPBudget[];
  transactions: BudgetTransaction[];
  stats?: {
    totalBudget: number;
    totalSpent: number;
    totalRemaining: number;
    utilizationRate: number;
  };
}

/**
 * Export budget data to PDF
 */
export function exportBudgetToPDF(data: BudgetExportData, filename: string = 'budget_report.pdf'): void {
  const doc = new jsPDF();
  let yPosition = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT Budget Report', 14, yPosition);
  
  yPosition += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-SD')}`, 14, yPosition);

  // Summary Statistics
  if (data.stats) {
    yPosition += 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Budget Summary', 14, yPosition);
    
    yPosition += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryData = [
      ['Total Budget', formatCurrency(data.stats.totalBudget * 100)],
      ['Total Spent', formatCurrency(data.stats.totalSpent * 100)],
      ['Total Remaining', formatCurrency(data.stats.totalRemaining * 100)],
      ['Utilization Rate', `${data.stats.utilizationRate.toFixed(1)}%`],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  }

  // Project Budgets
  if (data.projectBudgets.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Project Budgets', 14, yPosition);
    
    yPosition += 8;

    const projectData = data.projectBudgets.map(pb => [
      `FY ${pb.fiscalYear}`,
      pb.budgetPeriod.replace('_', ' '),
      formatCurrency(pb.totalBudgetCents),
      formatCurrency(pb.spentBudgetCents),
      formatCurrency(pb.remainingBudgetCents),
      pb.status,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Fiscal Year', 'Period', 'Total', 'Spent', 'Remaining', 'Status']],
      body: projectData,
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  }

  // MMP Budgets (on new page if needed)
  if (data.mmpBudgets.length > 0) {
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MMP Budgets', 14, yPosition);
    
    yPosition += 8;

    const mmpData = data.mmpBudgets.map(mb => [
      mb.mmpFileId.slice(0, 8),
      `${mb.completedSites}/${mb.totalSites}`,
      formatCurrency(mb.allocatedBudgetCents),
      formatCurrency(mb.spentBudgetCents),
      formatCurrency(mb.remainingBudgetCents),
      mb.status,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['MMP ID', 'Sites', 'Allocated', 'Spent', 'Remaining', 'Status']],
      body: mmpData,
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
    });
  }

  // Transactions (on new page)
  if (data.transactions.length > 0) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Recent Transactions', 14, yPosition);
    
    yPosition += 8;

    const txnData = data.transactions.slice(0, 50).map(txn => [
      formatDate(txn.createdAt),
      txn.transactionType.replace('_', ' '),
      txn.category?.replace('_', ' ') || '-',
      formatCurrency(txn.amountCents),
      (txn.description || '').substring(0, 40),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Date', 'Type', 'Category', 'Amount', 'Description']],
      body: txnData,
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      columnStyles: {
        4: { cellWidth: 60 }
      },
    });
  }

  // Save the PDF
  doc.save(filename);
}

/**
 * Export budget data to Excel
 */
export function exportBudgetToExcel(data: BudgetExportData, filename: string = 'budget_report.xlsx'): void {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  if (data.stats) {
    const summaryData = [
      ['PACT Budget Report'],
      [`Generated: ${new Date().toLocaleDateString('en-SD')}`],
      [''],
      ['Metric', 'Value'],
      ['Total Budget', formatCurrency(data.stats.totalBudget * 100)],
      ['Total Spent', formatCurrency(data.stats.totalSpent * 100)],
      ['Total Remaining', formatCurrency(data.stats.totalRemaining * 100)],
      ['Utilization Rate', `${data.stats.utilizationRate.toFixed(1)}%`],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  }

  // Project Budgets sheet
  if (data.projectBudgets.length > 0) {
    const projectData = [
      ['Fiscal Year', 'Period', 'Total Budget', 'Allocated', 'Spent', 'Remaining', 'Status', 'Created'],
      ...data.projectBudgets.map(pb => [
        pb.fiscalYear,
        pb.budgetPeriod,
        formatCurrency(pb.totalBudgetCents),
        formatCurrency(pb.allocatedBudgetCents),
        formatCurrency(pb.spentBudgetCents),
        formatCurrency(pb.remainingBudgetCents),
        pb.status,
        formatDate(pb.createdAt),
      ]),
    ];

    const projectSheet = XLSX.utils.aoa_to_sheet(projectData);
    XLSX.utils.book_append_sheet(workbook, projectSheet, 'Project Budgets');
  }

  // MMP Budgets sheet
  if (data.mmpBudgets.length > 0) {
    const mmpData = [
      ['MMP ID', 'Total Sites', 'Completed Sites', 'Allocated', 'Spent', 'Remaining', 'Avg per Site', 'Status', 'Source'],
      ...data.mmpBudgets.map(mb => [
        mb.mmpFileId.slice(0, 8),
        mb.totalSites,
        mb.completedSites,
        formatCurrency(mb.allocatedBudgetCents),
        formatCurrency(mb.spentBudgetCents),
        formatCurrency(mb.remainingBudgetCents),
        formatCurrency(mb.averageCostPerSiteCents),
        mb.status,
        mb.sourceType,
      ]),
    ];

    const mmpSheet = XLSX.utils.aoa_to_sheet(mmpData);
    XLSX.utils.book_append_sheet(workbook, mmpSheet, 'MMP Budgets');
  }

  // Transactions sheet
  if (data.transactions.length > 0) {
    const txnData = [
      ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Description', 'Before', 'After'],
      ...data.transactions.slice(0, 1000).map(txn => [
        formatDate(txn.createdAt),
        txn.transactionType,
        txn.category || '',
        formatCurrency(txn.amountCents),
        txn.currency,
        txn.description || '',
        formatCurrency(txn.balanceBeforeCents),
        formatCurrency(txn.balanceAfterCents),
      ]),
    ];

    const txnSheet = XLSX.utils.aoa_to_sheet(txnData);
    XLSX.utils.book_append_sheet(workbook, txnSheet, 'Transactions');
  }

  // Write the file
  XLSX.writeFile(workbook, filename);
}

/**
 * Export budget data to CSV
 */
export function exportBudgetToCSV(data: BudgetExportData, filename: string = 'budget_report.csv'): void {
  const rows: string[][] = [
    ['PACT Budget Report'],
    [`Generated: ${new Date().toLocaleDateString('en-SD')}`],
    [''],
  ];

  // Summary
  if (data.stats) {
    rows.push(['Summary']);
    rows.push(['Total Budget', formatCurrency(data.stats.totalBudget * 100)]);
    rows.push(['Total Spent', formatCurrency(data.stats.totalSpent * 100)]);
    rows.push(['Total Remaining', formatCurrency(data.stats.totalRemaining * 100)]);
    rows.push(['Utilization Rate', `${data.stats.utilizationRate.toFixed(1)}%`]);
    rows.push(['']);
  }

  // Project Budgets
  if (data.projectBudgets.length > 0) {
    rows.push(['Project Budgets']);
    rows.push(['Fiscal Year', 'Period', 'Total', 'Spent', 'Remaining', 'Status']);
    data.projectBudgets.forEach(pb => {
      rows.push([
        pb.fiscalYear.toString(),
        pb.budgetPeriod,
        formatCurrency(pb.totalBudgetCents),
        formatCurrency(pb.spentBudgetCents),
        formatCurrency(pb.remainingBudgetCents),
        pb.status,
      ]);
    });
    rows.push(['']);
  }

  // MMP Budgets
  if (data.mmpBudgets.length > 0) {
    rows.push(['MMP Budgets']);
    rows.push(['MMP ID', 'Sites', 'Allocated', 'Spent', 'Remaining', 'Status']);
    data.mmpBudgets.forEach(mb => {
      rows.push([
        mb.mmpFileId.slice(0, 8),
        `${mb.completedSites}/${mb.totalSites}`,
        formatCurrency(mb.allocatedBudgetCents),
        formatCurrency(mb.spentBudgetCents),
        formatCurrency(mb.remainingBudgetCents),
        mb.status,
      ]);
    });
    rows.push(['']);
  }

  // Convert to CSV
  const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
