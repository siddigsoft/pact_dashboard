import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';

const C = {
  navy:      [15, 32, 65]   as [number, number, number],
  navyMid:   [22, 48, 90]   as [number, number, number],
  blue:      [41, 98, 255]  as [number, number, number],
  blueLight: [232, 240, 255] as [number, number, number],
  green:     [16, 120, 60]  as [number, number, number],
  greenLight:[228, 245, 235] as [number, number, number],
  amber:     [180, 83, 9]   as [number, number, number],
  amberLight:[255, 251, 235] as [number, number, number],
  border:    [200, 205, 215] as [number, number, number],
  bgLight:   [245, 247, 252] as [number, number, number],
  label:     [90, 95, 110]  as [number, number, number],
  muted:     [120, 125, 140] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  dark:      [20, 20, 30]   as [number, number, number],
};

const EXPENSE_LABELS: Record<string, string> = {
  permits: 'Permits & Licenses',
  incentives: 'Incentives & Allowances',
  communications: 'Internet & Comms',
  training: 'Training',
  transport: 'Transportation',
  general_transport: 'Transportation',
  equipment: 'Equipment & Supplies',
  printing: 'Printing & Stationery',
  meetings: 'Meetings',
  office_admin: 'Office Admin',
  other: 'Other',
};

export interface BulkSubmission {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: string;
  tier1_approved_at: string | null;
  tier2_approved_at: string | null;
  tier2_notes: string | null;
  project_id: string | null;
  reference_number: string | null;
}

export interface BulkUserMap {
  [userId: string]: { name: string; email: string; role?: string };
}

export interface BulkProjectMap {
  [projectId: string]: string;
}

function sdg(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function usdFmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateBulkCostPDFBase64(
  submissions: BulkSubmission[],
  approverName: string,
  totalSdg: number,
  usdRate: number | null,
  userMap: BulkUserMap,
  projectMap: BulkProjectMap,
): string {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const dateStr = format(new Date(), 'dd MMM yyyy');
  const refNo = `BULK-${submissions.length}-${format(new Date(), 'yyyyMMdd')}`;

  const drawHeader = (pageNum: number, totalPages: number) => {
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, W, 22, 'F');

    doc.setFillColor(...C.blue);
    doc.rect(0, 22, W, 2.5, 'F');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text('PACT', 12, 13);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(175, 200, 230);
    doc.text('COMMAND CENTER  ·  FIELD OPERATIONS PLATFORM', 12, 18.5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text('APPROVED OPERATIONAL COST SUBMISSIONS — PAYMENT REQUEST', W / 2, 10, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(175, 200, 230);
    doc.text('طلب دفع — المصروفات التشغيلية الموافق عليها', W / 2, 16, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(150, 175, 210);
    doc.text(`Ref: ${refNo}`, W - 10, 10, { align: 'right' });
    doc.text(`Date: ${dateStr}`, W - 10, 15, { align: 'right' });
    doc.text(`Page ${pageNum} of ${totalPages}`, W - 10, 20, { align: 'right' });
  };

  const drawFooter = () => {
    const fY = doc.internal.pageSize.getHeight() - 12;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(10, fY - 2, W - 10, fY - 2);
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'italic');
    doc.text('CONFIDENTIAL — For authorised Finance Team use only. All amounts in SDG unless stated otherwise.', W / 2, fY + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Approved by: ${approverName}  |  Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, W / 2, fY + 6.5, { align: 'center' });
  };

  const totalAmtSdg = submissions.reduce((s, r) => s + r.amount_cents / 100, 0);
  const totalUsd = usdRate && usdRate > 0 ? totalAmtSdg / usdRate : null;

  drawHeader(1, 1);

  let y = 30;
  doc.setFillColor(...C.blueLight);
  doc.roundedRect(10, y, W - 20, 22, 2, 2, 'F');
  doc.setDrawColor(...C.blue);
  doc.setLineWidth(0.4);
  doc.roundedRect(10, y, W - 20, 22, 2, 2, 'S');

  const summCols = usdRate && usdRate > 0 ? 4 : 3;
  const colW = (W - 20) / summCols;

  const summaryItems = [
    { label: 'Total Submissions', value: `${submissions.length}`, sub: 'إجمالي الطلبات' },
    { label: 'Total Amount (SDG)', value: `SDG ${sdg(submissions.reduce((s, r) => s + r.amount_cents, 0))}`, sub: 'المبلغ الإجمالي' },
    ...(totalUsd !== null ? [{ label: `USD Equivalent`, value: `USD ${usdFmt(totalUsd)}`, sub: `Rate: 1 USD = ${usdRate?.toLocaleString()} SDG` }] : []),
    { label: 'Approved By', value: approverName, sub: dateStr },
  ];

  summaryItems.forEach((item, i) => {
    const cx = 10 + i * colW + colW / 2;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.blue);
    doc.text(item.label.toUpperCase(), cx, y + 7, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text(item.value, cx, y + 14, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(item.sub, cx, y + 19, { align: 'center' });

    if (i < summaryItems.length - 1) {
      doc.setDrawColor(...C.blue);
      doc.setLineWidth(0.2);
      doc.line(10 + (i + 1) * colW, y + 2, 10 + (i + 1) * colW, y + 20);
    }
  });

  y += 26;

  const tableHead = [['#', 'Ref / المرجع', 'Submitter / المقدّم', 'Category / الفئة', 'Description / الوصف', 'Project / المشروع', 'Date / التاريخ', 'Amount (SDG)', ...(totalUsd !== null ? ['USD Equiv.'] : []), 'Status']];
  const tableBody = submissions.map((s, idx) => {
    const submitter = userMap[s.submitted_by];
    const submitterName = submitter?.name || s.submitted_by.slice(0, 8) + '...';
    const project = s.project_id ? (projectMap[s.project_id] || s.project_id.slice(0, 8)) : '—';
    const category = EXPENSE_LABELS[s.expense_category] || s.expense_category;
    const dateVal = s.expense_date ? format(new Date(s.expense_date), 'dd MMM yy') : (s.submitted_at ? format(new Date(s.submitted_at), 'dd MMM yy') : '—');
    const desc = s.description ? (s.description.length > 40 ? s.description.slice(0, 38) + '…' : s.description) : (s.vendor || '—');
    const amtSdg = `SDG ${sdg(s.amount_cents)}`;
    const row = [
      `${idx + 1}`,
      s.reference_number || s.id.slice(0, 8),
      submitterName,
      category,
      desc,
      project,
      dateVal,
      amtSdg,
      ...(totalUsd !== null ? [`USD ${usdFmt(s.amount_cents / 100 / (usdRate || 1))}`] : []),
      'Approved',
    ];
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    margin: { left: 10, right: 10 },
    theme: 'grid',
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: C.dark,
    },
    alternateRowStyles: { fillColor: C.bgLight },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 8 },
      1:  { cellWidth: 22 },
      2:  { cellWidth: 34 },
      3:  { cellWidth: 28 },
      4:  { cellWidth: 42 },
      5:  { cellWidth: 28 },
      6:  { cellWidth: 18, halign: 'center' },
      7:  { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      ...(totalUsd !== null ? { 8: { cellWidth: 22, halign: 'right', textColor: C.blue }, 9: { cellWidth: 18, halign: 'center', textColor: [22, 101, 52] as [number, number, number] } } : { 8: { cellWidth: 18, halign: 'center', textColor: [22, 101, 52] as [number, number, number] } }),
    },
    didDrawPage: (data) => {
      const pageNum = (doc.internal as any).getCurrentPageInfo().pageNumber;
      const totalPg = doc.getNumberOfPages();
      drawHeader(pageNum, totalPg);
      drawFooter();
    },
    showHead: 'everyPage',
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  if (finalY < doc.internal.pageSize.getHeight() - 30) {
    doc.setFillColor(...C.amberLight);
    doc.setDrawColor(...C.amber);
    doc.setLineWidth(0.4);
    doc.roundedRect(10, finalY, W - 20, 16, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.amber);
    doc.text('⚠  RECONCILIATION REQUIREMENT / اشتراط التسوية', 12, finalY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(7);
    doc.text('All recipients must submit receipts and return any unused funds within 5 working days of disbursement. | يجب تقديم الإيصالات وإعادة الأموال غير المستخدمة خلال 5 أيام عمل.', 12, finalY + 12);
  }

  drawFooter();

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawHeader(p, totalPages);
    drawFooter();
  }

  return doc.output('datauristring').split(',')[1];
}

// ─── ExcelJS colour constants ────────────────────────────────────────────────
const NAVY    = 'FF0F2041';
const NAVY_MID = 'FF1E3A5F';
const BLUE_XL = 'FF2962FF';
const WHITE_XL = 'FFFFFFFF';
const LIGHT_BG = 'FFF5F7FC';
const BORDER_C = 'FFC8CDD7';
const DARK_XL  = 'FF14141E';
const GREEN_XL = 'FF107838';
const GREEN_BG = 'FFE4F5EB';
const AMBER_XL = 'FFB47800';
const AMBER_BG = 'FFFFF8E6';
const MUTED_XL = 'FF5A5F6E';

function xlThin(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER_C } };
  return { top: s, bottom: s, left: s, right: s };
}
function xlFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function xlFont(bold: boolean, size: number, argb = DARK_XL): Partial<ExcelJS.Font> {
  return { bold, size, name: 'Calibri', color: { argb } };
}
function xlAlign(h: ExcelJS.Alignment['horizontal'], v: ExcelJS.Alignment['vertical'] = 'middle'): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v };
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return d || '—'; }
}
function fmtCurrency(sdgAmt: number): string {
  return `SDG ${sdgAmt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function generateBulkCostExcelBase64(
  submissions: BulkSubmission[],
  approverName: string,
  usdRate: number | null,
  userMap: BulkUserMap,
  projectMap: BulkProjectMap,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const dateStr = format(new Date(), 'MMM d, yyyy | HH:mm');
  const refNo = `BULK-${submissions.length}-${format(new Date(), 'yyyyMMdd')}`;
  const totalAmtCents = submissions.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0);
  const totalSdg = totalAmtCents / 100;
  const totalUsd = usdRate && usdRate > 0 ? totalSdg / usdRate : null;

  const hasUsd = totalUsd !== null;
  const TOTAL_COLS = hasUsd ? 9 : 8;

  // ── helper: merge + style a section banner row ──────────────────────────
  function addBanner(ws: ExcelJS.Worksheet, label: string, size = 12) {
    const row = ws.addRow([label]);
    ws.mergeCells(row.number, 1, row.number, TOTAL_COLS);
    for (let c = 1; c <= TOTAL_COLS; c++) {
      const cell = row.getCell(c);
      cell.fill = xlFill(NAVY);
      cell.font = xlFont(true, size, WHITE_XL);
      cell.border = xlThin();
    }
    row.getCell(1).alignment = xlAlign('left');
    row.height = 22;
    return row;
  }

  // ── helper: add a key-value summary row ─────────────────────────────────
  function addSummRow(ws: ExcelJS.Worksheet, label: string, value: string | number, alt: boolean) {
    const data: (string | number)[] = [label, '', '', ''];
    for (let c = 5; c <= TOTAL_COLS; c++) data.push(c === 5 ? value : '');
    const row = ws.addRow(data);
    ws.mergeCells(row.number, 1, row.number, 4);
    ws.mergeCells(row.number, 5, row.number, 6);
    const bg = alt ? xlFill(LIGHT_BG) : undefined;
    const lCell = row.getCell(1);
    lCell.font = xlFont(true, 10);
    lCell.border = xlThin();
    lCell.alignment = { vertical: 'middle', indent: 1 };
    if (bg) lCell.fill = bg;
    const vCell = row.getCell(5);
    vCell.font = xlFont(true, 10);
    vCell.border = xlThin();
    vCell.alignment = xlAlign('right');
    if (bg) vCell.fill = bg;
    row.height = 18;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Summary (styled like buildStatementWorkbook)
  // ════════════════════════════════════════════════════════════════════════
  const ws = wb.addWorksheet('Summary');

  // Title
  const titleRow = ws.addRow(['PACT Command Center  |  Approved Operational Cost Submissions']);
  titleRow.font = xlFont(true, 16, NAVY);
  titleRow.height = 32;
  ws.mergeCells(titleRow.number, 1, titleRow.number, TOTAL_COLS);

  // Subtitle
  const subRow = ws.addRow(['Payment Request Report  —  Approved Submissions']);
  subRow.font = xlFont(true, 13, BLUE_XL);
  subRow.height = 22;
  ws.mergeCells(subRow.number, 1, subRow.number, TOTAL_COLS);

  // Meta rows
  const metaRows: [string][] = [
    [`Reference No: ${refNo}`],
    [`Generated: ${dateStr}`],
    [`Approved By: ${approverName}`],
  ];
  metaRows.forEach(([text]) => {
    const r = ws.addRow([text]);
    r.font = xlFont(false, 10, MUTED_XL);
    r.height = 16;
    ws.mergeCells(r.number, 1, r.number, TOTAL_COLS);
  });

  ws.addRow([]).height = 6;

  // ── SUMMARY section ──────────────────────────────────────────────────────
  addBanner(ws, 'SUMMARY');

  const summaryPairs: [string, string][] = [
    ['Total Submissions', String(submissions.length)],
    [`Total Amount (SDG)`, fmtCurrency(totalSdg)],
    ...(hasUsd ? [
      [`Exchange Rate (1 USD = SDG)`, usdRate!.toLocaleString()],
      [`USD Equivalent`, `USD ${totalUsd!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ] as [string, string][] : []),
    ['Approved By', approverName],
    ['Report Date', format(new Date(), 'MMMM d, yyyy')],
  ];
  summaryPairs.forEach(([label, value], i) => addSummRow(ws, label, value, i % 2 === 1));

  ws.addRow([]).height = 6;

  // ── CATEGORY BREAKDOWN section ───────────────────────────────────────────
  addBanner(ws, 'CATEGORY BREAKDOWN', 11);

  const catHdrRow = ws.addRow(['Category', '', '', '', 'Count', 'Total (SDG)', '', '', ...(hasUsd ? ['USD Equiv.'] : [])]);
  ws.mergeCells(catHdrRow.number, 1, catHdrRow.number, 4);
  catHdrRow.eachCell((cell, ci) => {
    if (ci > 4 || ci === 1) {
      cell.fill = xlFill(NAVY_MID);
      cell.font = xlFont(true, 10, WHITE_XL);
      cell.border = xlThin();
      cell.alignment = xlAlign(ci === 1 ? 'left' : 'center');
    }
  });
  catHdrRow.height = 20;

  const catTotals: Record<string, { count: number; total: number }> = {};
  submissions.forEach(s => {
    const cat = EXPENSE_LABELS[s.expense_category] || s.expense_category || 'Uncategorized';
    if (!catTotals[cat]) catTotals[cat] = { count: 0, total: 0 };
    catTotals[cat].count += 1;
    catTotals[cat].total += s.amount_cents / 100;
  });

  Object.entries(catTotals).forEach(([cat, { count, total }], i) => {
    const rowData = [cat, '', '', '', count, fmtCurrency(total), '', '', ...(hasUsd ? [usdRate! > 0 ? `USD ${(total / usdRate!).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'] : [])];
    const r = ws.addRow(rowData);
    ws.mergeCells(r.number, 1, r.number, 4);
    const bg = i % 2 === 1 ? xlFill(LIGHT_BG) : undefined;
    r.eachCell((cell, ci) => {
      cell.border = xlThin();
      cell.font = xlFont(false, 10);
      cell.alignment = xlAlign(ci === 1 ? 'left' : 'center');
      if (bg) cell.fill = bg;
    });
    r.height = 18;
  });

  ws.addRow([]).height = 6;

  // ── TRANSACTION DETAILS section ──────────────────────────────────────────
  addBanner(ws, 'TRANSACTION DETAILS');

  const colHeaders = [
    '#', 'Ref ID', 'Submitter', 'Category',
    'Project', 'Date', `Amount (SDG)`,
    ...(hasUsd ? ['USD Equiv.'] : []),
    'Status',
  ];
  const hdrRow = ws.addRow(colHeaders);
  hdrRow.eachCell((cell, ci) => {
    cell.fill = xlFill(NAVY_MID);
    cell.font = xlFont(true, 10, WHITE_XL);
    cell.border = xlThin();
    cell.alignment = xlAlign(ci <= 4 ? 'left' : 'center');
  });
  hdrRow.height = 22;

  submissions.forEach((s, idx) => {
    const submitter = userMap[s.submitted_by];
    const amtSdg = s.amount_cents / 100;
    const rowData = [
      idx + 1,
      s.reference_number || s.id.slice(0, 8).toUpperCase(),
      submitter?.name || '—',
      EXPENSE_LABELS[s.expense_category] || s.expense_category || '—',
      s.project_id ? (projectMap[s.project_id] || '—') : '—',
      s.expense_date ? format(new Date(s.expense_date), 'dd/MM/yyyy') : '—',
      fmtCurrency(amtSdg),
      ...(hasUsd ? [`USD ${(amtSdg / usdRate!).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : []),
      'Approved',
    ];
    const r = ws.addRow(rowData);
    const bg = idx % 2 === 1 ? xlFill(LIGHT_BG) : undefined;
    r.eachCell((cell, ci) => {
      cell.border = xlThin();
      cell.font = xlFont(false, 10);
      cell.alignment = xlAlign(ci <= 4 ? 'left' : 'center');
      if (bg) cell.fill = bg;
    });
    // Status cell — green
    const statusCell = r.getCell(rowData.length);
    statusCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: GREEN_XL } };
    statusCell.fill = xlFill(GREEN_BG);
    r.height = 18;
  });

  // Totals row
  const totalsData = [
    '', '', '', '', 'TOTALS',
    fmtCurrency(totalSdg),
    ...(hasUsd ? [`USD ${totalUsd!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : []),
    '',
  ];
  const totRow = ws.addRow(totalsData);
  totRow.eachCell((cell, ci) => {
    cell.fill = xlFill('FFE2E8F0');
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK_XL } };
    cell.border = xlThin();
    cell.alignment = xlAlign(ci <= 4 ? 'left' : 'center');
  });
  totRow.height = 20;

  // Approval summary
  ws.addRow([]).height = 6;
  addBanner(ws, 'APPROVAL SUMMARY', 11);

  const approvalPairs: [string, string][] = [
    ['Total Approved Submissions', String(submissions.length)],
    ['Approver / Sender', approverName],
    ['Report Generated', format(new Date(), 'MMMM d, yyyy  HH:mm')],
  ];
  approvalPairs.forEach(([label, value], i) => addSummRow(ws, label, value, i % 2 === 1));

  // Column widths for summary sheet
  const summaryWidths = hasUsd
    ? [5, 22, 26, 24, 24, 16, 18, 16, 12]
    : [5, 22, 26, 24, 24, 16, 18, 12];
  summaryWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Full Submissions Detail
  // ════════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Submissions Detail');

  const det2TitleRow = ws2.addRow(['PACT Command Center  |  Approved Cost Submissions — Full Detail']);
  det2TitleRow.font = xlFont(true, 14, NAVY);
  det2TitleRow.height = 28;
  const DET_COLS = hasUsd ? 16 : 15;
  ws2.mergeCells(det2TitleRow.number, 1, det2TitleRow.number, DET_COLS);

  const det2SubRow = ws2.addRow([`Generated: ${dateStr}  |  Approved By: ${approverName}  |  Ref: ${refNo}`]);
  det2SubRow.font = xlFont(false, 10, MUTED_XL);
  det2SubRow.height = 16;
  ws2.mergeCells(det2SubRow.number, 1, det2SubRow.number, DET_COLS);

  ws2.addRow([]).height = 6;

  const detHeaders = [
    '#', 'Reference No', 'Submitter Name', 'Submitter Email',
    'Category', 'Description', 'Vendor / Payee', 'Project',
    'Expense Date', 'Tier1 Approved', 'Tier2 Approved',
    `Amount (SDG)`,
    ...(hasUsd ? ['USD Equivalent'] : []),
    'Notes', 'Status',
  ];
  const detHdrRow = ws2.addRow(detHeaders);
  detHdrRow.eachCell((cell, ci) => {
    cell.fill = xlFill(NAVY);
    cell.font = xlFont(true, 10, WHITE_XL);
    cell.border = xlThin();
    cell.alignment = xlAlign(ci <= 8 ? 'left' : 'center');
  });
  detHdrRow.height = 22;

  submissions.forEach((s, idx) => {
    const submitter = userMap[s.submitted_by];
    const amtSdg = s.amount_cents / 100;
    const rowData = [
      idx + 1,
      s.reference_number || s.id,
      submitter?.name || '—',
      submitter?.email || '—',
      EXPENSE_LABELS[s.expense_category] || s.expense_category || '—',
      s.description || '—',
      s.vendor || '—',
      s.project_id ? (projectMap[s.project_id] || '—') : '—',
      s.expense_date ? format(new Date(s.expense_date), 'dd/MM/yyyy') : '—',
      s.tier1_approved_at ? format(new Date(s.tier1_approved_at), 'dd/MM/yyyy') : '—',
      s.tier2_approved_at ? format(new Date(s.tier2_approved_at), 'dd/MM/yyyy') : '—',
      fmtCurrency(amtSdg),
      ...(hasUsd ? [`USD ${(amtSdg / usdRate!).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : []),
      s.tier2_notes || '—',
      'Approved',
    ];
    const r = ws2.addRow(rowData);
    const bg = idx % 2 === 1 ? xlFill(LIGHT_BG) : undefined;
    r.eachCell((cell, ci) => {
      cell.border = xlThin();
      cell.font = xlFont(false, 10);
      cell.alignment = xlAlign(ci <= 8 ? 'left' : 'center');
      if (bg) cell.fill = bg;
    });
    const statusCell2 = r.getCell(rowData.length);
    statusCell2.font = { bold: true, size: 10, name: 'Calibri', color: { argb: GREEN_XL } };
    statusCell2.fill = xlFill(GREEN_BG);
    r.height = 18;
  });

  // Detail sheet totals
  const det2Totals: (string | number)[] = ['', '', '', '', '', '', '', '', '', '', 'TOTAL', fmtCurrency(totalSdg), ...(hasUsd ? [`USD ${totalUsd!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : []), '', ''];
  const det2TotRow = ws2.addRow(det2Totals);
  det2TotRow.eachCell(cell => {
    cell.fill = xlFill('FFE2E8F0');
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK_XL } };
    cell.border = xlThin();
    cell.alignment = xlAlign('center');
  });
  det2TotRow.height = 20;

  const det2Widths = [5, 24, 28, 32, 22, 36, 26, 26, 14, 18, 18, 18, ...(hasUsd ? [16] : []), 32, 12];
  det2Widths.forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 3 — By Submitter
  // ════════════════════════════════════════════════════════════════════════
  if (Object.keys(userMap).length > 0) {
    const ws3 = wb.addWorksheet('By Submitter');
    const subTitleRow = ws3.addRow(['PACT Command Center  |  Submissions by Submitter']);
    subTitleRow.font = xlFont(true, 14, NAVY);
    subTitleRow.height = 28;
    const BY_COLS = hasUsd ? 5 : 4;
    ws3.mergeCells(subTitleRow.number, 1, subTitleRow.number, BY_COLS);
    ws3.addRow([]).height = 6;

    const byHdrs = ['Submitter Name', 'Email', 'Submissions', `Total (SDG)`, ...(hasUsd ? ['Total (USD)'] : [])];
    const byHdrRow = ws3.addRow(byHdrs);
    byHdrRow.eachCell(cell => {
      cell.fill = xlFill(NAVY);
      cell.font = xlFont(true, 10, WHITE_XL);
      cell.border = xlThin();
      cell.alignment = xlAlign('left');
    });
    byHdrRow.height = 22;

    const submitterSummary: Record<string, { name: string; email: string; count: number; totalSdg: number }> = {};
    submissions.forEach(s => {
      const u = userMap[s.submitted_by];
      if (!submitterSummary[s.submitted_by]) {
        submitterSummary[s.submitted_by] = { name: u?.name || '—', email: u?.email || '—', count: 0, totalSdg: 0 };
      }
      submitterSummary[s.submitted_by].count += 1;
      submitterSummary[s.submitted_by].totalSdg += s.amount_cents / 100;
    });

    Object.values(submitterSummary).forEach((row, i) => {
      const r = ws3.addRow([
        row.name, row.email, row.count, fmtCurrency(row.totalSdg),
        ...(hasUsd ? [`USD ${(row.totalSdg / usdRate!).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : []),
      ]);
      const bg = i % 2 === 1 ? xlFill(LIGHT_BG) : undefined;
      r.eachCell(cell => {
        cell.border = xlThin();
        cell.font = xlFont(false, 10);
        cell.alignment = xlAlign('left');
        if (bg) cell.fill = bg;
      });
      r.height = 18;
    });

    [28, 32, 14, 18, ...(hasUsd ? [16] : [])].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });
  }

  // Write to buffer and return base64 (chunked to avoid O(n²) string concat)
  const buffer = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const CHUNK = 65536;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
