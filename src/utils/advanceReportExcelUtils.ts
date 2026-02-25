import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, parseISO } from 'date-fns';

const NAVY = 'FF0F2041';
const NAVY_MID = 'FF1E3A5F';
const BLUE = 'FF2962FF';
const WHITE = 'FFFFFFFF';
const LIGHT_BG = 'FFF5F7FC';
const BORDER_COLOR = 'FFC8CDD7';
const DARK = 'FF14141E';
const GREEN = 'FF107838';
const GREEN_BG = 'FFE4F5EB';
const AMBER = 'FFB47800';
const AMBER_BG = 'FFFFF8E6';
const RED = 'FFB42828';
const RED_BG = 'FFFFF0F0';

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER_COLOR } };
  return { top: side, bottom: side, left: side, right: side };
}

function headerFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
}

function headerFont(sz = 10): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: WHITE }, size: sz, name: 'Calibri' };
}

function bodyFont(sz = 10, color = DARK): Partial<ExcelJS.Font> {
  return { size: sz, name: 'Calibri', color: { argb: color } };
}

function totalFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
}

function altFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BG } };
}

function greenFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
}

function greenFont(): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };
}

function autoFitColumns(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value?.toString() || '';
      maxLen = Math.max(maxLen, val.length + 2);
    });
    col.width = Math.min(maxLen, 40);
  });
}

function getStatusColor(status: string): { font: string; bg: string } {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('paid') || s.includes('completed') || s.includes('reconciled')) return { font: GREEN, bg: GREEN_BG };
  if (s.includes('pending') || s.includes('review') || s.includes('partial')) return { font: AMBER, bg: AMBER_BG };
  if (s.includes('rejected') || s.includes('denied') || s.includes('cancelled')) return { font: RED, bg: RED_BG };
  return { font: DARK, bg: LIGHT_BG };
}

function addTitle(ws: ExcelJS.Worksheet, title: string, colSpan: number) {
  const row = ws.addRow([title]);
  row.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  row.height = 26;
  if (colSpan > 1) ws.mergeCells(row.number, 1, row.number, colSpan);
  return row;
}

function addSubtitle(ws: ExcelJS.Worksheet, text: string, colSpan: number) {
  const row = ws.addRow([text]);
  row.font = bodyFont(10, 'FF5A5F6E');
  row.height = 18;
  if (colSpan > 1) ws.mergeCells(row.number, 1, row.number, colSpan);
}

function addHeaderRow(ws: ExcelJS.Worksheet, headers: string[]): ExcelJS.Row {
  const row = ws.addRow(headers);
  row.eachCell((cell, ci) => {
    cell.fill = headerFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle', wrapText: true };
  });
  row.height = 24;
  return row;
}

function addDataRow(ws: ExcelJS.Worksheet, data: (string | number)[], rowIndex: number, statusColIndex?: number): ExcelJS.Row {
  const row = ws.addRow(data);
  row.eachCell((cell, ci) => {
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle', wrapText: true };
    cell.font = bodyFont(10);
    if (rowIndex % 2 === 1) cell.fill = altFill();
  });
  if (statusColIndex !== undefined) {
    const statusCell = row.getCell(statusColIndex);
    const colors = getStatusColor(statusCell.value?.toString() || '');
    statusCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: colors.font } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
  }
  row.height = 20;
  return row;
}

function addTotalRow(ws: ExcelJS.Worksheet, data: (string | number)[], useGreen = false): ExcelJS.Row {
  const row = ws.addRow(data);
  row.eachCell((cell, ci) => {
    cell.fill = useGreen ? greenFill() : totalFill();
    cell.font = useGreen ? greenFont() : { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });
  row.height = 24;
  return row;
}

interface AdvanceRequest {
  requestedAt: string;
  requestedBy: string;
  siteName: string;
  hubName?: string | null;
  stateName?: string | null;
  projectName?: string | null;
  mmpName?: string | null;
  requestedAmount: number;
  status: string;
  totalPaidAmount?: number;
  remainingAmount?: number;
  paymentType?: string;
  justification?: string;
}

interface Stats {
  totalCount: number;
  totalRequested: number;
  totalApproved: number;
  totalPending: number;
  totalRejected: number;
  totalPaid: number;
}

interface GroupItem {
  name: string;
  requests: number;
  totalRequested: number;
  totalApproved: number;
  pending?: number;
}

interface AgingBucket {
  label: string;
  count: number;
  total: number;
}

interface AgingData {
  totalCount: number;
  totalAmount: number;
  buckets: Record<string, AgingBucket>;
  items: Array<{
    requester: string;
    amount: number;
    daysOutstanding: number;
    siteName: string;
    projectName?: string;
    hubName?: string;
    bucket?: string;
    status?: string;
    requestDate?: string;
  }>;
}

export async function exportOverviewToFormattedExcel(
  filteredRequests: AdvanceRequest[],
  stats: Stats,
  getProfileName: (id: string) => string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const ws = wb.addWorksheet('Advance Requests');
  addTitle(ws, 'Transportation Advance Cost Report', 10);
  addSubtitle(ws, `Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm')}`, 10);
  ws.addRow([]);

  const summHeaders = ['Metric', 'Value'];
  const summHdr = ws.addRow(summHeaders);
  summHdr.eachCell(cell => {
    cell.fill = headerFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  summHdr.height = 22;

  const summaryPairs = [
    ['Total Requests', stats.totalCount],
    ['Total Requested (SDG)', stats.totalRequested.toLocaleString()],
    ['Total Approved (SDG)', stats.totalApproved.toLocaleString()],
    ['Total Pending (SDG)', stats.totalPending.toLocaleString()],
    ['Total Rejected (SDG)', stats.totalRejected.toLocaleString()],
    ['Total Paid (SDG)', stats.totalPaid.toLocaleString()],
  ];

  summaryPairs.forEach(([label, value], i) => {
    const row = ws.addRow([label, value]);
    row.eachCell(cell => {
      cell.border = thinBorder();
      cell.font = bodyFont(10);
      cell.alignment = { vertical: 'middle' };
      if (i % 2 === 1) cell.fill = altFill();
    });
    row.height = 20;
  });

  ws.addRow([]);

  const headers = ['Request Date', 'Requested By', 'Site Name', 'MMP', 'Hub', 'Requested (SDG)', 'Status', 'Paid (SDG)', 'Remaining (SDG)', 'Payment Type', 'Justification'];
  addHeaderRow(ws, headers);

  filteredRequests.forEach((req, i) => {
    addDataRow(ws, [
      format(parseISO(req.requestedAt), 'yyyy-MM-dd HH:mm'),
      getProfileName(req.requestedBy),
      req.siteName,
      req.mmpName || 'N/A',
      req.hubName || 'N/A',
      req.requestedAmount.toLocaleString(),
      req.status.replace(/_/g, ' ').toUpperCase(),
      (req.totalPaidAmount || 0).toLocaleString(),
      (req.remainingAmount || 0).toLocaleString(),
      req.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
      req.justification || '',
    ], i, 7);
  });

  addTotalRow(ws, [
    '', '', '', '', 'TOTALS',
    stats.totalRequested.toLocaleString(),
    '',
    stats.totalPaid.toLocaleString(),
    '', '', ''
  ], true);

  autoFitColumns(ws);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `transportation_advance_cost_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export async function exportAgingToFormattedExcel(
  agingData: AgingData
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const ws = wb.addWorksheet('Aging Summary');
  addTitle(ws, 'Advance Aging Report', 3);
  addSubtitle(ws, `Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm')}`, 3);
  ws.addRow([]);

  addHeaderRow(ws, ['Aging Bucket', 'Count', 'Total Amount (SDG)']);

  Object.entries(agingData.buckets).forEach(([, b], i) => {
    addDataRow(ws, [b.label, b.count, b.total.toLocaleString()], i);
  });

  addTotalRow(ws, ['TOTAL', agingData.totalCount, agingData.totalAmount.toLocaleString()], true);

  autoFitColumns(ws);

  const ws2 = wb.addWorksheet('Aging Details');
  addTitle(ws2, 'Aging Details', 9);
  ws2.addRow([]);

  addHeaderRow(ws2, ['Requester', 'Hub', 'Amount (SDG)', 'Request Date', 'Days Outstanding', 'Aging Bucket', 'Status', 'Site', 'Project']);

  agingData.items.forEach((item, i) => {
    addDataRow(ws2, [
      item.requester,
      item.hubName || 'N/A',
      item.amount.toLocaleString(),
      item.requestDate || 'N/A',
      item.daysOutstanding,
      item.bucket || '',
      item.status || '',
      item.siteName,
      item.projectName || 'N/A'
    ], i, 7);
  });

  autoFitColumns(ws2);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `advance_aging_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export async function exportGroupedToFormattedExcel(
  groupName: string,
  groupData: GroupItem[],
  filteredRequests: AdvanceRequest[],
  getProfileName: (id: string) => string,
  filename: string,
  groupField: (req: AdvanceRequest) => string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Summary by ${groupName}`);
  addTitle(ws, `Advance Requests by ${groupName}`, 5);
  addSubtitle(ws, `Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm')}`, 5);
  ws.addRow([]);

  const hasP = groupData.some(g => g.pending !== undefined);
  const summHeaders = hasP
    ? [groupName, 'Total Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending Requests']
    : [groupName, 'Total Requests', 'Total Requested (SDG)', 'Total Approved (SDG)'];
  addHeaderRow(ws, summHeaders);

  const totals = groupData.reduce((acc, g) => ({
    requests: acc.requests + g.requests,
    totalRequested: acc.totalRequested + g.totalRequested,
    totalApproved: acc.totalApproved + g.totalApproved,
    pending: acc.pending + (g.pending || 0),
  }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });

  groupData.forEach((g, i) => {
    const data: (string | number)[] = [g.name, g.requests, g.totalRequested.toLocaleString(), g.totalApproved.toLocaleString()];
    if (hasP) data.push(g.pending || 0);
    addDataRow(ws, data, i);
  });

  const totalData: (string | number)[] = ['SUBTOTAL', totals.requests, totals.totalRequested.toLocaleString(), totals.totalApproved.toLocaleString()];
  if (hasP) totalData.push(totals.pending);
  addTotalRow(ws, totalData, true);

  autoFitColumns(ws);

  const ws2 = wb.addWorksheet('All Requests');
  addTitle(ws2, 'All Requests - Details', 10);
  ws2.addRow([]);

  addHeaderRow(ws2, [groupName, 'Request Date', 'Requested By', 'Site', 'MMP', 'Hub', 'Amount (SDG)', 'Status', 'Paid (SDG)', 'Remaining (SDG)']);

  filteredRequests.forEach((req, i) => {
    addDataRow(ws2, [
      groupField(req),
      format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      getProfileName(req.requestedBy),
      req.siteName,
      req.mmpName || 'N/A',
      req.hubName || 'N/A',
      req.requestedAmount.toLocaleString(),
      req.status.replace(/_/g, ' ').toUpperCase(),
      (req.totalPaidAmount || 0).toLocaleString(),
      (req.remainingAmount || 0).toLocaleString(),
    ], i, 8);
  });

  autoFitColumns(ws2);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
