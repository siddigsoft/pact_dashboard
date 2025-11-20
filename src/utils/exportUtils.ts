import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

/**
 * Exports audit log data to CSV format and triggers download
 * @param logs The audit log data to export
 * @param filename Optional custom filename
 */
export const exportAuditLogsToCSV = (logs: any[], filename?: string) => {
  // Define CSV header
  const headers = [
    'Timestamp',
    'Action',
    'Category',
    'Description',
    'User',
    'User Role',
    'Details',
    'Status'
  ];
  
  // Convert logs to CSV rows
  const rows = logs.map(log => {
    return [
      format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      log.action,
      log.category,
      log.description,
      log.user,
      log.userRole,
      log.details,
      log.status
    ].map(value => {
      // Escape quotes and wrap in quotes to handle commas
      const stringValue = String(value || '');
      return `"${stringValue.replace(/"/g, '""')}"`;
    }).join(',');
  });
  
  // Construct CSV content
  const csvContent = [
    headers.join(','),
    ...rows
  ].join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const today = format(new Date(), 'yyyy-MM-dd');
  saveAs(blob, filename || `audit-report-${today}.csv`);
};

/**
 * Exports audit log data to JSON format and triggers download
 * @param logs The audit log data to export
 * @param filename Optional custom filename
 */
export const exportAuditLogsToJSON = (logs: any[], filename?: string) => {
  const processedLogs = logs.map(log => ({
    timestamp: format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
    action: log.action,
    category: log.category,
    description: log.description,
    user: log.user,
    userRole: log.userRole,
    details: log.details,
    status: log.status,
    metadata: log.metadata
  }));
  
  const blob = new Blob([JSON.stringify(processedLogs, null, 2)], { type: 'application/json' });
  const today = format(new Date(), 'yyyy-MM-dd');
  saveAs(blob, filename || `audit-report-${today}.json`);
};

/**
 * Generates a comprehensive audit report in PDF format
 * Note: This is a placeholder - actual PDF generation would require additional libraries
 * @param logs The audit log data
 * @param filters Any applied filters
 */
export const generateAuditReport = (logs: any[], filters?: any) => {
  // For now, export to CSV as default format
  exportAuditLogsToCSV(logs);
};

/**
 * Exports site entries to Excel (CSV) format and triggers download
 * @param sites The site entries data
 * @param filename Optional custom filename
 */
export const exportSiteEntriesToExcel = (sites: any[], filename?: string) => {
  // Define CSV header
  const headers = [
    'Site Code',
    'Site Name',
    'Main Activity',
    'Visit Date',
    'Visited By',
    'Status',
    'In MoDa',
    'Locality',
    'State',
    'Address',
    'Latitude',
    'Longitude',
    'Description',
    'Notes',
    'Is Flagged',
    'Flag Reason'
  ];

  // Convert sites to CSV rows
  const rows = sites.map(site => {
    return [
      site.siteCode,
      site.siteName,
      site.mainActivity,
      site.visitDate,
      site.visitedBy,
      site.status,
      site.inMoDa ? 'Yes' : 'No',
      site.locality || '',
      site.state || '',
      site.address || '',
      site.coordinates?.latitude || '',
      site.coordinates?.longitude || '',
      site.description || '',
      site.notes || '',
      site.isFlagged ? 'Yes' : 'No',
      site.flagReason || ''
    ].map(value => {
      // Escape quotes and wrap in quotes to handle commas
      const stringValue = String(value || '');
      return `"${stringValue.replace(/"/g, '""')}"`;
    }).join(',');
  });

  // Construct CSV content
  const csvContent = [
    headers.join(','),
    ...rows
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const today = format(new Date(), 'yyyy-MM-dd');
  saveAs(blob, filename || `site-entries-${today}.csv`);
};

/**
 * Exports site entries to PDF format and triggers download
 * @param sites The site entries data
 * @param filename Optional custom filename
 */
export const exportSiteEntriesToPDF = (sites: any[], filename?: string) => {
  try {
    // Create new jsPDF instance
    const doc = new jsPDF();
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const title = `Site Entries Report - ${today}`;
    
    // Add title to PDF
    doc.setFontSize(15);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${today}`, 14, 22);
    
    // Define table columns
    const tableColumn = [
      'Site Code', 
      'Site Name', 
      'Main Activity', 
      'Visit Date', 
      'Visited By', 
      'Status', 
      'In MoDa'
    ];
    
    // Prepare data for the table
    const tableRows = sites.map(site => [
      site.siteCode || '',
      site.siteName || '',
      site.mainActivity || '',
      site.visitDate || '',
      site.visitedBy || '',
      site.status || '',
      site.inMoDa ? 'Yes' : 'No'
    ]);
    
    // Add table to the document
    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      margin: { top: 30 },
    });
    
    // Save the PDF
    doc.save(filename || `site-entries-${today}.pdf`);
    
    console.log('PDF export completed successfully');
  } catch (error) {
    console.error('Error exporting PDF:', error);
  }
};
