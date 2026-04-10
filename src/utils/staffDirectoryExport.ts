import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

/* ─── Brand colours (matching advanceReportExcelUtils pattern) ─── */
const NAVY   = 'FF0F2041';
const NAVY2  = 'FF1D3461';
const WHITE  = 'FFFFFFFF';
const LIGHT  = 'FFF5F7FC';
const BORDER = 'FFC8CDD7';
const DARK   = 'FF14141E';
const GREEN  = 'FF107838';
const GREEN_BG = 'FFE4F5EB';
const RED    = 'FFB42828';
const RED_BG = 'FFFFF0F0';
const AMBER  = 'FFB47800';
const AMBER_BG = 'FFFFF8E6';

/* ─── Types ─────────────────────────────────────────────────────── */
export interface ExportProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  employee_id: string | null;
  hub_name: string;
  state_name: string;
  locality_name: string;
  availability: string | null;
  contract_type: string | null;
  bank_account: {
    accountName?: string;
    accountNumber?: string;
    branch?: string;
    bankName?: string;
  } | null;
  last_activity: string | null;
  device_info: string | null;
  app_version: string | null;
  location_sharing: boolean | null;
}

const ROLE_LABELS: Record<string, string> = {
  /* ── PascalCase (actual DB values) ── */
  SuperAdmin: 'Super Admin', Admin: 'Admin', Coordinator: 'Coordinator',
  DataCollector: 'Data Collector', DataTeam: 'Data Team', Supervisor: 'Supervisor',
  'Field Operation Manager (FOM)': 'Field Operation Manager', Reviewer: 'Reviewer',
  employee: 'Employee',
  /* ── Legacy snake_case (kept for safety) ── */
  super_admin: 'Super Admin', admin: 'Admin', country_director: 'Country Director',
  fom: 'FOM', supervisor: 'Supervisor', coordinator: 'Coordinator',
  data_team: 'Data Team', financial_auditor: 'Financial Auditor', enumerator: 'Enumerator',
};

function safeDate(d: string | null): string {
  if (!d) return 'N/A';
  try { return format(parseISO(d), 'MMM d, yyyy HH:mm'); } catch { return d; }
}

function lastActive(d: string | null): string {
  if (!d) return 'Unknown';
  try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return d; }
}

function border(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } };
  return { top: s, bottom: s, left: s, right: s };
}

function autoFit(ws: ExcelJS.Worksheet) {
  ws.columns.forEach(col => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, cell => {
      max = Math.max(max, (cell.value?.toString() || '').length + 2);
    });
    col.width = Math.min(max, 42);
  });
}

/* ─── Shared: PACT title block ───────────────────────────────────── */
function addCoverBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, cols: number) {
  /* Row 1: Organisation name */
  const r1 = ws.addRow(['PACT Command Center']);
  r1.height = 22;
  ws.mergeCells(r1.number, 1, r1.number, cols);
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  r1.getCell(1).font = { bold: true, size: 13, name: 'Calibri', color: { argb: WHITE } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  /* Row 2: Report title */
  const r2 = ws.addRow([title]);
  r2.height = 28;
  ws.mergeCells(r2.number, 1, r2.number, cols);
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY2 } };
  r2.getCell(1).font = { bold: true, size: 15, name: 'Calibri', color: { argb: WHITE } };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  /* Row 3: Subtitle + generated timestamp */
  const r3 = ws.addRow([`${subtitle}   |   Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`]);
  r3.height = 18;
  ws.mergeCells(r3.number, 1, r3.number, cols);
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FB' } };
  r3.getCell(1).font = { size: 10, name: 'Calibri', italic: true, color: { argb: '5A5F6E' } };
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  /* Blank spacer */
  ws.addRow([]);
}

function addHeader(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.height = 24;
  row.eachCell((cell, ci) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
    cell.border = border();
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true };
  });
}

function addDataRow(ws: ExcelJS.Worksheet, data: (string | number)[], idx: number, statusCol?: number) {
  const row = ws.addRow(data);
  row.height = 20;
  row.eachCell((cell, ci) => {
    cell.border = border();
    cell.font = { size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: false };
    if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  });
  if (statusCol !== undefined) {
    const cell = row.getCell(statusCol);
    const val = (cell.value?.toString() || '').toLowerCase();
    let font = DARK, bg = LIGHT;
    if (val === 'online') { font = GREEN; bg = GREEN_BG; }
    else if (val === 'busy') { font = AMBER; bg = AMBER_BG; }
    else if (val === 'offline') { font = '5A5F6E'; bg = 'FFF1F1F1'; }
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: font } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  }
}

function addBankStatusCell(row: ExcelJS.Row, colIdx: number, hasBank: boolean) {
  const cell = row.getCell(colIdx);
  cell.value = hasBank ? 'Registered' : 'Missing';
  cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: hasBank ? GREEN : RED } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hasBank ? GREEN_BG : RED_BG } };
}

function addTotalRow(ws: ExcelJS.Worksheet, data: (string | number)[], cols: number) {
  const row = ws.addRow(data);
  row.height = 24;
  row.eachCell((cell, ci) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DARK } };
    cell.border = border();
    cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle' };
  });
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT: Excel (ExcelJS formatted — 3 sheets)
═══════════════════════════════════════════════════════════════ */
export async function exportStaffToExcel(profiles: ExportProfile[], label = '') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PACT Command Center';
  wb.created = new Date();
  const dateStr = format(new Date(), 'dd-MMM-yyyy');
  const filterLabel = label ? ` (${label})` : '';

  /* ── Sheet 1: Full Directory ─────────────────────────────────── */
  const ws1 = wb.addWorksheet('Staff Directory', { pageSetup: { orientation: 'landscape' } });
  const CONTRACT_LABELS: Record<string, string> = { salary: 'Salary', retainer: 'Retainer', both: 'Salary+Retainer' };
  const hdrs1 = ['#', 'Full Name', 'Email', 'Phone', 'Role', 'Employee ID', 'Contract Type', 'Hub', 'State', 'Locality', 'Status', 'GPS Sharing', 'Last Active', 'Device', 'App Version', 'Bank Account', 'Account Name', 'Account No.', 'Bank', 'Branch'];
  addCoverBlock(ws1, 'Staff Directory Report', `All staff profiles${filterLabel}`, hdrs1.length);
  addHeader(ws1, hdrs1);

  profiles.forEach((p, i) => {
    const hasBank = !!p.bank_account?.accountNumber;
    const row = ws1.addRow([
      i + 1,
      p.full_name || '—',
      p.email || '—',
      p.phone || '—',
      ROLE_LABELS[p.role || ''] || p.role || '—',
      p.employee_id || '—',
      CONTRACT_LABELS[p.contract_type || ''] || 'Salary',
      p.hub_name || '—',
      p.state_name || '—',
      p.locality_name || '—',
      p.availability || 'offline',
      p.location_sharing ? 'Yes' : 'No',
      lastActive(p.last_activity),
      p.device_info || '—',
      p.app_version || '—',
      hasBank ? 'Registered' : 'Missing',
      p.bank_account?.accountName || '—',
      p.bank_account?.accountNumber || '—',
      p.bank_account?.bankName || '—',
      p.bank_account?.branch || '—',
    ]);
    row.height = 20;
    row.eachCell((cell, ci) => {
      cell.border = border();
      cell.font = { size: 10, name: 'Calibri', color: { argb: DARK } };
      cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    });
    /* Status colour (column 11 after adding Contract Type at 7) */
    const stCell = row.getCell(11);
    const st = (p.availability || 'offline').toLowerCase();
    stCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: st === 'online' ? GREEN : st === 'busy' ? AMBER : '5A5F6E' } };
    stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st === 'online' ? GREEN_BG : st === 'busy' ? AMBER_BG : 'FFF1F1F1' } };
    /* Bank status colour (column 16 after adding Contract Type at 7) */
    addBankStatusCell(row, 16, hasBank);
  });

  addTotalRow(ws1, ['', `Total: ${profiles.length} staff`, '', '', '', '', '', '', '', '', '', '', '', '', '', `${profiles.filter(p => !!p.bank_account?.accountNumber).length} registered`, '', '', '', ''], hdrs1.length);
  autoFit(ws1);

  /* ── Sheet 2: Bank Accounts ──────────────────────────────────── */
  const ws2 = wb.addWorksheet('Bank Accounts');
  const hdrs2 = ['#', 'Full Name', 'Email', 'Role', 'Hub', 'State', 'Account Name', 'Account Number', 'Bank Name', 'Branch', 'Status'];
  addCoverBlock(ws2, 'Bank Accounts Registry', `Payment details for all staff${filterLabel}`, hdrs2.length);
  addHeader(ws2, hdrs2);

  profiles.forEach((p, i) => {
    const hasBank = !!p.bank_account?.accountNumber;
    const row = ws2.addRow([
      i + 1,
      p.full_name || '—',
      p.email || '—',
      ROLE_LABELS[p.role || ''] || p.role || '—',
      p.hub_name || '—',
      p.state_name || '—',
      p.bank_account?.accountName || '—',
      p.bank_account?.accountNumber || '—',
      p.bank_account?.bankName || '—',
      p.bank_account?.branch || '—',
      hasBank ? 'Registered' : 'Missing',
    ]);
    row.height = 20;
    row.eachCell((cell, ci) => {
      cell.border = border();
      cell.font = { size: 10, name: 'Calibri', color: { argb: DARK } };
      cell.alignment = { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'middle' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    });
    /* Highlight account number bold */
    const numCell = row.getCell(8);
    numCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: NAVY }, name2: 'Calibri' } as any;
    /* Status colour */
    addBankStatusCell(row, 11, hasBank);
  });

  const registeredCount = profiles.filter(p => !!p.bank_account?.accountNumber).length;
  addTotalRow(ws2, ['', `Total: ${profiles.length}`, '', '', '', '', '', '', '', '', `${registeredCount} / ${profiles.length} registered`], hdrs2.length);
  autoFit(ws2);

  /* ── Sheet 3: Capacity Summary ───────────────────────────────── */
  const ws3 = wb.addWorksheet('Capacity Summary');
  addCoverBlock(ws3, 'Capacity Summary', 'Staff count by Hub, State, and Role', 6);

  /* By Hub */
  ws3.addRow(['BY HUB']).eachCell(c => {
    c.font = { bold: true, size: 11, name: 'Calibri', color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FB' } };
  });
  addHeader(ws3, ['Hub', 'Total Staff', 'Online', 'Busy', 'Offline', 'With Bank Account']);
  const hubMap: Record<string, { total: number; online: number; busy: number; withBank: number }> = {};
  profiles.forEach(p => {
    const k = p.hub_name || 'Unassigned';
    if (!hubMap[k]) hubMap[k] = { total: 0, online: 0, busy: 0, withBank: 0 };
    hubMap[k].total++;
    if (p.availability === 'online') hubMap[k].online++;
    if (p.availability === 'busy') hubMap[k].busy++;
    if (p.bank_account?.accountNumber) hubMap[k].withBank++;
  });
  Object.entries(hubMap).sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
    addDataRow(ws3, [name, v.total, v.online, v.busy, v.total - v.online - v.busy, v.withBank], i);
  });
  ws3.addRow([]);

  /* By Role */
  ws3.addRow(['BY ROLE']).eachCell(c => {
    c.font = { bold: true, size: 11, name: 'Calibri', color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FB' } };
  });
  addHeader(ws3, ['Role', 'Total Staff', 'Online', 'Busy', 'Offline', 'With Bank Account']);
  const roleMap: Record<string, { total: number; online: number; busy: number; withBank: number }> = {};
  profiles.forEach(p => {
    const k = ROLE_LABELS[p.role || ''] || p.role || 'Unknown';
    if (!roleMap[k]) roleMap[k] = { total: 0, online: 0, busy: 0, withBank: 0 };
    roleMap[k].total++;
    if (p.availability === 'online') roleMap[k].online++;
    if (p.availability === 'busy') roleMap[k].busy++;
    if (p.bank_account?.accountNumber) roleMap[k].withBank++;
  });
  Object.entries(roleMap).sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
    addDataRow(ws3, [name, v.total, v.online, v.busy, v.total - v.online - v.busy, v.withBank], i);
  });
  ws3.addRow([]);

  /* By State */
  ws3.addRow(['BY STATE']).eachCell(c => {
    c.font = { bold: true, size: 11, name: 'Calibri', color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FB' } };
  });
  addHeader(ws3, ['State', 'Total Staff', 'Online', 'Busy', 'Offline', 'With Bank Account']);
  const stateMap: Record<string, { total: number; online: number; busy: number; withBank: number }> = {};
  profiles.forEach(p => {
    const k = p.state_name || 'Unassigned';
    if (!stateMap[k]) stateMap[k] = { total: 0, online: 0, busy: 0, withBank: 0 };
    stateMap[k].total++;
    if (p.availability === 'online') stateMap[k].online++;
    if (p.availability === 'busy') stateMap[k].busy++;
    if (p.bank_account?.accountNumber) stateMap[k].withBank++;
  });
  Object.entries(stateMap).sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
    addDataRow(ws3, [name, v.total, v.online, v.busy, v.total - v.online - v.busy, v.withBank], i);
  });

  autoFit(ws3);

  /* ── Save ──────────────────────────────────────────────────── */
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `PACT_Staff_Directory_${dateStr}.xlsx`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT: PDF (jsPDF + autoTable)
═══════════════════════════════════════════════════════════════ */
export function exportStaffToPDF(profiles: ExportProfile[], tab: 'directory' | 'bank_accounts' | 'capacity' = 'directory', label = '') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dateStr = format(new Date(), 'dd MMM yyyy HH:mm');
  const filterLabel = label ? ` (${label})` : '';

  /* Header block */
  doc.setFillColor(15, 32, 65);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('PACT Command Center', 148, 9, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let reportTitle = '';
  if (tab === 'directory') reportTitle = 'Staff Directory Report';
  else if (tab === 'bank_accounts') reportTitle = 'Bank Accounts Registry';
  else reportTitle = 'Capacity Summary Report';

  doc.text(`${reportTitle}${filterLabel}`, 148, 16, { align: 'center' });
  doc.setTextColor(90, 95, 110);
  doc.setFontSize(8);
  doc.text(`Generated: ${dateStr}   |   Total: ${profiles.length} profiles`, 148, 21, { align: 'center' });

  /* Table */
  if (tab === 'directory') {
    autoTable(doc, {
      startY: 26,
      head: [['#', 'Name', 'Role', 'Hub', 'State', 'Status', 'Last Active', 'Bank Account', 'Account No.']],
      body: profiles.map((p, i) => [
        i + 1,
        p.full_name || '—',
        ROLE_LABELS[p.role || ''] || p.role || '—',
        p.hub_name || '—',
        p.state_name || '—',
        p.availability || 'offline',
        lastActive(p.last_activity),
        p.bank_account?.accountName || '—',
        p.bank_account?.accountNumber || '—',
      ]),
      headStyles: { fillColor: [15, 32, 65], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [200, 205, 215], lineWidth: 0.2 },
      columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center', fontStyle: 'bold' } },
      didDrawCell: (data) => {
        /* Colour the Status cell */
        if (data.section === 'body' && data.column.index === 5) {
          const val = String(data.cell.raw || '').toLowerCase();
          if (val === 'online') { doc.setFillColor(16, 120, 56); doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F'); doc.setTextColor(255, 255, 255); }
          else if (val === 'busy') { doc.setFillColor(180, 120, 0); doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F'); doc.setTextColor(255, 255, 255); }
          else { doc.setTextColor(90, 95, 110); }
          doc.setFontSize(8);
          doc.text(String(data.cell.raw || ''), data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.5, { align: 'center' });
        }
      },
    } as any);
  } else if (tab === 'bank_accounts') {
    autoTable(doc, {
      startY: 26,
      head: [['#', 'Name', 'Email', 'Role', 'Hub', 'Account Name', 'Account Number', 'Bank', 'Branch', 'Status']],
      body: profiles.map((p, i) => {
        const hasBank = !!p.bank_account?.accountNumber;
        return [
          i + 1,
          p.full_name || '—',
          p.email || '—',
          ROLE_LABELS[p.role || ''] || p.role || '—',
          p.hub_name || '—',
          p.bank_account?.accountName || '—',
          p.bank_account?.accountNumber || '—',
          p.bank_account?.bankName || '—',
          p.bank_account?.branch || '—',
          hasBank ? 'Registered' : 'Missing',
        ];
      }),
      headStyles: { fillColor: [15, 32, 65], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: [200, 205, 215], lineWidth: 0.2 },
      columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 6: { fontStyle: 'bold' } },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 9) {
          const isReg = String(data.cell.raw || '') === 'Registered';
          doc.setFillColor(...(isReg ? [228, 245, 235] : [255, 240, 240]) as [number, number, number]);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setTextColor(...(isReg ? [16, 120, 56] : [180, 40, 40]) as [number, number, number]);
          doc.setFontSize(8);
          doc.text(String(data.cell.raw || ''), data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.5, { align: 'center' });
        }
      },
    } as any);
  } else {
    /* Capacity - 3 tables: Hub, Role, State */
    const buildCapMap = (key: 'hub_name' | 'state_name' | 'role') => {
      const map: Record<string, { total: number; online: number; busy: number; withBank: number }> = {};
      profiles.forEach(p => {
        const k = key === 'role' ? (ROLE_LABELS[p.role || ''] || p.role || 'Unknown') : (p[key] || 'Unassigned');
        if (!map[k]) map[k] = { total: 0, online: 0, busy: 0, withBank: 0 };
        map[k].total++;
        if (p.availability === 'online') map[k].online++;
        if (p.availability === 'busy') map[k].busy++;
        if (p.bank_account?.accountNumber) map[k].withBank++;
      });
      return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    };

    const makeBody = (entries: [string, any][]) =>
      entries.map(([name, v], i) => [i + 1, name, v.total, v.online, v.busy, v.total - v.online - v.busy, v.withBank]);

    let y = 26;
    for (const [label, key] of [['By Hub', 'hub_name'], ['By Role', 'role'], ['By State', 'state_name']] as const) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 32, 65);
      doc.text(label, 14, y + 5);
      autoTable(doc, {
        startY: y + 8,
        head: [['#', 'Group', 'Total', 'Online', 'Busy', 'Offline', 'With Bank']],
        body: makeBody(buildCapMap(key as any)),
        headStyles: { fillColor: [15, 32, 65], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' } },
      } as any);
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  /* Footer */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(`PACT Command Center  |  Page ${i} of ${pageCount}  |  Confidential`, 148, 205, { align: 'center' });
  }

  const dateFile = format(new Date(), 'dd-MMM-yyyy');
  doc.save(`PACT_Staff_${tab === 'bank_accounts' ? 'BankAccounts' : tab === 'capacity' ? 'Capacity' : 'Directory'}_${dateFile}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT: CSV
═══════════════════════════════════════════════════════════════ */
export function exportStaffToCSV(profiles: ExportProfile[], tab: 'directory' | 'bank_accounts' | 'capacity' = 'directory') {
  let headers: string[];
  let rows: string[][];

  if (tab === 'bank_accounts') {
    headers = ['Full Name', 'Email', 'Phone', 'Role', 'Hub', 'State', 'Locality', 'Account Name', 'Account Number', 'Bank Name', 'Branch', 'Status'];
    rows = profiles.map(p => [
      p.full_name || '', p.email || '', p.phone || '',
      ROLE_LABELS[p.role || ''] || p.role || '',
      p.hub_name, p.state_name, p.locality_name,
      p.bank_account?.accountName || '', p.bank_account?.accountNumber || '',
      p.bank_account?.bankName || '', p.bank_account?.branch || '',
      p.bank_account?.accountNumber ? 'Registered' : 'Missing',
    ]);
  } else if (tab === 'capacity') {
    headers = ['Group', 'Category', 'Total', 'Online', 'Busy', 'Offline', 'With Bank Account'];
    rows = [];
    const add = (label: string, entries: [string, any][]) =>
      entries.forEach(([name, v]) => rows.push([name, label, v.total, v.online, v.busy, v.total - v.online - v.busy, v.withBank].map(String)));
    const buildMap = (key: keyof ExportProfile) => {
      const m: Record<string, any> = {};
      profiles.forEach(p => {
        const k = key === 'role' ? (ROLE_LABELS[String(p[key]) || ''] || String(p[key]) || 'Unknown') : (String(p[key]) || 'Unassigned');
        if (!m[k]) m[k] = { total: 0, online: 0, busy: 0, withBank: 0 };
        m[k].total++;
        if (p.availability === 'online') m[k].online++;
        if (p.availability === 'busy') m[k].busy++;
        if (p.bank_account?.accountNumber) m[k].withBank++;
      });
      return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
    };
    add('Hub', buildMap('hub_name'));
    add('Role', buildMap('role'));
    add('State', buildMap('state_name'));
  } else {
    const CT_LABELS: Record<string, string> = { salary: 'Salary', retainer: 'Retainer', both: 'Salary+Retainer' };
    headers = ['Full Name', 'Email', 'Phone', 'Role', 'Employee ID', 'Contract Type', 'Hub', 'State', 'Locality', 'Status', 'GPS Sharing', 'Last Active', 'Device', 'App Version', 'Has Bank Account', 'Account Number'];
    rows = profiles.map(p => [
      p.full_name || '', p.email || '', p.phone || '',
      ROLE_LABELS[p.role || ''] || p.role || '',
      p.employee_id || '',
      CT_LABELS[p.contract_type || ''] || 'Salary',
      p.hub_name, p.state_name, p.locality_name,
      p.availability || 'offline', p.location_sharing ? 'Yes' : 'No',
      lastActive(p.last_activity), p.device_info || '', p.app_version || '',
      p.bank_account?.accountNumber ? 'Yes' : 'No',
      p.bank_account?.accountNumber || '',
    ]);
  }

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const dateFile = format(new Date(), 'dd-MMM-yyyy');
  const name = tab === 'bank_accounts' ? 'BankAccounts' : tab === 'capacity' ? 'Capacity' : 'Directory';
  saveAs(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
    `PACT_Staff_${name}_${dateFile}.csv`);
}
