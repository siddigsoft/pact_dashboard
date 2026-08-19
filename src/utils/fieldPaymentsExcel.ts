import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

const NAVY = 'FF0F2041';
const NAVY_LIGHT = 'FF1D3461';
const WHITE = 'FFFFFFFF';
const LIGHT = 'FFF5F7FC';
const BORDER = 'FFC8CDD7';
const DARK = 'FF14141E';
const MUTED = 'FF5A5F6E';
const GREEN = 'FF107838';
const GREEN_BG = 'FFE4F5EB';
const RED = 'FFB42828';
const RED_BG = 'FFFFF0F0';
const AMBER = 'FF9A6700';
const AMBER_BG = 'FFFFF8E6';
const BLUE = 'FF1D4ED8';
const BLUE_BG = 'FFEFF6FF';

export type FieldPaymentsExcelValue = string | number | Date | null | undefined;

export interface FieldPaymentsExcelColumn {
  key: string;
  header: string;
  width?: number;
  format?: 'text' | 'integer' | 'currency' | 'date' | 'status';
  total?: boolean;
}

export interface FieldPaymentsExcelOptions {
  title: string;
  sheetName: string;
  filenamePrefix: string;
  filters: string[];
  summary: Array<{ label: string; value: string | number }>;
  columns: FieldPaymentsExcelColumn[];
  rows: Array<Record<string, FieldPaymentsExcelValue>>;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } };
  return { top: side, bottom: side, left: side, right: side };
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function normalizeValue(value: FieldPaymentsExcelValue, column: FieldPaymentsExcelColumn) {
  if (value == null || value === '') return column.format === 'currency' || column.format === 'integer' ? 0 : '—';
  if (column.format === 'date' && typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  return value;
}

function styleStatusCell(cell: ExcelJS.Cell) {
  const value = String(cell.value ?? '').toLowerCase();
  let color = MUTED;
  let background = LIGHT;

  if (/(paid|posted|executed|complete|success|current)/.test(value) && !/(unpaid|not posted|pending)/.test(value)) {
    color = GREEN;
    background = GREEN_BG;
  } else if (/(error|cancel|write.?off|overdue|failed)/.test(value)) {
    color = RED;
    background = RED_BG;
  } else if (/(pending|partial|approved|unpaid|hold|return)/.test(value)) {
    color = AMBER;
    background = AMBER_BG;
  } else if (/(roll|redirect|reassign|reduce)/.test(value)) {
    color = BLUE;
    background = BLUE_BG;
  }

  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: color } };
  cell.fill = solidFill(background);
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report';
}

export function buildFieldPaymentsWorkbook(options: FieldPaymentsExcelOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PACT Command Center';
  workbook.company = 'PACT';
  workbook.created = new Date();
  workbook.modified = new Date();

  const columnCount = Math.max(options.columns.length, 1);
  const worksheet = workbook.addWorksheet(safeSheetName(options.sheetName), {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const organisationRow = worksheet.addRow(['PACT Command Center']);
  worksheet.mergeCells(organisationRow.number, 1, organisationRow.number, columnCount);
  organisationRow.height = 22;
  organisationRow.getCell(1).fill = solidFill(NAVY);
  organisationRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
  organisationRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const titleRow = worksheet.addRow([options.title]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  titleRow.height = 28;
  titleRow.getCell(1).fill = solidFill(NAVY_LIGHT);
  titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const generatedRow = worksheet.addRow([`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`]);
  worksheet.mergeCells(generatedRow.number, 1, generatedRow.number, columnCount);
  generatedRow.getCell(1).fill = solidFill('FFF0F4FB');
  generatedRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: MUTED } };
  generatedRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const filterText = options.filters.length ? options.filters.join('  |  ') : 'All records';
  const filterRow = worksheet.addRow([`Filters: ${filterText}`]);
  worksheet.mergeCells(filterRow.number, 1, filterRow.number, columnCount);
  filterRow.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: DARK } };
  filterRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  filterRow.height = 24;

  const summaryText = options.summary.map(item => `${item.label}: ${item.value}`).join('  |  ');
  const summaryRow = worksheet.addRow([`Summary: ${summaryText || `Records: ${options.rows.length}`}`]);
  worksheet.mergeCells(summaryRow.number, 1, summaryRow.number, columnCount);
  summaryRow.getCell(1).fill = solidFill('FFE8EDF5');
  summaryRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: DARK } };
  summaryRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  summaryRow.height = 24;

  worksheet.addRow([]);

  const headerRow = worksheet.addRow(options.columns.map(column => column.header));
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill = solidFill(NAVY);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  if (options.rows.length === 0) {
    const emptyRow = worksheet.addRow(['No records match the selected filters.']);
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, columnCount);
    emptyRow.height = 30;
    emptyRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: MUTED } };
    emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    emptyRow.getCell(1).border = thinBorder();
  } else {
    options.rows.forEach((source, rowIndex) => {
      const row = worksheet.addRow(options.columns.map(column => normalizeValue(source[column.key], column)));
      row.height = 21;
      row.eachCell((cell, columnIndex) => {
        const column = options.columns[columnIndex - 1];
        cell.border = thinBorder();
        cell.font = { name: 'Calibri', size: 10, color: { argb: DARK } };
        cell.alignment = {
          horizontal: column.format === 'currency' || column.format === 'integer' ? 'right' : 'left',
          vertical: 'middle',
          wrapText: column.format === 'text',
        };
        if (rowIndex % 2 === 1) cell.fill = solidFill(LIGHT);
        if (column.format === 'currency') cell.numFmt = '"SDG" #,##0.00;[Red]-"SDG" #,##0.00';
        if (column.format === 'integer') cell.numFmt = '#,##0';
        if (column.format === 'date' && cell.value instanceof Date) cell.numFmt = 'dd mmm yyyy';
        if (column.format === 'status') styleStatusCell(cell);
      });
    });

    const totalColumns = options.columns
      .map((column, index) => ({ column, index }))
      .filter(item => item.column.total);

    if (totalColumns.length) {
      const totals = options.columns.map((column, index) => {
        if (index === 0) return 'TOTAL';
        if (!column.total) return '';
        return options.rows.reduce((sum, row) => {
          const value = row[column.key];
          return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
        }, 0);
      });
      const totalRow = worksheet.addRow(totals);
      totalRow.height = 24;
      totalRow.eachCell((cell, columnIndex) => {
        const column = options.columns[columnIndex - 1];
        cell.fill = solidFill('FFE2E8F0');
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DARK } };
        cell.border = thinBorder();
        cell.alignment = { horizontal: column.format === 'currency' ? 'right' : 'left', vertical: 'middle' };
        if (column.format === 'currency') cell.numFmt = '"SDG" #,##0.00;[Red]-"SDG" #,##0.00';
        if (column.format === 'integer') cell.numFmt = '#,##0';
      });
    }
  }

  worksheet.columns = options.columns.map(column => ({
    key: column.key,
    width: column.width ?? 16,
  }));
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow.number }];
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: columnCount },
  };
  worksheet.headerFooter.oddFooter = 'PACT Command Center | &D | Page &P of &N';

  const filename = `${options.filenamePrefix}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  return { workbook, worksheet, filename, headerRowNumber: headerRow.number };
}

export async function exportFieldPaymentsExcel(options: FieldPaymentsExcelOptions) {
  const { workbook, filename } = buildFieldPaymentsWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
  return filename;
}