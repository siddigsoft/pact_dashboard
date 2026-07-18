import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';

/**
 * PACT Command Center — Formatted Excel Export Engine (ExcelJS)
 *
 * Produces branded, fully-styled .xlsx files with:
 *  - Navy title + subtitle rows (merged, white bold text)
 *  - Teal header row (white bold, auto-filter, frozen)
 *  - Alternating row shading
 *  - Totals row (amber highlight, bold)
 *  - Borders on all cells
 *  - Auto-fitted column widths
 *  - Optional Summary and Breakdown sheets
 */

// ─── Brand colours ───────────────────────────────────────────────────────────
const COLOR = {
  titleBg:     '1e3a5f',   // deep navy
  titleFg:     'FFFFFF',
  subtitleBg:  '2d5282',   // mid navy
  subtitleFg:  'FFFFFF',
  headerBg:    '0891b2',   // PACT teal
  headerFg:    'FFFFFF',
  rowAlt:      'f0f9ff',   // very light cyan
  rowWhite:    'FFFFFF',
  totalsBg:    'fef3c7',   // soft amber
  totalsFg:    '92400e',
  border:      'cbd5e1',   // slate-300
  summaryBg:   '1e3a5f',
  summaryFg:   'FFFFFF',
};

type CellValue = string | number | null | undefined;

export interface FmtSheetSpec {
  sheetName: string;
  headers: string[];
  rows: CellValue[][];
  totalsRow?: CellValue[];
  colWidths?: number[];
}

export interface FmtReportOptions {
  reportTitle: string;
  subtitleLine: string;
  metaLine?: string;
  mainSheet: FmtSheetSpec;
  summarySheet?: { title: string; rows: CellValue[][]; colWidths?: number[] };
  breakdownSheets?: { title: string; sheetName: string; headers: string[]; rows: CellValue[][]; colWidths?: number[] }[];
  filenamePrefix: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyBorder(cell: ExcelJS.Cell) {
  const side: ExcelJS.BorderStyle = 'thin';
  cell.border = {
    top:    { style: side, color: { argb: 'FF' + COLOR.border } },
    left:   { style: side, color: { argb: 'FF' + COLOR.border } },
    bottom: { style: side, color: { argb: 'FF' + COLOR.border } },
    right:  { style: side, color: { argb: 'FF' + COLOR.border } },
  };
}

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
}

function setFont(cell: ExcelJS.Cell, hex: string, bold = false, size = 11) {
  cell.font = { color: { argb: 'FF' + hex }, bold, size, name: 'Calibri' };
}

function autoWidth(col: ExcelJS.Column, values: CellValue[], headerText: string) {
  const maxLen = [headerText, ...values.map(v => String(v ?? ''))].reduce(
    (m, s) => Math.max(m, s.length), 8
  );
  col.width = Math.min(Math.max(maxLen + 3, 12), 50);
}

// ─── Main sheet builder ───────────────────────────────────────────────────────

function buildMainSheet(
  wb: ExcelJS.Workbook,
  spec: FmtSheetSpec,
  reportTitle: string,
  subtitleLine: string,
  metaLine?: string,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(spec.sheetName.slice(0, 31));
  const numCols = spec.headers.length;
  const lastCol = numCols;

  // ── Title rows ──
  const titleRow = ws.addRow([reportTitle]);
  titleRow.height = 22;
  const titleCell = titleRow.getCell(1);
  setFill(titleCell, COLOR.titleBg);
  setFont(titleCell, COLOR.titleFg, true, 14);
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(titleRow.number, 1, titleRow.number, lastCol);

  const subRow = ws.addRow([subtitleLine]);
  subRow.height = 18;
  const subCell = subRow.getCell(1);
  setFill(subCell, COLOR.subtitleBg);
  setFont(subCell, COLOR.subtitleFg, false, 10);
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(subRow.number, 1, subRow.number, lastCol);

  if (metaLine) {
    const metaRow = ws.addRow([metaLine]);
    metaRow.height = 16;
    const metaCell = metaRow.getCell(1);
    setFill(metaCell, COLOR.subtitleBg);
    setFont(metaCell, COLOR.subtitleFg, false, 9);
    metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(metaRow.number, 1, metaRow.number, lastCol);
  }

  // empty separator
  ws.addRow([]);

  // ── Header row ──
  const headerRow = ws.addRow(spec.headers);
  headerRow.height = 20;
  headerRow.eachCell((cell, colNum) => {
    setFill(cell, COLOR.headerBg);
    setFont(cell, COLOR.headerFg, true, 11);
    applyBorder(cell);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
  });
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to:   { row: headerRow.number, column: lastCol },
  };
  ws.views = [{ state: 'frozen', ySplit: headerRow.number, xSplit: 0 }];

  // ── Data rows ──
  spec.rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData.map(v => v ?? ''));
    row.height = 17;
    const isAlt = idx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > lastCol) return;
      setFill(cell, isAlt ? COLOR.rowAlt : COLOR.rowWhite);
      setFont(cell, '1e293b', false, 10);
      applyBorder(cell);
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  });

  // ── Totals row ──
  if (spec.totalsRow) {
    ws.addRow([]);
    const totRow = ws.addRow(spec.totalsRow.map(v => v ?? ''));
    totRow.height = 19;
    totRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > lastCol) return;
      setFill(cell, COLOR.totalsBg);
      setFont(cell, COLOR.totalsFg, true, 10);
      applyBorder(cell);
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
    });
  }

  // ── Column widths ──
  spec.headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    if (spec.colWidths?.[i]) {
      col.width = spec.colWidths[i];
    } else {
      const colVals = spec.rows.map(r => r[i]);
      autoWidth(col, colVals, h);
    }
  });

  return ws;
}

// ─── Summary sheet builder ────────────────────────────────────────────────────

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  title: string,
  rows: CellValue[][],
  colWidths?: number[],
) {
  const ws = wb.addWorksheet('Summary');
  const numCols = colWidths?.length || Math.max(...rows.map(r => r.length), 2);

  const titleRow = ws.addRow([title]);
  titleRow.height = 22;
  const tc = titleRow.getCell(1);
  setFill(tc, COLOR.summaryBg);
  setFont(tc, COLOR.summaryFg, true, 13);
  tc.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(1, 1, 1, numCols);

  ws.addRow([]);

  rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData.map(v => v ?? ''));
    row.height = 17;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > numCols) return;
      const isLabel = colNum === 1;
      setFill(cell, idx % 2 === 0 ? 'f8fafc' : COLOR.rowWhite);
      setFont(cell, '1e293b', isLabel, 10);
      applyBorder(cell);
      cell.alignment = { vertical: 'middle', horizontal: isLabel ? 'left' : 'right' };
    });
  });

  for (let i = 1; i <= numCols; i++) {
    ws.getColumn(i).width = colWidths?.[i - 1] || 22;
  }
}

// ─── Breakdown sheet builder ──────────────────────────────────────────────────

function buildBreakdownSheet(
  wb: ExcelJS.Workbook,
  title: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
  colWidths?: number[],
) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const numCols = headers.length;

  const titleRow = ws.addRow([title]);
  titleRow.height = 20;
  const tc = titleRow.getCell(1);
  setFill(tc, COLOR.summaryBg);
  setFont(tc, COLOR.summaryFg, true, 12);
  tc.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(1, 1, 1, numCols);

  ws.addRow([]);

  const headerRow = ws.addRow(headers);
  headerRow.height = 18;
  headerRow.eachCell((cell) => {
    setFill(cell, COLOR.headerBg);
    setFont(cell, COLOR.headerFg, true, 10);
    applyBorder(cell);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach((rowData, idx) => {
    const row = ws.addRow(rowData.map(v => v ?? ''));
    row.height = 16;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > numCols) return;
      setFill(cell, idx % 2 === 1 ? COLOR.rowAlt : COLOR.rowWhite);
      setFont(cell, '1e293b', false, 10);
      applyBorder(cell);
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  });

  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = colWidths?.[i] || Math.max(h.length + 4, 14);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a PACT-branded, fully-formatted Excel workbook and triggers download.
 * Drop-in upgrade for `exportStandardExcel` — same option shape, richer output.
 */
export async function exportFormattedExcel(opts: FmtReportOptions): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'PACT Command Center';
  wb.created  = new Date();
  wb.modified = new Date();

  buildMainSheet(wb, opts.mainSheet, opts.reportTitle, opts.subtitleLine, opts.metaLine);

  if (opts.summarySheet) {
    buildSummarySheet(wb, opts.summarySheet.title, opts.summarySheet.rows, opts.summarySheet.colWidths);
  }

  (opts.breakdownSheets || []).forEach(bs => {
    buildBreakdownSheet(wb, bs.title, bs.sheetName, bs.headers, bs.rows, bs.colWidths);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${opts.filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

/** Same helper re-exports so callers can share utility fns */
export function sumField<T>(items: T[], getter: (item: T) => number | null | undefined): number {
  return items.reduce((s, item) => s + (getter(item) || 0), 0);
}

export function groupBreakdown<T>(
  items: T[],
  keyFn: (item: T) => string,
  amountFn: (item: T) => number,
): CellValue[][] {
  const map = new Map<string, { count: number; amount: number }>();
  items.forEach(item => {
    const k = keyFn(item) || 'Unknown';
    const e = map.get(k) || { count: 0, amount: 0 };
    e.count++;
    e.amount += amountFn(item) || 0;
    map.set(k, e);
  });
  return [...map.entries()].map(([k, v]) => [k, v.count, v.amount]);
}
