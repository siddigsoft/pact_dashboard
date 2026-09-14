import { DownPaymentRequest, DownPaymentReportConfig, DownPaymentFilter } from '@/types/down-payment';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { exportStandardExcel } from '@/utils/standardExcelExport';
import {
  classifyDownPaymentStatus,
  getDownPaymentBalance,
  getDownPaymentStatusLabel,
  isDownPaymentSettledStatus,
  type DownPaymentPaymentEvidence,
} from '@/utils/downPaymentBalance';
import { isStateNameInHub } from '@/utils/hubAccessControl';
import { normalizeHubId } from '@/data/sudanStates';

export type DownPaymentEvidenceMap = ReadonlyMap<string, readonly DownPaymentPaymentEvidence[]>;

export function matchesDownPaymentHub(
  request: Pick<DownPaymentRequest, 'hubId' | 'hubName' | 'stateName'>,
  hubFilter: string | null | undefined,
): boolean {
  if (!hubFilter) return true;
  if (request.hubId === hubFilter) return true;
  const selectedHubId = normalizeHubId(hubFilter);
  const requestHubId = normalizeHubId(request.hubName || request.hubId);
  if (selectedHubId && requestHubId === selectedHubId) return true;
  return isStateNameInHub(request.stateName, selectedHubId);
}

function balanceFor(
  request: DownPaymentRequest,
  evidenceByRequest?: DownPaymentEvidenceMap,
) {
  return getDownPaymentBalance(request, evidenceByRequest?.get(request.id) ?? []);
}

export function filterDownPayments(
  requests: DownPaymentRequest[],
  filters: DownPaymentFilter
): DownPaymentRequest[] {
  return requests.filter(req => {
    if (filters.status && filters.status.length > 0 && !filters.status.includes(req.status)) {
      return false;
    }
    if (!matchesDownPaymentHub(req, filters.hubId)) {
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
    if (filters.mmpName && req.mmpName?.toLowerCase() !== filters.mmpName.toLowerCase()) {
      return false;
    }
    if (filters.projectId && (req as any).project_id !== filters.projectId) {
      return false;
    }
    if (filters.dateFrom && new Date(req.requestedAt) < new Date(filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo) {
      const inclusiveEndDate = new Date(filters.dateTo);
      inclusiveEndDate.setHours(23, 59, 59, 999);
      if (new Date(req.requestedAt) > inclusiveEndDate) {
        return false;
      }
    }
    if (filters.amountMin && req.requestedAmount < filters.amountMin) {
      return false;
    }
    if (filters.amountMax && req.requestedAmount > filters.amountMax) {
      return false;
    }
    if (filters.preFundId === '__unlinked__') {
      const hasPaidAmount = (req.totalPaidAmount ?? 0) > 0;
      const hasPaidStatus = req.status === 'partially_paid' || isDownPaymentSettledStatus(req.status);
      if (!hasPaidAmount || !hasPaidStatus || (req.preFundNames?.length ?? 0) > 0) {
        return false;
      }
    }
    if (filters.preFundId === '__multiple__' && (req.preFundNames?.length ?? 0) < 2) {
      return false;
    }
    if (filters.preFundId && !['__unlinked__', '__multiple__'].includes(filters.preFundId)) {
      // The list receives resolved names for display. The page applies the
      // precise UUID filter before this shared export predicate.
      if (!(req as any).preFundIds?.includes(filters.preFundId)) return false;
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
        req.mmpName,
      ].filter(Boolean);
      if (!searchFields.some(f => f?.toLowerCase().includes(term))) {
        return false;
      }
    }
    return true;
  });
}

function getStatusLabel(status: string): string {
  const label = getDownPaymentStatusLabel(status);
  if (label !== 'Unknown' || !status) return label;
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
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

function getSiteCoverageLabel(request: DownPaymentRequest): string {
  const status = request.siteCompletionStatus?.trim().toLowerCase();
  if (status === 'completed' || status === 'wfp_confirmed' || status === 'confirmed') {
    return 'Covered / Completed';
  }
  if (status === 'not_covered' || status === 'rejected' || status === 'cancelled' || status === 'canceled') {
    return 'Not Covered';
  }
  if (!status) return 'Unknown';
  return 'Not Completed';
}

function getSiteStatusLabel(request: DownPaymentRequest): string {
  const status = request.siteCompletionStatus?.trim();
  if (!status) return 'Unknown';
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function getRemainingExplanation(
  request: DownPaymentRequest,
  evidenceByRequest?: DownPaymentEvidenceMap,
): string {
  const balance = balanceFor(request, evidenceByRequest);
  const classification = classifyDownPaymentStatus(request.status);
  if (classification === 'closed' || classification === 'deleted') {
    return 'Excluded historical record';
  }
  if (request.status === 'pending_supervisor' || request.status === 'pending_admin') {
    return 'Pending approval; no approved balance yet';
  }
  if (isDownPaymentSettledStatus(request.status) && balance.reconciliationRequired) {
    return 'Completed/settled status has an unpaid recorded balance; reconciliation required';
  }
  if (balance.remaining <= 0) return 'No outstanding approved balance';
  if (balance.paid <= 0) return 'Approved but unpaid; full approved amount outstanding';
  return 'Partially paid; unpaid approved balance outstanding';
}

export function exportToCSV(
  requests: DownPaymentRequest[],
  filename: string = 'down-payments',
  evidenceByRequest?: DownPaymentEvidenceMap,
): void {
  const headers = [
    'Request ID',
    'MMP',
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
    'Remaining Includes',
    'Status',
    'Site Coverage',
    'Site System Status',
    'Payment Basis',
    'Reconciliation',
    'Supervisor Status',
    'Admin Status',
    'Rejection Reason',
    'Justification',
  ];

  const rows = requests.map(req => {
    const balance = balanceFor(req, evidenceByRequest);
    return [
      req.id,
      req.mmpName || 'N/A',
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
      balance.approved,
      balance.paid,
      balance.remaining,
      getRemainingExplanation(req, evidenceByRequest),
      getStatusLabel(req.status),
      getSiteCoverageLabel(req),
      getSiteStatusLabel(req),
      balance.paymentBasis,
      balance.reconciliationRequired ? (balance.reconciliationReason || 'Required') : '',
      req.supervisorStatus ? (req.supervisorStatus === 'pending' ? 'Pending' : getStatusLabel(req.supervisorStatus)) : 'Pending',
      req.adminStatus ? (req.adminStatus === 'pending' ? 'Pending' : getStatusLabel(req.adminStatus)) : 'Pending',
      req.supervisorRejectionReason || req.adminRejectionReason || '',
      req.justification || '',
    ];
  });

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

export async function exportToExcel(
  requests: DownPaymentRequest[],
  filename: string = 'down-payments',
  tabLabel: string = 'All',
  evidenceByRequest?: DownPaymentEvidenceMap,
): Promise<void> {
  const totalRequested = requests.reduce((s, r) => s + r.requestedAmount, 0);
  const excelBalances = requests.map(req => balanceFor(req, evidenceByRequest));
  const totalApproved = excelBalances.reduce((s, balance) => s + balance.approved, 0);
  const totalPaid = excelBalances.reduce((s, balance) => s + balance.paid, 0);
  const totalRemaining = excelBalances.reduce((s, balance) => s + balance.remaining, 0);
  const headers = [
    '#', 'Request ID', 'MMP', 'Requester Name', 'Requester Role', 'Data Collector', 'Coordinator', 'Site Name', 'State', 'Locality', 'Hub',
    'Activity Type', 'CP Name', 'Requested At', 'Transportation Budget (SDG)',
    'Requested Amount (SDG)', 'Approval Type', 'Approval %', 'Approved Amount (SDG)',
    'Paid Amount (SDG)', 'Remaining (SDG)', 'Remaining Includes', 'Status',
    'Site Coverage', 'Site System Status', 'Payment Type',
    'Payment Basis', 'Reconciliation',
    'Supervisor Status', 'Supervisor Approved By', 'Supervisor Approved At',
    'Supervisor Notes', 'Admin Status', 'Admin Processed By', 'Admin Processed At',
    'Admin Notes', 'Justification',
  ];

  const dataRows = requests.map((req, idx) => {
    const balance = balanceFor(req, evidenceByRequest);
    return [
      idx + 1,
      req.id,
      req.mmpName || 'N/A',
      req.requestedByName || 'Unknown',
      req.requesterRole === 'coordinator' ? 'Coordinator' : 'Data Collector',
      req.dataCollectorName || (req.requesterRole === 'dataCollector' ? req.requestedByName : undefined) || 'Unassigned',
      req.coordinatorName || (req.requesterRole === 'coordinator' ? req.requestedByName : undefined) || 'Unassigned',
      req.siteName,
      req.stateName || 'N/A',
      req.localityName || 'N/A',
      req.hubName || 'N/A',
      req.activityType || 'N/A',
      req.projectName || 'N/A',
      format(new Date(req.requestedAt), 'yyyy-MM-dd HH:mm'),
      req.totalTransportationBudget,
      req.requestedAmount,
      req.approvalType ? getApprovalTypeLabel(req.approvalType) : 'Pending',
      req.approvalPercentage ? `${req.approvalPercentage}%` : (req.approvalType === 'full' ? '100%' : 'N/A'),
      balance.approved,
      balance.paid,
      balance.remaining,
      getRemainingExplanation(req, evidenceByRequest),
      getStatusLabel(req.status),
      getSiteCoverageLabel(req),
      getSiteStatusLabel(req),
      req.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
      balance.paymentBasis,
      balance.reconciliationRequired ? (balance.reconciliationReason || 'Required') : '',
      req.supervisorStatus ? (req.supervisorStatus === 'pending' ? 'Pending' : getStatusLabel(req.supervisorStatus)) : 'Pending',
      req.supervisorApprovedByName || req.supervisorApprovedBy || 'N/A',
      req.supervisorApprovedAt ? format(new Date(req.supervisorApprovedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
      req.supervisorNotes || '',
      req.adminStatus ? (req.adminStatus === 'pending' ? 'Pending' : getStatusLabel(req.adminStatus)) : 'Pending',
      req.adminProcessedByName || req.adminProcessedBy || 'N/A',
      req.adminProcessedAt ? format(new Date(req.adminProcessedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
      req.adminNotes || '',
      req.justification || '',
    ];
  });
  const totalBudget = requests.reduce((s, r) => s + r.totalTransportationBudget, 0);
  const emptyRow: string[] = Array(headers.length).fill('');
  const totalsRow = [...emptyRow];
  totalsRow[12] = 'TOTALS:';
  totalsRow[14] = totalBudget as any;
  totalsRow[15] = totalRequested as any;
  totalsRow[18] = totalApproved as any;
  totalsRow[19] = totalPaid as any;
  totalsRow[20] = totalRemaining as any;
  const summaryRows = (status: string) => requests.filter(r => r.status === status);
  const summaryAmount = (status: string, rows: DownPaymentRequest[]) => rows.reduce((sum, row) => {
    const balance = balanceFor(row, evidenceByRequest);
    if (status === 'pending_supervisor' || status === 'pending_admin') return sum + row.requestedAmount;
    if (status === 'approved') return sum + balance.approved;
    return sum + balance.paid;
  }, 0);
  const summaryData = [
    ['Category', 'Count', 'Amount (SDG)'],
    ['Total Requests (includes history)', requests.length, totalRequested],
    ...(['pending_supervisor', 'pending_admin', 'approved', 'partially_paid', 'fully_paid', 'paid', 'reconciled', 'completed', 'closed', 'rejected', 'cancelled', 'deleted'] as const).map(status => [
      getDownPaymentStatusLabel(status),
      summaryRows(status).length,
      summaryAmount(status, summaryRows(status)),
    ]),
    ['Note', 'Requested totals include rejected/cancelled history', ''],
    ['', 'Total Approved', totalApproved],
    ['', 'Total Paid', totalPaid],
    ['', 'Remaining', totalRemaining],
  ];
  const hubGroups = new Map<string, { count: number; requested: number; approved: number; paid: number; remaining: number }>();
  requests.forEach(r => {
    const hub = r.hubName || 'Unknown';
    const existing = hubGroups.get(hub) || { count: 0, requested: 0, approved: 0, paid: 0, remaining: 0 };
    const balance = balanceFor(r, evidenceByRequest);
    existing.count++;
    existing.requested += r.requestedAmount;
    existing.approved += balance.approved;
    existing.paid += balance.paid;
    existing.remaining += balance.remaining;
    hubGroups.set(hub, existing);
  });
  const hubData: (string | number)[][] = [
    ['Hub', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Paid (SDG)', 'Remaining (SDG)'],
  ];
  hubGroups.forEach((v, k) => {
    hubData.push([k, v.count, v.requested, v.approved, v.paid, v.remaining]);
  });

  type BreakdownTotals = {
    count: number;
    requested: number;
    approved: number;
    paid: number;
    remaining: number;
  };
  const addBreakdownRow = (
    groups: Map<string, BreakdownTotals>,
    key: string,
    request: DownPaymentRequest,
  ) => {
    const balance = balanceFor(request, evidenceByRequest);
    const totals = groups.get(key) ?? { count: 0, requested: 0, approved: 0, paid: 0, remaining: 0 };
    totals.count += 1;
    totals.requested += request.requestedAmount;
    totals.approved += balance.approved;
    totals.paid += balance.paid;
    totals.remaining += balance.remaining;
    groups.set(key, totals);
  };

  const statusOrder = [
    'pending_supervisor', 'pending_admin', 'approved', 'partially_paid',
    'fully_paid', 'paid', 'reconciled', 'completed', 'closed',
    'rejected', 'cancelled', 'deleted',
  ];
  const observedAdditionalStatuses = [...new Set(requests.map(request => request.status))]
    .filter(status => !statusOrder.includes(status))
    .sort((a, b) => a.localeCompare(b));
  const exportStatusOrder = [...statusOrder, ...observedAdditionalStatuses];
  const states = [...new Set(requests.map(request => request.stateName || 'Unknown'))]
    .sort((a, b) => a.localeCompare(b));
  const stateStatusGroups = new Map<string, BreakdownTotals>();
  requests.forEach(request => {
    addBreakdownRow(
      stateStatusGroups,
      `${request.stateName || 'Unknown'}\u0000${request.status}`,
      request,
    );
  });
  const stateStatusRows: (string | number)[][] = [];
  states.forEach(state => {
    const stateTotals: BreakdownTotals = { count: 0, requested: 0, approved: 0, paid: 0, remaining: 0 };
    exportStatusOrder.forEach(status => {
      const totals = stateStatusGroups.get(`${state}\u0000${status}`);
      if (!totals || totals.count === 0) return;
      stateStatusRows.push([
        state,
        getStatusLabel(status),
        totals.count,
        totals.requested,
        totals.approved,
        totals.paid,
        totals.remaining,
      ]);
      stateTotals.count += totals.count;
      stateTotals.requested += totals.requested;
      stateTotals.approved += totals.approved;
      stateTotals.paid += totals.paid;
      stateTotals.remaining += totals.remaining;
    });
    stateStatusRows.push([
      state,
      'STATE SUBTOTAL',
      stateTotals.count,
      stateTotals.requested,
      stateTotals.approved,
      stateTotals.paid,
      stateTotals.remaining,
    ]);
  });

  const siteStatusGroups = new Map<string, BreakdownTotals>();
  requests.forEach(request => {
    addBreakdownRow(
      siteStatusGroups,
      `${request.stateName || 'Unknown'}\u0000${getSiteCoverageLabel(request)}\u0000${getSiteStatusLabel(request)}`,
      request,
    );
  });
  const siteStatusRows = [...siteStatusGroups.entries()]
    .map(([key, totals]) => {
      const [state, coverage, siteStatus] = key.split('\u0000');
      return [
        state, coverage, siteStatus, totals.count, totals.requested,
        totals.approved, totals.paid, totals.remaining,
      ] as (string | number)[];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));

  const buildPersonRows = (
    role: 'dataCollector' | 'coordinator',
  ): (string | number)[][] => {
    const grouped = new Map<string, BreakdownTotals>();
    requests.forEach(request => {
      const state = request.stateName || 'Unknown';
      const person = role === 'dataCollector'
        ? request.dataCollectorName || (request.requesterRole === 'dataCollector' ? request.requestedByName : undefined) || 'Unassigned'
        : request.coordinatorName || (request.requesterRole === 'coordinator' ? request.requestedByName : undefined) || 'Unassigned';
      addBreakdownRow(grouped, `${state}\u0000${person}`, request);
    });
    const rows: (string | number)[][] = [];
    states.forEach(state => {
      const stateTotals: BreakdownTotals = { count: 0, requested: 0, approved: 0, paid: 0, remaining: 0 };
      [...grouped.entries()]
        .filter(([key]) => key.startsWith(`${state}\u0000`))
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, totals]) => {
          const person = key.split('\u0000')[1];
          rows.push([state, person, totals.count, totals.requested, totals.approved, totals.paid, totals.remaining]);
          stateTotals.count += totals.count;
          stateTotals.requested += totals.requested;
          stateTotals.approved += totals.approved;
          stateTotals.paid += totals.paid;
          stateTotals.remaining += totals.remaining;
        });
      rows.push([
        state,
        'STATE SUBTOTAL',
        stateTotals.count,
        stateTotals.requested,
        stateTotals.approved,
        stateTotals.paid,
        stateTotals.remaining,
      ]);
    });
    return rows;
  };
  const dataCollectorRows = buildPersonRows('dataCollector');
  const coordinatorRows = buildPersonRows('coordinator');
  await exportStandardExcel({
    reportTitle: 'PACT Command Center - Down-Payment Requests Report',
    subtitleLine: `Tab: ${tabLabel} | Total Requests: ${requests.length}`,
    metaLine: `Total Requested: ${formatCurrency(totalRequested)} | Total Approved: ${formatCurrency(totalApproved)} | Total Paid: ${formatCurrency(totalPaid)} | Remaining: ${formatCurrency(totalRemaining)}`,
    filenamePrefix: filename,
    mainSheet: {
      sheetName: 'Down Payments',
      headers,
      rows: dataRows,
      totalsRow,
      colWidths: headers.map((_, index) => index === 0 ? 5 : index === 3 ? 22 : 16),
    },
    summarySheet: {
      title: 'Summary Statistics',
      rows: summaryData,
      colWidths: [28, 18, 24],
    },
    breakdownSheets: [
      {
        title: 'Breakdown by Hub',
        sheetName: 'By Hub',
        headers: hubData[0].map(String),
        rows: hubData.slice(1),
        colWidths: [22, 12, 20, 20, 20, 20],
      },
      {
        title: 'Down-Payment Totals by Data Collector and State',
        sheetName: 'By Data Collector',
        headers: ['State', 'Data Collector', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Paid (SDG)', 'Remaining (SDG)'],
        rows: dataCollectorRows,
        colWidths: [22, 28, 12, 20, 20, 20, 20],
      },
      {
        title: 'Down-Payment Totals by Coordinator and State',
        sheetName: 'By Coordinator',
        headers: ['State', 'Coordinator', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Paid (SDG)', 'Remaining (SDG)'],
        rows: coordinatorRows,
        colWidths: [22, 28, 12, 20, 20, 20, 20],
      },
      {
        title: 'Breakdown by State and Request Status',
        sheetName: 'By State & Status',
        headers: ['State', 'Request Status', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Paid (SDG)', 'Remaining (SDG)'],
        rows: stateStatusRows,
        colWidths: [22, 24, 12, 20, 20, 20, 20],
      },
      {
        title: 'Breakdown by State and Site Completion Status',
        sheetName: 'By Site Status',
        headers: ['State', 'Site Coverage', 'Site System Status', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Paid (SDG)', 'Remaining (SDG)'],
        rows: siteStatusRows,
        colWidths: [22, 22, 22, 12, 20, 20, 20, 20],
      },
    ],
  });
}

export function exportToPDF(
  requests: DownPaymentRequest[],
  config: DownPaymentReportConfig,
  evidenceByRequest?: DownPaymentEvidenceMap,
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
  const pdfBalances = requests.map(req => balanceFor(req, evidenceByRequest));
  const totalApproved = pdfBalances.reduce((sum, balance) => sum + balance.approved, 0);
  const totalPaid = pdfBalances.reduce((sum, balance) => sum + balance.paid, 0);
  const totalRemaining = pdfBalances.reduce((sum, balance) => sum + balance.remaining, 0);

  const summaryY = config.reportNotes ? 40 : 34;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary:', 14, summaryY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Requested: ${formatCurrency(totalRequested)}`, 14, summaryY + 5);
  doc.text(`Total Approved: ${formatCurrency(totalApproved)}`, 80, summaryY + 5);
  doc.text(`Total Paid: ${formatCurrency(totalPaid)}`, 146, summaryY + 5);
  doc.text(`Total Remaining: ${formatCurrency(totalRemaining)}`, 212, summaryY + 5);

  const tableData = requests.map(req => {
    const balance = balanceFor(req, evidenceByRequest);
    return [
      req.siteName.substring(0, 25) + (req.siteName.length > 25 ? '...' : ''),
      req.mmpName ? (req.mmpName.substring(0, 20) + (req.mmpName.length > 20 ? '...' : '')) : '-',
      req.hubName || '-',
      req.stateName || '-',
      formatCurrency(req.requestedAmount),
      formatCurrency(balance.approved),
      formatCurrency(balance.paid),
      formatCurrency(balance.remaining),
      getStatusLabel(req.status),
      balance.paymentBasis,
      balance.reconciliationRequired ? 'Required' : '',
      format(new Date(req.requestedAt), 'yyyy-MM-dd'),
    ];
  });

  autoTable(doc, {
    head: [['Site', 'MMP', 'Hub', 'State', 'Requested', 'Approved', 'Paid', 'Remaining', 'Status', 'Payment Basis', 'Reconciliation', 'Date']],
    body: tableData,
    startY: summaryY + 12,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' },
      7: { cellWidth: 28, halign: 'right' },
      8: { cellWidth: 30 },
      9: { cellWidth: 30 },
      10: { cellWidth: 24 },
      11: { cellWidth: 24 },
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

export function getDownPaymentStats(
  requests: DownPaymentRequest[],
  getPaidAmount: (request: DownPaymentRequest) => number = request => request.totalPaidAmount || 0,
  evidenceByRequest?: DownPaymentEvidenceMap,
) {
  const pendingSupervisor = requests.filter(r => r.status === 'pending_supervisor').length;
  const pendingAdmin = requests.filter(r => r.status === 'pending_admin').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;
  const cancelled = requests.filter(r => r.status === 'cancelled').length;
  const deleted = requests.filter(r => r.status === 'deleted').length;
  const partiallyPaid = requests.filter(r => r.status === 'partially_paid').length;
  const fullyPaid = requests.filter(r => r.status === 'fully_paid').length;
  const paid = requests.filter(r => r.status === 'paid').length;
  const reconciled = requests.filter(r => r.status === 'reconciled').length;
  const completed = requests.filter(r => r.status === 'completed').length;
  const closed = requests.filter(r => r.status === 'closed').length;
  const unknown = requests.filter(r => classifyDownPaymentStatus(r.status) === 'unknown').length;
  const totalRequested = requests.reduce((sum, r) => sum + r.requestedAmount, 0);
  const balances = requests.map(request => getDownPaymentBalance({
    ...request,
    // Preserve the optional historical callback while using the canonical
    // per-row formula for all totals.
    totalPaidAmount: getPaidAmount(request),
  }, evidenceByRequest?.get(request.id) ?? []));
  const totalApproved = balances.reduce((sum, balance) => sum + balance.approved, 0);
  const totalPaid = balances.reduce((sum, balance) => sum + balance.paid, 0);
  const totalRemaining = balances.reduce((sum, balance) => sum + balance.remaining, 0);
  const paidRequests = requests.filter((request, index) => balances[index].paid > 0 && balances[index].approved > 0);
  const totalPendingAmount = requests
    .filter(r => r.status === 'pending_supervisor' || r.status === 'pending_admin')
    .reduce((sum, r) => sum + r.requestedAmount, 0);

  return {
    counts: {
      total: requests.length,
      pendingSupervisor,
      pendingAdmin,
      approved,
      rejected,
      cancelled,
      deleted,
      partiallyPaid,
      fullyPaid,
      paid: paidRequests.length,
      reconciled,
      completed,
      closed,
      unknown,
    },
    amounts: {
      totalRequested,
      totalApproved,
      totalPaid,
      totalRemaining,
      totalPendingAmount,
    },
  };
}
