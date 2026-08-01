/**
 * Formatted ExcelJS report for MMP sites that were not found in the WFP clean-data file.
 * Produces four sheets: Summary by Hub · by State · by Locality · Full Site List
 */
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

/* ─── Brand colours (matching staffDirectoryExport pattern) ────────── */
const NAVY      = 'FF0F2041';
const NAVY2     = 'FF1D3461';
const WHITE     = 'FFFFFFFF';
const LIGHT     = 'FFF5F7FC';
const BORDER_C  = 'FFC8CDD7';
const DARK      = 'FF14141E';
const ORANGE    = 'FFB45309';
const ORANGE_BG = 'FFFFF7ED';
const SLATE     = 'FF475569';

export interface NotInWfpSite {
  site_code:     string;
  site_name:     string;
  state:         string;
  locality:      string;
  hub_office:    string;
  system_status: string;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function border(ExcelJS: any) {
  const s = { style: 'thin', color: { argb: BORDER_C } };
  return { top: s, bottom: s, left: s, right: s };
}

function autoFit(ws: any) {
  ws.columns.forEach((col: any) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell: any) => {
      max = Math.max(max, (cell.value?.toString() ?? '').length + 2);
    });
    col.width = Math.min(max, 44);
  });
}

function addCoverBlock(ws: any, title: string, subtitle: string, cols: number) {
  const r1 = ws.addRow(['PACT Command Center']);
  r1.height = 22;
  ws.mergeCells(r1.number, 1, r1.number, cols);
  Object.assign(r1.getCell(1), {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    font:      { bold: true, size: 13, name: 'Calibri', color: { argb: WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  const r2 = ws.addRow([title]);
  r2.height = 28;
  ws.mergeCells(r2.number, 1, r2.number, cols);
  Object.assign(r2.getCell(1), {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY2 } },
    font:      { bold: true, size: 15, name: 'Calibri', color: { argb: WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  const r3 = ws.addRow([`${subtitle}   |   Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`]);
  r3.height = 18;
  ws.mergeCells(r3.number, 1, r3.number, cols);
  Object.assign(r3.getCell(1), {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FB' } },
    font:      { size: 10, name: 'Calibri', italic: true, color: { argb: SLATE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.addRow([]);
}

function addColumnHeaders(ws: any, headers: string[], bdr: any) {
  const row = ws.addRow(headers);
  row.height = 24;
  row.eachCell((cell: any, ci: number) => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
    cell.border    = bdr;
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true };
  });
}

function addDataRow(ws: any, data: (string | number)[], idx: number, bdr: any) {
  const row = ws.addRow(data);
  row.height = 20;
  row.eachCell((cell: any, ci: number) => {
    cell.border    = bdr;
    cell.font      = { size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle' };
    if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  });
}

function addTotalRow(ws: any, data: (string | number)[], bdr: any) {
  const row = ws.addRow(data);
  row.height = 24;
  row.eachCell((cell: any, ci: number) => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border    = bdr;
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle' };
  });
}

function addGroupSummarySheet(
  wb: any,
  ExcelJS: any,
  sheetName: string,
  title: string,
  groupKey: keyof NotInWfpSite,
  groupLabel: string,
  sites: NotInWfpSite[],
  cycleName: string,
) {
  const ws = wb.addWorksheet(sheetName);
  const bdr = border(ExcelJS);
  const COLS = 3;
  addCoverBlock(ws, title, `Cycle: ${cycleName} — Not in WFP Clean Data`, COLS);
  addColumnHeaders(ws, [groupLabel, 'Sites Not in WFP File', '% of All Not-in-WFP'], bdr);

  // Group
  const groups: Record<string, number> = {};
  for (const s of sites) groups[s[groupKey] || 'Unknown'] = (groups[s[groupKey] || 'Unknown'] ?? 0) + 1;
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const total = sites.length;

  sorted.forEach(([label, count], i) => {
    addDataRow(ws, [label, count, total ? `${Math.round((count / total) * 100)}%` : '0%'], i, bdr);
  });
  addTotalRow(ws, ['TOTAL', total, '100%'], bdr);
  autoFit(ws);

  // Freeze header
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: ws.rowCount - sorted.length }];
}

// ─── Main export function ────────────────────────────────────────────────────

export async function exportNotInWfpReport(
  sites: NotInWfpSite[],
  cycleName: string,
) {
  const ExcelJS = (await import('exceljs')).default;
  const bdr = border(ExcelJS);
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'PACT Command Center';
  wb.created  = new Date();
  wb.modified = new Date();

  // ── Sheet 1: Summary by Hub ───────────────────────────────────────────────
  addGroupSummarySheet(wb, ExcelJS, 'By Hub', 'Summary by Hub / Office', 'hub_office', 'Hub / Office', sites, cycleName);

  // ── Sheet 2: Summary by State ─────────────────────────────────────────────
  addGroupSummarySheet(wb, ExcelJS, 'By State', 'Summary by State', 'state', 'State', sites, cycleName);

  // ── Sheet 3: Summary by Locality ──────────────────────────────────────────
  addGroupSummarySheet(wb, ExcelJS, 'By Locality', 'Summary by Locality', 'locality', 'Locality', sites, cycleName);

  // ── Sheet 4: Full Site List ───────────────────────────────────────────────
  const ws4 = wb.addWorksheet('Full Site List');
  const COLS4 = 6;
  addCoverBlock(ws4, 'Not in WFP Clean Data — Full Site List', `Cycle: ${cycleName}`, COLS4);
  addColumnHeaders(ws4, ['#', 'Site Name', 'State', 'Locality', 'Hub / Office', 'System Status'], bdr);

  // Group by Hub → State → Locality for sorted output
  const sorted = [...sites].sort((a, b) =>
    (a.hub_office || '').localeCompare(b.hub_office || '') ||
    (a.state || '').localeCompare(b.state || '') ||
    (a.locality || '').localeCompare(b.locality || '') ||
    (a.site_name || '').localeCompare(b.site_name || '')
  );

  let currentGroup = '';
  let rowIdx = 0;
  for (const s of sorted) {
    const groupLabel = [s.hub_office, s.state].filter(Boolean).join(' › ');
    if (groupLabel !== currentGroup) {
      // Group separator row
      const sepRow = ws4.addRow([groupLabel]);
      ws4.mergeCells(sepRow.number, 1, sepRow.number, COLS4);
      sepRow.height = 18;
      sepRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
      sepRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: NAVY2 } };
      sepRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      currentGroup = groupLabel;
    }

    const row = ws4.addRow([
      ++rowIdx,
      s.site_name  || '—',
      s.state      || '—',
      s.locality   || '—',
      s.hub_office || '—',
      s.system_status || '—',
    ]);
    row.height = 20;
    row.eachCell((cell: any, ci: number) => {
      cell.border    = bdr;
      cell.font      = { size: 10, name: 'Calibri', color: { argb: DARK } };
      cell.alignment = { horizontal: ci <= 2 ? 'left' : ci === 1 ? 'center' : 'left', vertical: 'middle' };
      if (rowIdx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    });
    // Highlight site_name with subtle orange accent
    const nameCell = row.getCell(2);
    nameCell.font = { size: 10, name: 'Calibri', color: { argb: ORANGE }, bold: false };

    // Status badge colouring
    const statusCell = row.getCell(6);
    const sv = (s.system_status || '').toLowerCase();
    if (sv === 'accepted' || sv === 'confirmed') {
      statusCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: '107838' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F5EB' } };
    } else if (sv === 'dispatched' || sv === 'pending') {
      statusCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: ORANGE } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_BG } };
    }
  }

  // Totals
  ws4.addRow([]);
  addTotalRow(ws4, ['', `${sorted.length} sites total not in WFP file`, '', '', '', ''], bdr);
  autoFit(ws4);
  ws4.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }]; // freeze after cover block

  // ── Save ─────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const safeName = cycleName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `not_in_wfp_report_${safeName}_${format(new Date(), 'yyyyMMdd')}.xlsx`,
  );
}
