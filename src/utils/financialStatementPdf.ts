import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export interface StatementRow {
  refId: string;
  date: string;
  description: string;
  requester: string;
  project?: string;
  category?: string;
  site?: string;
  hub?: string;
  state?: string;
  locality?: string;
  mmpName?: string;
  activityType?: string;
  transportationBudget?: number;
  approvalType?: string;
  paymentType?: string;
  justification?: string;
  status: string;
  statusAr?: string;
  requestedAmount: number;
  approvedAmount: number;
  paidAmount: number;
  t1Approver?: string;
  t1Date?: string;
  t1Status?: string;
  t2Approver?: string;
  t2Date?: string;
  t2Status?: string;
  rejectionReason?: string;
  notes?: string;
}

export interface StatementConfig {
  title: string;
  titleAr?: string;
  statementType: 'transport_advance' | 'operational_cost';
  statusFilter: string;
  statusFilterAr?: string;
  dateRange?: { from?: string; to?: string };
  currency?: string;
  generatedBy?: string;
}

const C = {
  navy: [15, 32, 65] as [number, number, number],
  navyMid: [22, 48, 90] as [number, number, number],
  blue: [41, 98, 255] as [number, number, number],
  blueLight: [232, 240, 255] as [number, number, number],
  dark: [20, 20, 30] as [number, number, number],
  body: [45, 45, 60] as [number, number, number],
  label: [90, 95, 110] as [number, number, number],
  muted: [120, 125, 140] as [number, number, number],
  border: [200, 205, 215] as [number, number, number],
  bgLight: [245, 247, 252] as [number, number, number],
  green: [16, 120, 60] as [number, number, number],
  greenLight: [228, 245, 235] as [number, number, number],
  greenBadge: [34, 155, 80] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  amber: [180, 120, 10] as [number, number, number],
  amberLight: [255, 248, 230] as [number, number, number],
  red: [180, 40, 40] as [number, number, number],
  redLight: [255, 240, 240] as [number, number, number],
};

function fmtCurrency(amount: number, cur: string = 'SDG'): string {
  return `${cur} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string | null | undefined, withTime = false): string {
  if (!d) return 'N/A';
  try {
    return format(new Date(d), withTime ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function rr(doc: any, x: number, y: number, w: number, h: number, r: number, fill?: [number, number, number], stroke?: [number, number, number]) {
  if (fill) doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(0.3);
  }
  const mode = fill && stroke ? 'FD' : fill ? 'F' : 'S';
  doc.roundedRect(x, y, w, h, r, r, mode);
  doc.setLineWidth(0.2);
}

import { loadPactLogoDataUrl } from './pdfLogoCache';

async function loadArabicFont(doc: any): Promise<boolean> {
  try {
    const resp = await fetch('/fonts/Amiri-Regular.ttf');
    if (!resp.ok) return false;
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    doc.addFileToVFS('Amiri-Regular.ttf', base64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    return true;
  } catch {
    return false;
  }
}

const STATUS_COLORS: Record<string, [number, number, number]> = {
  approved: [16, 120, 60],
  fully_paid: [41, 98, 255],
  partially_paid: [180, 120, 10],
  paid: [41, 98, 255],
  reconciled: [124, 58, 237],
  rejected: [180, 40, 40],
  pending_supervisor: [180, 120, 10],
  pending_admin: [180, 120, 10],
  pending: [180, 120, 10],
  under_review: [180, 120, 10],
  cancelled: [120, 125, 140],
};

function getStatusColor(status: string): [number, number, number] {
  return STATUS_COLORS[status.toLowerCase()] || C.body;
}

export async function generateFinancialStatementPdf(
  rows: StatementRow[],
  config: StatementConfig
): Promise<void> {
  if (rows.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 14;
  const mr = 14;
  const cw = pw - ml - mr;
  const cur = config.currency || 'SDG';

  const hasArabic = await loadArabicFont(doc);
  const logoDataUrl = await loadPactLogoDataUrl();

  const arText = (text: string, x: number, yPos: number, opts?: any) => {
    if (!hasArabic) return;
    doc.setFont('Amiri', 'normal');
    doc.text(text, x, yPos, opts);
    doc.setFont('helvetica', 'normal');
  };

  let y = 0;

  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, 34, 'F');
  doc.setFillColor(...C.navyMid);
  doc.rect(0, 32, pw, 2, 'F');

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', ml + 1, 5, 22, 22); } catch {}
  }

  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT', ml + 27, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Command Center  |  Financial Statement', ml + 27, 22);
  if (hasArabic) {
    doc.setFontSize(10);
    doc.setTextColor(190, 205, 225);
    arText('مركز قيادة باكت  |  كشف مالي', ml + 27, 28);
  }

  doc.setFontSize(8);
  doc.setTextColor(190, 205, 225);
  doc.setFont('helvetica', 'bold');
  const refNum = `STMT-${format(new Date(), 'yyyyMMdd-HHmm')}`;
  doc.text(refNum, pw - mr, 13, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(170, 185, 210);
  doc.text(format(new Date(), 'MMM d, yyyy | HH:mm'), pw - mr, 19, { align: 'right' });

  y = 38;

  const statusColor = getStatusColor(config.statusFilter);
  const statusBgLight: [number, number, number] = [
    Math.min(255, statusColor[0] + 200),
    Math.min(255, statusColor[1] + 200),
    Math.min(255, statusColor[2] + 200),
  ];

  rr(doc, ml, y, cw, hasArabic ? 16 : 12, 2, statusBgLight, statusColor);
  doc.setFontSize(11);
  doc.setTextColor(...statusColor);
  doc.setFont('helvetica', 'bold');
  const titleText = `${config.title}  —  ${config.statusFilter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Statement`;
  doc.text(titleText, pw / 2, y + 6, { align: 'center' });
  if (hasArabic && config.titleAr && config.statusFilterAr) {
    doc.setFontSize(10);
    arText(`${config.titleAr}  —  كشف ${config.statusFilterAr}`, pw / 2, y + 12, { align: 'center' });
  }

  y += (hasArabic ? 20 : 16);

  if (config.dateRange?.from || config.dateRange?.to) {
    doc.setFontSize(8);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'normal');
    const rangeText = `Statement Period: ${config.dateRange.from ? fmtDate(config.dateRange.from) : 'All'} — ${config.dateRange.to ? fmtDate(config.dateRange.to) : 'Present'}`;
    doc.text(rangeText, pw / 2, y, { align: 'center' });
    y += 6;
  }

  const totalRequested = rows.reduce((s, r) => s + r.requestedAmount, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approvedAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);

  const cardGap = 3;
  const cardCount = 4;
  const cardW = (cw - cardGap * (cardCount - 1)) / cardCount;
  const cardH = 22;

  const drawSummaryCard = (x: number, label: string, labelAr: string, value: string, color: [number, number, number], bgColor: [number, number, number]) => {
    rr(doc, x, y, cardW, cardH, 2, bgColor, C.border);
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + cardW / 2, y + 5.5, { align: 'center' });
    if (hasArabic && labelAr) {
      doc.setFontSize(7);
      doc.setTextColor(...C.label);
      arText(labelAr, x + cardW / 2, y + 9, { align: 'center' });
    }
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + cardW / 2, y + (hasArabic ? 16 : 14), { align: 'center' });
  };

  drawSummaryCard(ml, 'TRANSACTIONS', 'المعاملات', `${rows.length}`, C.dark, C.bgLight);
  drawSummaryCard(ml + cardW + cardGap, 'TOTAL REQUESTED', 'إجمالي المطلوب', fmtCurrency(totalRequested, cur), C.dark, C.bgLight);
  drawSummaryCard(ml + (cardW + cardGap) * 2, 'TOTAL APPROVED', 'إجمالي المعتمد', fmtCurrency(totalApproved, cur), C.blue, C.blueLight);
  drawSummaryCard(ml + (cardW + cardGap) * 3, 'TOTAL PAID', 'إجمالي المدفوع', fmtCurrency(totalPaid, cur), C.green, C.greenLight);

  y += cardH + 6;

  doc.setFillColor(...C.navy);
  rr(doc, ml, y, cw, 8, 1.5, C.navy);
  doc.setFontSize(8.5);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSACTION DETAILS', ml + 5, y + 5.5);
  if (hasArabic) {
    doc.setFontSize(9);
    arText('تفاصيل المعاملات', pw - mr - 5, y + 5.5, { align: 'right' });
  }
  y += 11;

  const isTransport = config.statementType === 'transport_advance';

  const tableHead = isTransport
    ? [['#', 'Ref ID', 'Date', 'Requester', 'Site', 'Requested', 'Approved', 'Paid', 'T1', 'T2', 'Status']]
    : [['#', 'Ref ID', 'Date', 'Requester', 'Project', 'Category', 'Amount', 'Approved', 'T1', 'T2', 'Status']];

  const tableBody = rows.map((r, idx) => {
    const row: string[] = [
      String(idx + 1),
      r.refId,
      fmtDate(r.date),
      (r.requester || '').slice(0, 18),
    ];
    if (isTransport) {
      row.push(
        (r.site || r.description || '').slice(0, 20),
        fmtCurrency(r.requestedAmount, cur),
        fmtCurrency(r.approvedAmount, cur),
        fmtCurrency(r.paidAmount, cur),
      );
    } else {
      row.push(
        (r.project || '').slice(0, 18),
        (r.category || r.description || '').slice(0, 18),
        fmtCurrency(r.requestedAmount, cur),
        fmtCurrency(r.approvedAmount, cur),
      );
    }
    row.push(
      (r.t1Approver || 'N/A').slice(0, 12),
      (r.t2Approver || 'N/A').slice(0, 12),
      r.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    );
    return row;
  });

  const totalsRow = isTransport
    ? ['', '', '', '', 'TOTALS', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), fmtCurrency(totalPaid, cur), '', '', '']
    : ['', '', '', '', '', 'TOTALS', fmtCurrency(totalRequested, cur), fmtCurrency(totalApproved, cur), '', '', ''];

  tableBody.push(totalsRow);

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: C.border, lineWidth: 0.15 },
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontSize: 6.5,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: isTransport
      ? {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 18 },
          2: { cellWidth: 18 },
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
          5: { halign: 'right', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 18 },
          8: { cellWidth: 16 },
          9: { cellWidth: 16 },
          10: { cellWidth: 16 },
        }
      : {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 16 },
          2: { cellWidth: 18 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 18 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 18 },
          8: { cellWidth: 14 },
          9: { cellWidth: 14 },
          10: { cellWidth: 15 },
        },
    didParseCell: (data: any) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fillColor = C.bgLight;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = C.navy;
      }
    },
    margin: { left: ml, right: mr },
    tableLineColor: C.border,
    tableLineWidth: 0.15,
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 50;

  if (rows.some(r => r.t1Approver || r.t2Approver) && finalY + 50 < ph - 30) {
    let detY = finalY + 6;

    doc.setFillColor(...C.navy);
    rr(doc, ml, detY, cw, 8, 1.5, C.navy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('APPROVAL SUMMARY', ml + 5, detY + 5.5);
    if (hasArabic) {
      doc.setFontSize(9);
      arText('ملخص الموافقات', pw - mr - 5, detY + 5.5, { align: 'right' });
    }
    detY += 11;

    const approvedByT1 = rows.filter(r => r.t1Status === 'approved').length;
    const approvedByT2 = rows.filter(r => r.t2Status === 'approved').length;
    const rejectedCount = rows.filter(r => r.rejectionReason).length;

    const summaryText = [
      `Tier 1 Approved: ${approvedByT1} of ${rows.length}`,
      `Tier 2 Approved: ${approvedByT2} of ${rows.length}`,
      rejectedCount > 0 ? `Rejected: ${rejectedCount}` : '',
    ].filter(Boolean).join('   |   ');

    doc.setFontSize(8);
    doc.setTextColor(...C.body);
    doc.setFont('helvetica', 'normal');
    doc.text(summaryText, ml + 4, detY + 3);
  }

  const footerH = 14;
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = ph - footerH;

    doc.setFillColor(...C.navy);
    doc.rect(0, footerY, pw, footerH, 'F');

    doc.setFontSize(7);
    doc.setTextColor(180, 195, 220);
    doc.setFont('helvetica', 'normal');
    doc.text(`Statement: ${refNum}`, ml, footerY + 5.5);
    doc.text(`Page ${i} of ${totalPages}  |  Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm:ss')}`, pw / 2, footerY + 5.5, { align: 'center' });

    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT Command Center', pw - mr, footerY + 5.5, { align: 'right' });

    doc.setFontSize(6);
    doc.setTextColor(140, 155, 180);
    doc.setFont('helvetica', 'normal');
    doc.text('Financial Statement  |  Field Operations Platform', pw / 2, footerY + 10, { align: 'center' });
  }

  const statusClean = config.statusFilter.replace(/\s+/g, '_');
  const typeLabel = config.statementType === 'transport_advance' ? 'Transport-Advance' : 'Operational-Cost';
  doc.save(`${typeLabel}-Statement-${statusClean}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
