import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { StatementRow, StatementConfig } from './financialStatementPdf';

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

function subHeaderFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_MID } };
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

function sectionFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
}

// Explicit column widths for transport statement (Financial Statement sheet, 12 cols — incl. State)
const TRANSPORT_WIDTHS_SUMMARY = [5, 22, 13, 26, 16, 14, 15, 15, 11, 26, 18, 12];
// Explicit column widths for transport Full Details sheet (26 cols — incl. MMP, Locality, Activity, Budget, Approval Type, Payment Type, Justification)
const TRANSPORT_WIDTHS_DETAIL = [5, 22, 13, 26, 16, 14, 13, 22, 14, 16, 14, 16, 13, 14, 14, 11, 12, 26, 13, 13, 18, 13, 13, 20, 26, 18];
// Explicit column widths for operational cost (Financial Statement sheet, 11 cols — inc. Project)
const OPCOST_WIDTHS_SUMMARY = [5, 22, 13, 26, 22, 16, 15, 15, 26, 18, 12];
// Explicit column widths for operational cost Full Details (18 cols — inc. Project)
const OPCOST_WIDTHS_DETAIL = [5, 22, 13, 26, 22, 16, 22, 14, 14, 12, 26, 13, 13, 18, 13, 13, 20, 18];

function applyColWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function getStatusColor(status: string): { font: string; bg: string } {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('paid') || s.includes('completed')) return { font: GREEN, bg: GREEN_BG };
  if (s.includes('pending') || s.includes('review')) return { font: AMBER, bg: AMBER_BG };
  if (s.includes('rejected') || s.includes('denied')) return { font: RED, bg: RED_BG };
  return { font: DARK, bg: LIGHT_BG };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return 'N/A';
  try {
    return format(new Date(d), 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtCurrency(amount: number, cur: string = 'SDG'): string {
  return `${cur} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function buildStatementWorkbook(
  rows: StatementRow[],
  config: StatementConfig
): { wb: ExcelJS.Workbook; filename: string } | null {
  if (rows.length === 0) return null;

  const cur = config.currency || 'SDG';
  const isTransport = config.statementType === 'transport_advance';
  const refNum = `STMT-${format(new Date(), 'yyyyMMdd-HHmm')}`;

  const totalRequested = rows.reduce((s, r) => s + r.requestedAmount, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approvedAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);

  const statusLabel = fmtStatus(config.statusFilter);
  const typeLabel = isTransport ? 'Transport-Advance' : 'Operational-Cost';
  const totalCols = isTransport ? 12 : 11; // transport: 12 cols (incl. State), operational: 11 cols (with Project)

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const ws = wb.addWorksheet('Financial Statement');

  const titleRow = ws.addRow(['PACT Command Center  |  Financial Statement']);
  titleRow.font = { bold: true, size: 16, name: 'Calibri', color: { argb: NAVY } };
  titleRow.height = 30;
  ws.mergeCells(titleRow.number, 1, titleRow.number, totalCols);

  const subtitleRow = ws.addRow([`${config.title}  —  ${statusLabel} Statement`]);
  subtitleRow.font = { bold: true, size: 13, name: 'Calibri', color: { argb: BLUE } };
  subtitleRow.height = 22;
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, totalCols);

  const refRow = ws.addRow([`Statement Reference: ${refNum}`]);
  refRow.font = bodyFont(10, 'FF5A5F6E');
  refRow.height = 16;
  ws.mergeCells(refRow.number, 1, refRow.number, totalCols);

  const genRow = ws.addRow([`Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm')}`]);
  genRow.font = bodyFont(10, 'FF5A5F6E');
  genRow.height = 16;
  ws.mergeCells(genRow.number, 1, genRow.number, totalCols);

  if (config.generatedBy) {
    const byRow = ws.addRow([`Generated By: ${config.generatedBy}`]);
    byRow.font = bodyFont(10, 'FF5A5F6E');
    byRow.height = 16;
    ws.mergeCells(byRow.number, 1, byRow.number, totalCols);
  }

  if (config.dateRange?.from || config.dateRange?.to) {
    const periodRow = ws.addRow([`Statement Period: ${config.dateRange?.from ? fmtDate(config.dateRange.from) : 'All'} — ${config.dateRange?.to ? fmtDate(config.dateRange.to) : 'Present'}`]);
    periodRow.font = bodyFont(10, 'FF5A5F6E');
    periodRow.height = 16;
    ws.mergeCells(periodRow.number, 1, periodRow.number, totalCols);
  }

  ws.addRow([]).height = 6;

  // SUMMARY section
  const summSectionRow = ws.addRow(['SUMMARY']);
  for (let c = 1; c <= totalCols; c++) {
    const cell = summSectionRow.getCell(c);
    cell.fill = sectionFill();
    cell.font = headerFont(12);
    cell.border = thinBorder();
  }
  summSectionRow.height = 22;
  ws.mergeCells(summSectionRow.number, 1, summSectionRow.number, totalCols);

  const summaryPairs: [string, string | number][] = [
    ['Transactions', rows.length],
    [`Total Requested (${cur})`, fmtCurrency(totalRequested, cur)],
    [`Total Approved (${cur})`, fmtCurrency(totalApproved, cur)],
    [`Total Paid (${cur})`, fmtCurrency(totalPaid, cur)],
  ];

  // Label spans cols 1-4 (wide enough for long text); value spans cols 5-6 (right-aligned)
  const SUMM_LABEL_END = 4;
  const SUMM_VAL_START = 5;
  const SUMM_VAL_END = 6;
  summaryPairs.forEach(([label, value], i) => {
    const rowData: (string | number)[] = [label, '', '', ''];
    for (let c = SUMM_VAL_START; c <= totalCols; c++) rowData.push(c === SUMM_VAL_START ? value : '');
    const row = ws.addRow(rowData);
    ws.mergeCells(row.number, 1, row.number, SUMM_LABEL_END);
    ws.mergeCells(row.number, SUMM_VAL_START, row.number, SUMM_VAL_END);
    const bg = i % 2 === 1 ? altFill() : undefined;
    row.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    row.getCell(1).border = thinBorder();
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    if (bg) row.getCell(1).fill = bg;
    row.getCell(SUMM_VAL_START).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    row.getCell(SUMM_VAL_START).border = thinBorder();
    row.getCell(SUMM_VAL_START).alignment = { horizontal: 'right', vertical: 'middle' };
    if (bg) row.getCell(SUMM_VAL_START).fill = bg;
    row.height = 18;
  });

  ws.addRow([]).height = 6;

  // STATE SUMMARY section (transport only, when state data is available)
  if (isTransport) {
    const stateMap = new Map<string, { count: number; requested: number; approved: number; paid: number }>();
    rows.forEach(r => {
      const k = r.state && r.state.trim() ? r.state.trim() : 'Unknown';
      if (!stateMap.has(k)) stateMap.set(k, { count: 0, requested: 0, approved: 0, paid: 0 });
      const s = stateMap.get(k)!;
      s.count++;
      s.requested += r.requestedAmount;
      s.approved += r.approvedAmount;
      s.paid += r.paidAmount;
    });
    const stateEntries = Array.from(stateMap.entries()).sort(([a], [b]) => a.localeCompare(b));

    const stateSectionRow = ws.addRow(['STATE SUMMARY']);
    for (let c = 1; c <= totalCols; c++) {
      const cell = stateSectionRow.getCell(c);
      cell.fill = sectionFill();
      cell.font = headerFont(12);
      cell.border = thinBorder();
    }
    stateSectionRow.height = 22;
    ws.mergeCells(stateSectionRow.number, 1, stateSectionRow.number, totalCols);

    const stateHdrData = ['State', 'Requests', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`];
    const stateHdr = ws.addRow([...stateHdrData, ...Array(totalCols - stateHdrData.length).fill('')]);
    stateHdr.eachCell((cell, ci) => {
      cell.fill = subHeaderFill();
      cell.font = headerFont(10);
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
    });
    stateHdr.height = 20;

    stateEntries.forEach(([stateName, s], i) => {
      const rowData: (string | number)[] = [
        stateName, s.count, fmtCurrency(s.requested, cur), fmtCurrency(s.approved, cur), fmtCurrency(s.paid, cur),
        ...Array(totalCols - 5).fill(''),
      ];
      const row = ws.addRow(rowData);
      row.eachCell((cell, ci) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.font = bodyFont(10);
        if (i % 2 === 1) cell.fill = altFill();
      });
      row.height = 18;
    });

    ws.addRow([]).height = 6;
  }

  // TRANSACTION DETAILS section
  const detailSectionRow = ws.addRow(['TRANSACTION DETAILS']);
  for (let c = 1; c <= totalCols; c++) {
    const cell = detailSectionRow.getCell(c);
    cell.fill = sectionFill();
    cell.font = headerFont(12);
    cell.border = thinBorder();
  }
  detailSectionRow.height = 22;
  ws.mergeCells(detailSectionRow.number, 1, detailSectionRow.number, totalCols);

  const tableHead = isTransport
    ? ['#', 'Ref ID', 'Date', 'Requester', 'Site', 'State', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`, 'T1 Approver', 'T2 Approver', 'Status']
    : ['#', 'Ref ID', 'Date', 'Requester', 'Project', 'Category', `Amount (${cur})`, `Approved (${cur})`, 'T1 Approver', 'T2 Approver', 'Status'];

  const hdrRow = ws.addRow(tableHead);
  hdrRow.eachCell((cell, ci) => {
    cell.fill = subHeaderFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci <= (isTransport ? 5 : 5) ? 'left' : 'center', vertical: 'middle', wrapText: false };
  });
  hdrRow.height = 22;

  rows.forEach((r, idx) => {
    const rowData: (string | number)[] = [idx + 1, r.refId, fmtDate(r.date), r.requester || ''];
    if (isTransport) {
      rowData.push(r.site || r.description || '', r.state || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur), fmtCurrency(r.paidAmount, cur));
    } else {
      rowData.push(r.project || '', r.category || r.description || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur));
    }
    rowData.push(r.t1Approver || 'N/A', r.t2Approver || 'N/A', fmtStatus(r.status));

    const dataRow = ws.addRow(rowData);
    const leftCols = isTransport ? 5 : 5;
    dataRow.eachCell((cell, ci) => {
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= leftCols ? 'left' : 'center', vertical: 'middle', wrapText: false };
      cell.font = bodyFont(10);
      if (idx % 2 === 1) cell.fill = altFill();
    });

    const statusCell = dataRow.getCell(rowData.length);
    const statusColors = getStatusColor(fmtStatus(r.status));
    statusCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: statusColors.font } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };

    dataRow.height = 18;
  });

  const totalsData: (string | number)[] = isTransport
    ? ['', '', '', '', 'TOTALS', '', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), fmtCurrency(totalPaid, cur), '', '', '']
    : ['', '', '', '', '', 'TOTALS', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), '', '', ''];

  const totRow = ws.addRow(totalsData);
  totRow.eachCell((cell, ci) => {
    cell.fill = totalFill();
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle' };
  });
  totRow.height = 20;

  const approvedByT1 = rows.filter(r => r.t1Status === 'approved').length;
  const approvedByT2 = rows.filter(r => r.t2Status === 'approved').length;
  const rejectedCount = rows.filter(r => r.rejectionReason).length;

  if (rows.some(r => r.t1Approver || r.t2Approver)) {
    ws.addRow([]).height = 6;
    const appSectionRow = ws.addRow(['APPROVAL SUMMARY']);
    for (let c = 1; c <= totalCols; c++) {
      const cell = appSectionRow.getCell(c);
      cell.fill = sectionFill();
      cell.font = headerFont(11);
      cell.border = thinBorder();
    }
    appSectionRow.height = 20;
    ws.mergeCells(appSectionRow.number, 1, appSectionRow.number, totalCols);

    const appPairs: [string, string][] = [
      ['Tier 1 Approved', `${approvedByT1} of ${rows.length}`],
      ['Tier 2 Approved', `${approvedByT2} of ${rows.length}`],
    ];
    if (rejectedCount > 0) appPairs.push(['Rejected', String(rejectedCount)]);

    appPairs.forEach(([label, value], i) => {
      const rowData: (string | number)[] = [label, '', '', ''];
      for (let c = SUMM_VAL_START; c <= totalCols; c++) rowData.push(c === SUMM_VAL_START ? value : '');
      const row = ws.addRow(rowData);
      ws.mergeCells(row.number, 1, row.number, SUMM_LABEL_END);
      ws.mergeCells(row.number, SUMM_VAL_START, row.number, SUMM_VAL_END);
      const bg = i % 2 === 1 ? altFill() : undefined;
      row.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
      row.getCell(1).border = thinBorder();
      row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
      if (bg) row.getCell(1).fill = bg;
      row.getCell(SUMM_VAL_START).font = bodyFont(10);
      row.getCell(SUMM_VAL_START).border = thinBorder();
      row.getCell(SUMM_VAL_START).alignment = { horizontal: 'right', vertical: 'middle' };
      if (bg) row.getCell(SUMM_VAL_START).fill = bg;
      row.height = 18;
    });
  }

  applyColWidths(ws, isTransport ? TRANSPORT_WIDTHS_SUMMARY : OPCOST_WIDTHS_SUMMARY);

  // Full Details sheet
  if (rows.length > 0) {
    const ws2 = wb.addWorksheet('Full Details');
    const detailTitleRow = ws2.addRow([`${config.title} - Full Details`]);
    detailTitleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
    detailTitleRow.height = 26;
    ws2.addRow([]).height = 6;

    const detailHeaders = isTransport
      ? ['#', 'Reference ID', 'Date', 'Requester', 'Site', 'Hub', 'State', 'MMP', 'Locality', 'Activity Type', `Budget (${cur})`, 'Approval Type', 'Payment Type', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`, 'Status', 'T1 Approver', 'T1 Date', 'T1 Status', 'T2 Approver', 'T2 Date', 'T2 Status', 'Rejection Reason', 'Justification', 'Notes']
      : ['#', 'Reference ID', 'Date', 'Requester', 'Project', 'Category', 'Description', `Amount (${cur})`, `Approved (${cur})`, 'Status', 'T1 Approver', 'T1 Date', 'T1 Status', 'T2 Approver', 'T2 Date', 'T2 Status', 'Rejection Reason', 'Notes'];

    const detHdrRow = ws2.addRow(detailHeaders);
    const detLeftCols = isTransport ? 7 : 5;
    detHdrRow.eachCell((cell, ci) => {
      cell.fill = headerFill();
      cell.font = headerFont(10);
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= detLeftCols ? 'left' : 'center', vertical: 'middle', wrapText: false };
    });
    detHdrRow.height = 22;

    rows.forEach((r, idx) => {
      const rowData: (string | number)[] = [idx + 1, r.refId, fmtDate(r.date), r.requester || ''];
      if (isTransport) {
        rowData.push(
          r.site || r.description || '',
          r.hub || '',
          r.state || '',
          r.mmpName || '',
          r.locality || '',
          r.activityType || '',
          r.transportationBudget != null ? r.transportationBudget : '',
          r.approvalType || '',
          r.paymentType || '',
          r.requestedAmount,
          r.approvedAmount,
          r.paidAmount,
        );
      } else {
        rowData.push(r.project || '', r.category || '', r.description || '', r.requestedAmount, r.approvedAmount);
      }
      rowData.push(fmtStatus(r.status));
      rowData.push(r.t1Approver || 'N/A', r.t1Date ? fmtDate(r.t1Date) : 'N/A', r.t1Status ? fmtStatus(r.t1Status) : 'N/A');
      rowData.push(r.t2Approver || 'N/A', r.t2Date ? fmtDate(r.t2Date) : 'N/A', r.t2Status ? fmtStatus(r.t2Status) : 'N/A');
      if (isTransport) {
        rowData.push(r.rejectionReason || '', r.justification || '', r.notes || '');
      } else {
        rowData.push(r.rejectionReason || '', r.notes || '');
      }

      const dataRow = ws2.addRow(rowData);
      dataRow.eachCell((cell, ci) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci <= detLeftCols ? 'left' : 'center', vertical: 'middle', wrapText: false };
        cell.font = bodyFont(10);
        if (idx % 2 === 1) cell.fill = altFill();
      });
      dataRow.height = 18;
    });

    applyColWidths(ws2, isTransport ? TRANSPORT_WIDTHS_DETAIL : OPCOST_WIDTHS_DETAIL);
  }

  const statusClean = config.statusFilter.replace(/\s+/g, '_');
  const filename = `${typeLabel}-Statement-${statusClean}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  return { wb, filename };
}

const GROUP_BAND = 'FF1E3A5F'; // slightly lighter navy for group bands
const SUBTOTAL_BG = 'FFD6E4F7'; // light blue for subtotal rows

function addGroupedSheet(
  wb: ExcelJS.Workbook,
  rows: StatementRow[],
  config: StatementConfig,
  groupBy: 'state' | 'enumerator' | 'hub' | 'locality'
): void {
  if (rows.length === 0) return;

  const cur = config.currency || 'SDG';
  const isTransport = config.statementType === 'transport_advance';
  const totalCols = isTransport ? 12 : 10;
  const refNum = `STMT-${format(new Date(), 'yyyyMMdd-HHmm')}`;

  const groupLabel =
    groupBy === 'state' ? 'By State' :
    groupBy === 'hub' ? 'By Hub' :
    groupBy === 'locality' ? 'By Locality' : 'By Enumerator';
  const entityLabel =
    groupBy === 'state' ? 'state' :
    groupBy === 'hub' ? 'hub' :
    groupBy === 'locality' ? 'locality' : 'enumerator';
  const groupKey = (r: StatementRow): string =>
    groupBy === 'state' ? (r.state || 'Unknown State') :
    groupBy === 'hub' ? (r.hub || 'Unknown Hub') :
    groupBy === 'locality' ? (r.locality || 'Unknown Locality') :
    (r.requester || 'Unknown Enumerator');

  const groupMap = new Map<string, StatementRow[]>();
  rows.forEach(r => {
    const k = groupKey(r);
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k)!.push(r);
  });
  const groups = Array.from(groupMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  const totalRequested = rows.reduce((s, r) => s + r.requestedAmount, 0);
  const totalApproved  = rows.reduce((s, r) => s + r.approvedAmount, 0);
  const totalPaid      = rows.reduce((s, r) => s + r.paidAmount, 0);

  const ws = wb.addWorksheet(groupLabel);

  // ── Title block ──────────────────────────────────────────────────────────
  const titleRow = ws.addRow([`PACT Command Center  |  Financial Statement — ${groupLabel}`]);
  titleRow.font = { bold: true, size: 16, name: 'Calibri', color: { argb: NAVY } };
  titleRow.height = 30;
  ws.mergeCells(titleRow.number, 1, titleRow.number, totalCols);

  const subtitleRow = ws.addRow([`${config.title}  —  ${fmtStatus(config.statusFilter)} Statement (${groupLabel})`]);
  subtitleRow.font = { bold: true, size: 13, name: 'Calibri', color: { argb: BLUE } };
  subtitleRow.height = 22;
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, totalCols);

  const refRow = ws.addRow([`Reference: ${refNum}   |   Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}${config.generatedBy ? `   |   By: ${config.generatedBy}` : ''}`]);
  refRow.font = bodyFont(10, 'FF5A5F6E');
  refRow.height = 16;
  ws.mergeCells(refRow.number, 1, refRow.number, totalCols);
  ws.addRow([]).height = 6;

  // ── Overall summary ──────────────────────────────────────────────────────
  const summSectionRow = ws.addRow([`OVERALL SUMMARY  (${groups.length} ${entityLabel}s)`]);
  for (let c = 1; c <= totalCols; c++) {
    const cell = summSectionRow.getCell(c);
    cell.fill = sectionFill(); cell.font = headerFont(12); cell.border = thinBorder();
  }
  summSectionRow.height = 22;
  ws.mergeCells(summSectionRow.number, 1, summSectionRow.number, totalCols);

  const SUMM_LABEL_END = 4; const SUMM_VAL_START = 5; const SUMM_VAL_END = 6;
  const summaryPairs: [string, string | number][] = [
    ['Total Transactions', rows.length],
    [`Total Requested (${cur})`, fmtCurrency(totalRequested, cur)],
    [`Total Approved (${cur})`,  fmtCurrency(totalApproved, cur)],
    [`Total Paid (${cur})`,      fmtCurrency(totalPaid, cur)],
  ];
  summaryPairs.forEach(([label, value], i) => {
    const rowData: (string | number)[] = [label, '', '', ''];
    for (let c = SUMM_VAL_START; c <= totalCols; c++) rowData.push(c === SUMM_VAL_START ? value : '');
    const row = ws.addRow(rowData);
    ws.mergeCells(row.number, 1, row.number, SUMM_LABEL_END);
    ws.mergeCells(row.number, SUMM_VAL_START, row.number, SUMM_VAL_END);
    const bg = i % 2 === 1 ? altFill() : undefined;
    row.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    row.getCell(1).border = thinBorder();
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    if (bg) row.getCell(1).fill = bg;
    row.getCell(SUMM_VAL_START).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    row.getCell(SUMM_VAL_START).border = thinBorder();
    row.getCell(SUMM_VAL_START).alignment = { horizontal: 'right', vertical: 'middle' };
    if (bg) row.getCell(SUMM_VAL_START).fill = bg;
    row.height = 18;
  });
  ws.addRow([]).height = 8;

  const tableHead = isTransport
    ? ['#', 'Ref ID', 'Date', 'Requester', 'Site', 'State', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`, 'T1 Approver', 'T2 Approver', 'Status']
    : ['#', 'Ref ID', 'Date', 'Requester', 'Category', `Amount (${cur})`, `Approved (${cur})`, 'T1 Approver', 'T2 Approver', 'Status'];

  // ── Groups ───────────────────────────────────────────────────────────────
  groups.forEach(([groupName, groupRows]) => {
    const gReq  = groupRows.reduce((s, r) => s + r.requestedAmount, 0);
    const gApp  = groupRows.reduce((s, r) => s + r.approvedAmount, 0);
    const gPaid = groupRows.reduce((s, r) => s + r.paidAmount, 0);

    const groupHeaderRow = ws.addRow([`${groupLabel.replace('By ', '')}: ${groupName}   (${groupRows.length} request${groupRows.length !== 1 ? 's' : ''})`]);
    for (let c = 1; c <= totalCols; c++) {
      const cell = groupHeaderRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_BAND } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri' };
      cell.border = thinBorder();
    }
    groupHeaderRow.height = 20;
    ws.mergeCells(groupHeaderRow.number, 1, groupHeaderRow.number, totalCols);

    const hdrRow = ws.addRow(tableHead);
    hdrRow.eachCell((cell, ci) => {
      cell.fill = subHeaderFill(); cell.font = headerFont(9); cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= (isTransport ? 5 : 4) ? 'left' : 'center', vertical: 'middle', wrapText: false };
    });
    hdrRow.height = 20;

    groupRows.forEach((r, idx) => {
      const rowData: (string | number)[] = [idx + 1, r.refId, fmtDate(r.date), r.requester || ''];
      if (isTransport) {
        rowData.push(r.site || r.description || '', r.state || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur), fmtCurrency(r.paidAmount, cur));
      } else {
        rowData.push(r.category || r.description || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur));
      }
      rowData.push(r.t1Approver || 'N/A', r.t2Approver || 'N/A', fmtStatus(r.status));
      const dataRow = ws.addRow(rowData);
      dataRow.eachCell((cell, ci) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci <= (isTransport ? 5 : 4) ? 'left' : 'center', vertical: 'middle', wrapText: false };
        cell.font = bodyFont(9);
        if (idx % 2 === 1) cell.fill = altFill();
      });
      const statusCell = dataRow.getCell(rowData.length);
      const sc = getStatusColor(fmtStatus(r.status));
      statusCell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: sc.font } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
      dataRow.height = 17;
    });

    const subtotalData: (string | number)[] = isTransport
      ? ['', '', '', '', `Subtotal — ${groupName}`, '', fmtCurrency(gReq, cur), fmtCurrency(gApp, cur), fmtCurrency(gPaid, cur), '', '', '']
      : ['', '', '', '', `Subtotal — ${groupName}`, fmtCurrency(gReq, cur), fmtCurrency(gApp, cur), '', '', ''];
    const subTotRow = ws.addRow(subtotalData);
    subTotRow.eachCell((cell, ci) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_BG } };
      cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: NAVY } };
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= (isTransport ? 5 : 4) ? 'left' : 'center', vertical: 'middle' };
    });
    subTotRow.height = 18;
    ws.addRow([]).height = 4;
  });

  // ── Grand total ──────────────────────────────────────────────────────────
  const grandData: (string | number)[] = isTransport
    ? ['', '', '', '', 'GRAND TOTAL', '', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), fmtCurrency(totalPaid, cur), '', '', '']
    : ['', '', '', '', 'GRAND TOTAL', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), '', '', ''];
  const grandRow = ws.addRow(grandData);
  grandRow.eachCell((cell, ci) => {
    cell.fill = sectionFill();
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle' };
  });
  grandRow.height = 20;

  applyColWidths(ws, isTransport ? TRANSPORT_WIDTHS_SUMMARY : OPCOST_WIDTHS_SUMMARY);
}

function buildAllSheetsWorkbook(
  rows: StatementRow[],
  config: StatementConfig
): { wb: ExcelJS.Workbook; filename: string } | null {
  const base = buildStatementWorkbook(rows, config);
  if (!base) return null;
  addGroupedSheet(base.wb, rows, config, 'state');
  addGroupedSheet(base.wb, rows, config, 'hub');
  addGroupedSheet(base.wb, rows, config, 'locality');
  addGroupedSheet(base.wb, rows, config, 'enumerator');
  const isTransport = config.statementType === 'transport_advance';
  const typeLabel = isTransport ? 'Transport-Advance' : 'Operational-Cost';
  const statusClean = config.statusFilter.replace(/\s+/g, '_');
  const filename = `${typeLabel}-Full-Report-${statusClean}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  return { wb: base.wb, filename };
}

/** Convert a Uint8Array to a base64 string using 64 KB chunks to avoid O(n²) string concatenation. */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 65536;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

export async function generateAllSheetsStatementExcelBase64(
  rows: StatementRow[],
  config: StatementConfig
): Promise<{ base64: string; filename: string } | null> {
  const result = buildAllSheetsWorkbook(rows, config);
  if (!result) return null;
  const buffer = await result.wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  return { base64: uint8ToBase64(bytes), filename: result.filename };
}

export function generateFinancialStatementExcel(
  rows: StatementRow[],
  config: StatementConfig
): void {
  const result = buildStatementWorkbook(rows, config);
  if (!result) return;
  result.wb.xlsx.writeBuffer().then(buffer => {
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), result.filename);
  });
}

export async function generateFinancialStatementExcelBase64(
  rows: StatementRow[],
  config: StatementConfig
): Promise<{ base64: string; filename: string } | null> {
  const result = buildStatementWorkbook(rows, config);
  if (!result) return null;
  const buffer = await result.wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  return { base64: uint8ToBase64(bytes), filename: result.filename };
}
