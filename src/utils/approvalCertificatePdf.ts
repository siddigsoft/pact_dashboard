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
  primary: [26, 54, 93] as [number, number, number],
  accent: [41, 98, 255] as [number, number, number],
  dark: [30, 30, 40] as [number, number, number],
  body: [55, 55, 70] as [number, number, number],
  label: [120, 120, 140] as [number, number, number],
  border: [200, 205, 215] as [number, number, number],
  bgLight: [247, 248, 252] as [number, number, number],
  success: [22, 130, 65] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  headerBg: [26, 54, 93] as [number, number, number],
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

export async function generateApprovalCertificatePdf(data: ApprovalCertificateData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 20;
  const mr = 20;
  const cw = pw - ml - mr;
  const col2X = ml + cw / 2 + 4;
  let y = 0;

  const refNumber = `PACT-OC-${data.submission.id.substring(0, 8).toUpperCase()}`;

  const logoDataUrl = await loadLogoAsDataUrl();
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', ml, 12, 22, 22);
    } catch { /* logo failed, continue without */ }
  }

  doc.setFontSize(14);
  doc.setTextColor(...C.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT', ml + 26, 20);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.body);
  doc.text('Command Center', ml + 26, 25);
  doc.text('Field Operations', ml + 26, 29);

  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.text(`Ref: ${refNumber}`, pw - mr, 16, { align: 'right' });
  doc.text(`Date: ${format(new Date(), 'MMM d, yyyy')}`, pw - mr, 21, { align: 'right' });
  doc.text(`Time: ${format(new Date(), 'HH:mm:ss')}`, pw - mr, 26, { align: 'right' });

  y = 38;
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.8);
  doc.line(ml, y, pw - mr, y);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C.border);
  doc.line(ml, y + 1, pw - mr, y + 1);

  y = 46;
  doc.setFontSize(13);
  doc.setTextColor(...C.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('OPERATIONAL COST APPROVAL CONFIRMATION', pw / 2, y, { align: 'center' });

  y += 10;

  doc.setFillColor(...C.bgLight);
  doc.roundedRect(ml, y, cw, 22, 1.5, 1.5, 'F');
  doc.setDrawColor(...C.border);
  doc.roundedRect(ml, y, cw, 22, 1.5, 1.5, 'S');

  const statusX = ml + 8;
  const amountX = ml + 55;
  const catX = ml + 120;

  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  doc.text('STATUS', statusX, y + 7);
  doc.text('AMOUNT', amountX, y + 7);
  doc.text('CATEGORY', catX, y + 7);

  doc.setFontSize(11);
  doc.setTextColor(...C.success);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED', statusX, y + 16);

  doc.setFontSize(11);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.submission.amount_cents, data.submission.currency), amountX, y + 16);

  doc.setFontSize(9);
  doc.setTextColor(...C.body);
  doc.setFont('helvetica', 'normal');
  doc.text(fmtCategory(data.submission.expense_category), catX, y + 16);

  y += 30;

  const sectionTitle = (title: string) => {
    doc.setFontSize(9);
    doc.setTextColor(...C.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(title, ml, y);
    y += 1;
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.4);
    doc.line(ml, y, ml + doc.getTextWidth(title) + 2, y);
    doc.setLineWidth(0.2);
    y += 5;
  };

  const fieldRow = (label: string, value: string, x: number) => {
    doc.setFontSize(7);
    doc.setTextColor(...C.label);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    const maxW = (x === ml) ? (cw / 2 - 8) : (cw / 2 - 4);
    const lines = doc.splitTextToSize(value || '-', maxW);
    doc.text(lines[0], x, y + 4);
  };

  sectionTitle('REQUEST DETAILS');

  const savedY = y;
  fieldRow('Submitted By', data.submitter.name, ml);
  y += 11;
  fieldRow('Role', data.submitter.role || 'N/A', ml);
  y += 11;
  fieldRow('Submission Date', fmtDate(data.submission.submitted_at || data.submission.created_at, true), ml);
  y += 11;
  if (data.submission.description) {
    fieldRow('Description', data.submission.description.substring(0, 90) + (data.submission.description.length > 90 ? '...' : ''), ml);
    y += 11;
  }
  const leftEndY = y;

  y = savedY;
  fieldRow('Expense Date', fmtDate(data.submission.expense_date), col2X);
  y += 11;
  fieldRow('Vendor', data.submission.vendor || 'Not specified', col2X);
  y += 11;
  fieldRow('Reference', refNumber, col2X);
  y += 11;
  if (data.project) {
    fieldRow('Project', data.project.name, col2X);
    y += 11;
  }
  if (data.hub) {
    fieldRow('Hub', data.hub.name, col2X);
    y += 11;
  }

  y = Math.max(leftEndY, y) + 2;

  doc.setDrawColor(...C.border);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  sectionTitle('APPROVAL TIMELINE');

  const footerReserve = 30;
  const ensureFit = (needed: number) => {
    if (y + needed > ph - footerReserve) {
      doc.addPage();
      y = 20;
    }
  };

  const drawApprovalRow = (
    tierLabel: string,
    tierData: ApprovalCertificateData['tier1'],
    tierNum: number,
    sigImage?: string | null
  ) => {
    const rowH = sigImage ? 32 : 24;
    ensureFit(rowH + 6);

    doc.setFillColor(...C.bgLight);
    doc.roundedRect(ml, y, cw, rowH, 1.5, 1.5, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(ml, y, cw, rowH, 1.5, 1.5, 'S');

    doc.setDrawColor(...(tierNum === 2 ? C.accent : C.success));
    doc.setLineWidth(1.5);
    doc.line(ml, y, ml, y + rowH);
    doc.setLineWidth(0.2);

    const ix = ml + 6;
    let iy = y + 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(tierNum === 2 ? C.accent : C.success));
    doc.text(tierLabel, ix, iy);

    doc.setTextColor(...C.success);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const statusText = tierData.status === 'approved' ? 'APPROVED' : tierData.status.toUpperCase();
    doc.text(statusText, pw - mr - 8, iy, { align: 'right' });

    iy += 7;
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(`Approved by: ${tierData.approverName}`, ix, iy);

    const dateStr = fmtDate(tierData.approvedAt, true);
    doc.setTextColor(...C.body);
    doc.text(`Date: ${dateStr}`, ix + 90, iy);

    const cleanNotes = getCleanNotes(tierData.notes);
    if (cleanNotes) {
      iy += 5.5;
      doc.setFontSize(7);
      doc.setTextColor(...C.label);
      doc.setFont('helvetica', 'italic');
      const notesTrunc = cleanNotes.length > 80 ? cleanNotes.substring(0, 80) + '...' : cleanNotes;
      doc.text(`Notes: "${notesTrunc}"`, ix, iy);
    }

    if (tierNum === 2) {
      const sig = parseSignatureFromNotes(tierData.notes);
      if (sig) {
        iy += 5;
        doc.setFontSize(6.5);
        doc.setTextColor(...C.accent);
        doc.setFont('helvetica', 'bold');
        doc.text('DIGITAL SIGNATURE', ix, iy);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.label);
        doc.text(`Method: ${sig.method}  |  Hash: ${sig.hash}...  |  ID: ${sig.id}`, ix + 30, iy);
      }

      if (sigImage) {
        try {
          doc.addImage(sigImage, 'PNG', pw - mr - 45, y + 4, 40, rowH - 8);
        } catch { /* signature image failed */ }
      }
    }

    y += rowH + 4;
  };

  drawApprovalRow('TIER 1  -  Supervisor / FOM Review', data.tier1, 1);
  drawApprovalRow('TIER 2  -  Admin / Super Admin Final Approval', data.tier2, 2, data.tier2.signatureImageData);

  ensureFit(22);
  y += 2;
  doc.setDrawColor(...C.border);
  doc.line(ml, y, pw - mr, y);
  y += 5;

  doc.setFontSize(7);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'This document confirms that the above operational cost submission has been reviewed and approved through the PACT',
    ml, y
  );
  y += 3.5;
  doc.text(
    'two-tier approval workflow. Both Tier 1 (Supervisor/FOM) and Tier 2 (Admin/Super Admin) approvals have been obtained.',
    ml, y
  );
  y += 3.5;
  doc.text(
    'The digital signature provides cryptographic proof of the final approver\'s identity and approval timestamp.',
    ml, y
  );

  const footerY = ph - 12;
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.4);
  doc.line(ml, footerY - 3, pw - mr, footerY - 3);
  doc.setLineWidth(0.2);

  doc.setFontSize(6.5);
  doc.setTextColor(...C.label);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document Reference: ${refNumber}`, ml, footerY);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm:ss')}`, pw / 2, footerY, { align: 'center' });
  doc.text('PACT Command Center', pw - mr, footerY, { align: 'right' });

  doc.save(`Approval-Confirmation-${refNumber}.pdf`);
}
