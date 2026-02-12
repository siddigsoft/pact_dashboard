import jsPDF from 'jspdf';
import { format } from 'date-fns';
import QRCode from 'qrcode';

interface ApprovalCertificateData {
  submission: {
    id: string;
    expense_category: string;
    amount_cents: number;
    currency: string;
    description: string | null;
    expense_date: string | null;
    vendor: string | null;
    reference_number: string | null;
    submitted_at: string | null;
    created_at: string;
    supporting_documents: any;
  };
  submitter: {
    name: string;
    email: string;
    role: string | null;
  };
  project?: {
    name: string;
  } | null;
  hub?: {
    name: string;
  } | null;
  tier1: {
    approverName: string;
    approverEmail?: string;
    status: string;
    approvedAt: string;
    notes: string | null;
  };
  tier2: {
    approverName: string;
    approverEmail?: string;
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
};

function fmtCurrency(cents: number, cur: string = 'SDG'): string {
  return `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d: string | null | undefined, withTime = false): string {
  if (!d) return 'N/A';
  try {
    return format(new Date(d), withTime ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function parseSignatureFromNotes(notes: string | null): { method: string; hash: string; id: string; signedAt: string } | null {
  if (!notes) return null;
  const match = notes.match(/\[Signed:\s*(\S+)\s*\|\s*Hash:\s*(\S+?)\.\.\.\s*\|\s*ID:\s*(\S+)\s*\|\s*(.+?)\]/);
  if (!match) return null;
  return { method: match[1], hash: match[2], id: match[3], signedAt: match[4] };
}

function getCleanNotes(notes: string | null): string {
  if (!notes) return '';
  return notes.replace(/\n?\[Signed:.*?\]/, '').trim();
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
  'OPERATIONAL COST - APPROVAL CONFIRMATION': 'تأكيد الموافقة على التكلفة التشغيلية',
  'TOTAL AMOUNT': 'المبلغ الإجمالي',
  'CATEGORY': 'الفئة',
  'STATUS': 'الحالة',
  'REQUEST DETAILS': 'تفاصيل الطلب',
  'SUBMITTED BY': 'مقدم من',
  'PROJECT': 'المشروع',
  'ROLE': 'الدور',
  'EXPENSE DATE': 'تاريخ المصروف',
  'SUBMISSION DATE': 'تاريخ التقديم',
  'VENDOR': 'المورد',
  'REQUEST ID': 'رقم الطلب',
  'FUNDING TYPE': 'نوع التمويل',
  'DESCRIPTION': 'الوصف',
  'HUB': 'المحور',
  'APPROVAL WORKFLOW': 'مسار الموافقة',
  'Supervisor / FOM Review': 'مراجعة المشرف',
  'Admin / Super Admin Final Approval': 'الموافقة النهائية للمسؤول',
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

async function buildApprovalCertificateDoc(data: ApprovalCertificateData): Promise<{ doc: any; refNumber: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 14;
  const mr = 14;
  const cw = pw - ml - mr;
  let y = 0;

  const refNumber = `PACT-OC-${data.submission.id.substring(0, 8).toUpperCase()}`;
  const hasArabic = await loadArabicFont(doc);

  const ar = (key: string): string => ARABIC_MAP[key] || '';

  const arText = (text: string, x: number, yPos: number, opts?: any) => {
    if (!hasArabic) return;
    doc.setFont('Amiri', 'normal');
    doc.text(text, x, yPos, opts);
    doc.setFont('helvetica', 'normal');
  };

  const qrLines = [
    `PACT APPROVAL CERTIFICATE`,
    `========================`,
    `Ref: ${refNumber}`,
    `Date: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
    ``,
    `SUBMISSION`,
    `Amount: ${fmtCurrency(data.submission.amount_cents, data.submission.currency)}`,
    `Category: ${fmtCategory(data.submission.expense_category)}`,
    `Submitter: ${data.submitter.name}`,
    `Project: ${data.project?.name || 'N/A'}`,
    `Expense Date: ${fmtDate(data.submission.expense_date)}`,
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
  doc.text('Command Center  |  Field Operations', ml + 27, 22);
  if (hasArabic) {
    doc.setFontSize(9);
    doc.setTextColor(190, 205, 225);
    arText('مركز قيادة باكت', ml + 27, 28);
  }

  doc.setFontSize(8);
  doc.setTextColor(190, 205, 225);
  doc.setFont('helvetica', 'bold');
  doc.text(refNumber, pw - mr, 13, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(170, 185, 210);
  doc.text(format(new Date(), 'MMM d, yyyy | HH:mm'), pw - mr, 19, { align: 'right' });

  y = 38;

  rr(doc, ml, y, cw, 12, 2, C.greenLight, C.green);
  doc.setFontSize(11);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('OPERATIONAL COST  —  APPROVAL CONFIRMATION', pw / 2, y + 6, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(9.5);
    arText(ar('OPERATIONAL COST - APPROVAL CONFIRMATION'), pw / 2, y + 10.5, { align: 'center' });
  }

  y += 16;

  const cardGap = 3;
  const cardW = (cw - cardGap * 2) / 3;
  const cardH = 22;

  rr(doc, ml, y, cardW, cardH, 2, C.bgLight, C.border);
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL AMOUNT', ml + cardW / 2, y + 6, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    arText(ar('TOTAL AMOUNT'), ml + cardW / 2, y + 9.5, { align: 'center' });
  }
  doc.setFontSize(13);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.submission.amount_cents, data.submission.currency), ml + cardW / 2, y + 17, { align: 'center' });

  const c2x = ml + cardW + cardGap;
  rr(doc, c2x, y, cardW, cardH, 2, C.bgLight, C.border);
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'bold');
  doc.text('EXPENSE CATEGORY', c2x + cardW / 2, y + 6, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    arText(ar('CATEGORY'), c2x + cardW / 2, y + 9.5, { align: 'center' });
  }
  doc.setFontSize(11);
  doc.setTextColor(...C.body);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCategory(data.submission.expense_category), c2x + cardW / 2, y + 17, { align: 'center' });

  const c3x = ml + (cardW + cardGap) * 2;
  rr(doc, c3x, y, cardW, cardH, 2, C.greenLight, [170, 215, 185] as [number, number, number]);
  doc.setFontSize(7);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('STATUS', c3x + cardW / 2, y + 6, { align: 'center' });
  if (hasArabic) {
    doc.setFontSize(7);
    arText(ar('STATUS'), c3x + cardW / 2, y + 9.5, { align: 'center' });
  }
  doc.setFontSize(13);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED', c3x + cardW / 2, y + 17, { align: 'center' });

  y += cardH + 5;

  const sectionBar = (enTitle: string, arKey: string) => {
    doc.setFillColor(...C.navy);
    rr(doc, ml, y, cw, 8, 1.5, C.navy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text(enTitle, ml + 5, y + 5.5);
    if (hasArabic && ar(arKey)) {
      doc.setFontSize(8);
      arText(ar(arKey), pw - mr - 5, y + 5.5, { align: 'right' });
    }
    y += 11;
  };

  const drawLabel = (enLabel: string, arLabel: string | undefined, x: number) => {
    doc.setFontSize(7);
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

    drawLabel(l1, arL1, ml + 4);
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const lines1 = doc.splitTextToSize(v1 || 'N/A', halfW - 6);
    doc.text(lines1[0], ml + 4, y + 4.5);

    if (l2) {
      drawLabel(l2, arL2, col2X);
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      doc.setFont('helvetica', 'normal');
      const lines2 = doc.splitTextToSize(v2 || 'N/A', halfW - 3);
      doc.text(lines2[0], col2X, y + 4.5);
    }

    y += 9;
  };

  sectionBar('REQUEST DETAILS', 'REQUEST DETAILS');

  const fundingType = data.submission.description?.includes('[ADVANCE]') ? 'Advance Request' : data.submission.description?.includes('[REIMBURSEMENT]') ? 'Reimbursement' : 'Standard';

  fieldPair('Submitted By', data.submitter.name, 'Project', data.project?.name || 'N/A', ar('SUBMITTED BY'), ar('PROJECT'));
  fieldPair('Role', (data.submitter.role || 'N/A').replace(/\b\w/g, c => c.toUpperCase()), 'Expense Date', fmtDate(data.submission.expense_date), ar('ROLE'), ar('EXPENSE DATE'));
  fieldPair('Submission Date', fmtDate(data.submission.submitted_at || data.submission.created_at, true), 'Vendor', data.submission.vendor || 'Not specified', ar('SUBMISSION DATE'), ar('VENDOR'));
  fieldPair('Request ID', refNumber, 'Funding Type', fundingType, ar('REQUEST ID'), ar('FUNDING TYPE'));

  if (data.submission.description) {
    const cleanDesc = data.submission.description.replace(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/i, '');
    if (cleanDesc.trim()) {
      drawLabel('Description', ar('DESCRIPTION'), ml + 4);
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(cleanDesc, cw - 10);
      doc.text(descLines[0], ml + 4, y + 4.5);
      y += 9;
    }
  }

  if (data.hub) {
    fieldPair('Hub', data.hub.name, '', '', ar('HUB'));
  }

  y += 1;

  sectionBar('APPROVAL WORKFLOW', 'APPROVAL WORKFLOW');

  const drawTierCard = (
    tierNum: number,
    tierLabel: string,
    tierData: ApprovalCertificateData['tier1'],
    sigImage?: string | null
  ) => {
    const sig = parseSignatureFromNotes(tierData.notes);
    const hasSigBlock = sig || sigImage;
    const cleanNotes = getCleanNotes(tierData.notes);
    const hasNotes = cleanNotes.length > 0;

    let ch = 22;
    if (hasNotes) ch += 6;
    if (hasSigBlock) ch += 12;

    const tierColor = tierNum === 1 ? C.green : C.blue;
    const tierBg = tierNum === 1 ? C.greenLight : C.blueLight;
    const isApproved = tierData.status === 'approved';

    rr(doc, ml, y, cw, ch, 2, C.white, C.border);

    doc.setFillColor(...tierBg);
    doc.rect(ml + 0.3, y + 0.3, cw - 0.6, 8.5, 'F');

    doc.setDrawColor(...tierColor);
    doc.setLineWidth(2);
    doc.line(ml + 0.15, y + 0.3, ml + 0.15, y + ch - 0.3);
    doc.setLineWidth(0.2);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...tierColor);
    doc.text(`TIER ${tierNum}`, ml + 6, y + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.body);
    doc.text(tierLabel, ml + 22, y + 6);

    if (hasArabic) {
      const arLabel = tierNum === 1 ? ar('Supervisor / FOM Review') : ar('Admin / Super Admin Final Approval');
      doc.setFontSize(7.5);
      arText(arLabel, pw - mr - 5, y + 6, { align: 'right' });
    }

    if (isApproved) {
      const badgeText = 'APPROVED';
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const bw = doc.getTextWidth(badgeText) + 7;
      const bx = pw - mr - bw - 4;
      rr(doc, bx, y + 1.5, bw, 5.5, 1.5, C.greenBadge as [number, number, number]);
      doc.setTextColor(...C.white);
      doc.text(badgeText, bx + bw / 2, y + 5.2, { align: 'center' });
    }

    let iy = y + 12;

    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'bold');
    doc.text('APPROVER', ml + 6, iy);
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(tierData.approverName, ml + 6, iy + 4.5);

    const dateX = ml + cw * 0.45;
    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'bold');
    doc.text('DATE & TIME', dateX, iy);
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDate(tierData.approvedAt, true), dateX, iy + 4.5);

    iy += 9;

    if (hasNotes) {
      doc.setFontSize(7);
      doc.setTextColor(...C.label);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTES', ml + 6, iy);
      doc.setFontSize(8);
      doc.setTextColor(...C.body);
      doc.setFont('helvetica', 'italic');
      const notesTrunc = cleanNotes.length > 85 ? cleanNotes.substring(0, 85) + '...' : cleanNotes;
      doc.text(`"${notesTrunc}"`, ml + 6, iy + 4);
      iy += 6;
    }

    if (hasSigBlock) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(ml + 4, iy, pw - mr - 4, iy);
      iy += 2.5;

      if (sig) {
        doc.setFontSize(6.5);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bold');
        doc.text('DIGITAL SIGNATURE', ml + 6, iy + 2.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.label);
        doc.setFontSize(6);
        doc.text(`${sig.method}  |  Hash: ${sig.hash}...  |  ID: ${sig.id}`, ml + 36, iy + 2.5);
      }

      const sbW = 34;
      const sbH = 10;
      const sbX = pw - mr - sbW - 4;
      doc.setDrawColor(...C.blue);
      doc.setLineWidth(0.4);
      doc.roundedRect(sbX, iy - 0.5, sbW, sbH, 1.5, 1.5, 'S');
      doc.setLineWidth(0.2);

      if (sigImage) {
        try { doc.addImage(sigImage, 'PNG', sbX + 1.5, iy + 0.5, sbW - 3, sbH - 2); } catch {}
      } else if (sig) {
        doc.setFontSize(9);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bolditalic');
        const sn = tierData.approverName.length > 16 ? tierData.approverName.substring(0, 16) : tierData.approverName;
        doc.text(sn, sbX + sbW / 2, iy + sbH / 2 + 1, { align: 'center' });
      }
    }

    y += ch + 4;
  };

  drawTierCard(1, 'Supervisor / FOM Review', data.tier1);
  drawTierCard(2, 'Admin / Super Admin Final Approval', data.tier2, data.tier2.signatureImageData);

  y += 1;

  const qrSize = 24;
  const disclaimerH = qrSize + 6;

  rr(doc, ml, y, cw, disclaimerH, 2, C.bgLight, C.border);

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
    doc.setFontSize(8);
    doc.text('التحقق', textX + vw + sw, y + 6);
    doc.setFont('helvetica', 'normal');
  }

  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  const disclaimEn = doc.splitTextToSize(
    'This document confirms the operational cost submission has been reviewed and approved through the PACT multi-tier approval workflow. Scan the QR code to verify. System-generated, valid without physical signature.',
    textW
  );
  doc.text(disclaimEn.slice(0, 3), textX, y + 11);

  if (hasArabic) {
    doc.setFontSize(8);
    doc.setTextColor(...C.label);
    arText('يؤكد هذا المستند أن التكلفة التشغيلية قد تمت مراجعتها والموافقة عليها. امسح رمز الاستجابة السريعة للتحقق.', textX, y + disclaimerH - 4);
  }

  const footerH = 14;
  const footerY = ph - footerH;

  doc.setFillColor(...C.navy);
  doc.rect(0, footerY, pw, footerH, 'F');

  doc.setFontSize(7);
  doc.setTextColor(180, 195, 220);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document Reference: ${refNumber}`, ml, footerY + 5.5);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy | HH:mm:ss')}`, pw / 2, footerY + 5.5, { align: 'center' });

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT Command Center', pw - mr, footerY + 5.5, { align: 'right' });

  doc.setFontSize(6);
  doc.setTextColor(140, 155, 180);
  doc.setFont('helvetica', 'normal');
  doc.text('Financial Operations  |  Field Operations Platform', pw / 2, footerY + 10, { align: 'center' });

  return { doc, refNumber };
}

export async function generateApprovalCertificatePdf(data: ApprovalCertificateData) {
  const { doc, refNumber } = await buildApprovalCertificateDoc(data);
  doc.save(`Approval-Confirmation-${refNumber}.pdf`);
}

export async function generateApprovalCertificateBase64(data: ApprovalCertificateData): Promise<{ base64: string; filename: string }> {
  const { doc, refNumber } = await buildApprovalCertificateDoc(data);
  const base64String = doc.output('datauristring').split(',')[1];
  return { base64: base64String, filename: `Approval-Confirmation-${refNumber}.pdf` };
}
