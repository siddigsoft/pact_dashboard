import { format } from 'date-fns';
import { exportFormattedExcel } from './formattedExcelExport';

/**
 * PACT Command Center standard Excel report format.
 * All exports now use ExcelJS via exportFormattedExcel:
 * branded navy title, teal headers, alternating rows, borders, auto-filter, frozen header.
 */

export interface StandardSheetSpec {
  sheetName: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  totalsRow?: (string | number | null | undefined)[];
  colWidths?: Record<number, number>;
}

export interface StandardReportOptions {
  reportTitle: string;
  subtitleLine: string;
  metaLine?: string;
  mainSheet: StandardSheetSpec;
  summarySheet?: { title: string; rows: (string | number | null | undefined)[][]; colWidths?: number[] };
  breakdownSheets?: { title: string; sheetName: string; headers: string[]; rows: (string | number | null | undefined)[][]; colWidths?: number[] }[];
  filenamePrefix: string;
}

/**
 * Builds and downloads a PACT-branded, fully-formatted Excel workbook.
 * Now async — wrap in a .then() or await if callers care about completion.
 */
export function exportStandardExcel(opts: StandardReportOptions): Promise<void> {
  const colWidthsArr = opts.mainSheet.headers.map((_, i) => opts.mainSheet.colWidths?.[i] || undefined);

  return exportFormattedExcel({
    reportTitle:  opts.reportTitle,
    subtitleLine: opts.subtitleLine,
    metaLine:     opts.metaLine,
    filenamePrefix: opts.filenamePrefix,
    mainSheet: {
      sheetName: opts.mainSheet.sheetName,
      headers:   opts.mainSheet.headers,
      rows:      opts.mainSheet.rows,
      totalsRow: opts.mainSheet.totalsRow,
      colWidths: colWidthsArr.some(Boolean) ? (colWidthsArr as number[]) : undefined,
    },
    summarySheet: opts.summarySheet ? {
      title:     opts.summarySheet.title,
      rows:      opts.summarySheet.rows,
      colWidths: opts.summarySheet.colWidths,
    } : undefined,
    breakdownSheets: opts.breakdownSheets?.map(bs => ({
      title:     bs.title,
      sheetName: bs.sheetName,
      headers:   bs.headers,
      rows:      bs.rows,
      colWidths: bs.colWidths,
    })),
  });
}

/** Sums a numeric field across an array, defaulting missing/NaN values to 0. */
export function sumField<T>(items: T[], getter: (item: T) => number | null | undefined): number {
  return items.reduce((s, item) => s + (getter(item) || 0), 0);
}

/** Builds simple label/count/amount breakdown rows grouped by a key function. */
export function groupBreakdown<T>(
  items: T[],
  keyFn: (item: T) => string,
  amountFn: (item: T) => number,
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
