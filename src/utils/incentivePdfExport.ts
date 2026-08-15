import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

// ── Brand colours (matching employeeCvExport.ts) ─────────────────────────────
const NAVY:   [number,number,number] = [15,  32,  65];
const NAVY2:  [number,number,number] = [29,  52,  97];
const LIGHT:  [number,number,number] = [245, 247, 252];
const MID:    [number,number,number] = [100, 110, 130];
const BORDER: [number,number,number] = [200, 205, 215];
const DARK:   [number,number,number] = [20,  20,  30];
const WHITE:  [number,number,number] = [255, 255, 255];
const AMBER:  [number,number,number] = [180, 110, 20];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents: number | null | undefined, currency = 'SDG'): string {
  if (cents == null) return '—';
  return `${(cents / 100).toLocaleString('en-US')} ${currency}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
}

function displayStatus(p: any): string {
  if (p.status === 'paid') return 'Paid';
  const snap = p.mmp_incentive_snapshots?.status ?? p.snapshot_status;
  if (snap === 'approved')     return 'Approved';
  if (snap === 'pre_approved') return 'Pre-Approved';
  return snap ?? 'Pre-Approved';
}

// ── Public interface ──────────────────────────────────────────────────────────
export interface IncentivePDFOptions {
  /** The profile being viewed */
  userName: string;
  userRole: string;
  userEmail?: string | null;
  /** Whether the current viewer is an admin (shows extra columns) */
  isAdmin: boolean;
  /** Raw payment rows from mmp_incentive_payments */
  payments: any[];
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateIncentivePDF(opts: IncentivePDFOptions): void {
  const { userName, userRole, userEmail, isAdmin, payments } = opts;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Landscape A4: 297 × 210 mm
  const PW = 297, PH = 210, M = 14, CW = PW - M * 2;
  const FOOTER_Y = PH - 10;
  let y = M;

  // ── HEADER BAR ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 24, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PACT', M, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('COMMAND CENTER', M, 15);
  doc.setFontSize(6);
  doc.text('INCENTIVE BONUS PAYMENT HISTORY  ·  CONFIDENTIAL', M, 20.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('INCENTIVE BONUS STATEMENT', PW - M, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy')}`, PW - M, 15.5, { align: 'right' });
  doc.text('PACT Field Operations · MMP Incentive System', PW - M, 20.5, { align: 'right' });

  y = 29;

  // ── STAFF BANNER ─────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...BORDER);
  doc.rect(M, y, CW, 18, 'FD');
  doc.setFillColor(...AMBER[0], AMBER[1], AMBER[2]);
  doc.rect(M, y, 3, 18, 'F');

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(userName, M + 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text(`Role: ${userRole}`, M + 6, y + 14.5);

  if (userEmail) {
    doc.setTextColor(...DARK);
    doc.setFontSize(8);
    doc.text(userEmail, PW - M, y + 8, { align: 'right' });
  }

  y += 23;

  // ── SUMMARY STATS ROW ────────────────────────────────────────────────────
  const paidRows  = payments.filter(p => p.status === 'paid' && !p.excluded);
  const totalPaid = paidRows.reduce((s: number, p: any) => s + (p.bonus_amount_cents ?? 0), 0);
  const currency  = payments[0]?.currency ?? 'SDG';
  const totalMMPs = new Set(payments.map((p: any) => p.mmp_files?.id ?? p.mmp_id)).size;

  const stats: [string, string][] = [
    ['Total Paid Out',    fmtCents(totalPaid, currency)],
    ['MMPs Covered',      String(totalMMPs)],
    ['Total Records',     String(payments.length)],
    ['Paid Records',      String(paidRows.length)],
  ];
  const boxW = CW / stats.length;
  stats.forEach(([label, value], i) => {
    const bx = M + i * boxW;
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...BORDER);
    doc.rect(bx, y, boxW, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...MID);
    doc.text(label.toUpperCase(), bx + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(value, bx + 3, y + 12);
  });
  y += 18;

  // ── PAYMENT TABLE ────────────────────────────────────────────────────────
  const tHead: any = {
    fillColor: NAVY2, textColor: WHITE, fontStyle: 'bold', fontSize: 7, cellPadding: 2.5,
  };
  const tBody: any = { fontSize: 7, cellPadding: 2.5 };
  const tAlt:  any = { fillColor: LIGHT };

  // Build head / body depending on isAdmin
  const head = isAdmin
    ? [['MMP', 'Role', 'Hub', 'DC Fee Pool', 'Bonus %', 'Bonus Amount', 'Status', 'Payment', 'Paid Date']]
    : [['MMP', 'Role', 'Hub', 'Bonus Amount', 'Status', 'Payment', 'Paid Date']];

  const body = payments.map((p: any) => {
    const mmpName     = p.mmp_files?.name ?? p.mmp_files?.mmp_id ?? '—';
    const bonusAmt    = p.excluded
      ? `(excluded) ${fmtCents(p.bonus_amount_cents, p.currency)}`
      : fmtCents(p.bonus_amount_cents, p.currency);
    const status      = displayStatus(p);
    const method      = p.status === 'paid' ? (p.payment_method ?? 'wallet') : '—';
    const paidDate    = p.status === 'paid' ? fmtDate(p.paid_at) : '—';

    if (isAdmin) {
      return [
        mmpName,
        p.role ?? '—',
        p.hub_name ?? '—',
        fmtCents(p.dc_fee_pool_cents, p.currency),
        p.bonus_pct != null ? `${p.bonus_pct}%` : '—',
        bonusAmt,
        status,
        method,
        paidDate,
      ];
    }
    return [mmpName, p.role ?? '—', p.hub_name ?? '—', bonusAmt, status, method, paidDate];
  });

  // Column widths
  const colStyles = isAdmin
    ? {
        0: { cellWidth: 44 },
        1: { cellWidth: 22 },
        2: { cellWidth: 30 },
        3: { cellWidth: 28, halign: 'right' as const },
        4: { cellWidth: 16, halign: 'right' as const },
        5: { cellWidth: 28, halign: 'right' as const },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 },
        8: { cellWidth: 22 },
      }
    : {
        0: { cellWidth: 60 },
        1: { cellWidth: 28 },
        2: { cellWidth: 40 },
        3: { cellWidth: 36, halign: 'right' as const },
        4: { cellWidth: 28 },
        5: { cellWidth: 28 },
        6: { cellWidth: 28 },
      };

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head,
    body,
    headStyles: tHead,
    bodyStyles: tBody,
    alternateRowStyles: tAlt,
    columnStyles: colStyles,
    // Stripe paid rows in a subtle purple tint
    didParseCell: (data) => {
      if (data.section === 'body') {
        const p = payments[data.row.index];
        if (p?.status === 'paid') {
          data.cell.styles.fillColor = [245, 240, 255] as any;
        }
        if (p?.excluded) {
          data.cell.styles.textColor = [160, 160, 160] as any;
        }
      }
    },
    didDrawPage: () => { y = M; },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;

  // ── TOTAL PAID FOOTER ROW ─────────────────────────────────────────────────
  if (paidRows.length > 0) {
    const footY = tableEndY + 2;
    doc.setFillColor(...NAVY);
    doc.rect(M, footY, CW, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('TOTAL PAID OUT', M + 3, footY + 5.5);
    doc.text(fmtCents(totalPaid, currency), PW - M - 3, footY + 5.5, { align: 'right' });
  }

  // ── FOOTER ON EVERY PAGE ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...LIGHT);
    doc.rect(0, PH - 9, PW, 9, 'F');
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.3);
    doc.line(0, PH - 9, PW, PH - 9);
    doc.setFontSize(6);
    doc.setTextColor(...MID);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `PACT Command Center  ·  Incentive Bonus Payment History  ·  ${userName}  ·  CONFIDENTIAL`,
      M, PH - 3
    );
    doc.text(`Page ${p} of ${totalPages}`, PW - M, PH - 3, { align: 'right' });
  }

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const safeName = userName.replace(/[^a-z0-9]/gi, '_');
  doc.save(`${safeName}_Incentive_History_${format(new Date(), 'yyyyMMdd')}.pdf`);
}
