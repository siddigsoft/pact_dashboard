import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import QRCode from 'qrcode';

interface TransportAdvanceCertificateData {
  request: {
    id: string;
    siteName: string;
    stateName?: string;
    localityName?: string;
    projectName?: string;
    hubName?: string;
    activityType?: string;
    requestedAmount: number;
    approvedAmount?: number;
    totalPaidAmount: number;
    remainingAmount: number;
    justification: string;
    requestedAt: string;
    status: string;
    paymentType: string;
    approvalType?: string;
    approvalPercentage?: number;
  };
  requester: {
    name: string;
    email: string;
    role: string | null;
  };
  tier1: {
    approverName: string;
    status: string;
    approvedAt: string;
    notes: string | null;
  };
  tier2: {
    approverName: string;
    status: string;
    approvedAt: string;
    notes: string | null;
    signatureImageData?: string | null;
  };
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
};

function fmtCurrency(amount: number): string {
  return `SDG ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string | null | undefined, withTime = false): string {
  if (!d) return 'N/A';
  try {
    return format(new Date(d), withTime ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function parseSignatureFromNotes(notes: string | null): { method: string; hash: string; id: string } | null {
  if (!notes) return null;
  const match = notes.match(/\[Signed:\s*(\S+)\s*\|\s*Hash:\s*(\S+?)\.\.\.\s*\|\s*ID:\s*(\S+)\s*\|\s*(.+?)\]/);
  if (!match) return null;
  return { method: match[1], hash: match[2], id: match[3] };
}

function getCleanNotes(notes: string | null): string {
  if (!notes) return '';
  return notes.replace(/\n?\[Signed:.*?\]/, '').trim();
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch('/pact-logo.png');
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function generateQRDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      width: 200,
      margin: 1,
      color: { dark: '#0f2041', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}

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

const ARABIC_MAP: Record<string, string> = {
  'TRANSPORTATION ADVANCE - APPROVAL CONFIRMATION': 'تأكيد الموافقة على سلفة النقل',
  'REQUESTED AMOUNT': 'المبلغ المطلوب',
  'APPROVED AMOUNT': 'المبلغ المعتمد',
  'STATUS': 'الحالة',
  'REQUEST DETAILS': 'تفاصيل الطلب',
  'REQUESTED BY': 'مقدم من',
  'PROJECT': 'المشروع',
  'ROLE': 'الدور',
  'SITE': 'الموقع',
  'STATE': 'الولاية',
  'LOCALITY': 'المحلية',
  'HUB': 'المحور',
  'REQUEST DATE': 'تاريخ الطلب',
  'ACTIVITY TYPE': 'نوع النشاط',
  'PAYMENT TYPE': 'نوع الدفع',
  'JUSTIFICATION': 'المبرر',
  'APPROVAL WORKFLOW': 'مسار الموافقة',
  'Supervisor / FOM Review': 'مراجعة المشرف',
  'Admin Final Approval': 'الموافقة النهائية للمسؤول',
  'FINANCIAL SUMMARY': 'الملخص المالي',
  'TOTAL PAID': 'إجمالي المدفوع',
  'REMAINING': 'المتبقي',
  'RECONCILIATION NOTICE': 'إشعار التسوية',
  'APPROVAL PERCENTAGE': 'نسبة الموافقة',
  'APPROVER EMAIL': 'بريد الموافق',
  'REQUESTER ROLE': 'دور مقدم الطلب',
};

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

async function buildTransportCertificateDoc(data: TransportAdvanceCertificateData): Promise<{ doc: any; refNumber: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 12;
  const mr = 12;
  const cw = pw - ml - mr;
  let y = 0;

  const refNumber = `PACT-TA-${data.request.id.substring(0, 8).toUpperCase()}`;
  const hasArabic = await loadArabicFont(doc);

  const ar = (key: string): string => ARABIC_MAP[key] || '';

  const arText = (text: string, x: number, yPos: number, opts?: any) => {
    if (!hasArabic) return;
    doc.setFont('Amiri', 'normal');
    doc.text(text, x, yPos, opts);
    doc.setFont('helvetica', 'normal');
  };

  const qrLines = [
    `PACT TRANSPORT ADVANCE CERTIFICATE`,
    `===================================`,
    `Ref: ${refNumber}`,
    `Date: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
    ``,
    `REQUEST`,
    `Requested: ${fmtCurrency(data.request.requestedAmount)}`,
    `Approved: ${fmtCurrency(data.request.approvedAmount || data.request.requestedAmount)}`,
    `Requester: ${data.requester.name}`,
    `Site: ${data.request.siteName}`,
    `Project: ${data.request.projectName || 'N/A'}`,
    ``,
    `TIER 1 APPROVAL`,
    `Approver: ${data.tier1.approverName}`,
    `Status: ${data.tier1.status.toUpperCase()}`,
    `Date: ${fmtDate(data.tier1.approvedAt, true)}`,
    ``,
    `TIER 2 APPROVAL`,
    `Approver: ${data.tier2.approverName}`,
    `Status: ${data.tier2.status.toUpperCase()}`,
    `Date: ${fmtDate(data.tier2.approvedAt, true)}`,
    ``,
    `Verified: YES`,
  ];
  const qrContent = qrLines.join('\n');

  const [logoDataUrl, qrDataUrl] = await Promise.all([
    loadLogoAsDataUrl(),
    generateQRDataUrl(qrContent),
  ]);

  // === HEADER (compact: 28mm) ===
  const headerH = 28;
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, headerH, 'F');
  doc.setFillColor(...C.navyMid);
  doc.rect(0, headerH - 1.5, pw, 1.5, 'F');

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', ml + 1, 4, 18, 18); } catch {}
  }

  doc.setFontSize(16);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT', ml + 22, 13);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Command Center  |  Field Operations', ml + 22, 18);
  if (hasArabic) {
    doc.setFontSize(8.5);
    doc.setTextColor(190, 205, 225);
    arText('مركز قيادة باكت', ml + 22, 23);
  }

  doc.setFontSize(7.5);
  doc.setTextColor(190, 205, 225);
  doc.setFont('helvetica', 'bold');
  doc.text(refNumber, pw - mr, 11, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(170, 185, 210);
  doc.text(format(new Date(), 'MMM d, yyyy | HH:mm'), pw - mr, 16, { align: 'right' });

  y = headerH + 3;

  // === TITLE BAR (compact: 10mm) ===
  rr(doc, ml, y, cw, 10, 2, C.greenLight, C.green);
  doc.setFontSize(9.5);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSPORTATION ADVANCE  —  APPROVAL CONFIRMATION', pw / 2, y + 5, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(8.5);
    arText(ar('TRANSPORTATION ADVANCE - APPROVAL CONFIRMATION'), pw / 2, y + 9, { align: 'center' });
  }

  y += 13;

  // === AMOUNT CARDS (compact: 18mm) ===
  const cardGap = 3;
  const cardW = (cw - cardGap * 2) / 3;
  const cardH = 18;

  rr(doc, ml, y, cardW, cardH, 2, C.bgLight, C.border);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'bold');
  doc.text('REQUESTED AMOUNT', ml + cardW / 2, y + 5, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(6.5);
    doc.setTextColor(...C.label);
    arText(ar('REQUESTED AMOUNT'), ml + cardW / 2, y + 8.5, { align: 'center' });
  }
  doc.setFontSize(12);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.request.requestedAmount), ml + cardW / 2, y + 14.5, { align: 'center' });

  const c2x = ml + cardW + cardGap;
  rr(doc, c2x, y, cardW, cardH, 2, C.blueLight, [180, 200, 235] as [number, number, number]);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.blue);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED AMOUNT', c2x + cardW / 2, y + 5, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(6.5);
    doc.setTextColor(...C.label);
    arText(ar('APPROVED AMOUNT'), c2x + cardW / 2, y + 8.5, { align: 'center' });
  }
  doc.setFontSize(12);
  doc.setTextColor(...C.blue);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.request.approvedAmount || data.request.requestedAmount), c2x + cardW / 2, y + 14.5, { align: 'center' });

  const c3x = ml + (cardW + cardGap) * 2;
  rr(doc, c3x, y, cardW, cardH, 2, C.greenLight, [170, 215, 185] as [number, number, number]);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('STATUS', c3x + cardW / 2, y + 5, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(6.5);
    arText(ar('STATUS'), c3x + cardW / 2, y + 8.5, { align: 'center' });
  }
  doc.setFontSize(12);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtStatus(data.request.status).toUpperCase(), c3x + cardW / 2, y + 14.5, { align: 'center' });

  y += cardH + 3;

  // === SECTION BAR helper (compact: 7mm) ===
  const sectionBar = (enTitle: string, arKey: string) => {
    doc.setFillColor(...C.navy);
    rr(doc, ml, y, cw, 6.5, 1.5, C.navy);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text(enTitle, ml + 4, y + 4.5);
    if (hasArabic && ar(arKey)) {
      doc.setFontSize(8);
      arText(ar(arKey), pw - mr - 4, y + 4.5, { align: 'right' });
    }
    y += 8.5;
  };

  // === FIELD PAIR helper (compact: 8mm per row) ===
  const drawLabel = (enLabel: string, arLabel: string | undefined, x: number) => {
    doc.setFontSize(6);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'bold');
    const enText = enLabel.toUpperCase();
    doc.text(enText, x, y);
    if (hasArabic && arLabel) {
      const enW = doc.getTextWidth(enText);
      doc.setFont('helvetica', 'normal');
      doc.text(' / ', x + enW, y);
      const slW = doc.getTextWidth(' / ');
      doc.setFont('Amiri', 'normal');
      doc.setFontSize(7);
      doc.text(arLabel, x + enW + slW, y);
      doc.setFont('helvetica', 'normal');
    }
  };

  const fieldPair = (l1: string, v1: string, l2: string, v2: string, arL1?: string, arL2?: string) => {
    const halfW = cw / 2 - 3;
    const col2X = ml + cw / 2 + 3;

    drawLabel(l1, arL1, ml + 3);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const lines1 = doc.splitTextToSize(v1 || 'N/A', halfW - 5);
    doc.text(lines1[0], ml + 3, y + 4);

    if (l2) {
      drawLabel(l2, arL2, col2X);
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.setFont('helvetica', 'normal');
      const lines2 = doc.splitTextToSize(v2 || 'N/A', halfW - 3);
      doc.text(lines2[0], col2X, y + 4);
    }

    y += 8;
  };

  sectionBar('REQUEST DETAILS', 'REQUEST DETAILS');

  const paymentLabel = data.request.paymentType === 'full_advance' ? 'Full Advance' : 'Installments';

  fieldPair('Requested By', data.requester.name, 'Project', data.request.projectName || 'N/A', ar('REQUESTED BY'), ar('PROJECT'));
  fieldPair('Site', data.request.siteName, 'Hub', data.request.hubName || 'N/A', ar('SITE'), ar('HUB'));
  fieldPair('State', data.request.stateName || 'N/A', 'Locality', data.request.localityName || 'N/A', ar('STATE'), ar('LOCALITY'));
  fieldPair('Request Date', fmtDate(data.request.requestedAt, true), 'Activity Type', data.request.activityType || 'N/A', ar('REQUEST DATE'), ar('ACTIVITY TYPE'));
  fieldPair('Payment Type', paymentLabel, 'Request ID', refNumber, ar('PAYMENT TYPE'));
  if (data.requester.role) {
    fieldPair('Requester Role', data.requester.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 'Email', data.requester.email || 'N/A', ar('REQUESTER ROLE'), ar('APPROVER EMAIL'));
  }
  if (data.request.approvalPercentage && data.request.approvalPercentage < 100) {
    fieldPair('Approval Percentage', `${data.request.approvalPercentage}%`, '', '', ar('APPROVAL PERCENTAGE'));
  }

  if (data.request.justification) {
    const cleanJust = data.request.justification.trim();
    if (cleanJust) {
      drawLabel('Justification', ar('JUSTIFICATION'), ml + 3);
      if (hasArabic && containsArabic(cleanJust)) {
        doc.setFont('Amiri', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...C.dark);
        const justLines = doc.splitTextToSize(cleanJust, cw - 8);
        doc.text(justLines[0], pw - mr - 3, y + 4, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setFontSize(8.5);
        doc.setTextColor(...C.dark);
        doc.setFont('helvetica', 'normal');
        const justLines = doc.splitTextToSize(cleanJust, cw - 8);
        doc.text(justLines[0], ml + 3, y + 4);
      }
      y += 8;
    }
  }

  y += 1;

  // === APPROVAL WORKFLOW ===
  sectionBar('APPROVAL WORKFLOW', 'APPROVAL WORKFLOW');

  const drawTierCard = (
    tierNum: number,
    tierLabel: string,
    tierData: TransportAdvanceCertificateData['tier1'],
    sigImage?: string | null
  ) => {
    const sig = parseSignatureFromNotes(tierData.notes);
    const hasSigBlock = sig || sigImage;
    const cleanNotes = getCleanNotes(tierData.notes);
    const hasNotes = cleanNotes.length > 0;

    let ch = 20;
    if (hasNotes) ch += 7;
    if (hasSigBlock) ch += 10;

    const tierColor = tierNum === 1 ? C.green : C.blue;
    const tierBg = tierNum === 1 ? C.greenLight : C.blueLight;
    const isApproved = tierData.status === 'approved';

    rr(doc, ml, y, cw, ch, 2, C.white, C.border);

    doc.setFillColor(...tierBg);
    doc.rect(ml + 0.3, y + 0.3, cw - 0.6, 7, 'F');

    doc.setDrawColor(...tierColor);
    doc.setLineWidth(1.8);
    doc.line(ml + 0.15, y + 0.3, ml + 0.15, y + ch - 0.3);
    doc.setLineWidth(0.2);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...tierColor);
    doc.text(`TIER ${tierNum}`, ml + 5, y + 5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.body);
    doc.text(tierLabel, ml + 19, y + 5);

    if (isApproved) {
      const badgeText = 'APPROVED';
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      const bw = doc.getTextWidth(badgeText) + 6;
      const bx = pw - mr - bw - 3;
      rr(doc, bx, y + 1.5, bw, 4.5, 1.5, C.greenBadge as [number, number, number]);
      doc.setTextColor(...C.white);
      doc.text(badgeText, bx + bw / 2, y + 4.5, { align: 'center' });
    }

    if (hasArabic) {
      const arLabel = tierNum === 1 ? ar('Supervisor / FOM Review') : ar('Admin Final Approval');
      doc.setFontSize(7);
      doc.setTextColor(...C.body);
      const arLabelMaxX = isApproved ? pw - mr - 35 : pw - mr - 4;
      arText(arLabel, arLabelMaxX, y + 5, { align: 'right' });
    }

    let iy = y + 9.5;

    doc.setFontSize(6);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'bold');
    doc.text('APPROVER', ml + 5, iy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(tierData.approverName, ml + 5, iy + 4);

    const dateX = ml + cw * 0.45;
    doc.setFontSize(6);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'bold');
    doc.text('DATE & TIME', dateX, iy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDate(tierData.approvedAt, true), dateX, iy + 4);

    iy += 7;

    if (hasNotes) {
      doc.setFontSize(6);
      doc.setTextColor(...C.label);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTES', ml + 5, iy);
      if (hasArabic && containsArabic(cleanNotes)) {
        doc.setFont('Amiri', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.body);
        const notesTrunc = cleanNotes.length > 70 ? cleanNotes.substring(0, 70) + '...' : cleanNotes;
        doc.text(`"${notesTrunc}"`, pw - mr - 5, iy + 4, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setFontSize(7.5);
        doc.setTextColor(...C.body);
        doc.setFont('helvetica', 'italic');
        const notesTrunc = cleanNotes.length > 85 ? cleanNotes.substring(0, 85) + '...' : cleanNotes;
        doc.text(`"${notesTrunc}"`, ml + 5, iy + 3.5);
      }
      iy += 6;
    }

    if (hasSigBlock) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(ml + 3, iy, pw - mr - 3, iy);
      iy += 2;

      if (sig) {
        doc.setFontSize(6);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bold');
        doc.text('DIGITAL SIGNATURE', ml + 5, iy + 2.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.label);
        doc.setFontSize(5.5);
        doc.text(`${sig.method}  |  Hash: ${sig.hash}...  |  ID: ${sig.id}`, ml + 33, iy + 2.5);
      }

      const sbW = 30;
      const sbH = 8;
      const sbX = pw - mr - sbW - 3;
      doc.setDrawColor(...C.blue);
      doc.setLineWidth(0.4);
      doc.roundedRect(sbX, iy - 0.5, sbW, sbH, 1.5, 1.5, 'S');
      doc.setLineWidth(0.2);

      if (sigImage) {
        try { doc.addImage(sigImage, 'PNG', sbX + 1.5, iy + 0.5, sbW - 3, sbH - 2); } catch {}
      } else if (sig) {
        doc.setFontSize(8);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bolditalic');
        const sn = tierData.approverName.length > 16 ? tierData.approverName.substring(0, 16) : tierData.approverName;
        doc.text(sn, sbX + sbW / 2, iy + sbH / 2 + 1, { align: 'center' });
      }
    }

    y += ch + 3;
  };

  drawTierCard(1, 'Supervisor / FOM Review', data.tier1);
  drawTierCard(2, 'Admin Final Approval', data.tier2, data.tier2.signatureImageData);

  y += 1;

  // === FINANCIAL SUMMARY (compact: 16mm) ===
  const approvedAmt = data.request.approvedAmount || data.request.requestedAmount;
  const paidAmt = data.request.totalPaidAmount || 0;
  const remainAmt = data.request.remainingAmount || (approvedAmt - paidAmt);

  const finH = 15;
  rr(doc, ml, y, cw, finH, 2, C.amberLight, C.amber as [number, number, number]);
  doc.setFontSize(7.5);
  doc.setTextColor(...C.amber);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL SUMMARY', ml + 4, y + 5);
  if (hasArabic) {
    doc.setFontSize(8);
    arText(ar('FINANCIAL SUMMARY'), pw - mr - 4, y + 5, { align: 'right' });
  }
  const col1 = ml + 4;
  const col2 = ml + cw * 0.25;
  const col3 = ml + cw * 0.5;
  const col4 = ml + cw * 0.75;
  doc.setFontSize(6);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'bold');
  doc.text('REQUESTED', col1, y + 9);
  doc.text('APPROVED', col2, y + 9);
  doc.text('TOTAL PAID', col3, y + 9);
  doc.text('REMAINING', col4, y + 9);
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.request.requestedAmount), col1, y + 13.5);
  doc.text(fmtCurrency(approvedAmt), col2, y + 13.5);
  const paidColor = paidAmt > 0 ? C.green : C.dark;
  doc.setTextColor(paidColor[0], paidColor[1], paidColor[2]);
  doc.text(fmtCurrency(paidAmt), col3, y + 13.5);
  const remColor = remainAmt > 0 ? C.amber : C.green;
  doc.setTextColor(remColor[0], remColor[1], remColor[2]);
  doc.text(fmtCurrency(remainAmt), col4, y + 13.5);
  y += finH + 3;

  // === RECONCILIATION + VERIFICATION combined row ===
  const red: [number, number, number] = [180, 40, 40];
  const redLight: [number, number, number] = [255, 240, 240];

  const reconW = cw * 0.52;
  const verifyW = cw - reconW - 3;
  const bottomH = hasArabic ? 28 : 22;

  rr(doc, ml, y, reconW, bottomH, 2, redLight, red);
  doc.setFontSize(7);
  doc.setTextColor(...red);
  doc.setFont('helvetica', 'bold');
  doc.text('RECONCILIATION NOTICE', ml + 4, y + 5);
  if (hasArabic) {
    doc.setFontSize(7.5);
    arText(ar('RECONCILIATION NOTICE'), ml + reconW - 4, y + 5, { align: 'right' });
  }
  doc.setFontSize(6.5);
  doc.setTextColor(...C.body);
  doc.setFont('helvetica', 'normal');
  const reconText = 'This advance must be reconciled after field activity completion. Submit receipts and return unused funds within the reconciliation period.';
  const reconLines = doc.splitTextToSize(reconText, reconW - 8);
  doc.text(reconLines.slice(0, 2), ml + 4, y + 9.5);
  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.body);
    const arReconText = 'يجب تسوية هذه السلفة بعد اكتمال النشاط الميداني. يجب تقديم الإيصالات وإعادة الأموال غير المستخدمة خلال فترة التسوية.';
    const arReconLines = doc.splitTextToSize(arReconText, reconW - 8);
    doc.text(arReconLines.slice(0, 2), ml + reconW - 4, y + 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  const verifyX = ml + reconW + 3;
  rr(doc, verifyX, y, verifyW, bottomH, 2, C.bgLight, C.border);

  const qrSize = bottomH - 6;
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', verifyX + 3, y + 3, qrSize, qrSize); } catch {}
  }

  const vtX = verifyX + qrSize + 6;
  const vtW = verifyW - qrSize - 10;

  doc.setFontSize(7);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('VERIFICATION', vtX, y + 5);
  if (hasArabic) {
    const vw = doc.getTextWidth('VERIFICATION');
    doc.setFont('helvetica', 'normal');
    doc.text(' / ', vtX + vw, y + 5);
    const sw = doc.getTextWidth(' / ');
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7.5);
    doc.text('التحقق', vtX + vw + sw, y + 5);
    doc.setFont('helvetica', 'normal');
  }

  doc.setFontSize(6);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  const disclaimEn = doc.splitTextToSize(
    'This document confirms the advance has been approved through PACT multi-tier workflow. Scan QR to verify. System-generated, valid without signature.',
    vtW
  );
  doc.text(disclaimEn.slice(0, 4), vtX, y + 9);

  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    const arVerifyText = 'يؤكد هذا المستند الموافقة عبر مسار باكت. امسح رمز QR للتحقق.';
    const arVerifyLines = doc.splitTextToSize(arVerifyText, vtW);
    doc.text(arVerifyLines.slice(0, 2), verifyX + verifyW - 4, y + bottomH - 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  // === FOOTER ===
  const footerH = 10;
  const footerY = ph - footerH;
  doc.setFillColor(...C.navy);
  doc.rect(0, footerY, pw, footerH, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(180, 195, 220);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${refNumber}`, ml, footerY + 4.5);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm:ss')}`, pw / 2, footerY + 4.5, { align: 'center' });
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT Command Center', pw - mr, footerY + 4.5, { align: 'right' });
  doc.setFontSize(5.5);
  doc.setTextColor(140, 155, 180);
  doc.setFont('helvetica', 'normal');
  doc.text('Financial Operations  |  Field Operations Platform', pw / 2, footerY + 8, { align: 'center' });

  return { doc, refNumber };
}

export async function generateTransportAdvanceCertificatePdf(data: TransportAdvanceCertificateData) {
  const { doc, refNumber } = await buildTransportCertificateDoc(data);
  doc.save(`Transport-Advance-Confirmation-${refNumber}.pdf`);
}

export async function generateTransportAdvanceCertificateBase64(data: TransportAdvanceCertificateData): Promise<{ base64: string; filename: string }> {
  const { doc, refNumber } = await buildTransportCertificateDoc(data);
  const base64String = doc.output('datauristring').split(',')[1];
  return { base64: base64String, filename: `Transport-Advance-Confirmation-${refNumber}.pdf` };
}

export type { TransportAdvanceCertificateData };

export async function generateBulkPaymentPdf(
  requests: TransportAdvanceCertificateData[],
  groupLabel?: string
): Promise<void> {
  if (requests.length === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const cw = pw - ml - mr;
  const footerH = 14;
  const maxY = ph - footerH - 4;
  const batchRef = `PACT-BULK-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  let hasArabic = false;
  try {
    hasArabic = await loadArabicFont(doc);
  } catch {}

  const logoDataUrl = await loadLogoAsDataUrl();

  const arText = (text: string, x: number, yPos: number, opts?: any) => {
    if (!hasArabic) return;
    doc.setFont('Amiri', 'normal');
    doc.text(text, x, yPos, opts);
    doc.setFont('helvetica', 'normal');
  };

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
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 195, 220);
  doc.text('Command Center | Field Operations', ml + 27, 22);
  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(10);
    doc.text('مركز قيادة باكت', ml + 27, 28);
    doc.setFont('helvetica', 'normal');
  }

  doc.setFontSize(7);
  doc.setTextColor(180, 195, 220);
  doc.text(batchRef, pw - mr, 8, { align: 'right' });
  doc.text(`${format(new Date(), 'MMM d, yyyy | HH:mm')}`, pw - mr, 13, { align: 'right' });

  let y = 42;

  rr(doc, ml, y, cw, 14, 2, C.blueLight, C.blue as [number, number, number]);
  doc.setFontSize(12);
  doc.setTextColor(...C.blue);
  doc.setFont('helvetica', 'bold');
  doc.text('BULK PAYMENT REQUEST', ml + 5, y + 8);
  if (hasArabic) {
    doc.setFontSize(11);
    arText('طلب دفع جماعي', pw - mr - 5, y + 8, { align: 'right' });
  }
  y += 18;

  if (groupLabel) {
    doc.setFontSize(9);
    doc.setTextColor(...C.body);
    doc.setFont('helvetica', 'bold');
    doc.text(`Group: ${groupLabel}`, ml + 2, y + 3);
    y += 7;
  }

  const totalRequested = requests.reduce((s, r) => s + r.request.requestedAmount, 0);
  const totalApproved = requests.reduce((s, r) => s + (r.request.approvedAmount || r.request.requestedAmount), 0);

  const summH = 22;
  rr(doc, ml, y, cw, summH, 2, C.bgLight, C.border);
  doc.setFontSize(8);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL REQUESTS', ml + 5, y + 6);
  doc.text('TOTAL REQUESTED', ml + cw * 0.3, y + 6);
  doc.text('TOTAL APPROVED', ml + cw * 0.6, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(`${requests.length}`, ml + 5, y + 16);
  doc.setFontSize(11);
  doc.text(fmtCurrency(totalRequested), ml + cw * 0.3, y + 16);
  doc.setTextColor(...C.green);
  doc.text(fmtCurrency(totalApproved), ml + cw * 0.6, y + 16);
  y += summH + 6;

  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('REQUEST DETAILS', ml + 2, y);
  if (hasArabic) {
    doc.setFontSize(9);
    arText('تفاصيل الطلبات', pw - mr - 2, y, { align: 'right' });
  }
  y += 5;

  const tableHead = [['#', 'Ref / المرجع', 'Requester / مقدم الطلب', 'Site / الموقع', 'Hub', 'Requested', 'Approved', 'Status']];
  const tableBody = requests.map((r, i) => [
    `${i + 1}`,
    `PACT-TA-${r.request.id.substring(0, 8).toUpperCase()}`,
    r.requester.name,
    r.request.siteName || 'N/A',
    r.request.hubName || 'N/A',
    fmtCurrency(r.request.requestedAmount),
    fmtCurrency(r.request.approvedAmount || r.request.requestedAmount),
    fmtStatus(r.request.status),
  ]);

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    margin: { left: ml, right: mr, bottom: footerH + 6 },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: C.border,
      lineWidth: 0.2,
      textColor: C.body,
    },
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 6.5,
    },
    alternateRowStyles: {
      fillColor: [248, 249, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        const val = data.cell.raw?.toString().toLowerCase() || '';
        if (val.includes('approved')) {
          data.cell.styles.textColor = C.green;
        } else if (val.includes('rejected')) {
          data.cell.styles.textColor = [180, 40, 40];
        } else if (val.includes('pending')) {
          data.cell.styles.textColor = C.amber;
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  const checkPage = (needed: number) => {
    if (y + needed > maxY) {
      doc.addPage();
      y = 15;
    }
  };

  checkPage(20);
  const totH = 16;
  rr(doc, ml, y, cw, totH, 2, C.amberLight, C.amber as [number, number, number]);
  doc.setFontSize(8);
  doc.setTextColor(...C.amber);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL', ml + 5, y + 6);
  if (hasArabic) arText('الإجمالي الكلي', pw - mr - 5, y + 6, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.text('TOTAL REQUESTED', ml + 5, y + 10);
  doc.text('TOTAL APPROVED', ml + cw * 0.5, y + 10);
  doc.setFontSize(11);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(totalRequested), ml + 5, y + 15);
  doc.setTextColor(...C.green);
  doc.text(fmtCurrency(totalApproved), ml + cw * 0.5, y + 15);
  y += totH + 6;

  checkPage(22);
  const reconH2 = hasArabic ? 22 : 16;
  const red: [number, number, number] = [180, 40, 40];
  const redLight: [number, number, number] = [255, 240, 240];
  rr(doc, ml, y, cw, reconH2, 2, redLight, red);
  doc.setFontSize(8);
  doc.setTextColor(...red);
  doc.setFont('helvetica', 'bold');
  doc.text('RECONCILIATION NOTICE', ml + 5, y + 5.5);
  if (hasArabic) {
    doc.setFontSize(9);
    arText('إشعار التسوية', pw - mr - 5, y + 5.5, { align: 'right' });
  }
  doc.setFontSize(7);
  doc.setTextColor(...C.body);
  doc.setFont('helvetica', 'normal');
  const reconText = 'All transportation advances listed must be reconciled after field activities are completed. Recipients must submit receipts and return unused funds within the reconciliation period.';
  const reconLines = doc.splitTextToSize(reconText, cw - 12);
  doc.text(reconLines.slice(0, 2), ml + 5, y + 10);
  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8);
    const arRecon = 'يجب تسوية جميع سلف النقل المدرجة بعد اكتمال الأنشطة الميدانية. يجب على المستلمين تقديم الإيصالات وإعادة الأموال غير المستخدمة.';
    const arLines = doc.splitTextToSize(arRecon, cw - 12);
    doc.text(arLines.slice(0, 2), pw - mr - 5, y + 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }
  y += reconH2 + 4;

  let qrDataUrl: string | null = null;
  try {
    const qrContent = [
      `PACT BULK PAYMENT REQUEST`,
      `Ref: ${batchRef}`,
      `Date: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      `Total Requests: ${requests.length}`,
      `Total Approved: ${fmtCurrency(totalApproved)}`,
      groupLabel ? `Group: ${groupLabel}` : '',
      `Verified: YES`,
    ].filter(Boolean).join('\n');
    qrDataUrl = await generateQRDataUrl(qrContent);
  } catch {}

  const qrSize = 22;
  const verifyH = qrSize + 6;
  checkPage(verifyH + 4);
  rr(doc, ml, y, cw, verifyH, 2, C.bgLight, C.border);
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', ml + 4, y + 3, qrSize, qrSize); } catch {}
  }
  const textX = ml + qrSize + 10;
  const textW = cw - qrSize - 16;
  doc.setFontSize(8);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('VERIFICATION', textX, y + 6);
  if (hasArabic) {
    const vw = doc.getTextWidth('VERIFICATION');
    doc.setFont('helvetica', 'normal');
    doc.text(' / ', textX + vw, y + 6);
    const sw = doc.getTextWidth(' / ');
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(9);
    doc.text('التحقق', textX + vw + sw, y + 6);
    doc.setFont('helvetica', 'normal');
  }
  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  const verifyText = doc.splitTextToSize(
    `This document confirms ${requests.length} transportation advance request(s) have been reviewed and approved through the PACT multi-tier workflow. Scan the QR code to verify. System-generated, valid without physical signature.`,
    textW
  );
  doc.text(verifyText.slice(0, 3), textX, y + 11);
  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8);
    const arV = `يؤكد هذا المستند أن ${requests.length} طلب(ات) سلفة نقل قد تمت مراجعتها والموافقة عليها. امسح رمز الاستجابة السريعة للتحقق.`;
    const arVL = doc.splitTextToSize(arV, textW);
    doc.text(arVL.slice(0, 2), pw - mr - 4, y + verifyH - 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = ph - footerH;
    doc.setFillColor(...C.navy);
    doc.rect(0, footerY, pw, footerH, 'F');
    doc.setFontSize(7);
    doc.setTextColor(180, 195, 220);
    doc.setFont('helvetica', 'normal');
    doc.text(`Batch Reference: ${batchRef}`, ml, footerY + 5.5);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm:ss')}`, pw / 2, footerY + 5.5, { align: 'center' });
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT Command Center', pw - mr, footerY + 5.5, { align: 'right' });
    doc.setFontSize(6);
    doc.setTextColor(140, 155, 180);
    doc.setFont('helvetica', 'normal');
    doc.text(`Financial Operations  |  Bulk Payment  |  Page ${p} of ${totalPages}`, pw / 2, footerY + 10, { align: 'center' });
  }

  doc.save(`Bulk-Payment-Request-${batchRef}.pdf`);
}
