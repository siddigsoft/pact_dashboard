import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const NAVY = 'FF0F2041';
const BLUE = 'FF2962FF';
const WHITE = 'FFFFFFFF';
const LIGHT_BG = 'FFF5F7FC';
const BORDER_COLOR = 'FFC8CDD7';
const AMBER = 'FFB47800';
const GREEN = 'FF107838';
const PURPLE = 'FF7C3AED';
const BLUE_TEXT = 'FF2563EB';
const GREEN_TEXT = 'FF16A34A';
const AMBER_TEXT = 'FFD97706';
const DARK = 'FF14141E';

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

export interface TrackerExportData {
  title: string;
  headers: string[];
  subHeaders?: string[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
}

export async function exportFormattedExcel(
  sheets: TrackerExportData[],
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  sheets.forEach(sheet => {
    const name = sheet.title.slice(0, 31);
    const ws = wb.addWorksheet(name);

    const titleRow = ws.addRow([sheet.title]);
    titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
    titleRow.height = 24;
    ws.addRow([]);

    if (sheet.subHeaders) {
      const subRow = ws.addRow(sheet.subHeaders);
      subRow.eachCell((cell, colIdx) => {
        cell.fill = headerFill();
        cell.font = headerFont(9);
        cell.border = thinBorder();
        cell.alignment = { horizontal: colIdx > 1 ? 'center' : 'left', vertical: 'middle', wrapText: true };
      });
      subRow.height = 18;
    }

    const hdrRow = ws.addRow(sheet.headers);
    hdrRow.eachCell((cell, colIdx) => {
      cell.fill = headerFill();
      cell.font = headerFont(10);
      cell.border = thinBorder();
      cell.alignment = { horizontal: colIdx > 1 ? 'center' : 'left', vertical: 'middle', wrapText: true };
    });
    hdrRow.height = 22;

    sheet.rows.forEach((rowData, ri) => {
      const row = ws.addRow(rowData);
      row.eachCell((cell, colIdx) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: colIdx > 1 ? 'center' : 'left', vertical: 'middle', wrapText: true };
        cell.font = bodyFont(10);
        if (ri % 2 === 1) {
          cell.fill = altFill();
        }
      });
      row.height = 20;
    });

    if (sheet.totalRow) {
      const totRow = ws.addRow(sheet.totalRow);
      totRow.eachCell((cell, colIdx) => {
        cell.fill = totalFill();
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
        cell.border = thinBorder();
        cell.alignment = { horizontal: colIdx > 1 ? 'center' : 'left', vertical: 'middle' };
      });
      totRow.height = 22;
    }

    autoFitColumns(ws);
  });

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export async function exportFormattedTrackerExcel(
  trackerData: any,
  isPdmActivity: (a: string) => boolean,
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors } = trackerData;

  const ws = wb.addWorksheet('Activity x Hub');
  const titleRow = ws.addRow(['Tracker - Activity by Hub']);
  titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  titleRow.height = 24;
  ws.addRow([]);

  const hubHeaderCells: string[] = [''];
  hubs.forEach((h: string) => { hubHeaderCells.push(h, '', '', ''); });
  hubHeaderCells.push('Grand Total', '', '', '');
  const hubRow = ws.addRow(hubHeaderCells);
  hubRow.eachCell((cell, ci) => {
    cell.fill = headerFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  hubRow.height = 22;

  for (let hi = 0; hi < hubs.length; hi++) {
    const startCol = 2 + hi * 4;
    ws.mergeCells(hubRow.number, startCol, hubRow.number, startCol + 3);
  }
  const gtStart = 2 + hubs.length * 4;
  ws.mergeCells(hubRow.number, gtStart, hubRow.number, gtStart + 3);

  const subCells: string[] = ['Activity'];
  hubs.forEach(() => { subCells.push('Sites', 'Actual', 'PDM', 'DC'); });
  subCells.push('Sites', 'Actual', 'PDM', 'DC');
  const subRow = ws.addRow(subCells);
  subRow.eachCell((cell, ci) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = headerFont(9);
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 1 ? 'center' : 'left', vertical: 'middle' };
    const subIdx = (ci - 2) % 4;
    if (ci > 1) {
      if (subIdx === 0) cell.font = headerFont(9);
      else if (subIdx === 1) cell.font = { ...headerFont(9), color: { argb: 'FF93C5FD' } };
      else if (subIdx === 2) cell.font = { ...headerFont(9), color: { argb: 'FFFBBF24' } };
      else cell.font = { ...headerFont(9), color: { argb: 'FFC4B5FD' } };
    }
  });
  subRow.height = 20;

  matrix.forEach((row: any, ri: number) => {
    const cells: (string | number)[] = [row.activity];
    row.cells.forEach((c: any) => {
      cells.push(c.sites || '-', c.questionnaires || '-', isPdmActivity(row.activity) && c.questionnaires ? Math.ceil(c.questionnaires / 7) : '-', c.collectors || '-');
    });
    cells.push(row.totalSites, row.totalQ, isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-', row.totalCollectors);
    const dataRow = ws.addRow(cells);
    dataRow.eachCell((cell, ci) => {
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 1 ? 'center' : 'left', vertical: 'middle' };
      cell.font = bodyFont(10);
      if (ri % 2 === 1) cell.fill = altFill();
      if (ci > 1) {
        const subIdx = (ci - 2) % 4;
        if (subIdx === 0) cell.font = bodyFont(10, BLUE_TEXT);
        else if (subIdx === 1) cell.font = bodyFont(10, GREEN_TEXT);
        else if (subIdx === 2) cell.font = bodyFont(10, AMBER_TEXT);
        else cell.font = bodyFont(10, PURPLE);
      }
    });
    dataRow.height = 20;
  });

  const totCells: (string | number)[] = ['Grand Total'];
  hubTotals.forEach((ht: any, hi: number) => {
    const pdmSitesCol = matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : r.cells[hi].questionnaires), 0);
    totCells.push(ht.sites, ht.questionnaires, pdmSitesCol || '-', ht.collectors);
  });
  const pdmSitesGrand = matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
  totCells.push(grandSites, grandQ, pdmSitesGrand || '-', grandCollectors);
  const totRow = ws.addRow(totCells);
  totRow.eachCell((cell) => {
    cell.fill = totalFill();
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  totRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  totRow.height = 22;

  autoFitColumns(ws);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
