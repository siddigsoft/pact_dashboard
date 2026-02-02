import { DownPaymentRequest, DownPaymentReportConfig, DownPaymentFilter } from '@/types/down-payment';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export function filterDownPayments(
  requests: DownPaymentRequest[],
  filters: DownPaymentFilter
): DownPaymentRequest[] {
  return requests.filter(req => {
    if (filters.status && filters.status.length > 0 && !filters.status.includes(req.status)) {
      return false;
    }
    if (filters.hubId && req.hubId !== filters.hubId) {
      return false;
    }
    if (filters.stateName && req.stateName?.toLowerCase() !== filters.stateName.toLowerCase()) {
      return false;
    }
    if (filters.localityName && req.localityName?.toLowerCase() !== filters.localityName.toLowerCase()) {
      return false;
    }
    if (filters.siteName && !req.siteName.toLowerCase().includes(filters.siteName.toLowerCase())) {
      return false;
    }
    if (filters.activityType && req.activityType?.toLowerCase() !== filters.activityType.toLowerCase()) {
      return false;
    }
    if (filters.dataCollectorId && req.requestedBy !== filters.dataCollectorId) {
      return false;
    }
    if (filters.dateFrom && new Date(req.requestedAt) < new Date(filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo && new Date(req.requestedAt) > new Date(filters.dateTo)) {
      return false;
    }
    if (filters.amountMin && req.requestedAmount < filters.amountMin) {
      return false;
    }
    if (filters.amountMax && req.requestedAmount > filters.amountMax) {
      return false;
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const searchFields = [
        req.siteName,
        req.hubName,
        req.stateName,
        req.localityName,
        req.requestedByName,
        req.justification,
      ].filter(Boolean);
      if (!searchFields.some(f => f?.toLowerCase().includes(term))) {
        return false;
      }
    }
    return true;
  });
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_supervisor: 'Pending Supervisor',
    pending_admin: 'Pending Admin',
    approved: 'Approved',
    rejected: 'Rejected',
    partially_paid: 'Partially Paid',
    fully_paid: 'Fully Paid',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} SDG`;
}

function getApprovalTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    full: 'Full Amount (100%)',
    half: 'Half Amount (50%)',
    percentage: 'Custom Percentage',
    custom: 'Custom Amount',
  };
  return labels[type] || type;
}

export function exportToCSV(requests: DownPaymentRequest[], filename: string = 'down-payments'): void {
  const headers = [
    'Request ID',
    'Requester Name',
    'Site Name',
    'State',
    'Locality',
    'Hub',
    'Activity Type',
    'CP Name',
    'Requested At',
    'Requested Amount (SDG)',
    'Approval Type',
    'Approved Amount (SDG)',
    'Paid Amount (SDG)',
    'Remaining (SDG)',
    'Status',
    'Supervisor Status',
    'Admin Status',
    'Rejection Reason',
    'Justification',
  ];

  const rows = requests.map(req => [
    req.id,
    req.requestedByName || 'Unknown',
    req.siteName,
    req.stateName || 'N/A',
    req.localityName || 'N/A',
    req.hubName || 'N/A',
    req.activityType || 'N/A',
    req.projectName || 'N/A',
    format(new Date(req.requestedAt), 'yyyy-MM-dd HH:mm'),
    req.requestedAmount,
    req.approvalType ? getApprovalTypeLabel(req.approvalType) : 'Pending',
    req.approvedAmount || 0,
    req.totalPaidAmount,
    req.remainingAmount,
    getStatusLabel(req.status),
    req.supervisorStatus ? getStatusLabel(req.supervisorStatus) : 'Pending',
    req.adminStatus ? getStatusLabel(req.adminStatus) : 'Pending',
    req.supervisorRejectionReason || req.adminRejectionReason || '',
    req.justification || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
}

export function exportToExcel(requests: DownPaymentRequest[], filename: string = 'down-payments'): void {
  const data = requests.map(req => ({
    'Request ID': req.id,
    'Requester Name': req.requestedByName || 'Unknown',
    'Site Name': req.siteName,
    'State': req.stateName || 'N/A',
    'Locality': req.localityName || 'N/A',
    'Hub': req.hubName || 'N/A',
    'Activity Type': req.activityType || 'N/A',
    'CP Name': req.projectName || 'N/A',
    'Requested At': format(new Date(req.requestedAt), 'yyyy-MM-dd HH:mm'),
    'Transportation Budget (SDG)': req.totalTransportationBudget,
    'Requested Amount (SDG)': req.requestedAmount,
    'Approval Type': req.approvalType ? getApprovalTypeLabel(req.approvalType) : 'Pending',
    'Approval %': req.approvalPercentage ? `${req.approvalPercentage}%` : (req.approvalType === 'full' ? '100%' : 'N/A'),
    'Approved Amount (SDG)': req.approvedAmount || 0,
    'Paid Amount (SDG)': req.totalPaidAmount,
    'Remaining (SDG)': req.remainingAmount,
    'Status': getStatusLabel(req.status),
    'Payment Type': req.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
    'Supervisor Status': req.supervisorStatus ? getStatusLabel(req.supervisorStatus) : 'Pending',
    'Supervisor Approved By': req.supervisorApprovedByName || req.supervisorApprovedBy || 'N/A',
    'Supervisor Approved At': req.supervisorApprovedAt ? format(new Date(req.supervisorApprovedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
    'Supervisor Notes': req.supervisorNotes || '',
    'Supervisor Rejection Reason': req.supervisorRejectionReason || '',
    'Admin Status': req.adminStatus ? getStatusLabel(req.adminStatus) : 'Pending',
    'Admin Processed By': req.adminProcessedByName || req.adminProcessedBy || 'N/A',
    'Admin Processed At': req.adminProcessedAt ? format(new Date(req.adminProcessedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
    'Admin Notes': req.adminNotes || '',
    'Admin Rejection Reason': req.adminRejectionReason || '',
    'Justification': req.justification || '',
    'Created At': format(new Date(req.createdAt), 'yyyy-MM-dd HH:mm'),
    'Updated At': format(new Date(req.updatedAt), 'yyyy-MM-dd HH:mm'),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Down Payments');

  const colWidths = Object.keys(data[0] || {}).map(() => ({ wch: 18 }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function exportToPDF(
  requests: DownPaymentRequest[],
  config: DownPaymentReportConfig
): void {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(config.reportTitle || 'Down-Payment Requests Report', pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, pageWidth / 2, 22, { align: 'center' });
  doc.text(`Total Requests: ${requests.length}`, pageWidth / 2, 28, { align: 'center' });

  if (config.reportNotes) {
    doc.setFontSize(9);
    doc.text(`Notes: ${config.reportNotes}`, 14, 34);
  }

  const totalRequested = requests.reduce((sum, r) => sum + r.requestedAmount, 0);
  const totalApproved = requests.reduce((sum, r) => sum + (r.approvedAmount || r.requestedAmount), 0);
  const totalPaid = requests.reduce((sum, r) => sum + r.totalPaidAmount, 0);
  const totalRemaining = requests.reduce((sum, r) => sum + r.remainingAmount, 0);

  const summaryY = config.reportNotes ? 40 : 34;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary:', 14, summaryY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Requested: ${formatCurrency(totalRequested)}`, 14, summaryY + 5);
  doc.text(`Total Approved: ${formatCurrency(totalApproved)}`, 80, summaryY + 5);
  doc.text(`Total Paid: ${formatCurrency(totalPaid)}`, 146, summaryY + 5);
  doc.text(`Total Remaining: ${formatCurrency(totalRemaining)}`, 212, summaryY + 5);

  const tableData = requests.map(req => [
    req.siteName.substring(0, 25) + (req.siteName.length > 25 ? '...' : ''),
    req.hubName || '-',
    formatCurrency(req.requestedAmount),
    formatCurrency(req.approvedAmount || req.requestedAmount),
    formatCurrency(req.totalPaidAmount),
    getStatusLabel(req.status),
    format(new Date(req.requestedAt), 'yyyy-MM-dd'),
  ]);

  autoTable(doc, {
    head: [['Site', 'Hub', 'Requested', 'Approved', 'Paid', 'Status', 'Date']],
    body: tableData,
    startY: summaryY + 12,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 30 },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 35 },
      6: { cellWidth: 28 },
    },
  });

  if (config.includeAuditLog) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Audit Log', 14, 15);

    const auditData: string[][] = [];
    requests.forEach(req => {
      if (req.auditLog && req.auditLog.length > 0) {
        req.auditLog.forEach(entry => {
          auditData.push([
            req.siteName.substring(0, 20),
            entry.action.replace(/_/g, ' '),
            entry.performedByName || entry.performedBy,
            format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm'),
            entry.notes || '-',
          ]);
        });
      }
    });

    if (auditData.length > 0) {
      autoTable(doc, {
        head: [['Site', 'Action', 'Performed By', 'Timestamp', 'Notes']],
        body: auditData,
        startY: 22,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      });
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('No audit entries found.', 14, 25);
    }
  }

  if (config.includeSignature && config.signatureData) {
    const currentPage = doc.getNumberOfPages();
    doc.setPage(currentPage);
    
    const signatureY = pageHeight - 45;
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, signatureY, pageWidth - 14, signatureY);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Authorized Signature:', 14, signatureY + 8);

    if (config.signatureData.signatureImage) {
      try {
        doc.addImage(config.signatureData.signatureImage, 'PNG', 14, signatureY + 10, 50, 20);
      } catch (e) {
        console.warn('Could not add signature image:', e);
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.text(config.signatureData.signerName, 14, signatureY + 35);
    doc.setFontSize(9);
    doc.text(config.signatureData.signerTitle, 14, signatureY + 40);
    doc.text(`Signed: ${format(new Date(config.signatureData.signedAt), 'MMMM d, yyyy')}`, 14, signatureY + 45);

    if (config.signatureData.stampImage) {
      try {
        doc.addImage(config.signatureData.stampImage, 'PNG', pageWidth - 60, signatureY + 5, 40, 40);
      } catch (e) {
        console.warn('Could not add stamp image:', e);
      }
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    doc.text('PACT Command Center - Confidential', 14, pageHeight - 5);
  }

  doc.save(`${config.reportTitle?.replace(/\s+/g, '_') || 'down-payment-report'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function getDownPaymentStats(requests: DownPaymentRequest[]) {
  const pendingSupervisor = requests.filter(r => r.status === 'pending_supervisor').length;
  const pendingAdmin = requests.filter(r => r.status === 'pending_admin').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;
  const partiallyPaid = requests.filter(r => r.status === 'partially_paid').length;
  const fullyPaid = requests.filter(r => r.status === 'fully_paid').length;

  const totalRequested = requests.reduce((sum, r) => sum + r.requestedAmount, 0);
  const totalApproved = requests.reduce((sum, r) => sum + (r.approvedAmount || (r.status !== 'rejected' ? r.requestedAmount : 0)), 0);
  const totalPaid = requests.reduce((sum, r) => sum + r.totalPaidAmount, 0);
  const totalRemaining = requests.reduce((sum, r) => sum + r.remainingAmount, 0);

  return {
    counts: {
      total: requests.length,
      pendingSupervisor,
      pendingAdmin,
      approved,
      rejected,
      partiallyPaid,
      fullyPaid,
    },
    amounts: {
      totalRequested,
      totalApproved,
      totalPaid,
      totalRemaining,
    },
  };
}
