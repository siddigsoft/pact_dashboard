import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { parse as dateParse, isValid as dateIsValid, format as dateFmt } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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
const DUP_BG = 'FFFFF3CD';
const DUP_TEXT = 'FF92400E';

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
  filename: string,
  filteredRows?: FilteredRow[]
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
      cells.push(c.sites || '-', c.questionnaires || '-', c.questionnaires ? Math.floor(c.questionnaires / 7) : '-', c.collectors || '-');
    });
    cells.push(row.totalSites, row.totalQ, row.totalQ ? Math.floor(row.totalQ / 7) : '-', row.totalCollectors);
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
    const pdmSitesCol = matrix.reduce((a: number, r: any) => a + Math.floor(r.cells[hi].questionnaires / 7), 0);
    totCells.push(ht.sites, ht.questionnaires, pdmSitesCol || '-', ht.collectors);
  });
  const pdmSitesGrand = matrix.reduce((a: number, r: any) => a + Math.floor(r.totalQ / 7), 0);
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

  if (filteredRows && filteredRows.length > 0) {
    buildSummarySheet(wb, filteredRows, 'Tracker Summary Report');
  }

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

function buildSummarySheet(wb: ExcelJS.Workbook, rows: FilteredRow[], sheetTitle: string) {
  const ws = wb.addWorksheet('Summary');
  const titleR = ws.addRow([sheetTitle]);
  titleR.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  titleR.height = 26;
  ws.addRow([]);

  const addSection = (text: string) => {
    const r = ws.addRow([text, '']);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    r.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri' };
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    r.getCell(2).font = { bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri' };
    r.height = 22;
  };
  const addPair = (label: string, value: string | number) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = bodyFont(10);
    r.getCell(2).font = bodyFont(10);
    r.getCell(1).border = thinBorder();
    r.getCell(2).border = thinBorder();
  };

  const uniqueHubs = new Set(rows.map(r => r.hub).filter(Boolean));
  const uniqueStates = new Set(rows.map(r => r.state).filter(Boolean));
  const uniqueLocalities = new Set(rows.map(r => r.locality).filter(Boolean));
  const uniqueSites = new Set(rows.map(r => r.activitySite).filter(Boolean));
  const uniqueCollectors = new Set(rows.map(r => r.dataCollector).filter(Boolean));
  const uniqueSupervisors = new Set(rows.map(r => r.supervisor).filter(Boolean));

  const parseDateFmts = ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy/MM/dd', 'M/d/yyyy', 'd/M/yyyy'];
  const dates: Date[] = [];
  rows.forEach(r => {
    if (!r.date) return;
    for (const fmt of parseDateFmts) {
      try {
        const d = dateParse(r.date, fmt, new Date());
        if (dateIsValid(d)) { dates.push(d); break; }
      } catch { /* skip */ }
    }
  });
  let monthCoverage = 'N/A';
  if (dates.length > 0) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dateFmt(dates[0], 'MMMM yyyy');
    const last = dateFmt(dates[dates.length - 1], 'MMMM yyyy');
    monthCoverage = first === last ? first : `${first} - ${last}`;
  }

  addSection('Report Information');
  addPair('Generated Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  addPair('Month Coverage', monthCoverage);
  ws.addRow([]);

  addSection('Coverage Totals');
  addPair('Total Questionnaires', rows.length);
  addPair('Unique Sites', uniqueSites.size);
  addPair('Hubs', uniqueHubs.size);
  addPair('States', uniqueStates.size);
  addPair('Localities', uniqueLocalities.size);
  addPair('Data Collectors', uniqueCollectors.size);
  addPair('Supervisors', uniqueSupervisors.size);
  ws.addRow([]);

  addSection('Hub Coverage');
  Array.from(uniqueHubs).sort().forEach(hub => {
    const hubRows = rows.filter(r => r.hub === hub);
    const hubSites = new Set(hubRows.map(r => r.activitySite).filter(Boolean)).size;
    addPair(hub, `${hubRows.length} Q, ${hubSites} sites`);
  });
  ws.addRow([]);

  addSection('Team Roster');
  const supMap = new Map<string, Map<string, { deviceId: string; count: number }>>();
  rows.forEach(r => {
    const sup = r.supervisor || '(Unassigned)';
    const dc = r.dataCollector || '(Unknown)';
    if (!supMap.has(sup)) supMap.set(sup, new Map());
    const cm = supMap.get(sup)!;
    if (!cm.has(dc)) cm.set(dc, { deviceId: r.deviceId || '', count: 0 });
    cm.get(dc)!.count++;
  });
  Array.from(supMap.entries())
    .sort(([, a], [, b]) => {
      const totalA = Array.from(a.values()).reduce((s, c) => s + c.count, 0);
      const totalB = Array.from(b.values()).reduce((s, c) => s + c.count, 0);
      return totalB - totalA;
    })
    .forEach(([sup, dcMap]) => {
      const totalQ = Array.from(dcMap.values()).reduce((s, c) => s + c.count, 0);
      const supRow = ws.addRow([`Supervisor: ${sup}`, `${dcMap.size} DCs, ${totalQ} Q`]);
      supRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
      supRow.getCell(2).font = bodyFont(10);
      supRow.getCell(1).border = thinBorder();
      supRow.getCell(2).border = thinBorder();
      Array.from(dcMap.entries())
        .sort(([, a], [, b]) => b.count - a.count)
        .forEach(([name, info]) => {
          addPair(`  ${name}`, `Device: ${info.deviceId} | ${info.count} Q`);
        });
    });

  ws.columns = [{ width: 40 }, { width: 45 }];
}

const GREEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF107838' } };
const GREEN_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };

interface FilteredRow {
  hub?: string;
  state?: string;
  locality?: string;
  activity?: string;
  dataCollector?: string;
  activitySite?: string;
  deviceId?: string;
  supervisor?: string;
  date?: string;
}

import { isPdmActivity } from '@/utils/pdmMdmUtils';

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
    const existing = results.find(r => r.primaryName === name);
    if (existing) {
      d.activities.forEach((count, abbr) => {
        existing.activities.set(abbr, (existing.activities.get(abbr) || 0) + count);
      });
    } else {
      results.push({ primaryName: name, activities: d.activities, nameVariants: 0 });
    }
  });
  return results.sort((a, b) => a.primaryName.localeCompare(b.primaryName));
}

const DETAIL_COLS = [...ACTIVITY_COLS, 'PDM Sites'];

interface CollectorClassificationInfo {
  classificationLevel: string;
  baseFee: number;
  transportFee: number;
  currency: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
}

async function fetchCollectorClassifications(): Promise<Map<string, CollectorClassificationInfo>> {
  const result = new Map<string, CollectorClassificationInfo>();

  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .or('role.ilike.%data collector%,role.ilike.%datacollector%,role.ilike.%enumerator%,role.ilike.%coordinator%');

    if (!profiles || profiles.length === 0) return result;

    const profileMap = new Map<string, { id: string; fullName: string }>();
    profiles.forEach(p => {
      const normalizedName = (p.full_name || '').trim().toLowerCase();
      if (normalizedName) {
        profileMap.set(normalizedName, { id: p.id, fullName: p.full_name || '' });
      }
    });

    const { data: classifications } = await supabase
      .from('user_classifications')
      .select('*')
      .eq('is_active', true);

    const { data: feeStructures } = await supabase
      .from('classification_fee_structures')
      .select('*')
      .eq('is_active', true);

    const classMap = new Map<string, any>();
    (classifications || []).forEach(c => {
      classMap.set(c.user_id, c);
    });

    const feeMap = new Map<string, any>();
    (feeStructures || []).forEach(f => {
      const key = `${f.classification_level}_${f.role_scope}`;
      feeMap.set(key, f);
    });

    profileMap.forEach(({ id, fullName }, normalizedName) => {
      const classification = classMap.get(id);
      if (classification) {
        const feeKey = `${classification.classification_level}_${classification.role_scope}`;
        const fee = feeMap.get(feeKey);
        result.set(normalizedName, {
          classificationLevel: classification.classification_level || 'N/A',
          baseFee: fee ? parseInt(fee.site_visit_base_fee_cents || 0) / 100 : 0,
          transportFee: fee ? parseInt(fee.site_visit_transport_fee_cents || 0) / 100 : 0,
          currency: fee?.currency || 'SDG',
          bankAccountName: '',
          bankAccountNumber: '',
          bankBranch: '',
        });
      }
    });
  } catch (err) {
    console.error('[CoverageTracker] Error fetching classifications:', err);
  }

  return result;
}

function matchCollectorClassification(
  collectorName: string,
  classificationMap: Map<string, CollectorClassificationInfo>
): CollectorClassificationInfo | null {
  const normalized = collectorName.trim().toLowerCase();
  if (classificationMap.has(normalized)) return classificationMap.get(normalized)!;

  for (const [key, value] of classificationMap.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) return value;
  }

  const nameParts = normalized.split(/\s+/);
  if (nameParts.length >= 2) {
    for (const [key, value] of classificationMap.entries()) {
      const keyParts = key.split(/\s+/);
      const matchCount = nameParts.filter(p => keyParts.some(kp => kp === p)).length;
      if (matchCount >= 2) return value;
    }
  }

  return null;
}

export async function buildCoverageTrackerWorkbook(
  filteredData: FilteredRow[],
  sessionName?: string
): Promise<ArrayBuffer> {
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

  const headers = ['Hub', 'State', 'Data Collector', ...DETAIL_COLS, 'Overall Site Total', 'Total Sites (PDM/7)', 'Class. Level', 'Fee/Site', 'Transport Fee', 'Total Cost', 'Bank Account', 'Bank Branch'];

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
      overall += v;
    });
    vals.push(pdmSites);
    vals.push(overall);
    let siteTotal = 0;
    ACTIVITY_COLS.forEach(col => {
      if (col !== 'PDM') siteTotal += (totals.get(col) || 0);
    });
    siteTotal += pdmSites;
    vals.push(siteTotal);
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
      overall += v;
    });
    vals.push(pdmSites);
    vals.push(overall);
    let siteTotal = 0;
    ACTIVITY_COLS.forEach(col => {
      if (col !== 'PDM') siteTotal += (totals.get(col) || 0);
    });
    siteTotal += pdmSites;
    vals.push(siteTotal);
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

      const nameCounts = new Map<string, number>();
      merged.forEach(mc => {
        const n = mc.primaryName.trim().toLowerCase();
        nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
      });
      const dupNames = new Set<string>();
      nameCounts.forEach((count, n) => { if (count > 1) dupNames.add(n); });

      merged.forEach(mc => {
        const isDup = dupNames.has(mc.primaryName.trim().toLowerCase());
        const vals: (string | number)[] = [hub, state, mc.primaryName];
        let rowTotal = 0;
        let nonPdmTotal = 0;
        ACTIVITY_COLS.forEach(col => {
          const v = mc.activities.get(col) || 0;
          vals.push(v || '');
          rowTotal += v;
          if (col !== 'PDM') nonPdmTotal += v;
          stateTotals.set(col, (stateTotals.get(col) || 0) + v);
        });
        const pdmCount = mc.activities.get('PDM') || 0;
        const pdmSites = pdmCount > 0 ? Math.floor(pdmCount / 7) : 0;
        vals.push(pdmSites || '');
        statePdmSites += pdmSites;
        vals.push(rowTotal || '');
        const siteTotal = nonPdmTotal + pdmSites;
        vals.push(siteTotal || '');

        vals.push('');
        vals.push('');
        vals.push('');
        vals.push('');
        vals.push('');
        vals.push('');

        const dataRow = ws.addRow(vals);
        dataRow.eachCell((cell, ci) => {
          cell.border = thinBorder();
          cell.alignment = { horizontal: ci > 3 ? 'center' : 'left', vertical: 'middle' };
          if (isDup) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DUP_BG } };
            cell.font = bodyFont(10, DUP_TEXT);
          } else {
            cell.font = bodyFont(10);
          }
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

  const summaryHeaders = ['HUB', 'State', ...DETAIL_COLS, 'Overall Site Total', 'Total Sites (PDM/7)'];
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
      let nonPdmTotal = 0;
      ACTIVITY_COLS.forEach(col => {
        const v = am.get(col) || 0;
        vals.push(v);
        rowTotal += v;
        if (col !== 'PDM') nonPdmTotal += v;
        hubTotals.set(col, (hubTotals.get(col) || 0) + v);
        grandTotals.set(col, (grandTotals.get(col) || 0) + v);
      });
      const pdmCount = am.get('PDM') || 0;
      const pdmSites = pdmCount > 0 ? Math.floor(pdmCount / 7) : 0;
      hubPdmSites += pdmSites;
      vals.push(pdmSites);
      vals.push(rowTotal);
      vals.push(nonPdmTotal + pdmSites);
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
  let grandNonPdm = 0;
  ACTIVITY_COLS.forEach(col => {
    const v = grandTotals.get(col) || 0;
    overallVals.push(v);
    grandOverall += v;
    if (col !== 'PDM') grandNonPdm += v;
  });
  overallVals.push(grandPdmSites);
  overallVals.push(grandOverall);
  overallVals.push(grandNonPdm + grandPdmSites);
  const grandRow = ws2.addRow(overallVals);
  grandRow.eachCell((cell, ci) => {
    cell.fill = GREEN_FILL;
    cell.font = GREEN_FONT;
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });
  grandRow.height = 22;

  autoFitColumns(ws2);

  if (filteredData.length > 0) {
    buildSummarySheet(wb, filteredData, 'Coverage Tracker Summary');
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export interface EnumTrackerEntry {
  collectorId: string;
  collectorName: string;
  hub: string;
  state: string;
  covered: number;
  submitted: number;
  wfpConfirmed: number;
  pending: number;
  rejected: number;
  total: number;
  sites: { siteName: string; locality: string; hub: string; state: string; status: string; date: string; activity: string }[];
}

export async function exportEnumeratorTrackerExcel(
  rows: EnumTrackerEntry[],
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  // ── Sheet 1: Summary ──────────────────────────────────────────
  const ws1 = wb.addWorksheet('Enumerator Summary');
  ws1.addRow(['Enumerator Tracker — Sites Covered per Data Collector']).font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  ws1.getRow(1).height = 28;
  ws1.addRow(['Generated: ' + new Date().toLocaleString()]).font = bodyFont(9, 'FF6B7280');
  ws1.addRow([]);

  const hdr1 = ws1.addRow(['#', 'Enumerator', 'Hub', 'State', 'Total Sites', 'WFP Confirmed', 'Submitted', 'Pending', 'Rejected', 'Coverage %']);
  hdr1.height = 22;
  hdr1.eachCell((cell, ci) => {
    cell.fill = headerFill(); cell.font = headerFont(10); cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle', wrapText: true };
  });

  rows.forEach((r, i) => {
    const pctNum = r.total > 0 ? (r.covered / r.total) * 100 : 0;
    const pct = r.total > 0 ? pctNum.toFixed(1) + '%' : '0%';
    const row = ws1.addRow([i + 1, r.collectorName, r.hub, r.state, r.total, r.wfpConfirmed, r.submitted, r.pending, r.rejected, pct]);
    row.height = 20;
    row.eachCell((cell, ci) => {
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
      cell.font = bodyFont(10);
      if (i % 2 === 1) cell.fill = altFill();
    });
    const pctCell = row.getCell(10);
    pctCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: pctNum >= 80 ? GREEN : pctNum >= 50 ? AMBER : 'FFDC2626' } };
  });

  const grandTot  = rows.reduce((s, r) => s + r.total, 0);
  const grandWfp  = rows.reduce((s, r) => s + r.wfpConfirmed, 0);
  const grandCov  = rows.reduce((s, r) => s + r.covered, 0);
  const grandPend = rows.reduce((s, r) => s + r.pending, 0);
  const grandRej  = rows.reduce((s, r) => s + r.rejected, 0);
  const totals = ws1.addRow(['', 'TOTAL', '', '', grandTot, grandWfp, grandCov, grandPend, grandRej, grandTot > 0 ? ((grandCov / grandTot) * 100).toFixed(1) + '%' : '0%']);
  totals.height = 22;
  totals.eachCell((cell, ci) => {
    cell.fill = totalFill(); cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border = thinBorder(); cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });
  autoFitColumns(ws1);

  // ── Sheet 2: Site Detail (with Activity) ──────────────────────
  const ws2 = wb.addWorksheet('Site Detail');
  ws2.addRow(['Enumerator Tracker — All Sites Detail']).font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  ws2.getRow(1).height = 28;
  ws2.addRow([]);
  const hdr2 = ws2.addRow(['#', 'Enumerator', 'Hub', 'State', 'Activity', 'Locality', 'Site Name', 'Status', 'Date']);
  hdr2.height = 22;
  hdr2.eachCell((cell, ci) => {
    cell.fill = headerFill(); cell.font = headerFont(10); cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 4 ? 'center' : 'left', vertical: 'middle', wrapText: true };
  });
  let siteSeq = 0;
  rows.forEach(r => {
    r.sites.forEach(s => {
      siteSeq++;
      const row = ws2.addRow([siteSeq, r.collectorName, s.hub || r.hub, s.state || r.state, s.activity || '—', s.locality, s.siteName, s.status.replace(/_/g, ' '), s.date]);
      row.height = 20;
      row.eachCell((cell, ci) => {
        cell.border = thinBorder(); cell.alignment = { horizontal: ci > 4 ? 'center' : 'left', vertical: 'middle' };
        cell.font = bodyFont(10);
        if (siteSeq % 2 === 0) cell.fill = altFill();
      });
      const sc = s.status === 'wfp_confirmed' ? GREEN : s.status === 'submitted' ? BLUE_TEXT : s.status === 'rejected' ? 'FFDC2626' : AMBER_TEXT;
      row.getCell(8).font = { bold: true, size: 10, name: 'Calibri', color: { argb: sc } };
    });
  });
  autoFitColumns(ws2);

  // ── Sheet 3: By Activity ───────────────────────────────────────
  const ws3 = wb.addWorksheet('By Activity');
  ws3.addRow(['Enumerator Tracker — Breakdown by Activity']).font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  ws3.getRow(1).height = 28;
  ws3.addRow(['Generated: ' + new Date().toLocaleString()]).font = bodyFont(9, 'FF6B7280');
  ws3.addRow([]);

  const actMap3 = new Map<string, { collectorId: string; collectorName: string; hub: string; state: string; total: number; covered: number }[]>();
  for (const r of rows) {
    for (const s of r.sites) {
      const act = s.activity || '—';
      if (!actMap3.has(act)) actMap3.set(act, []);
      const arr = actMap3.get(act)!;
      const key = `${r.collectorId}||${r.hub}||${r.state}`;
      let entry = arr.find(e => `${e.collectorId}||${e.hub}||${e.state}` === key);
      if (!entry) { entry = { collectorId: r.collectorId, collectorName: r.collectorName, hub: r.hub, state: r.state, total: 0, covered: 0 }; arr.push(entry); }
      entry.total++;
      if (['submitted', 'wfp_confirmed'].includes(s.status)) entry.covered++;
    }
  }
  const ACT_COLS3 = ['#', 'Data Collector', 'Hub', 'State', 'Total Sites', 'Submitted', 'Coverage %'];
  let actSeq3 = 0;
  for (const [act, colls] of [...actMap3.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const actTot = colls.reduce((s, c) => s + c.total, 0);
    const actCov = colls.reduce((s, c) => s + c.covered, 0);
    const aHdr = ws3.addRow([act, '', '', '', '', '', '']);
    ws3.mergeCells(aHdr.number, 1, aHdr.number, ACT_COLS3.length);
    aHdr.height = 24; aHdr.getCell(1).fill = headerFill();
    aHdr.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: WHITE } };
    aHdr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    const aColHdr = ws3.addRow(ACT_COLS3);
    aColHdr.height = 20;
    aColHdr.eachCell((cell, ci) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = headerFont(9); cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
    });
    colls.sort((a, b) => b.covered - a.covered).forEach((c, i) => {
      actSeq3++;
      const pctNum = c.total > 0 ? (c.covered / c.total) * 100 : 0;
      const dr = ws3.addRow([actSeq3, c.collectorName, c.hub, c.state, c.total, c.covered, c.total > 0 ? pctNum.toFixed(1) + '%' : '0%']);
      dr.height = 20;
      dr.eachCell((cell, ci) => { cell.border = thinBorder(); cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' }; cell.font = bodyFont(10); if (i % 2 === 1) cell.fill = altFill(); });
      dr.getCell(7).font = { bold: true, size: 10, name: 'Calibri', color: { argb: pctNum >= 80 ? GREEN : pctNum >= 50 ? AMBER : 'FFDC2626' } };
    });
    const aPctNum = actTot > 0 ? (actCov / actTot) * 100 : 0;
    const aSub = ws3.addRow(['', 'Activity Total', '', '', actTot, actCov, actTot > 0 ? aPctNum.toFixed(1) + '%' : '0%']);
    aSub.height = 18;
    aSub.eachCell((cell, ci) => { cell.fill = totalFill(); cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: DARK } }; cell.border = thinBorder(); cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' }; });
    ws3.addRow([]);
  }
  autoFitColumns(ws3);

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

// ── Formatted Enumerator Tracker Excel (Hub-grouped) ─────────────
export async function exportEnumeratorTrackerFormattedExcel(
  rows: EnumTrackerEntry[],
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();

  // Rebuild Hub → State → Collector hierarchy from flat rows
  const hubMap = new Map<string, Map<string, EnumTrackerEntry[]>>();
  for (const r of rows) {
    const hub   = r.hub   || '—';
    const state = r.state || '—';
    if (!hubMap.has(hub)) hubMap.set(hub, new Map());
    const sm = hubMap.get(hub)!;
    if (!sm.has(state)) sm.set(state, []);
    sm.get(state)!.push(r);
  }
  const hubGroups = [...hubMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  // ── Sheet 1: Grouped by Hub → State → Collector ───────────────
  const COLS = ['#', 'Data Collector', 'Total Sites', 'WFP Confirmed', 'Submitted', 'Pending', 'Rejected', 'Coverage %'];
  const COL_COUNT = COLS.length;

  const ws1 = wb.addWorksheet('Enumerator by Hub');

  // Title
  const titleRow = ws1.addRow(['Enumerator Tracker — By Hub, State & Data Collector']);
  titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  titleRow.height = 28;
  ws1.mergeCells(titleRow.number, 1, titleRow.number, COL_COUNT);
  ws1.addRow(['Generated: ' + new Date().toLocaleString()]).font = bodyFont(9, 'FF6B7280');
  ws1.addRow([]);

  let seq = 0;

  for (const [hub, sm] of hubGroups) {
    const hubStates = [...sm.entries()].sort(([a], [b]) => a.localeCompare(b));
    const hubCollectors = hubStates.flatMap(([, cs]) => cs);
    const hubTotal   = hubCollectors.reduce((s, c) => s + c.total,       0);
    const hubWfp     = hubCollectors.reduce((s, c) => s + c.wfpConfirmed, 0);
    const hubCovered = hubCollectors.reduce((s, c) => s + c.covered,     0);
    const hubPend    = hubCollectors.reduce((s, c) => s + c.pending,     0);
    const hubRej     = hubCollectors.reduce((s, c) => s + c.rejected,    0);

    // Hub header row (navy)
    const hubRow = ws1.addRow([hub, '', '', '', '', '', '', '']);
    ws1.mergeCells(hubRow.number, 1, hubRow.number, COL_COUNT);
    hubRow.height = 24;
    hubRow.getCell(1).fill = headerFill();
    hubRow.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: WHITE } };
    hubRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    // Column header row
    const colHdr = ws1.addRow(COLS);
    colHdr.height = 20;
    colHdr.eachCell((cell, ci) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = headerFont(9); cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
    });

    for (const [state, collectors] of hubStates) {
      const stateTot     = collectors.reduce((s, c) => s + c.total,       0);
      const stateWfp     = collectors.reduce((s, c) => s + c.wfpConfirmed, 0);
      const stateCovered = collectors.reduce((s, c) => s + c.covered,     0);
      const statePend    = collectors.reduce((s, c) => s + c.pending,     0);
      const stateRej     = collectors.reduce((s, c) => s + c.rejected,    0);

      // State sub-header row (light blue)
      const stateRow = ws1.addRow([`  ${state}`, '', '', '', '', '', '', '']);
      ws1.mergeCells(stateRow.number, 1, stateRow.number, COL_COUNT);
      stateRow.height = 18;
      stateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E4FF' } };
      stateRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF1E3A8A' } };
      stateRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

      // Collector rows
      collectors.sort((a, b) => b.covered - a.covered).forEach((c, i) => {
        seq++;
        const pctNum = c.total > 0 ? (c.covered / c.total) * 100 : 0;
        const pct    = c.total > 0 ? pctNum.toFixed(1) + '%' : '0%';
        const dataRow = ws1.addRow([seq, c.collectorName, c.total, c.wfpConfirmed, c.covered, c.pending, c.rejected, pct]);
        dataRow.height = 20;
        dataRow.eachCell((cell, ci) => {
          cell.border = thinBorder();
          cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
          cell.font = bodyFont(10);
          if (i % 2 === 1) cell.fill = altFill();
        });
        dataRow.getCell(COL_COUNT).font = { bold: true, size: 10, name: 'Calibri', color: { argb: pctNum >= 80 ? GREEN : pctNum >= 50 ? AMBER : 'FFDC2626' } };
      });

      // State subtotal
      const stPctNum = stateTot > 0 ? (stateCovered / stateTot) * 100 : 0;
      const stSub = ws1.addRow(['', `State Total — ${state}`, stateTot, stateWfp, stateCovered, statePend, stateRej, stateTot > 0 ? stPctNum.toFixed(1) + '%' : '0%']);
      stSub.height = 18;
      stSub.eachCell((cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };
        cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FF1E3A8A' } };
        cell.border = thinBorder();
        cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
      });
    }

    // Hub subtotal
    const hPctNum = hubTotal > 0 ? (hubCovered / hubTotal) * 100 : 0;
    const hubSub = ws1.addRow(['', `Hub Total — ${hub}`, hubTotal, hubWfp, hubCovered, hubPend, hubRej, hubTotal > 0 ? hPctNum.toFixed(1) + '%' : '0%']);
    hubSub.height = 22;
    hubSub.eachCell((cell, ci) => {
      cell.fill = totalFill();
      cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
      cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
    });

    ws1.addRow([]);
  }

  // Grand total
  const grandTotal   = rows.reduce((s, r) => s + r.total,       0);
  const grandWfpTot  = rows.reduce((s, r) => s + r.wfpConfirmed, 0);
  const grandCovered = rows.reduce((s, r) => s + r.covered,     0);
  const grandPendTot = rows.reduce((s, r) => s + r.pending,     0);
  const grandRejTot  = rows.reduce((s, r) => s + r.rejected,    0);
  const grandPctNum  = grandTotal > 0 ? (grandCovered / grandTotal) * 100 : 0;
  const grandRow = ws1.addRow(['', 'GRAND TOTAL', grandTotal, grandWfpTot, grandCovered, grandPendTot, grandRejTot, grandTotal > 0 ? grandPctNum.toFixed(1) + '%' : '0%']);
  grandRow.height = 24;
  grandRow.eachCell((cell, ci) => {
    cell.fill = headerFill();
    cell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: WHITE } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
  });

  autoFitColumns(ws1);

  // ── Sheet 2: Site Detail (with Activity column) ────────────────
  const ws2 = wb.addWorksheet('Site Detail');
  ws2.addRow(['Enumerator Tracker — All Sites Detail']).font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  ws2.getRow(1).height = 28;
  ws2.addRow(['Generated: ' + new Date().toLocaleString()]).font = bodyFont(9, 'FF6B7280');
  ws2.addRow([]);

  const h2 = ws2.addRow(['#', 'Hub', 'State', 'Data Collector', 'Activity', 'Locality', 'Site Name', 'Status', 'Date']);
  h2.height = 22;
  h2.eachCell((cell, ci) => {
    cell.fill = headerFill(); cell.font = headerFont(10); cell.border = thinBorder();
    cell.alignment = { horizontal: ci > 4 ? 'center' : 'left', vertical: 'middle' };
  });

  let si2 = 0;
  for (const [hub, sm] of hubGroups) {
    const hubStates2 = [...sm.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [state, collectors] of hubStates2) {
      for (const c of collectors) {
        for (const s of c.sites) {
          si2++;
          const dr = ws2.addRow([si2, hub, state, c.collectorName, s.activity || '—', s.locality, s.siteName, s.status.replace(/_/g, ' '), s.date]);
          dr.height = 20;
          dr.eachCell((cell, ci) => {
            cell.border = thinBorder();
            cell.alignment = { horizontal: ci > 4 ? 'center' : 'left', vertical: 'middle' };
            cell.font = bodyFont(10);
            if (si2 % 2 === 0) cell.fill = altFill();
          });
          const sc = s.status === 'wfp_confirmed' ? GREEN : s.status === 'submitted' ? BLUE_TEXT : s.status === 'rejected' ? 'FFDC2626' : AMBER_TEXT;
          dr.getCell(8).font = { bold: true, size: 10, name: 'Calibri', color: { argb: sc } };
        }
      }
    }
  }
  autoFitColumns(ws2);

  // ── Sheet 3: By Activity ───────────────────────────────────────
  const ws3 = wb.addWorksheet('By Activity');
  ws3.addRow(['Enumerator Tracker — Breakdown by Activity']).font = { bold: true, size: 14, name: 'Calibri', color: { argb: NAVY } };
  ws3.getRow(1).height = 28;
  ws3.addRow(['Generated: ' + new Date().toLocaleString()]).font = bodyFont(9, 'FF6B7280');
  ws3.addRow([]);

  const actMap = new Map<string, { collectorId: string; collectorName: string; hub: string; state: string; total: number; covered: number }[]>();
  for (const r of rows) {
    for (const s of r.sites) {
      const act = s.activity || '—';
      if (!actMap.has(act)) actMap.set(act, []);
      const arr = actMap.get(act)!;
      const key = `${r.collectorId}||${r.hub}||${r.state}`;
      let entry = arr.find(e => `${e.collectorId}||${e.hub}||${e.state}` === key);
      if (!entry) {
        entry = { collectorId: r.collectorId, collectorName: r.collectorName, hub: r.hub, state: r.state, total: 0, covered: 0 };
        arr.push(entry);
      }
      entry.total++;
      if (['submitted', 'wfp_confirmed'].includes(s.status)) entry.covered++;
    }
  }

  const ACT_COLS = ['#', 'Data Collector', 'Hub', 'State', 'Total Sites', 'Submitted', 'Coverage %'];
  let actSeq = 0;
  for (const [act, colls] of [...actMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const actTot = colls.reduce((s, c) => s + c.total, 0);
    const actCov = colls.reduce((s, c) => s + c.covered, 0);

    const aHdr = ws3.addRow([act, '', '', '', '', '', '']);
    ws3.mergeCells(aHdr.number, 1, aHdr.number, ACT_COLS.length);
    aHdr.height = 24;
    aHdr.getCell(1).fill = headerFill();
    aHdr.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: WHITE } };
    aHdr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    const aColHdr = ws3.addRow(ACT_COLS);
    aColHdr.height = 20;
    aColHdr.eachCell((cell, ci) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = headerFont(9); cell.border = thinBorder();
      cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
    });

    colls.sort((a, b) => b.covered - a.covered).forEach((c, i) => {
      actSeq++;
      const pctNum = c.total > 0 ? (c.covered / c.total) * 100 : 0;
      const dr = ws3.addRow([actSeq, c.collectorName, c.hub, c.state, c.total, c.covered, c.total > 0 ? pctNum.toFixed(1) + '%' : '0%']);
      dr.height = 20;
      dr.eachCell((cell, ci) => {
        cell.border = thinBorder(); cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
        cell.font = bodyFont(10); if (i % 2 === 1) cell.fill = altFill();
      });
      dr.getCell(ACT_COLS.length).font = { bold: true, size: 10, name: 'Calibri', color: { argb: pctNum >= 80 ? GREEN : pctNum >= 50 ? AMBER : 'FFDC2626' } };
    });

    const aPctNum = actTot > 0 ? (actCov / actTot) * 100 : 0;
    const aSub = ws3.addRow(['', 'Activity Total', '', '', actTot, actCov, actTot > 0 ? aPctNum.toFixed(1) + '%' : '0%']);
    aSub.height = 18;
    aSub.eachCell((cell, ci) => {
      cell.fill = totalFill(); cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: DARK } };
      cell.border = thinBorder(); cell.alignment = { horizontal: ci > 2 ? 'center' : 'left', vertical: 'middle' };
    });
    ws3.addRow([]);
  }
  autoFitColumns(ws3);

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export async function exportCoverageTrackerExcel(
  filteredData: FilteredRow[],
  filename: string,
  sessionName?: string
) {
  const buf = await buildCoverageTrackerWorkbook(filteredData, sessionName);
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
