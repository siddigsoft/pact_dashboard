import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const C = {
  navy:      [15, 32, 65]   as [number, number, number],
  navyMid:   [22, 48, 90]   as [number, number, number],
  blue:      [41, 98, 255]  as [number, number, number],
  blueLight: [232, 240, 255] as [number, number, number],
  green:     [16, 120, 60]  as [number, number, number],
  greenLight:[228, 245, 235] as [number, number, number],
  amber:     [180, 83, 9]   as [number, number, number],
  amberLight:[255, 251, 235] as [number, number, number],
  border:    [200, 205, 215] as [number, number, number],
  bgLight:   [245, 247, 252] as [number, number, number],
  label:     [90, 95, 110]  as [number, number, number],
  muted:     [120, 125, 140] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  dark:      [20, 20, 30]   as [number, number, number],
};

const EXPENSE_LABELS: Record<string, string> = {
  permits: 'Permits & Licenses',
  incentives: 'Incentives & Allowances',
  communications: 'Internet & Comms',
  training: 'Training',
  transport: 'Transportation',
  general_transport: 'Transportation',
  equipment: 'Equipment & Supplies',
  printing: 'Printing & Stationery',
  meetings: 'Meetings',
  office_admin: 'Office Admin',
  other: 'Other',
};

export interface BulkSubmission {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: string;
  tier1_approved_at: string | null;
  tier2_approved_at: string | null;
  tier2_notes: string | null;
  project_id: string | null;
  reference_number: string | null;
}

export interface BulkUserMap {
  [userId: string]: { name: string; email: string; role?: string };
}

export interface BulkProjectMap {
  [projectId: string]: string;
}

function sdg(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function usdFmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateBulkCostPDFBase64(
  submissions: BulkSubmission[],
  approverName: string,
  totalSdg: number,
  usdRate: number | null,
  userMap: BulkUserMap,
  projectMap: BulkProjectMap,
): string {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const dateStr = format(new Date(), 'dd MMM yyyy');
  const refNo = `BULK-${submissions.length}-${format(new Date(), 'yyyyMMdd')}`;

  const drawHeader = (pageNum: number, totalPages: number) => {
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, W, 22, 'F');

    doc.setFillColor(...C.blue);
    doc.rect(0, 22, W, 2.5, 'F');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text('PACT', 12, 13);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(175, 200, 230);
    doc.text('COMMAND CENTER  ·  FIELD OPERATIONS PLATFORM', 12, 18.5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text('APPROVED OPERATIONAL COST SUBMISSIONS — PAYMENT REQUEST', W / 2, 10, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(175, 200, 230);
    doc.text('طلب دفع — المصروفات التشغيلية الموافق عليها', W / 2, 16, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(150, 175, 210);
    doc.text(`Ref: ${refNo}`, W - 10, 10, { align: 'right' });
    doc.text(`Date: ${dateStr}`, W - 10, 15, { align: 'right' });
    doc.text(`Page ${pageNum} of ${totalPages}`, W - 10, 20, { align: 'right' });
  };

  const drawFooter = () => {
    const fY = doc.internal.pageSize.getHeight() - 12;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(10, fY - 2, W - 10, fY - 2);
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'italic');
    doc.text('CONFIDENTIAL — For authorised Finance Team use only. All amounts in SDG unless stated otherwise.', W / 2, fY + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Approved by: ${approverName}  |  Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, W / 2, fY + 6.5, { align: 'center' });
  };

  const totalAmtSdg = submissions.reduce((s, r) => s + r.amount_cents / 100, 0);
  const totalUsd = usdRate && usdRate > 0 ? totalAmtSdg / usdRate : null;

  drawHeader(1, 1);

  let y = 30;
  doc.setFillColor(...C.blueLight);
  doc.roundedRect(10, y, W - 20, 22, 2, 2, 'F');
  doc.setDrawColor(...C.blue);
  doc.setLineWidth(0.4);
  doc.roundedRect(10, y, W - 20, 22, 2, 2, 'S');

  const summCols = usdRate && usdRate > 0 ? 4 : 3;
  const colW = (W - 20) / summCols;

  const summaryItems = [
    { label: 'Total Submissions', value: `${submissions.length}`, sub: 'إجمالي الطلبات' },
    { label: 'Total Amount (SDG)', value: `SDG ${sdg(submissions.reduce((s, r) => s + r.amount_cents, 0))}`, sub: 'المبلغ الإجمالي' },
    ...(totalUsd !== null ? [{ label: `USD Equivalent`, value: `USD ${usdFmt(totalUsd)}`, sub: `Rate: 1 USD = ${usdRate?.toLocaleString()} SDG` }] : []),
    { label: 'Approved By', value: approverName, sub: dateStr },
  ];

  summaryItems.forEach((item, i) => {
    const cx = 10 + i * colW + colW / 2;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.blue);
    doc.text(item.label.toUpperCase(), cx, y + 7, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text(item.value, cx, y + 14, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(item.sub, cx, y + 19, { align: 'center' });

    if (i < summaryItems.length - 1) {
      doc.setDrawColor(...C.blue);
      doc.setLineWidth(0.2);
      doc.line(10 + (i + 1) * colW, y + 2, 10 + (i + 1) * colW, y + 20);
    }
  });

  y += 26;

  const tableHead = [['#', 'Ref / المرجع', 'Submitter / المقدّم', 'Category / الفئة', 'Description / الوصف', 'Project / المشروع', 'Date / التاريخ', 'Amount (SDG)', ...(totalUsd !== null ? ['USD Equiv.'] : []), 'Status']];
  const tableBody = submissions.map((s, idx) => {
    const submitter = userMap[s.submitted_by];
    const submitterName = submitter?.name || s.submitted_by.slice(0, 8) + '...';
    const project = s.project_id ? (projectMap[s.project_id] || s.project_id.slice(0, 8)) : '—';
    const category = EXPENSE_LABELS[s.expense_category] || s.expense_category;
    const dateVal = s.expense_date ? format(new Date(s.expense_date), 'dd MMM yy') : (s.submitted_at ? format(new Date(s.submitted_at), 'dd MMM yy') : '—');
    const desc = s.description ? (s.description.length > 40 ? s.description.slice(0, 38) + '…' : s.description) : (s.vendor || '—');
    const amtSdg = `SDG ${sdg(s.amount_cents)}`;
    const row = [
      `${idx + 1}`,
      s.reference_number || s.id.slice(0, 8),
      submitterName,
      category,
      desc,
      project,
      dateVal,
      amtSdg,
      ...(totalUsd !== null ? [`USD ${usdFmt(s.amount_cents / 100 / (usdRate || 1))}`] : []),
      'Approved',
    ];
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    margin: { left: 10, right: 10 },
    theme: 'grid',
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: C.dark,
    },
    alternateRowStyles: { fillColor: C.bgLight },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 8 },
      1:  { cellWidth: 22 },
      2:  { cellWidth: 34 },
      3:  { cellWidth: 28 },
      4:  { cellWidth: 42 },
      5:  { cellWidth: 28 },
      6:  { cellWidth: 18, halign: 'center' },
      7:  { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      ...(totalUsd !== null ? { 8: { cellWidth: 22, halign: 'right', textColor: C.blue }, 9: { cellWidth: 18, halign: 'center', textColor: [22, 101, 52] as [number, number, number] } } : { 8: { cellWidth: 18, halign: 'center', textColor: [22, 101, 52] as [number, number, number] } }),
    },
    didDrawPage: (data) => {
      const pageNum = (doc.internal as any).getCurrentPageInfo().pageNumber;
      const totalPg = doc.getNumberOfPages();
      drawHeader(pageNum, totalPg);
      drawFooter();
    },
    showHead: 'everyPage',
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  if (finalY < doc.internal.pageSize.getHeight() - 30) {
    doc.setFillColor(...C.amberLight);
    doc.setDrawColor(...C.amber);
    doc.setLineWidth(0.4);
    doc.roundedRect(10, finalY, W - 20, 16, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.amber);
    doc.text('⚠  RECONCILIATION REQUIREMENT / اشتراط التسوية', 12, finalY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(7);
    doc.text('All recipients must submit receipts and return any unused funds within 5 working days of disbursement. | يجب تقديم الإيصالات وإعادة الأموال غير المستخدمة خلال 5 أيام عمل.', 12, finalY + 12);
  }

  drawFooter();

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawHeader(p, totalPages);
    drawFooter();
  }

  return doc.output('datauristring').split(',')[1];
}

export function generateBulkCostExcelBase64(
  submissions: BulkSubmission[],
  approverName: string,
  usdRate: number | null,
  userMap: BulkUserMap,
  projectMap: BulkProjectMap,
): string {
  const wb = XLSX.utils.book_new();
  const dateStr = format(new Date(), 'dd MMM yyyy HH:mm');
  const totalAmtCents = submissions.reduce((s, r) => s + r.amount_cents, 0);
  const totalSdg = totalAmtCents / 100;
  const totalUsd = usdRate && usdRate > 0 ? totalSdg / usdRate : null;

  const summaryData: (string | number)[][] = [
    ['PACT COMMAND CENTER — Approved Operational Cost Submissions'],
    ['Payment Request Report'],
    [],
    ['Generated On', dateStr],
    ['Approved By', approverName],
    ['Reference No', `BULK-${submissions.length}-${format(new Date(), 'yyyyMMdd')}`],
    [],
    ['SUMMARY', ''],
    ['Total Submissions', submissions.length],
    ['Total Amount (SDG)', totalSdg],
    ...(totalUsd !== null ? [
      ['USD Rate (1 USD = SDG)', usdRate as number],
      ['USD Equivalent', totalUsd],
    ] : []),
    [],
    ['CATEGORY BREAKDOWN', ''],
    ...(() => {
      const catTotals: Record<string, number> = {};
      submissions.forEach(s => {
        const cat = EXPENSE_LABELS[s.expense_category] || s.expense_category;
        catTotals[cat] = (catTotals[cat] || 0) + s.amount_cents / 100;
      });
      return Object.entries(catTotals).map(([cat, amt]) => [cat, amt]);
    })(),
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 32 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const detailHeaders = [
    '#',
    'Reference No',
    'Submitter Name',
    'Submitter Email',
    'Category',
    'Description',
    'Vendor / Payee',
    'Project',
    'Expense Date',
    'Submitted At',
    'Tier1 Approved At',
    'Tier2 Approved At',
    'Amount (SDG)',
    ...(usdRate && usdRate > 0 ? ['USD Equivalent'] : []),
    'Notes',
    'Status',
  ];

  const detailRows = submissions.map((s, idx) => {
    const submitter = userMap[s.submitted_by];
    const amtSdg = s.amount_cents / 100;
    return [
      idx + 1,
      s.reference_number || s.id,
      submitter?.name || '—',
      submitter?.email || '—',
      EXPENSE_LABELS[s.expense_category] || s.expense_category,
      s.description || '—',
      s.vendor || '—',
      s.project_id ? (projectMap[s.project_id] || s.project_id) : '—',
      s.expense_date ? format(new Date(s.expense_date), 'dd/MM/yyyy') : '—',
      s.submitted_at ? format(new Date(s.submitted_at), 'dd/MM/yyyy HH:mm') : '—',
      s.tier1_approved_at ? format(new Date(s.tier1_approved_at), 'dd/MM/yyyy') : '—',
      s.tier2_approved_at ? format(new Date(s.tier2_approved_at), 'dd/MM/yyyy') : '—',
      amtSdg,
      ...(usdRate && usdRate > 0 ? [amtSdg / usdRate] : []),
      s.tier2_notes || '—',
      'Approved',
    ];
  });

  const totalsRow = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTAL',
    totalSdg,
    ...(usdRate && usdRate > 0 ? [totalUsd as number] : []),
    '',
    '',
  ];

  const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows, [], totalsRow]);
  ws2['!cols'] = [
    { wch: 5 }, { wch: 22 }, { wch: 28 }, { wch: 32 }, { wch: 24 },
    { wch: 40 }, { wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 16 },
    ...(usdRate && usdRate > 0 ? [{ wch: 16 }] : []),
    { wch: 36 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Submissions Detail');

  if (Object.keys(userMap).length > 0) {
    const submitterSummary: Record<string, { name: string; email: string; count: number; totalSdg: number }> = {};
    submissions.forEach(s => {
      const u = userMap[s.submitted_by];
      if (!submitterSummary[s.submitted_by]) {
        submitterSummary[s.submitted_by] = { name: u?.name || '—', email: u?.email || '—', count: 0, totalSdg: 0 };
      }
      submitterSummary[s.submitted_by].count += 1;
      submitterSummary[s.submitted_by].totalSdg += s.amount_cents / 100;
    });
    const bySubmitterRows = [
      ['Submitter Name', 'Email', 'Submissions', 'Total SDG', ...(usdRate && usdRate > 0 ? ['Total USD'] : [])],
      ...Object.values(submitterSummary).map(r => [
        r.name,
        r.email,
        r.count,
        r.totalSdg,
        ...(usdRate && usdRate > 0 ? [r.totalSdg / (usdRate || 1)] : []),
      ]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(bySubmitterRows);
    ws3['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 18 }, ...(usdRate && usdRate > 0 ? [{ wch: 16 }] : [])];
    XLSX.utils.book_append_sheet(wb, ws3, 'By Submitter');
  }

  const raw = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return raw;
}
