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

const ACTIVITY_COLS = ['AM', 'DM', 'MDM', 'PDM', 'Warehouse'];

function activityAbbrev(name: string): string {
  if (/implementation.*monitoring|aim/i.test(name)) return 'AM';
  if (/^distribution\s+monitoring|^dm$/i.test(name)) return 'DM';
  if (/market.*diversion|mdm/i.test(name)) return 'MDM';
  if (/post.*distribution|pdm/i.test(name)) return 'PDM';
  if (/warehouse|whm/i.test(name)) return 'Warehouse';
  return name;
}

const GREEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107838' } };
const GREEN_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };

interface FilteredRow {
  hub?: string;
  state?: string;
  activity?: string;
  dataCollector?: string;
  activitySite?: string;
  deviceId?: string;
}

const isPdmActivity = (activity: string) => /pdm/i.test(activity);

interface MergedCollector {
  primaryName: string;
  activities: Map<string, number>;
  nameVariants: number;
}

function mergeCollectorsByDevice(
  rows: { collector: string; deviceId: string; activity: string; abbr: string }[]
): MergedCollector[] {
  const deviceMap = new Map<string, { names: Map<string, number>; activities: Map<string, number> }>();
  const noDeviceMap = new Map<string, { activities: Map<string, number> }>();

  rows.forEach(r => {
    const devId = r.deviceId?.trim() || '';
    if (devId) {
      if (!deviceMap.has(devId)) deviceMap.set(devId, { names: new Map(), activities: new Map() });
      const entry = deviceMap.get(devId)!;
      entry.names.set(r.collector, (entry.names.get(r.collector) || 0) + 1);
      entry.activities.set(r.abbr, (entry.activities.get(r.abbr) || 0) + 1);
    } else {
      if (!noDeviceMap.has(r.collector)) noDeviceMap.set(r.collector, { activities: new Map() });
      const entry = noDeviceMap.get(r.collector)!;
      entry.activities.set(r.abbr, (entry.activities.get(r.abbr) || 0) + 1);
    }
  });

  const results: MergedCollector[] = [];
  deviceMap.forEach(d => {
    const nameEntries = [...d.names.entries()].sort((a, b) => b[1] - a[1]);
    results.push({
      primaryName: nameEntries[0]?.[0] || '(Unknown)',
      activities: d.activities,
      nameVariants: nameEntries.length,
    });
  });
  noDeviceMap.forEach((d, name) => {
    results.push({ primaryName: name, activities: d.activities, nameVariants: 0 });
  });
  return results.sort((a, b) => a.primaryName.localeCompare(b.primaryName));
}

const DETAIL_COLS = [...ACTIVITY_COLS, 'PDM Sites'];

export async function exportCoverageTrackerExcel(
  filteredData: FilteredRow[],
  filename: string,
  sessionName?: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  const label = sessionName?.trim() || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const hubStateRows = new Map<string, Map<string, { collector: string; deviceId: string; activity: string; abbr: string }[]>>();
  const hubStateMap = new Map<string, Map<string, Map<string, number>>>();
  const hubOrder: string[] = [];
  const hubSet = new Set<string>();

  filteredData.forEach(row => {
    if (!row.hub || !row.state || !row.activity) return;
    const hub = row.hub;
    const state = row.state;
    const collector = row.dataCollector || '(Unknown)';
    const abbr = activityAbbrev(row.activity);
    const deviceId = row.deviceId?.trim() || '';

    if (!hubSet.has(hub)) { hubSet.add(hub); hubOrder.push(hub); }

    if (!hubStateRows.has(hub)) hubStateRows.set(hub, new Map());
    const sr = hubStateRows.get(hub)!;
    if (!sr.has(state)) sr.set(state, []);
    sr.get(state)!.push({ collector, deviceId, activity: row.activity!, abbr });

    if (!hubStateMap.has(hub)) hubStateMap.set(hub, new Map());
    const hsm = hubStateMap.get(hub)!;
    if (!hsm.has(state)) hsm.set(state, new Map());
    const am = hsm.get(state)!;
    am.set(abbr, (am.get(abbr) || 0) + 1);
  });

  hubOrder.sort();

  const headers = ['Hub', 'State', 'Data Collector', ...DETAIL_COLS, 'Overall Site Total'];

  const ws = wb.addWorksheet(label.slice(0, 31));

  function addSectionHeaderRow(sheet: ExcelJS.Worksheet, hdrs: string[]) {
    const hRow = sheet.addRow(hdrs);
    hRow.eachCell((cell, ci) => {
      cell.fill = headerFill();
      cell.font = headerFont(10);
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 3 ? 'center' : 'left', vertical: 'middle' };
    });
    hRow.height = 22;
    return hRow;
  }

  function addGreenTotalRow(sheet: ExcelJS.Worksheet, label: string, totals: Map<string, number>, pdmSites: number, colOffset: number) {
    const vals: (string | number)[] = [];
    for (let i = 0; i < colOffset - 1; i++) vals.push('');
    vals.push(label);
    let overall = 0;
    ACTIVITY_COLS.forEach(col => {
      const v = totals.get(col) || 0;
      vals.push(v);
      if (col !== 'PDM') overall += v;
    });
    vals.push(pdmSites);
    overall += pdmSites;
    vals.push(overall);
    const row = sheet.addRow(vals);
    row.eachCell((cell, ci) => {
      cell.fill = GREEN_FILL;
      cell.font = GREEN_FONT;
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > colOffset ? 'center' : 'left', vertical: 'middle' };
    });
    row.height = 22;
    return row;
  }

  function addGreenTotalRowSummary(sheet: ExcelJS.Worksheet, label: string, totals: Map<string, number>, pdmSites: number, colOffset: number) {
    const vals: (string | number)[] = [];
    for (let i = 0; i < colOffset - 1; i++) vals.push('');
    vals.push(label);
    let overall = 0;
    ACTIVITY_COLS.forEach(col => {
      const v = totals.get(col) || 0;
      vals.push(v);
      if (col !== 'PDM') overall += v;
    });
    vals.push(pdmSites);
    overall += pdmSites;
    vals.push(overall);
    const row = sheet.addRow(vals);
    row.eachCell((cell, ci) => {
      cell.fill = GREEN_FILL;
      cell.font = GREEN_FONT;
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > colOffset ? 'center' : 'left', vertical: 'middle' };
    });
    row.height = 22;
    return row;
  }

  hubOrder.forEach(hub => {
    const stateMap = hubStateRows.get(hub);
    if (!stateMap) return;
    const states = [...stateMap.keys()].sort();

    states.forEach(state => {
      addSectionHeaderRow(ws, headers);
      const stateRowData = stateMap.get(state)!;
      const merged = mergeCollectorsByDevice(stateRowData);
      const stateTotals = new Map<string, number>();
      let statePdmSites = 0;

      merged.forEach(mc => {
        const vals: (string | number)[] = [hub, state, mc.primaryName];
        let rowTotal = 0;
        ACTIVITY_COLS.forEach(col => {
          const v = mc.activities.get(col) || 0;
          vals.push(v || '');
          if (col !== 'PDM') rowTotal += v;
          stateTotals.set(col, (stateTotals.get(col) || 0) + v);
        });
        const pdmCount = mc.activities.get('PDM') || 0;
        const pdmSites = pdmCount > 0 ? Math.ceil(pdmCount / 7) : 0;
        vals.push(pdmSites || '');
        statePdmSites += pdmSites;
        rowTotal += pdmSites;
        vals.push(rowTotal || '');
        const dataRow = ws.addRow(vals);
        dataRow.eachCell((cell, ci) => {
          cell.border = thinBorder();
          cell.alignment = { horizontal: ci > 3 ? 'center' : 'left', vertical: 'middle' };
          cell.font = bodyFont(10);
        });
        dataRow.height = 20;
      });

      addGreenTotalRow(ws, `Total ${state}`, stateTotals, statePdmSites, 3);
      ws.addRow([]);
    });
  });

  autoFitColumns(ws);

  const summarySheetName = `TPM Tracker ${label}`.slice(0, 31);
  const ws2 = wb.addWorksheet(summarySheetName);
  const titleRow = ws2.addRow([`TPM Tracker ${label}`]);
  titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  titleRow.height = 26;
  ws2.addRow([]);

  const summaryHeaders = ['HUB', 'State', ...DETAIL_COLS, 'Overall Site Total'];
  const sHdrRow = ws2.addRow(summaryHeaders);
  sHdrRow.eachCell((cell, ci) => {
    cell.fill = headerFill();
    cell.font = headerFont(10);
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });
  sHdrRow.height = 22;

  const grandTotals = new Map<string, number>();
  let grandPdmSites = 0;

  hubOrder.forEach(hub => {
    const hsm = hubStateMap.get(hub);
    if (!hsm) return;
    const states = [...hsm.keys()].sort();
    const hubTotals = new Map<string, number>();
    let hubPdmSites = 0;

    states.forEach(state => {
      const am = hsm.get(state)!;
      const vals: (string | number)[] = [hub, state];
      let rowTotal = 0;
      ACTIVITY_COLS.forEach(col => {
        const v = am.get(col) || 0;
        vals.push(v);
        if (col !== 'PDM') rowTotal += v;
        hubTotals.set(col, (hubTotals.get(col) || 0) + v);
        grandTotals.set(col, (grandTotals.get(col) || 0) + v);
      });
      const pdmCount = am.get('PDM') || 0;
      const pdmSites = pdmCount > 0 ? Math.ceil(pdmCount / 7) : 0;
      hubPdmSites += pdmSites;
      vals.push(pdmSites);
      rowTotal += pdmSites;
      vals.push(rowTotal);
      const dataRow = ws2.addRow(vals);
      dataRow.eachCell((cell, ci) => {
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
        cell.font = bodyFont(10);
      });
      dataRow.height = 20;
    });

    grandPdmSites += hubPdmSites;
    addGreenTotalRowSummary(ws2, `Total ${hub}`, hubTotals, hubPdmSites, 2);
  });

  const overallVals: (string | number)[] = ['', 'Overall Total'];
  let grandOverall = 0;
  ACTIVITY_COLS.forEach(col => {
    const v = grandTotals.get(col) || 0;
    overallVals.push(v);
    if (col !== 'PDM') grandOverall += v;
  });
  overallVals.push(grandPdmSites);
  grandOverall += grandPdmSites;
  overallVals.push(grandOverall);
  const grandRow = ws2.addRow(overallVals);
  grandRow.eachCell((cell, ci) => {
    cell.fill = GREEN_FILL;
    cell.font = GREEN_FONT;
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });
  grandRow.height = 22;

  autoFitColumns(ws2);

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
