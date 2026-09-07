import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ARABIC_FONT_NAME, ensureArabicFont } from '@/lib/jspdfArabic';
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
  roleCounts?: Partial<Record<'coordinator' | 'supervisor' | 'fom' | 'support_team', number>>;
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
  language?: 'en' | 'ar';
}

const amount = (value: number, currency: string) =>
  `${currency} ${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const exportLabels = (ar: boolean) => ar ? { title: 'تقرير حوافز PACT', basis: 'الأساس', generated: 'تم الإنشاء', snapshots: 'لقطات MMP', mmp: 'MMP', hub: 'المركز', status: 'الحالة', coordinator: 'المنسق', supervisor: 'المشرف', fom: 'مدير العمليات الميدانية', support: 'فريق الدعم', fee: 'مجمّع الرسوم', bonus: 'إجمالي المكافأة', recipient: 'المستلم', role: 'الدور', amount: 'المبلغ', summarySheet: 'ملخص MMP', detailSheet: 'تفاصيل الدفع', reportMonth: 'شهر التقرير', excluded: 'صفوف الدفع المستبعدة', currency: 'العملة', rate: 'نسبة المكافأة', included: 'مضمن', email: 'البريد الإلكتروني', total: 'الإجمالي', unavailable: 'غير متاح', poolTotal: 'إجمالي مجمّع الرسوم', paymentRows: 'صفوف الدفع', auditCaption: 'تُحتفظ بالصفوف المستبعدة لأغراض المراجعة', footer: 'PACT مركز القيادة · تقرير تشغيلي سري', page: 'صفحة' } : { title: 'PACT Incentive Bonus Report', basis: 'Basis', generated: 'Generated', snapshots: 'MMP snapshots', mmp: 'MMP', hub: 'Hub', status: 'Status', coordinator: 'Coordinator', supervisor: 'Supervisor', fom: 'FOM', support: 'Support Team', fee: 'DC fee pool', bonus: 'Total bonus', recipient: 'Recipient', role: 'Role', amount: 'Amount', summarySheet: 'MMP Summary', detailSheet: 'Payment Detail', reportMonth: 'Report month', excluded: 'Excluded payment rows', currency: 'Currency', rate: 'Bonus %', included: 'Included', email: 'Email', total: 'TOTAL', unavailable: 'N/A', poolTotal: 'Total DC fee pool', paymentRows: 'Payment rows', auditCaption: 'Excluded rows are retained for audit visibility', footer: 'PACT Command Center · Confidential operational report', page: 'Page' };

export async function exportIncentiveExcel(report: IncentiveExportSummary): Promise<void> {
  const { snapshots, payments } = report;
  const ar = report.language === 'ar';
  const labels = exportLabels(ar);
  await exportFormattedExcel({
    reportTitle: labels.title,
    subtitleLine: report.monthLabel,
    metaLine: `${labels.basis}: ${report.basisLabel} · ${labels.generated} ${new Date().toLocaleString(ar ? 'ar' : 'en-US')} · ${snapshots.length} ${labels.snapshots}`,
    filenamePrefix: `PACT_incentive_${report.monthKey}`,
    mainSheet: {
      sheetName: labels.summarySheet,
      headers: [
        labels.mmp,
        labels.hub,
        labels.status,
         labels.coordinator,
         labels.supervisor,
         labels.fom,
         labels.support,
         labels.fee,
        labels.currency,
        labels.bonus,
      ],
      rows: snapshots.map((row) => [
        row.name,
        row.hub,
        row.status,
         row.roleCounts?.coordinator ?? row.coordinators,
         row.roleCounts?.supervisor ?? row.supervisors,
         row.roleCounts?.fom ?? 0,
         row.roleCounts?.support_team ?? 0,
        row.feePool == null ? labels.unavailable : row.feePool / 100,
        row.currency,
        row.bonus / 100,
      ]),
      totalsRow: [
        labels.total,
        '',
        '',
        '',
        '',
        '',
        '',
         '',
         ar ? 'راجع الملخص حسب العملة' : 'See Summary by Currency',
      ],
    },
    summarySheet: {
      title: `${ar ? 'ملخص الحوافز' : 'Incentive summary'} — ${report.monthLabel}`,
      rows: [
        [labels.reportMonth, report.monthLabel],
        [labels.snapshots, snapshots.length],
        [labels.basis, report.basisLabel],
        ...Object.entries(report.poolByCurrency).map(([currency, total]) => [
          `${labels.poolTotal} (${currency})`,
          total / 100,
        ]),
        ...Object.entries(report.bonusByCurrency).map(([currency, total]) => [
          `${labels.bonus} (${currency})`,
          total / 100,
        ]),
        [labels.excluded, report.excluded],
      ],
    },
    breakdownSheets: [
      {
        title: ar ? 'تفاصيل الدفع' : 'Payment detail',
        sheetName: labels.detailSheet,
        headers: [
          labels.recipient,
          labels.email,
          labels.role,
          labels.hub,
          labels.rate,
          labels.currency,
          labels.amount,
          labels.status,
          labels.excluded,
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
          row.excluded ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No'),
        ]),
      },
    ],
  });
}

export async function exportIncentivePdf(report: IncentiveExportSummary): Promise<void> {
  const ar = report.language === 'ar';
  const labels = exportLabels(ar);
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const arabicFontReady = ar ? await ensureArabicFont(doc) : false;
  if (ar && !arabicFontReady) {
    throw new Error('تعذر تحميل خط PDF العربي. يرجى المحاولة مرة أخرى.');
  }
  const pdfFont = ar ? ARABIC_FONT_NAME : 'helvetica';
  const textX = ar ? doc.internal.pageSize.getWidth() - 14 : 14;
  const textAlign = ar ? 'right' as const : 'left' as const;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(18, 57, 66);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont(pdfFont, ar ? 'normal' : 'bold');
  doc.text(ar ? 'PACT / تقرير حوافز المكافآت' : 'PACT / INCENTIVE BONUS REPORT', textX, 11, { align: textAlign });
  doc.setFontSize(9);
  doc.setFont(pdfFont, 'normal');
  doc.text(
    `${report.monthLabel} · ${report.basisLabel} · ${labels.generated} ${new Date().toLocaleDateString(ar ? 'ar' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    textX,
    18,
    { align: textAlign },
  );

  doc.setTextColor(18, 57, 66);
  doc.setFontSize(10);
  doc.setFont(pdfFont, ar ? 'normal' : 'bold');
  const bonusSummary = Object.entries(report.bonusByCurrency)
    .map(([currency, total]) => amount(total, currency))
    .join(' · ');
  const poolSummary = Object.entries(report.poolByCurrency)
    .map(([currency, total]) => amount(total, currency))
    .join(' · ');
  const summaryRows = [
    `${labels.bonus}: ${bonusSummary || '—'}`,
    `${labels.fee}: ${poolSummary || '—'}`,
    `${labels.snapshots}: ${report.snapshots.length}`,
    `${labels.paymentRows}: ${report.payments.length}`,
  ];
  summaryRows.forEach((summary, index) => {
    const x = ar ? pageWidth - 14 - (index * 68) : 14 + (index * 68);
    doc.text(summary, x, 35, { align: ar ? 'right' : 'left' });
  });

  autoTable(doc, {
    startY: 42,
     head: [[labels.mmp, labels.hub, labels.status, labels.coordinator, labels.supervisor, labels.fom, labels.support, labels.currency, labels.fee, labels.bonus]],
    body: report.snapshots.map((row) => [
      row.name,
      row.hub,
      row.status,
       row.roleCounts?.coordinator ?? row.coordinators,
       row.roleCounts?.supervisor ?? row.supervisors,
       row.roleCounts?.fom ?? 0,
       row.roleCounts?.support_team ?? 0,
      row.currency,
      row.feePool == null ? labels.unavailable : amount(row.feePool, row.currency),
      amount(row.bonus, row.currency),
    ]),
    headStyles: { fillColor: [13, 128, 130], textColor: 255, font: pdfFont, fontStyle: ar ? 'normal' : 'bold', halign: ar ? 'right' : 'left' },
    alternateRowStyles: { fillColor: [239, 247, 246] },
    styles: { fontSize: 8, font: pdfFont, fontStyle: 'normal', halign: ar ? 'right' : 'left' },
  });

  doc.addPage();
  doc.setTextColor(18, 57, 66);
  doc.setFontSize(14);
  doc.setFont(pdfFont, ar ? 'normal' : 'bold');
  doc.text(ar ? 'تفاصيل دفعات المستلمين' : 'Recipient payment detail', textX, 16, { align: textAlign });
  doc.setFontSize(9);
  doc.setFont(pdfFont, 'normal');
  doc.text(
    `${report.monthLabel} · ${labels.auditCaption}`,
    textX,
    22,
    { align: textAlign },
  );
  autoTable(doc, {
    startY: 28,
    head: [[labels.recipient, labels.email, labels.role, labels.hub, labels.rate, labels.currency, labels.amount, labels.status, labels.included]],
    body: report.payments.map((row) => [
      row.recipient,
      row.email,
      row.role,
      row.hub,
      `${row.rate}%`,
      row.currency,
      amount(row.amount, row.currency),
      row.status,
      row.excluded ? labels.excluded : labels.included,
    ]),
    headStyles: { fillColor: [13, 128, 130], textColor: 255, font: pdfFont, fontStyle: ar ? 'normal' : 'bold', halign: ar ? 'right' : 'left' },
    alternateRowStyles: { fillColor: [239, 247, 246] },
    styles: { fontSize: 7, cellPadding: 2, font: pdfFont, fontStyle: 'normal', halign: ar ? 'right' : 'left' },
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
    doc.setFont(pdfFont, 'normal');
    doc.text(labels.footer, ar ? pageWidth - 14 : 14, pageHeight - 6, { align: ar ? 'right' : 'left' });
    doc.text(ar ? `${labels.page} ${page} من ${totalPages}` : `${labels.page} ${page} of ${totalPages}`, ar ? 14 : pageWidth - 14, pageHeight - 6, {
      align: ar ? 'left' : 'right',
    });
  }
  doc.save(`PACT_incentive_${report.monthKey}.pdf`);
}