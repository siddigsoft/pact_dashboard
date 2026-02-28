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

// Explicit column widths for transport statement (Financial Statement sheet, 11 cols)
const TRANSPORT_WIDTHS_SUMMARY = [5, 22, 13, 26, 16, 15, 15, 11, 26, 18, 12];
// Explicit column widths for transport Full Details sheet (19 cols)
const TRANSPORT_WIDTHS_DETAIL = [5, 22, 13, 26, 16, 14, 13, 14, 14, 11, 12, 26, 13, 13, 18, 13, 13, 20, 18];
// Explicit column widths for operational cost (Financial Statement sheet, 10 cols)
const OPCOST_WIDTHS_SUMMARY = [5, 22, 13, 26, 16, 15, 15, 26, 18, 12];
// Explicit column widths for operational cost Full Details (17 cols)
const OPCOST_WIDTHS_DETAIL = [5, 22, 13, 26, 16, 22, 14, 14, 12, 26, 13, 13, 18, 13, 13, 20, 18];

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
  const totalCols = isTransport ? 11 : 10;

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
    ? ['#', 'Ref ID', 'Date', 'Requester', 'Site', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`, 'T1 Approver', 'T2 Approver', 'Status']
    : ['#', 'Ref ID', 'Date', 'Requester', 'Category', `Amount (${cur})`, `Approved (${cur})`, 'T1 Approver', 'T2 Approver', 'Status'];

  const hdrRow = ws.addRow(tableHead);
  hdrRow.eachCell((cell, ci) => {
    cell.fill = subHeaderFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: false };
  });
  hdrRow.height = 22;

  rows.forEach((r, idx) => {
    const rowData: (string | number)[] = [idx + 1, r.refId, fmtDate(r.date), r.requester || ''];
    if (isTransport) {
      rowData.push(r.site || r.description || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur), fmtCurrency(r.paidAmount, cur));
    } else {
      rowData.push(r.category || r.description || '', fmtCurrency(r.requestedAmount, cur), fmtCurrency(r.approvedAmount, cur));
    }
    rowData.push(r.t1Approver || 'N/A', r.t2Approver || 'N/A', fmtStatus(r.status));

    const dataRow = ws.addRow(rowData);
    dataRow.eachCell((cell, ci) => {
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: false };
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
    ? ['', '', '', '', 'TOTALS', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), fmtCurrency(totalPaid, cur), '', '', '']
    : ['', '', '', '', 'TOTALS', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), '', '', ''];

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
      ? ['#', 'Reference ID', 'Date', 'Requester', 'Site', 'Hub', 'State', `Requested (${cur})`, `Approved (${cur})`, `Paid (${cur})`, 'Status', 'T1 Approver', 'T1 Date', 'T1 Status', 'T2 Approver', 'T2 Date', 'T2 Status', 'Rejection Reason', 'Notes']
      : ['#', 'Reference ID', 'Date', 'Requester', 'Category', 'Description', `Amount (${cur})`, `Approved (${cur})`, 'Status', 'T1 Approver', 'T1 Date', 'T1 Status', 'T2 Approver', 'T2 Date', 'T2 Status', 'Rejection Reason', 'Notes'];

    const detHdrRow = ws2.addRow(detailHeaders);
    detHdrRow.eachCell((cell, ci) => {
      cell.fill = headerFill();
      cell.font = headerFont(10);
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: false };
    });
    detHdrRow.height = 22;

    rows.forEach((r, idx) => {
      const rowData: (string | number)[] = [idx + 1, r.refId, fmtDate(r.date), r.requester || ''];
      if (isTransport) {
        rowData.push(r.site || r.description || '', r.hub || '', r.state || '', r.requestedAmount, r.approvedAmount, r.paidAmount);
      } else {
        rowData.push(r.category || '', r.description || '', r.requestedAmount, r.approvedAmount);
      }
      rowData.push(fmtStatus(r.status));
      rowData.push(r.t1Approver || 'N/A', r.t1Date ? fmtDate(r.t1Date) : 'N/A', r.t1Status ? fmtStatus(r.t1Status) : 'N/A');
      rowData.push(r.t2Approver || 'N/A', r.t2Date ? fmtDate(r.t2Date) : 'N/A', r.t2Status ? fmtStatus(r.t2Status) : 'N/A');
      rowData.push(r.rejectionReason || '', r.notes || '');

      const dataRow = ws2.addRow(rowData);
      dataRow.eachCell((cell, ci) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: false };
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
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return { base64: btoa(binary), filename: result.filename };
}
