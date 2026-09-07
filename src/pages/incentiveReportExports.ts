import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportFormattedExcel } from '@/utils/formattedExcelExport';

export interface IncentiveExportSnapshot {
  name: string;
  hub: string;
  status: string;
  coordinators: number;
  supervisors: number;
  feePool: number | null;
  bonus: number;
  currency: string;
}

export interface IncentiveExportPayment {
  recipient: string;
  email: string;
  role: string;
  hub: string;
  rate: number;
  amount: number;
  currency: string;
  status: string;
  excluded: boolean;
}

interface IncentiveExportSummary {
  monthLabel: string;
  monthKey: string;
  basisLabel: string;
  snapshots: IncentiveExportSnapshot[];
  payments: IncentiveExportPayment[];
  poolByCurrency: Record<string, number>;
  bonusByCurrency: Record<string, number>;
  excluded: number;
}

const amount = (value: number, currency: string) =>
  `${currency} ${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export async function exportIncentiveExcel(report: IncentiveExportSummary): Promise<void> {
  const { snapshots, payments } = report;
  await exportFormattedExcel({
    reportTitle: 'PACT Incentive Bonus Report',
    subtitleLine: report.monthLabel,
    metaLine: `Basis: ${report.basisLabel} · Generated ${new Date().toLocaleString()} · ${snapshots.length} MMP snapshots`,
    filenamePrefix: `PACT_incentive_${report.monthKey}`,
    mainSheet: {
      sheetName: 'MMP Summary',
      headers: [
        'MMP',
        'Hub',
        'Status',
        'Coordinators',
        'Supervisors',
        'DC fee pool',
        'Currency',
        'Total bonus',
      ],
      rows: snapshots.map((row) => [
        row.name,
        row.hub,
        row.status,
        row.coordinators,
        row.supervisors,
        row.feePool == null ? 'N/A' : row.feePool / 100,
        row.currency,
        row.bonus / 100,
      ]),
      totalsRow: [
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        '',
        'See Summary by Currency',
      ],
    },
    summarySheet: {
      title: `Incentive summary — ${report.monthLabel}`,
      rows: [
        ['Report month', report.monthLabel],
        ['MMP snapshots', snapshots.length],
        ['Basis', report.basisLabel],
        ...Object.entries(report.poolByCurrency).map(([currency, total]) => [
          `Total DC fee pool (${currency})`,
          total / 100,
        ]),
        ...Object.entries(report.bonusByCurrency).map(([currency, total]) => [
          `Total bonus (${currency})`,
          total / 100,
        ]),
        ['Excluded payment rows', report.excluded],
      ],
    },
    breakdownSheets: [
      {
        title: 'Payment detail',
        sheetName: 'Payment Detail',
        headers: [
          'Recipient',
          'Email',
          'Role',
          'Hub',
          'Bonus %',
          'Currency',
          'Amount',
          'Status',
          'Excluded',
        ],
        rows: payments.map((row) => [
          row.recipient,
          row.email,
          row.role,
          row.hub,
          row.rate,
          row.currency,
          row.amount / 100,
          row.status,
          row.excluded ? 'Yes' : 'No',
        ]),
      },
    ],
  });
}

export function exportIncentivePdf(report: IncentiveExportSummary): void {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(18, 57, 66);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT / INCENTIVE BONUS REPORT', 14, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${report.monthLabel} · ${report.basisLabel} · Generated ${format(new Date(), 'MMMM d, yyyy')}`,
    14,
    18,
  );

  doc.setTextColor(18, 57, 66);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const bonusSummary = Object.entries(report.bonusByCurrency)
    .map(([currency, total]) => amount(total, currency))
    .join(' · ');
  const poolSummary = Object.entries(report.poolByCurrency)
    .map(([currency, total]) => amount(total, currency))
    .join(' · ');
  doc.text(`Total bonus: ${bonusSummary || '—'}`, 14, 35);
  doc.text(`DC fee pool: ${poolSummary || '—'}`, 110, 35);
  doc.text(`Snapshots: ${report.snapshots.length}`, 166, 35);
  doc.text(`Payment rows: ${report.payments.length}`, 230, 35);

  autoTable(doc, {
    startY: 42,
    head: [['MMP', 'Hub', 'Status', 'Coordinators', 'Supervisors', 'Currency', 'DC fee pool', 'Total bonus']],
    body: report.snapshots.map((row) => [
      row.name,
      row.hub,
      row.status,
      row.coordinators,
      row.supervisors,
      row.currency,
      row.feePool == null ? 'N/A' : amount(row.feePool, row.currency),
      amount(row.bonus, row.currency),
    ]),
    headStyles: { fillColor: [13, 128, 130], textColor: 255 },
    alternateRowStyles: { fillColor: [239, 247, 246] },
    styles: { fontSize: 8 },
  });

  doc.addPage();
  doc.setTextColor(18, 57, 66);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Recipient payment detail', 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${report.monthLabel} · Excluded rows are retained for audit visibility`,
    14,
    22,
  );
  autoTable(doc, {
    startY: 28,
    head: [['Recipient', 'Email', 'Role', 'Hub', 'Rate', 'Currency', 'Amount', 'Status', 'Included']],
    body: report.payments.map((row) => [
      row.recipient,
      row.email,
      row.role,
      row.hub,
      `${row.rate}%`,
      row.currency,
      amount(row.amount, row.currency),
      row.status,
      row.excluded ? 'Excluded' : 'Included',
    ]),
    headStyles: { fillColor: [13, 128, 130], textColor: 255 },
    alternateRowStyles: { fillColor: [239, 247, 246] },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 47 },
      2: { cellWidth: 23 },
      3: { cellWidth: 27 },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 23 },
      7: { cellWidth: 23 },
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('PACT Command Center · Confidential operational report', 14, pageHeight - 6);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - 14, pageHeight - 6, {
      align: 'right',
    });
  }
  doc.save(`PACT_incentive_${report.monthKey}.pdf`);
}