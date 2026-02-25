import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';

export interface WriteOffCertificateData {
  advanceId: string;
  siteName: string;
  hubName?: string;
  requesterName: string;
  requesterRole?: string;
  requestedAmount: number;
  currency: string;
  requestedAt: string;
  writeOffReason: string;
  writeOffNotes?: string;
  writtenOffBy: string;
  writtenOffAt: string;
  reclaimReason?: string;
  reclaimedByName?: string;
  reclaimedAt?: string;
}

const C = {
  navy:      [15, 32, 65]   as [number, number, number],
  blue:      [41, 98, 255]  as [number, number, number],
  blueLight: [232, 240, 255] as [number, number, number],
  dark:      [20, 20, 30]   as [number, number, number],
  body:      [45, 45, 60]   as [number, number, number],
  label:     [90, 95, 110]  as [number, number, number],
  muted:     [150, 155, 170] as [number, number, number],
  border:    [210, 215, 225] as [number, number, number],
  bgLight:   [248, 249, 252] as [number, number, number],
  red:       [180, 30, 30]  as [number, number, number],
  redLight:  [255, 240, 240] as [number, number, number],
  gray:      [100, 100, 110] as [number, number, number],
  grayLight: [240, 241, 244] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
};

export function generateWriteOffCertificatePdf(data: WriteOffCertificateData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const marginL = 18;
  const marginR = 18;
  const contentW = W - marginL - marginR;
  let y = 0;

  const rgb = (c: [number, number, number]) => doc.setDrawColor(...c) && doc.setFillColor(...c);
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };
  const setTextColor = (c: [number, number, number]) => doc.setTextColor(...c);

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, W, 32, 'F');
  setFont(18, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('PACT Command Center', marginL, 13);
  setFont(9, 'normal');
  doc.setTextColor(180, 195, 230);
  doc.text('مركز قيادة باكت  |  Sudan Field Operations', marginL, 20);

  // Certificate title block
  doc.setFillColor(...C.red);
  doc.rect(0, 32, W, 18, 'F');
  setFont(13, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ADVANCE WRITE-OFF CERTIFICATE', W / 2, 43, { align: 'center' });
  setFont(8, 'normal');
  doc.setTextColor(255, 210, 210);
  doc.text('شهادة شطب السلفة', W / 2, 48, { align: 'center' });
  y = 56;

  // ── "WRITTEN OFF" diagonal watermark ──────────────────────────────────────
  doc.saveGraphicsState();
  doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
  setFont(52, 'bold');
  doc.setTextColor(...C.red);
  doc.text('WRITTEN OFF', W / 2, 165, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  // ── Certificate ID & Date ──────────────────────────────────────────────────
  const certId = `WO-${data.advanceId.substring(0, 8).toUpperCase()}`;
  const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm');
  doc.setFillColor(...C.bgLight);
  doc.roundedRect(marginL, y, contentW, 10, 2, 2, 'F');
  setFont(8, 'normal');
  setTextColor(C.label);
  doc.text(`Certificate No: ${certId}`, marginL + 3, y + 6.5);
  doc.text(`Generated: ${generatedAt}`, W - marginR - 3, y + 6.5, { align: 'right' });
  y += 14;

  // ── Section: Advance Details ──────────────────────────────────────────────
  const drawSectionHeader = (title: string, titleAr: string) => {
    doc.setFillColor(...C.navy);
    doc.roundedRect(marginL, y, contentW, 7, 1, 1, 'F');
    setFont(8, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(title, marginL + 3, y + 5);
    doc.text(titleAr, W - marginR - 3, y + 5, { align: 'right' });
    y += 10;
  };

  const drawRow = (label: string, value: string, labelAr?: string, highlight?: boolean) => {
    if (highlight) {
      doc.setFillColor(...C.redLight);
      doc.rect(marginL, y - 1, contentW, 8, 'F');
    }
    setFont(7.5, 'bold');
    setTextColor(C.label);
    doc.text(label, marginL + 2, y + 4.5);
    if (labelAr) {
      setFont(7, 'normal');
      doc.text(labelAr, marginL + 48, y + 4.5);
    }
    setFont(8, 'bold');
    setTextColor(C.dark);
    doc.text(value, W - marginR - 2, y + 4.5, { align: 'right' });
    doc.setDrawColor(...C.border);
    doc.line(marginL, y + 7, marginL + contentW, y + 7);
    y += 8;
  };

  drawSectionHeader('Advance Details', 'تفاصيل السلفة');
  drawRow('Advance Reference', certId, 'رقم السلفة');
  drawRow('Site Name', data.siteName || 'N/A', 'اسم الموقع');
  if (data.hubName) drawRow('Hub', data.hubName, 'المحور');
  drawRow('Requester', data.requesterName, 'مقدم الطلب');
  if (data.requesterRole) drawRow('Role', data.requesterRole, 'الدور');
  drawRow(
    'Requested Amount',
    `${Number(data.requestedAmount).toLocaleString()} ${data.currency || 'SDG'}`,
    'المبلغ المطلوب',
    true
  );
  const reqDate = data.requestedAt
    ? format(parseISO(data.requestedAt), 'dd MMM yyyy')
    : 'N/A';
  drawRow('Request Date', reqDate, 'تاريخ الطلب');
  y += 4;

  // ── Section: Reclaim Context ───────────────────────────────────────────────
  if (data.reclaimReason || data.reclaimedByName) {
    drawSectionHeader('Site Reclaim Details', 'تفاصيل استرداد الموقع');
    if (data.reclaimedByName) drawRow('Reclaimed By', data.reclaimedByName, 'تم الاسترداد بواسطة');
    if (data.reclaimedAt) {
      drawRow('Reclaim Date', format(parseISO(data.reclaimedAt), 'dd MMM yyyy'), 'تاريخ الاسترداد');
    }
    if (data.reclaimReason) {
      const reasonLines = doc.splitTextToSize(data.reclaimReason, contentW - 60);
      setFont(7.5, 'bold');
      setTextColor(C.label);
      doc.text('Reclaim Reason / سبب الاسترداد', marginL + 2, y + 4.5);
      setFont(8, 'normal');
      setTextColor(C.body);
      doc.text(reasonLines, W - marginR - 2, y + 4.5, { align: 'right' });
      y += Math.max(8, reasonLines.length * 4.5);
    }
    y += 4;
  }

  // ── Section: Write-Off Decision ────────────────────────────────────────────
  drawSectionHeader('Write-Off Decision', 'قرار الشطب');
  drawRow('Written Off By', data.writtenOffBy, 'تم الشطب بواسطة');
  const woDate = data.writtenOffAt
    ? format(parseISO(data.writtenOffAt), 'dd MMM yyyy, HH:mm')
    : 'N/A';
  drawRow('Write-Off Date & Time', woDate, 'تاريخ ووقت الشطب');
  drawRow('Write-Off Reason', data.writeOffReason, 'سبب الشطب', true);

  if (data.writeOffNotes) {
    const noteLines = doc.splitTextToSize(data.writeOffNotes, contentW - 60);
    setFont(7.5, 'bold');
    setTextColor(C.label);
    doc.text('Notes / ملاحظات', marginL + 2, y + 4.5);
    setFont(8, 'normal');
    setTextColor(C.body);
    doc.text(noteLines, W - marginR - 2, y + 4.5, { align: 'right' });
    doc.setDrawColor(...C.border);
    doc.line(marginL, y + Math.max(8, noteLines.length * 4.5) + 1, marginL + contentW, y + Math.max(8, noteLines.length * 4.5) + 1);
    y += Math.max(8, noteLines.length * 4.5) + 4;
  } else {
    y += 4;
  }

  // ── Amount Summary Box ──────────────────────────────────────────────────────
  doc.setFillColor(...C.grayLight);
  doc.roundedRect(marginL, y, contentW, 18, 2, 2, 'F');
  doc.setDrawColor(...C.gray);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginL, y, contentW, 18, 2, 2, 'S');

  setFont(8, 'bold');
  setTextColor(C.label);
  doc.text('Amount Written Off', marginL + 4, y + 7);
  doc.text('المبلغ المشطوب', marginL + 4, y + 13);

  setFont(14, 'bold');
  setTextColor(C.red);
  doc.text(
    `${Number(data.requestedAmount).toLocaleString()} ${data.currency || 'SDG'}`,
    W - marginR - 4,
    y + 12,
    { align: 'right' }
  );
  y += 24;

  // ── Legal Notice ────────────────────────────────────────────────────────────
  doc.setFillColor(...C.blueLight);
  doc.roundedRect(marginL, y, contentW, 22, 2, 2, 'F');
  setFont(7.5, 'bold');
  setTextColor(C.navy);
  doc.text('IMPORTANT NOTICE / إشعار مهم', marginL + 4, y + 6);
  setFont(7, 'normal');
  setTextColor(C.body);
  const notice =
    'This certificate documents the formal write-off of the above advance. The advance record has been cancelled and marked accordingly in the financial system. This decision is final and was approved by authorized financial personnel. Retain this document for audit purposes.';
  const noticeLines = doc.splitTextToSize(notice, contentW - 8);
  doc.text(noticeLines, marginL + 4, y + 11);
  y += 26;

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = 285;
  doc.setFillColor(...C.navy);
  doc.rect(0, footerY, W, 12, 'F');
  setFont(7, 'normal');
  doc.setTextColor(180, 195, 230);
  doc.text('PACT Command Center — Confidential Financial Document', W / 2, footerY + 5, { align: 'center' });
  doc.text(`${certId} | ${generatedAt}`, W / 2, footerY + 9.5, { align: 'center' });

  doc.save(`write-off-certificate-${certId}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
