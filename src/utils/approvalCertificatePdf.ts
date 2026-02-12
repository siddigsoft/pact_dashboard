import jsPDF from 'jspdf';
import { format } from 'date-fns';

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
  navyMid: [25, 55, 100] as [number, number, number],
  blue: [41, 98, 255] as [number, number, number],
  blueLight: [230, 238, 255] as [number, number, number],
  dark: [25, 25, 35] as [number, number, number],
  body: [50, 50, 65] as [number, number, number],
  label: [100, 105, 120] as [number, number, number],
  muted: [140, 145, 160] as [number, number, number],
  border: [210, 215, 225] as [number, number, number],
  bgLight: [245, 247, 252] as [number, number, number],
  bgWarm: [252, 252, 255] as [number, number, number],
  green: [16, 120, 60] as [number, number, number],
  greenLight: [225, 245, 232] as [number, number, number],
  greenBadge: [34, 155, 80] as [number, number, number],
  amber: [180, 120, 20] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gold: [200, 160, 50] as [number, number, number],
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
    return format(new Date(d), withTime ? 'MMM d, yyyy  HH:mm' : 'MMM d, yyyy');
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

function drawRoundedRect(doc: any, x: number, y: number, w: number, h: number, r: number, fillColor?: [number, number, number], strokeColor?: [number, number, number]) {
  if (fillColor) doc.setFillColor(...fillColor);
  if (strokeColor) {
    doc.setDrawColor(...strokeColor);
    doc.setLineWidth(0.3);
  }
  const mode = fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'S';
  doc.roundedRect(x, y, w, h, r, r, mode);
  doc.setLineWidth(0.2);
}

async function buildApprovalCertificateDoc(data: ApprovalCertificateData): Promise<{ doc: any; refNumber: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 18;
  const mr = 18;
  const cw = pw - ml - mr;
  let y = 0;

  const refNumber = `PACT-OC-${data.submission.id.substring(0, 8).toUpperCase()}`;

  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, 42, 'F');

  doc.setFillColor(...C.navyMid);
  doc.rect(0, 38, pw, 4, 'F');

  const logoDataUrl = await loadLogoAsDataUrl();
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', ml + 1, 8, 24, 24);
    } catch { /* logo failed */ }
  }

  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT', ml + 30, 19);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Command Center', ml + 30, 25);
  doc.setFontSize(7);
  doc.setTextColor(200, 210, 230);
  doc.text('Field Operations Platform', ml + 30, 30);

  doc.setFontSize(7.5);
  doc.setTextColor(180, 195, 220);
  doc.setFont('helvetica', 'normal');
  doc.text(refNumber, pw - mr, 14, { align: 'right' });
  doc.setFontSize(7);
  doc.text(format(new Date(), 'MMM d, yyyy  |  HH:mm'), pw - mr, 20, { align: 'right' });

  y = 50;

  doc.setFillColor(...C.greenLight);
  drawRoundedRect(doc, ml, y, cw, 14, 2, C.greenLight, C.green);

  doc.setFontSize(12);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('OPERATIONAL COST  -  APPROVAL CONFIRMATION', pw / 2, y + 9, { align: 'center' });

  y += 22;

  const col1W = cw * 0.35;
  const col2W = cw * 0.35;
  const col3W = cw * 0.30;
  const cardH = 26;

  drawRoundedRect(doc, ml, y, col1W - 2, cardH, 2, C.bgLight, C.border);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL AMOUNT', ml + (col1W - 2) / 2, y + 8, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  const amountStr = fmtCurrency(data.submission.amount_cents, data.submission.currency);
  doc.text(amountStr, ml + (col1W - 2) / 2, y + 18, { align: 'center' });

  const col2Start = ml + col1W;
  drawRoundedRect(doc, col2Start, y, col2W - 2, cardH, 2, C.bgLight, C.border);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('EXPENSE CATEGORY', col2Start + (col2W - 2) / 2, y + 8, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(...C.body);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCategory(data.submission.expense_category), col2Start + (col2W - 2) / 2, y + 18, { align: 'center' });

  const col3Start = ml + col1W + col2W;
  drawRoundedRect(doc, col3Start, y, col3W, cardH, 2, C.greenLight, [180, 220, 190] as [number, number, number]);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'normal');
  doc.text('STATUS', col3Start + col3W / 2, y + 8, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(...C.green);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED', col3Start + col3W / 2, y + 18, { align: 'center' });

  y += cardH + 8;

  const sectionHeader = (title: string, icon?: string) => {
    doc.setFillColor(...C.navy);
    drawRoundedRect(doc, ml, y, cw, 8, 1.5, C.navy);
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text((icon ? icon + '  ' : '') + title, ml + 5, y + 5.5);
    y += 12;
  };

  const fieldPair = (label1: string, val1: string, label2: string, val2: string) => {
    const halfW = cw / 2 - 3;

    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(label1.toUpperCase(), ml + 4, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const lines1 = doc.splitTextToSize(val1 || 'N/A', halfW - 8);
    doc.text(lines1[0], ml + 4, y + 4.5);

    const col2X = ml + cw / 2 + 3;
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(label2.toUpperCase(), col2X, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const lines2 = doc.splitTextToSize(val2 || 'N/A', halfW - 4);
    doc.text(lines2[0], col2X, y + 4.5);

    y += 10;
  };

  const fieldFull = (label: string, val: string) => {
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), ml + 4, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(val || 'N/A', cw - 12);
    doc.text(lines.slice(0, 2).join('\n'), ml + 4, y + 4.5);
    y += 5 + Math.min(lines.length, 2) * 4;
  };

  sectionHeader('REQUEST DETAILS');

  drawRoundedRect(doc, ml, y - 4, cw, 2, 0, C.bgLight);

  fieldPair('Submitted By', data.submitter.name, 'Project', data.project?.name || 'N/A');
  fieldPair('Role', (data.submitter.role || 'N/A').replace(/\b\w/g, c => c.toUpperCase()), 'Expense Date', fmtDate(data.submission.expense_date));
  fieldPair('Submission Date', fmtDate(data.submission.submitted_at || data.submission.created_at, true), 'Vendor', data.submission.vendor || 'Not specified');
  fieldPair('Request ID', refNumber, 'Funding Type', data.submission.description?.includes('[ADVANCE]') ? 'Advance Request' : data.submission.description?.includes('[REIMBURSEMENT]') ? 'Reimbursement' : 'Standard');

  if (data.submission.description) {
    const cleanDesc = data.submission.description.replace(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/i, '');
    if (cleanDesc.trim()) {
      fieldFull('Description', cleanDesc);
    }
  }

  if (data.hub) {
    fieldPair('Hub', data.hub.name, '', '');
  }

  y += 2;

  sectionHeader('APPROVAL WORKFLOW');

  const footerReserve = 35;
  const ensureFit = (needed: number) => {
    if (y + needed > ph - footerReserve) {
      doc.addPage();
      y = 20;
    }
  };

  const drawTierCard = (
    tierNum: number,
    tierLabel: string,
    tierData: ApprovalCertificateData['tier1'],
    sigImage?: string | null
  ) => {
    const sig = parseSignatureFromNotes(tierData.notes);
    const hasSigBlock = sig || sigImage;
    const cardH = hasSigBlock ? 44 : 28;
    ensureFit(cardH + 6);

    const isApproved = tierData.status === 'approved';
    const tierColor = tierNum === 1 ? C.green : C.blue;
    const tierBg = tierNum === 1 ? C.greenLight : C.blueLight;

    drawRoundedRect(doc, ml, y, cw, cardH, 2, C.white, C.border);

    doc.setFillColor(...tierBg);
    doc.rect(ml + 0.3, y + 0.3, cw - 0.6, 9, 'F');

    doc.setDrawColor(...tierColor);
    doc.setLineWidth(2);
    doc.line(ml + 0.15, y + 0.3, ml + 0.15, y + cardH - 0.3);
    doc.setLineWidth(0.2);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...tierColor);
    doc.text(`TIER ${tierNum}`, ml + 6, y + 6.5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.body);
    doc.text(tierLabel, ml + 22, y + 6.5);

    if (isApproved) {
      const badgeText = 'APPROVED';
      const badgeW = doc.getTextWidth(badgeText) + 8;
      const badgeX = pw - mr - badgeW - 4;
      drawRoundedRect(doc, badgeX, y + 2, badgeW, 5.5, 1.5, C.greenBadge as [number, number, number]);
      doc.setFontSize(6.5);
      doc.setTextColor(...C.white);
      doc.setFont('helvetica', 'bold');
      doc.text(badgeText, badgeX + badgeW / 2, y + 5.8, { align: 'center' });
    }

    let iy = y + 14;
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text('APPROVER', ml + 6, iy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(tierData.approverName, ml + 6, iy + 4.5);

    const dateX = ml + cw / 2;
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text('DATE & TIME', dateX, iy);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDate(tierData.approvedAt, true), dateX, iy + 4.5);

    const cleanNotes = getCleanNotes(tierData.notes);
    if (cleanNotes) {
      iy += 10;
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.setFont('helvetica', 'normal');
      doc.text('NOTES', ml + 6, iy);
      doc.setFontSize(7.5);
      doc.setTextColor(...C.body);
      doc.setFont('helvetica', 'italic');
      const notesTrunc = cleanNotes.length > 100 ? cleanNotes.substring(0, 100) + '...' : cleanNotes;
      doc.text(`"${notesTrunc}"`, ml + 6, iy + 4);
    }

    if (hasSigBlock) {
      iy = y + cardH - 15;

      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(ml + 4, iy - 2, pw - mr - 4, iy - 2);

      if (sig) {
        doc.setFontSize(6);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bold');
        doc.text('DIGITAL SIGNATURE VERIFICATION', ml + 6, iy + 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.label);
        doc.setFontSize(6);
        doc.text(`Method: ${sig.method}   |   Hash: ${sig.hash}...   |   ID: ${sig.id}`, ml + 6, iy + 6);
        doc.text(`Signed: ${sig.signedAt}`, ml + 6, iy + 10);
      }

      if (sigImage) {
        const sigBoxW = 42;
        const sigBoxH = 14;
        const sigBoxX = pw - mr - sigBoxW - 4;
        const sigBoxY = iy - 2;

        doc.setDrawColor(...C.blue);
        doc.setLineWidth(0.4);
        doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 1.5, 1.5, 'S');
        doc.setLineWidth(0.2);

        try {
          doc.addImage(sigImage, 'PNG', sigBoxX + 2, sigBoxY + 1, sigBoxW - 4, sigBoxH - 2);
        } catch { /* skip */ }
      } else if (sig) {
        const sigBoxW = 42;
        const sigBoxH = 14;
        const sigBoxX = pw - mr - sigBoxW - 4;
        const sigBoxY = iy - 2;

        doc.setDrawColor(...C.blue);
        doc.setLineWidth(0.4);
        doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 1.5, 1.5, 'S');
        doc.setLineWidth(0.2);

        doc.setFontSize(10);
        doc.setTextColor(...C.blue);
        doc.setFont('helvetica', 'bolditalic');
        const sigName = tierData.approverName.length > 18
          ? tierData.approverName.substring(0, 18)
          : tierData.approverName;
        doc.text(sigName, sigBoxX + sigBoxW / 2, sigBoxY + sigBoxH / 2 + 1, { align: 'center' });

        doc.setDrawColor(...C.blue);
        doc.setLineWidth(0.3);
        doc.line(sigBoxX + 5, sigBoxY + sigBoxH / 2 + 4, sigBoxX + sigBoxW - 5, sigBoxY + sigBoxH / 2 + 4);
        doc.setLineWidth(0.2);
      }
    }

    y += cardH + 5;
  };

  drawTierCard(1, 'Supervisor / FOM Review', data.tier1);
  drawTierCard(2, 'Admin / Super Admin Final Approval', data.tier2, data.tier2.signatureImageData);

  ensureFit(25);
  y += 2;

  drawRoundedRect(doc, ml, y, cw, 16, 2, C.bgLight, C.border);
  doc.setFontSize(6.5);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  const disclaimerLines = [
    'This document confirms that the above operational cost submission has been reviewed and approved through the PACT',
    'multi-tier approval workflow. All required approvals have been obtained. The digital signature provides cryptographic',
    'proof of the approver\'s identity and approval timestamp. This document is system-generated and valid without physical signature.',
  ];
  disclaimerLines.forEach((line, i) => {
    doc.text(line, pw / 2, y + 5 + i * 3.5, { align: 'center' });
  });

  y = ph - 16;

  doc.setFillColor(...C.navy);
  doc.rect(0, y - 2, pw, 20, 'F');

  doc.setFontSize(7);
  doc.setTextColor(180, 195, 220);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document Reference: ${refNumber}`, ml, y + 4);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy  |  HH:mm:ss')}`, pw / 2, y + 4, { align: 'center' });

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT Command Center', pw - mr, y + 4, { align: 'right' });

  doc.setFontSize(5.5);
  doc.setTextColor(140, 155, 180);
  doc.setFont('helvetica', 'normal');
  doc.text('Financial Operations  |  Field Operations Platform', pw / 2, y + 9, { align: 'center' });

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
