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
  };
}

const COLORS = {
  primary: [41, 98, 255] as [number, number, number],
  dark: [30, 30, 40] as [number, number, number],
  medium: [80, 80, 100] as [number, number, number],
  light: [140, 140, 160] as [number, number, number],
  border: [200, 205, 215] as [number, number, number],
  bgLight: [245, 247, 250] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function formatCurrency(amountCents: number, currency: string = 'SDG'): string {
  const amount = amountCents / 100;
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function parseSignatureFromNotes(notes: string | null): { method: string; hash: string; id: string; signedAt: string } | null {
  if (!notes) return null;
  const match = notes.match(/\[Signed:\s*(\S+)\s*\|\s*Hash:\s*(\S+?)\.\.\.\s*\|\s*ID:\s*(\S+)\s*\|\s*(.+?)\]/);
  if (!match) return null;
  return {
    method: match[1],
    hash: match[2],
    id: match[3],
    signedAt: match[4],
  };
}

function getApprovalNotesWithoutSignature(notes: string | null): string {
  if (!notes) return '';
  return notes.replace(/\n?\[Signed:.*?\]/, '').trim();
}

export function generateApprovalCertificatePdf(data: ApprovalCertificateData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const refNumber = `PACT-OC-${data.submission.id.substring(0, 8).toUpperCase()}`;

  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 48, 'F');

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'normal');
  doc.text('PACT Command Center', margin, 14);
  doc.text('Field Operations Command Center', margin, 20);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('OPERATIONAL COST APPROVAL CERTIFICATE', margin, 34);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${refNumber}`, pageWidth - margin - 50, 14);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, pageWidth - margin - 62, 20);

  y = 56;

  doc.setFillColor(...COLORS.bgLight);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S');

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.light);
  doc.setFont('helvetica', 'normal');
  doc.text('STATUS', margin + 6, y + 8);
  doc.text('AMOUNT', margin + 50, y + 8);
  doc.text('CATEGORY', margin + 110, y + 8);

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.success);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED', margin + 6, y + 20);

  doc.setTextColor(...COLORS.dark);
  doc.text(formatCurrency(data.submission.amount_cents, data.submission.currency), margin + 50, y + 20);

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.medium);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCategory(data.submission.expense_category), margin + 110, y + 20);

  y += 38;

  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('REQUEST DETAILS', margin, y);
  y += 2;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 40, y);
  y += 8;

  const addField = (label: string, value: string, xOffset: number = 0) => {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.light);
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin + xOffset, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '-', margin + xOffset, y);
    y += 7;
  };

  const col2 = contentWidth / 2 + margin;
  const savedY = y;

  addField('Submitted By', `${data.submitter.name} (${data.submitter.role || 'N/A'})`);
  addField('Email', data.submitter.email);
  addField('Submission Date', data.submission.submitted_at ? format(new Date(data.submission.submitted_at), 'MMM d, yyyy HH:mm') : format(new Date(data.submission.created_at), 'MMM d, yyyy HH:mm'));

  if (data.submission.description) {
    addField('Description', data.submission.description.substring(0, 80) + (data.submission.description.length > 80 ? '...' : ''));
  }

  const leftEndY = y;
  y = savedY;

  const addFieldRight = (label: string, value: string) => {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.light);
    doc.setFont('helvetica', 'normal');
    doc.text(label, col2, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '-', col2, y);
    y += 7;
  };

  addFieldRight('Reference Number', refNumber);
  addFieldRight('Vendor', data.submission.vendor || 'Not specified');
  addFieldRight('Expense Date', data.submission.expense_date ? format(new Date(data.submission.expense_date), 'MMM d, yyyy') : 'Not specified');
  if (data.project) {
    addFieldRight('Project', data.project.name);
  }
  if (data.hub) {
    addFieldRight('Hub', data.hub.name);
  }

  y = Math.max(leftEndY, y) + 4;

  const docsCount = Array.isArray(data.submission.supporting_documents) ? data.submission.supporting_documents.length : 0;
  if (docsCount > 0) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.light);
    doc.text(`Supporting Documents: ${docsCount} file(s) attached`, margin, y);
    y += 8;
  }

  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  const drawSignatureBlock = (
    tierLabel: string,
    tierData: ApprovalCertificateData['tier1'],
    tierNumber: number
  ) => {
    const blockHeight = 52;
    const blockWidth = contentWidth;

    if (y + blockHeight > doc.internal.pageSize.height - 30) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(...COLORS.bgLight);
    doc.roundedRect(margin, y, blockWidth, blockHeight, 2, 2, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(margin, y, blockWidth, blockHeight, 2, 2, 'S');

    doc.setDrawColor(...(tierNumber === 2 ? COLORS.primary : COLORS.success));
    doc.setLineWidth(2);
    doc.line(margin, y, margin, y + blockHeight);
    doc.setLineWidth(0.2);

    const innerX = margin + 8;
    let innerY = y + 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(tierNumber === 2 ? COLORS.primary : COLORS.success));
    doc.text(tierLabel.toUpperCase(), innerX, innerY);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.success);
    doc.setFont('helvetica', 'bold');
    doc.text(tierData.status === 'approved' ? 'APPROVED' : tierData.status.toUpperCase(), innerX + 80, innerY);

    innerY += 10;

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.text('Approver:', innerX, innerY);
    doc.setFont('helvetica', 'normal');
    doc.text(tierData.approverName, innerX + 30, innerY);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', innerX + 100, innerY);
    doc.setFont('helvetica', 'normal');
    const approvedDateStr = tierData.approvedAt
      ? (() => { try { return format(new Date(tierData.approvedAt), 'MMM d, yyyy HH:mm'); } catch { return tierData.approvedAt; } })()
      : 'N/A';
    doc.text(approvedDateStr, innerX + 116, innerY);

    innerY += 8;

    const cleanNotes = getApprovalNotesWithoutSignature(tierData.notes);
    if (cleanNotes) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.medium);
      doc.setFont('helvetica', 'italic');
      const notesText = cleanNotes.length > 100 ? cleanNotes.substring(0, 100) + '...' : cleanNotes;
      doc.text(`Notes: "${notesText}"`, innerX, innerY);
      innerY += 7;
    }

    if (tierNumber === 2) {
      const sig = parseSignatureFromNotes(tierData.notes);
      if (sig) {
        innerY += 1;
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text('DIGITAL SIGNATURE', innerX, innerY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.medium);
        doc.text(`Method: ${sig.method}  |  Hash: ${sig.hash}...  |  Sig ID: ${sig.id}`, innerX + 40, innerY);
      }
    }

    y += blockHeight + 8;
  };

  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVAL SIGNATURES', margin, y);
  y += 2;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 45, y);
  y += 8;

  drawSignatureBlock('Tier 1 - Supervisor / FOM Review', data.tier1, 1);
  drawSignatureBlock('Tier 2 - Admin / Super Admin Final Approval', data.tier2, 2);

  if (y + 30 > doc.internal.pageSize.height - 20) {
    doc.addPage();
    y = margin;
  }

  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.light);
  doc.setFont('helvetica', 'normal');
  doc.text('This document certifies that the above operational cost submission has been reviewed and approved through', margin, y);
  y += 4;
  doc.text('the PACT two-tier approval workflow. Both Tier 1 (Supervisor/FOM) and Tier 2 (Admin/Super Admin) approvals', margin, y);
  y += 4;
  doc.text('have been obtained. The digital signature provides cryptographic proof of the final approver\'s identity.', margin, y);
  y += 8;

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.light);
  doc.text(`Document Reference: ${refNumber}`, margin, y);
  doc.text(`PACT Command Center - Field Operations`, pageWidth - margin - 55, y);

  doc.save(`Approval-Certificate-${refNumber}.pdf`);
}
