import * as _XLSXStyleNS from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

const XLSXStyle: any = (_XLSXStyleNS as any).default ?? _XLSXStyleNS;

export interface MMPPaymentReportRow {
  id: string;
  type: 'advance' | 'cost';
  reference: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: 'C0392B' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FFFFFF' } },
    bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
    left: { style: 'thin', color: { rgb: 'FFFFFF' } },
    right: { style: 'thin', color: { rgb: 'FFFFFF' } },
  },
};

const SUBHEADER_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: '7B241C' } },
  fill: { fgColor: { rgb: 'FADBD8' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: 'E8967A' } },
    bottom: { style: 'thin', color: { rgb: 'E8967A' } },
    left: { style: 'thin', color: { rgb: 'E8967A' } },
    right: { style: 'thin', color: { rgb: 'E8967A' } },
  },
};

const cellStyle = (rgb: string, bold = false, align: string = 'left') => ({
  font: { sz: 10, bold, color: { rgb: '2C3E50' } },
  fill: { fgColor: { rgb } },
  alignment: { horizontal: align, vertical: 'center', wrapText: false },
  border: {
    top: { style: 'thin', color: { rgb: 'D5D8DC' } },
    bottom: { style: 'thin', color: { rgb: 'D5D8DC' } },
    left: { style: 'thin', color: { rgb: 'D5D8DC' } },
    right: { style: 'thin', color: { rgb: 'D5D8DC' } },
  },
});

const STATUS_COLORS: Record<string, string> = {
  paid: 'F9EBEA',
  approved: 'F9EBEA',
  pending: 'FEF9E7',
  rejected: 'F2F3F4',
};

function c(v: any, style: any) {
  return { v, s: style };
}

export function exportMMPPaymentReport(
  mmpName: string,
  rows: MMPPaymentReportRow[],
): void {
  const wb = XLSXStyle.utils.book_new();
  const wsData: any[][] = [];

  // Row 1 — Title
  wsData.push([
    c(`Finance Clearance Report — ${mmpName}`, {
      font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '922B21' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
    c('', { fill: { fgColor: { rgb: '922B21' } } }),
    c('', { fill: { fgColor: { rgb: '922B21' } } }),
    c('', { fill: { fgColor: { rgb: '922B21' } } }),
    c('', { fill: { fgColor: { rgb: '922B21' } } }),
  ]);

  // Row 2 — Generated
  wsData.push([
    c(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, {
      font: { italic: true, sz: 9, color: { rgb: '7F8C8D' } },
      fill: { fgColor: { rgb: 'FDEDEC' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    }),
    c('', { fill: { fgColor: { rgb: 'FDEDEC' } } }),
    c('', { fill: { fgColor: { rgb: 'FDEDEC' } } }),
    c('', { fill: { fgColor: { rgb: 'FDEDEC' } } }),
    c('', { fill: { fgColor: { rgb: 'FDEDEC' } } }),
  ]);

  // Row 3 — Notice
  wsData.push([
    c(
      'ACTION REQUIRED: The following linked payments must be cleared before this MMP can be permanently deleted.',
      {
        font: { bold: true, sz: 10, color: { rgb: '7B241C' } },
        fill: { fgColor: { rgb: 'FADBD8' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      },
    ),
    c('', { fill: { fgColor: { rgb: 'FADBD8' } } }),
    c('', { fill: { fgColor: { rgb: 'FADBD8' } } }),
    c('', { fill: { fgColor: { rgb: 'FADBD8' } } }),
    c('', { fill: { fgColor: { rgb: 'FADBD8' } } }),
  ]);

  // Row 4 — blank
  wsData.push([c('', {}), c('', {}), c('', {}), c('', {}), c('', {})]);

  // Row 5 — Column headers
  wsData.push([
    c('Type', HEADER_STYLE),
    c('Reference', HEADER_STYLE),
    c('Amount', HEADER_STYLE),
    c('Status', HEADER_STYLE),
    c('Date', HEADER_STYLE),
  ]);

  // Data rows
  rows.forEach((row, i) => {
    const bg = i % 2 === 0 ? 'FFFFFF' : 'FDFEFE';
    const statusBg = STATUS_COLORS[row.status?.toLowerCase()] ?? bg;
    const typeLabel = row.type === 'advance' ? 'Advance Request' : 'Cost Submission';
    const amountStr =
      row.amount > 0
        ? `${Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${row.currency || 'SDG'}`
        : '—';
    const dateStr = row.date
      ? format(new Date(row.date), 'dd MMM yyyy')
      : '—';

    wsData.push([
      c(typeLabel, cellStyle(bg)),
      c(row.reference || '—', cellStyle(bg)),
      c(amountStr, { ...cellStyle(bg, false, 'right') }),
      c(row.status || 'pending', { ...cellStyle(statusBg, true, 'center') }),
      c(dateStr, cellStyle(bg, false, 'center')),
    ]);
  });

  // Row — blank
  wsData.push([c('', {}), c('', {}), c('', {}), c('', {}), c('', {})]);

  // Summary row
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const currency = rows[0]?.currency || 'SDG';
  wsData.push([
    c('Total', { ...SUBHEADER_STYLE, alignment: { horizontal: 'right', vertical: 'center' } }),
    c('', SUBHEADER_STYLE),
    c(
      `${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`,
      { ...SUBHEADER_STYLE, alignment: { horizontal: 'right', vertical: 'center' } },
    ),
    c(`${rows.length} item${rows.length !== 1 ? 's' : ''}`, {
      ...SUBHEADER_STYLE,
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
    c('', SUBHEADER_STYLE),
  ]);

  const ws = XLSXStyle.utils.aoa_to_sheet(wsData);

  // Merges for title rows
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
  ];

  // Column widths
  ws['!cols'] = [
    { wch: 20 }, // Type
    { wch: 32 }, // Reference
    { wch: 22 }, // Amount
    { wch: 16 }, // Status
    { wch: 16 }, // Date
  ];

  // Row heights
  ws['!rows'] = [
    { hpt: 28 }, // title
    { hpt: 16 }, // generated
    { hpt: 32 }, // notice
    { hpt: 8 },  // blank
    { hpt: 20 }, // header
  ];

  XLSXStyle.utils.book_append_sheet(wb, ws, 'Finance Report');

  const blob = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([blob], { type: 'application/octet-stream' }),
    `MMP_Finance_Report_${mmpName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`,
  );
}
