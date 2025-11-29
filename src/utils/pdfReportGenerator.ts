import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';

interface ReportData {
  title: string;
  subtitle?: string;
  dateRange?: { from?: Date; to?: Date };
  data: any[];
  columns: { header: string; dataKey: string }[];
  summary?: { label: string; value: string | number }[];
  chartElement?: HTMLCanvasElement;
}

export class PDFReportGenerator {
  private doc: jsPDF;
  private pageHeight: number;
  private pageWidth: number;
  private margin: number = 20;
  private currentY: number = 20;

  constructor() {
    this.doc = new jsPDF();
    this.pageHeight = this.doc.internal.pageSize.height;
    this.pageWidth = this.doc.internal.pageSize.width;
  }

  private addHeader(title: string, subtitle?: string, dateRange?: { from?: Date; to?: Date }) {
    // Company/System header
    this.doc.setFontSize(10);
    this.doc.setTextColor(100);
    this.doc.text('TPM Workflow System', this.margin, this.currentY);
    this.doc.text(`Generated: ${format(new Date(), 'PPP')}`, this.pageWidth - this.margin - 60, this.currentY);
    
    this.currentY += 15;

    // Main title
    this.doc.setFontSize(20);
    this.doc.setTextColor(0);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    
    this.currentY += 10;

    // Subtitle
    if (subtitle) {
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(60);
      this.doc.text(subtitle, this.margin, this.currentY);
      this.currentY += 8;
    }

    // Date range
    if (dateRange?.from || dateRange?.to) {
      this.doc.setFontSize(12);
      this.doc.setTextColor(80);
      let dateText = 'Report Period: ';
      if (dateRange.from && dateRange.to) {
        dateText += `${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')}`;
      } else if (dateRange.from) {
        dateText += `From ${format(dateRange.from, 'MMM dd, yyyy')}`;
      } else if (dateRange.to) {
        dateText += `Until ${format(dateRange.to, 'MMM dd, yyyy')}`;
      }
      this.doc.text(dateText, this.margin, this.currentY);
      this.currentY += 15;
    }

    // Add separator line
    this.doc.setDrawColor(200);
    this.doc.line(this.margin, this.currentY, this.pageWidth - this.margin, this.currentY);
    this.currentY += 10;
  }

  private addSummarySection(summary: { label: string; value: string | number }[]) {
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(0);
    this.doc.text('Summary', this.margin, this.currentY);
    this.currentY += 10;

    // Create summary boxes
    const boxWidth = (this.pageWidth - 2 * this.margin - 20) / Math.min(summary.length, 3);
    const boxHeight = 25;
    
    summary.forEach((item, index) => {
      const x = this.margin + (index % 3) * (boxWidth + 10);
      const y = this.currentY + Math.floor(index / 3) * (boxHeight + 10);

      // Draw box
      this.doc.setFillColor(240, 248, 255);
      this.doc.rect(x, y, boxWidth, boxHeight, 'F');
      this.doc.setDrawColor(200);
      this.doc.rect(x, y, boxWidth, boxHeight, 'S');

      // Add text
      this.doc.setFontSize(10);
      this.doc.setTextColor(60);
      this.doc.text(item.label, x + 5, y + 8);
      
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setTextColor(0);
      this.doc.text(String(item.value), x + 5, y + 18);
    });

    this.currentY += Math.ceil(summary.length / 3) * (boxHeight + 10) + 10;
  }

  private async addChart(chartElement: HTMLCanvasElement) {
    try {
      const canvas = await html2canvas(chartElement, {
        backgroundColor: 'white',
        scale: 2
      });
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = this.pageWidth - 2 * this.margin;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Check if we need a new page
      if (this.currentY + imgHeight > this.pageHeight - this.margin) {
        this.doc.addPage();
        this.currentY = this.margin;
      }

      this.doc.addImage(imgData, 'PNG', this.margin, this.currentY, imgWidth, imgHeight);
      this.currentY += imgHeight + 10;
    } catch (error) {
      console.error('Error adding chart to PDF:', error);
    }
  }

  private addTable(data: any[], columns: { header: string; dataKey: string }[]) {
    const tableData = data.map(row => 
      columns.map(col => row[col.dataKey] || '')
    );

    autoTable(this.doc, {
      head: [columns.map(col => col.header)],
      body: tableData,
      startY: this.currentY,
      margin: { left: this.margin, right: this.margin },
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      didDrawPage: (data: any) => {
        // Add page numbers
        this.doc.setFontSize(8);
        this.doc.setTextColor(100);
        try {
          const pageInfo = (this.doc as any).getCurrentPageInfo?.();
          const pageNum = pageInfo?.pageNumber ?? this.doc.getNumberOfPages();
          this.doc.text(
            `Page ${pageNum}`,
            this.pageWidth - this.margin - 20,
            this.pageHeight - 10
          );
        } catch {
          // Fallback: omit page number if API not available
        }
      }
    });

    this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
  }

  private addFooter() {
    const pageCount = this.doc.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      
      // Footer line
      this.doc.setDrawColor(200);
      this.doc.line(this.margin, this.pageHeight - 20, this.pageWidth - this.margin, this.pageHeight - 20);
      
      // Footer text
      this.doc.setFontSize(8);
      this.doc.setTextColor(100);
      this.doc.text(
        'TPM Workflow System - Confidential Report',
        this.margin,
        this.pageHeight - 10
      );
    }
  }

  async generateReport(reportData: ReportData): Promise<void> {
    // Add header
    this.addHeader(reportData.title, reportData.subtitle, reportData.dateRange);

    // Add summary if provided
    if (reportData.summary && reportData.summary.length > 0) {
      this.addSummarySection(reportData.summary);
    }

    // Add chart if provided
    if (reportData.chartElement) {
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Visual Analysis', this.margin, this.currentY);
      this.currentY += 10;
      
      await this.addChart(reportData.chartElement);
    }

    // Add data table
    if (reportData.data.length > 0) {
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Detailed Data', this.margin, this.currentY);
      this.currentY += 10;
      
      this.addTable(reportData.data, reportData.columns);
    }

    // Add footer
    this.addFooter();
  }

  download(filename: string): void {
    this.doc.save(filename);
  }

  getBlob(): Blob {
    return this.doc.output('blob');
  }
}

// Helper functions for different report types
export const generateSiteVisitsPDF = async (
  visits: any[],
  dateRange?: { from?: Date; to?: Date },
  chartElement?: HTMLCanvasElement
) => {
  const generator = new PDFReportGenerator();
  
  const completed = visits.filter(v => (v['Status'] ?? v.status) === 'completed').length;
  const pending = visits.filter(v => (v['Status'] ?? v.status) === 'pending').length;
  const totalFees = visits.reduce((sum, v) => sum + (Number(v['Total Fee']) || 0), 0);

  const summary = [
    { label: 'Total Visits', value: visits.length },
    { label: 'Completed', value: completed },
    { label: 'Pending', value: pending },
    { label: 'Total Fees', value: `${totalFees.toLocaleString()} SDG` }
  ];

  const columns = [
    { header: 'Site Name', dataKey: 'Site Name' },
    { header: 'Site Code', dataKey: 'Site Code' },
    { header: 'State', dataKey: 'State' },
    { header: 'Locality', dataKey: 'Locality' },
    { header: 'Activity', dataKey: 'Activity' },
    { header: 'Main Activity', dataKey: 'Main Activity' },
    { header: 'Visit Type', dataKey: 'Visit Type' },
    { header: 'Due Date', dataKey: 'Due Date' },
    { header: 'Status', dataKey: 'Status' },
    { header: 'Total Fee', dataKey: 'Total Fee' },
    { header: 'Currency', dataKey: 'Currency' }
  ];

  await generator.generateReport({
    title: 'Site Visits Report',
    subtitle: 'Comprehensive analysis of site visit activities and performance',
    dateRange,
    data: visits,
    columns,
    summary,
    chartElement
  });

  const filename = `site_visits_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  generator.download(filename);
};

export const generateProjectBudgetPDF = async (
  projects: any[],
  dateRange?: { from?: Date; to?: Date },
  chartElement?: HTMLCanvasElement
) => {
  const generator = new PDFReportGenerator();
  
  const totalBudget = projects.reduce((sum, p) => sum + (p['Budget Total'] || 0), 0);
  const totalAllocated = projects.reduce((sum, p) => sum + (p['Budget Allocated'] || 0), 0);
  const totalRemaining = projects.reduce((sum, p) => sum + (p['Budget Remaining'] || 0), 0);

  const summary = [
    { label: 'Total Projects', value: projects.length },
    { label: 'Total Budget', value: `${totalBudget.toLocaleString()} SDG` },
    { label: 'Allocated', value: `${totalAllocated.toLocaleString()} SDG` },
    { label: 'Remaining', value: `${totalRemaining.toLocaleString()} SDG` }
  ];

  const columns = [
    { header: 'Project Name', dataKey: 'Project Name' },
    { header: 'Project Code', dataKey: 'Project Code' },
    { header: 'Status', dataKey: 'Status' },
    { header: 'Budget Total', dataKey: 'Budget Total' },
    { header: 'Budget Allocated', dataKey: 'Budget Allocated' },
    { header: 'Budget Remaining', dataKey: 'Budget Remaining' },
    { header: 'Currency', dataKey: 'Currency' },
    { header: 'Updated At', dataKey: 'Updated At' }
  ];

  await generator.generateReport({
    title: 'Project Budget Report',
    subtitle: 'Financial overview and budget allocation analysis',
    dateRange,
    data: projects,
    columns,
    summary,
    chartElement
  });

  const filename = `project_budget_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  generator.download(filename);
};

export const generateMMPProgressPDF = async (
  mmpFiles: any[],
  dateRange?: { from?: Date; to?: Date },
  chartElement?: HTMLCanvasElement
) => {
  const generator = new PDFReportGenerator();
  
  const totalEntries = mmpFiles.reduce((sum, m) => sum + (m.Entries || 0), 0);
  const totalProcessed = mmpFiles.reduce((sum, m) => sum + (m['Processed Entries'] || 0), 0);
  const completionRate = totalEntries > 0 ? Math.round((totalProcessed / totalEntries) * 100) : 0;

  const summary = [
    { label: 'Total MMP Files', value: mmpFiles.length },
    { label: 'Total Entries', value: totalEntries },
    { label: 'Processed', value: totalProcessed },
    { label: 'Completion Rate', value: `${completionRate}%` }
  ];

  const columns = [
    { header: 'Name', dataKey: 'Name' },
    { header: 'Status', dataKey: 'Status' },
    { header: 'Entries', dataKey: 'Entries' },
    { header: 'Processed Entries', dataKey: 'Processed Entries' },
    { header: 'MMP ID', dataKey: 'MMP ID' },
    { header: 'Uploaded At', dataKey: 'Uploaded At' }
  ];

  await generator.generateReport({
    title: 'MMP Implementation Progress Report',
    subtitle: 'Monitoring and evaluation of MMP implementation activities',
    dateRange,
    data: mmpFiles,
    columns,
    summary,
    chartElement
  });

  const filename = `mmp_progress_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  generator.download(filename);
};

export const generateTeamPerformancePDF = async (
  teamData: any[],
  dateRange?: { from?: Date; to?: Date },
  chartElement?: HTMLCanvasElement
) => {
  const generator = new PDFReportGenerator();
  
  const totalAssigned = teamData.reduce((sum, t) => sum + (t['Assigned Visits'] || 0), 0);
  const totalCompleted = teamData.reduce((sum, t) => sum + (t['Completed Visits'] || 0), 0);
  const avgCompletion = teamData.length > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  const summary = [
    { label: 'Team Members', value: teamData.length },
    { label: 'Total Assigned', value: totalAssigned },
    { label: 'Total Completed', value: totalCompleted },
    { label: 'Avg Completion', value: `${avgCompletion}%` }
  ];

  const columns = [
    { header: 'User', dataKey: 'User' },
    { header: 'Role', dataKey: 'Role' },
    { header: 'Assigned Visits', dataKey: 'Assigned Visits' },
    { header: 'Completed Visits', dataKey: 'Completed Visits' },
    { header: 'Pending/Active', dataKey: 'Pending/Active' }
  ];

  await generator.generateReport({
    title: 'Team Performance Report',
    subtitle: 'Analysis of team productivity and task completion rates',
    dateRange,
    data: teamData,
    columns,
    summary,
    chartElement
  });

  const filename = `team_performance_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  generator.download(filename);
};
