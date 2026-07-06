import * as XLSX from 'xlsx';
import { format } from 'date-fns';

/**
 * PACT Command Center standard Excel report format.
 * Mirrors the Down-Payments report style: a merged title/meta block at the
 * top of the main sheet, a totals row under the data, and optional
 * "Summary" / "Breakdown" companion sheets. Use this for every new or
 * retrofitted Excel export so all reports look and feel the same.
 */

export interface StandardSheetSpec {
  /** Sheet tab name (max 31 chars, enforced automatically). */
  sheetName: string;
  /** Column headers for the data table. */
  headers: string[];
  /** Data rows, same column order/length as headers. */
  rows: (string | number)[][];
  /** Optional totals row (same length as headers, blanks for non-numeric cols). */
  totalsRow?: (string | number)[];
  /** Optional per-column width overrides (index -> chars). Defaults to 16. */
  colWidths?: Record<number, number>;
}

export interface StandardReportOptions {
  /** e.g. "PACT Command Center - Down-Payment Requests Report" */
  reportTitle: string;
  /** e.g. "Tab: All | Generated: ... | Total Requests: 42" */
  subtitleLine: string;
  /** Optional extra meta line, e.g. totals summary. */
  metaLine?: string;
  /** Main data sheet. */
  mainSheet: StandardSheetSpec;
  /** Optional "Summary" sheet: simple label/value or category breakdown rows. */
  summarySheet?: { title: string; rows: (string | number)[][]; colWidths?: number[] };
  /** Optional additional breakdown sheets (e.g. "By Hub", "By Category"). */
  breakdownSheets?: { title: string; sheetName: string; headers: string[]; rows: (string | number)[][]; colWidths?: number[] }[];
  /** Filename prefix; date suffix + .xlsx appended automatically. */
  filenamePrefix: string;
}

function buildTitledSheet(spec: StandardSheetSpec, reportTitle: string, subtitleLine: string, metaLine?: string): XLSX.WorkSheet {
  const titleRows: (string | number)[][] = [
    [reportTitle],
    [subtitleLine],
  ];
  if (metaLine) titleRows.push([metaLine]);
  titleRows.push([]);

  const allRows = [...titleRows, spec.headers, ...spec.rows];
  if (spec.totalsRow) {
    allRows.push(Array(spec.headers.length).fill(''));
    allRows.push(spec.totalsRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const numCols = spec.headers.length;

  ws['!merges'] = titleRows.map((_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: numCols - 1 } })).filter((_, i) => titleRows[i].length > 0);

  ws['!cols'] = Array.from({ length: numCols }, (_, i) => ({ wch: spec.colWidths?.[i] || 16 }));

  return ws;
}

/**
 * Builds and downloads a PACT-standard multi-sheet Excel workbook:
 * main data sheet (title block + totals row), optional Summary sheet,
 * and optional breakdown sheets (e.g. By Hub, By Category).
 */
export function exportStandardExcel(opts: StandardReportOptions): void {
  const wb = XLSX.utils.book_new();

  const mainWs = buildTitledSheet(opts.mainSheet, opts.reportTitle, opts.subtitleLine, opts.metaLine);
  XLSX.utils.book_append_sheet(wb, mainWs, opts.mainSheet.sheetName.slice(0, 31));

  if (opts.summarySheet) {
    const data: (string | number)[][] = [[opts.summarySheet.title], [], ...opts.summarySheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const numCols = opts.summarySheet.colWidths?.length || Math.max(...opts.summarySheet.rows.map(r => r.length), 2);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }];
    ws['!cols'] = (opts.summarySheet.colWidths || Array(numCols).fill(20)).map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  (opts.breakdownSheets || []).forEach(bs => {
    const data: (string | number)[][] = [[bs.title], [], bs.headers, ...bs.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const numCols = bs.headers.length;
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }];
    ws['!cols'] = (bs.colWidths || Array(numCols).fill(18)).map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, bs.sheetName.slice(0, 31));
  });

  XLSX.writeFile(wb, `${opts.filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

/** Sums a numeric field across an array, defaulting missing/NaN values to 0. */
export function sumField<T>(items: T[], getter: (item: T) => number | null | undefined): number {
  return items.reduce((s, item) => s + (getter(item) || 0), 0);
}

/** Builds simple label/count/amount breakdown rows grouped by a key function — useful for Summary/Breakdown sheets. */
export function groupBreakdown<T>(
  items: T[],
  keyFn: (item: T) => string,
  amountFn: (item: T) => number
): (string | number)[][] {
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
