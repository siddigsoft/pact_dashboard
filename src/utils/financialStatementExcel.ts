import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { StatementRow, StatementConfig } from './financialStatementPdf';

function fmtDate(d: string | null | undefined): string {
  if (!d) return 'N/A';
  try {
    return format(new Date(d), 'MMM d, yyyy HH:mm');
  } catch {
    return d;
  }
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function generateFinancialStatementExcel(
  rows: StatementRow[],
  config: StatementConfig
): void {
  if (rows.length === 0) return;

  const cur = config.currency || 'SDG';
  const isTransport = config.statementType === 'transport_advance';

  const totalRequested = rows.reduce((s, r) => s + r.requestedAmount, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approvedAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);

  const summaryData = [
    ['PACT Command Center - Financial Statement'],
    [`Statement Type: ${config.title}`],
    [`Status Filter: ${fmtStatus(config.statusFilter)}`],
    [`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`],
    config.dateRange?.from || config.dateRange?.to
      ? [`Period: ${config.dateRange?.from || 'All'} — ${config.dateRange?.to || 'Present'}`]
      : [],
    [],
    ['SUMMARY'],
    ['Total Transactions', rows.length],
    [`Total Requested (${cur})`, totalRequested],
    [`Total Approved (${cur})`, totalApproved],
    [`Total Paid (${cur})`, totalPaid],
    [],
  ].filter(r => r.length > 0);

  const detailData = rows.map((r, idx) => {
    const base: Record<string, any> = {
      '#': idx + 1,
      'Reference ID': r.refId,
      'Date': fmtDate(r.date),
      'Requester': r.requester,
    };

    if (isTransport) {
      base['Site'] = r.site || r.description || '';
      base['Hub'] = r.hub || '';
      base['State'] = r.state || '';
      base[`Requested (${cur})`] = r.requestedAmount;
      base[`Approved (${cur})`] = r.approvedAmount;
      base[`Paid (${cur})`] = r.paidAmount;
    } else {
      base['Category'] = r.category || '';
      base['Description'] = r.description || '';
      base[`Amount (${cur})`] = r.requestedAmount;
      base[`Approved (${cur})`] = r.approvedAmount;
    }

    base['Status'] = fmtStatus(r.status);
    base['Status (Arabic)'] = r.statusAr || '';
    base['T1 Approver'] = r.t1Approver || 'N/A';
    base['T1 Date'] = r.t1Date ? fmtDate(r.t1Date) : 'N/A';
    base['T1 Status'] = r.t1Status ? fmtStatus(r.t1Status) : 'N/A';
    base['T2 Approver'] = r.t2Approver || 'N/A';
    base['T2 Date'] = r.t2Date ? fmtDate(r.t2Date) : 'N/A';
    base['T2 Status'] = r.t2Status ? fmtStatus(r.t2Status) : 'N/A';
    base['Rejection Reason'] = r.rejectionReason || '';
    base['Notes'] = r.notes || '';

    return base;
  });

  const wb = XLSX.utils.book_new();

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  if (detailData.length > 0) {
    const detailWs = XLSX.utils.json_to_sheet(detailData);
    const colWidths = Object.keys(detailData[0]).map(k => ({
      wch: Math.max(k.length + 2, 16),
    }));
    detailWs['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, detailWs, 'Transactions');
  }

  const totalsData = [
    {
      'Metric': 'Total Transactions',
      'Value': rows.length,
    },
    {
      'Metric': `Total Requested (${cur})`,
      'Value': totalRequested,
    },
    {
      'Metric': `Total Approved (${cur})`,
      'Value': totalApproved,
    },
    {
      'Metric': `Total Paid (${cur})`,
      'Value': totalPaid,
    },
  ];

  const statusBreakdown: Record<string, { count: number; amount: number }> = {};
  rows.forEach(r => {
    const s = fmtStatus(r.status);
    if (!statusBreakdown[s]) statusBreakdown[s] = { count: 0, amount: 0 };
    statusBreakdown[s].count++;
    statusBreakdown[s].amount += r.requestedAmount;
  });

  Object.entries(statusBreakdown).forEach(([status, data]) => {
    totalsData.push({
      'Metric': `${status} Count`,
      'Value': data.count,
    });
    totalsData.push({
      'Metric': `${status} Amount (${cur})`,
      'Value': data.amount,
    });
  });

  const totalsWs = XLSX.utils.json_to_sheet(totalsData);
  totalsWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, totalsWs, 'Totals');

  const statusClean = config.statusFilter.replace(/\s+/g, '_');
  const typeLabel = config.statementType === 'transport_advance' ? 'Transport-Advance' : 'Operational-Cost';
  XLSX.writeFile(wb, `${typeLabel}-Statement-${statusClean}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
