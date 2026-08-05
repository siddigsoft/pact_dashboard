/**
 * Budget PDF Export — generates a "Budget Summary" PDF styled like the
 * Cost Submission Payment Request overview (table + summary footer).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const BRAND_BLUE  = [29, 52, 97] as [number, number, number];   // #1D3461
const BRAND_LIGHT = [240, 245, 255] as [number, number, number];
const WHITE       = [255, 255, 255] as [number, number, number];
const GREY_TEXT   = [80, 80, 80] as [number, number, number];
const GREY_LINE   = [210, 210, 210] as [number, number, number];

const BUDGET_CAT_LABEL: Record<string, string> = {
  personnel_labor_fees:      'Personnel & Labor Fees',
  transportation_logistics:  'Transportation & Logistics',
  equipment_supplies:        'Equipment & Supplies',
  field_operations_activities: 'Field Operations & Activities',
  internet_communication:    'Internet & Communication',
  permits_taxes_legal:       'Permits, Taxes & Legal Fees',
  management_overhead:       'Management & Overhead',
  contingency_reserve:       'Contingency / Reserve',
  // legacy keys
  transportation_and_visit_fees: 'Transportation & Logistics',
  permit_fee:                'Permits & Legal Fees',
  internet_and_communication_fees: 'Internet & Communication',
  professional_fees:         'Professional Fees',
  personnel_fees:            'Personnel Fees',
  enumerator_fees:           'Enumerator / Field Staff Fees',
  supervisor_fees:           'Supervisor Fees',
  data_collection_tools:     'Data Collection Tools',
  report_production:         'Report Production',
  management_overhead:       'Management & Overhead',
  other:                     'Other',
};

export interface BudgetPdfData {
  projectName:    string;
  projectCode?:   string;
  budgetStatus:   string;
  budgetPeriod:   string;
  fiscalYear?:    number;
  currency:       string;
  expenseCurrency?: string;
  totalBudgetCents: number;
  totalSpentCents:  number;
  opsCents:         number;
  advCents:         number;
  pfCents:          number;
  categoryBreakdown: { cat: string; label: string; budgeted: number; spent: number; pct: number }[];
  forecast?: {
    burnRatePerDay: number;
    daysToRunOut: number;
    forecastDate: Date;
    onTrack: boolean;
  } | null;
  generatedBy?: string;
}

function fmt(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hRule(doc: jsPDF, y: number, margin: number) {
  const w = doc.internal.pageSize.width;
  doc.setDrawColor(...GREY_LINE);
  doc.setLineWidth(0.3);
  doc.line(margin, y, w - margin, y);
}

export function exportBudgetPDF(data: BudgetPdfData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const M  = 14; // margin
  const usableW = pw - 2 * M;
  let y = M;

  // ── 1. Header band ──────────────────────────────────────────────────
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pw, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text('PACT Platform', M, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Budget Summary Report', M, 17.5);

  // status badge (top-right)
  const statusLabel = data.budgetStatus.replace(/_/g, ' ').toUpperCase();
  const badgeW = 34;
  const badgeX = pw - M - badgeW;
  doc.setFillColor(255, 255, 255, 0.2 as any);
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.6);
  doc.roundedRect(badgeX, 8, badgeW, 10, 2, 2, 'S');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, badgeX + badgeW / 2, 14.5, { align: 'center' });

  y = 32;

  // ── 2. Project title block ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(data.projectName, M, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY_TEXT);
  const metaParts: string[] = [];
  if (data.projectCode) metaParts.push(data.projectCode);
  metaParts.push(`Period: ${data.budgetPeriod.replace(/_/g, ' ')}`);
  if (data.fiscalYear) metaParts.push(`FY ${data.fiscalYear}`);
  metaParts.push(`Currency: ${data.currency}`);
  if (data.expenseCurrency && data.expenseCurrency !== data.currency)
    metaParts.push(`Expense CCY: ${data.expenseCurrency}`);
  doc.text(metaParts.join('  ·  '), M, y);
  y += 4;

  doc.setFontSize(8);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}${data.generatedBy ? `  ·  By: ${data.generatedBy}` : ''}`, M, y);
  y += 5;
  hRule(doc, y, M);
  y += 5;

  // ── 3. KPI row ──────────────────────────────────────────────────────
  const remainingCents = Math.max(data.totalBudgetCents - data.totalSpentCents, 0);
  const utilizationPct = data.totalBudgetCents > 0
    ? Math.min((data.totalSpentCents / data.totalBudgetCents) * 100, 100)
    : 0;

  const kpis = [
    { label: 'Total Budget',   value: fmt(data.totalBudgetCents, data.currency) },
    { label: 'Total Spent',    value: fmt(data.totalSpentCents,  data.currency) },
    { label: 'Remaining',      value: fmt(remainingCents,        data.currency) },
    { label: 'Utilisation',    value: `${utilizationPct.toFixed(1)}%`           },
  ];
  const cardW = (usableW - 6) / 4;
  kpis.forEach((kpi, i) => {
    const x = M + i * (cardW + 2);
    doc.setFillColor(...BRAND_LIGHT);
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, 16, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY_TEXT);
    doc.text(kpi.label, x + cardW / 2, y + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    const valLine = doc.splitTextToSize(kpi.value, cardW - 4);
    doc.text(valLine[0], x + cardW / 2, y + 12, { align: 'center' });
  });
  y += 22;

  // ── 4. Category Breakdown table ─────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_BLUE);
  doc.text('Category Allocation Breakdown', M, y);
  y += 4;

  const catRows = data.categoryBreakdown.map(r => {
    const catLabel = BUDGET_CAT_LABEL[r.cat] || r.label || r.cat.replace(/_/g, ' ');
    const remaining = Math.max(r.budgeted - r.spent, 0);
    const over = r.spent > r.budgeted ? r.spent - r.budgeted : 0;
    return [
      catLabel,
      fmt(r.budgeted, data.currency),
      fmt(r.spent,    data.currency),
      over > 0 ? `(${fmt(over, data.currency)})` : fmt(remaining, data.currency),
      `${r.pct.toFixed(1)}%`,
    ];
  });

  const totalAllocated = data.categoryBreakdown.reduce((s, r) => s + r.budgeted, 0);
  const totalCatSpent  = data.categoryBreakdown.reduce((s, r) => s + r.spent,    0);
  const totalCatRem    = Math.max(totalAllocated - totalCatSpent, 0);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Budget Category', `Budgeted (${data.currency})`, `Spent (${data.currency})`, `Remaining (${data.currency})`, 'Utilisation']],
    body: catRows,
    foot: [['TOTAL', fmt(totalAllocated, data.currency), fmt(totalCatSpent, data.currency), fmt(totalCatRem, data.currency), `${utilizationPct.toFixed(1)}%`]],
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
    headStyles: { fillColor: BRAND_BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 34, halign: 'right' },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 18, halign: 'center' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  // ── 5. Spending Source section ─────────────────────────────────────
  if (y + 40 > ph - 30) { doc.addPage(); y = M; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_BLUE);
  doc.text('Spending by Source', M, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Source', `Amount (${data.currency})`]],
    body: [
      ['Operational Cost Submissions',  fmt(data.opsCents, data.currency)],
      ['Advances / Down-payments',      fmt(data.advCents, data.currency)],
      ['Pre-fund Disbursements',        fmt(data.pfCents,  data.currency)],
    ],
    foot: [['Grand Total Spent', fmt(data.totalSpentCents, data.currency)]],
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 72, halign: 'right' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  // ── 6. Forecast note ───────────────────────────────────────────────
  if (data.forecast) {
    if (y + 20 > ph - 30) { doc.addPage(); y = M; }
    const f = data.forecast;
    doc.setFillColor(f.onTrack ? 240 : 255, f.onTrack ? 253 : 235, f.onTrack ? 244 : 235);
    doc.setDrawColor(f.onTrack ? 200 : 245, f.onTrack ? 220 : 190, f.onTrack ? 200 : 190);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, usableW, 14, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(f.onTrack ? 22 : 120, f.onTrack ? 101 : 50, f.onTrack ? 52 : 30);
    const forecastLine = `Burn Rate Forecast: ${fmt(Math.round(f.burnRatePerDay), data.currency)}/day  ·  Budget runs out in ~${f.daysToRunOut} days (${format(f.forecastDate, 'dd MMM yyyy')})  ·  ${f.onTrack ? '✓ On track' : '⚠ At risk of overrun'}`;
    doc.text(forecastLine, M + 4, y + 9);
    y += 20;
  }

  // ── 7. Summary box ─────────────────────────────────────────────────
  if (y + 36 > ph - 30) { doc.addPage(); y = M; }
  hRule(doc, y, M);
  y += 5;

  doc.setFillColor(248, 249, 255);
  doc.setDrawColor(...GREY_LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, usableW, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_BLUE);
  doc.text('Budget Summary', M + 4, y + 7);

  const summaryRows = [
    ['Project', data.projectName],
    ['Budget Period', data.budgetPeriod.replace(/_/g, ' ') + (data.fiscalYear ? ` · FY ${data.fiscalYear}` : '')],
    ['Status', data.budgetStatus.replace(/_/g, ' ')],
    ['Total Budget', fmt(data.totalBudgetCents, data.currency)],
    ['Total Spent', fmt(data.totalSpentCents, data.currency)],
    ['Remaining', fmt(remainingCents, data.currency)],
  ];
  const col1X = M + 4;
  const col2X = M + 52;
  const col3X = M + usableW / 2 + 4;
  const col4X = M + usableW / 2 + 50;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY_TEXT);

  summaryRows.slice(0, 3).forEach((r, i) => {
    const baseY = y + 14 + i * 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREY_TEXT);
    doc.text(r[0], col1X, baseY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(r[1], col2X, baseY);
  });
  summaryRows.slice(3).forEach((r, i) => {
    const baseY = y + 14 + i * 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREY_TEXT);
    doc.text(r[0], col3X, baseY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(r[1], col4X, baseY);
  });

  // ── 8. Footer on every page ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(0, ph - 12, pw, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('PACT Platform — Confidential Budget Report', M, ph - 5);
    doc.text(`Page ${i} of ${pageCount}`, pw - M, ph - 5, { align: 'right' });
  }

  // ── 9. Save ────────────────────────────────────────────────────────
  const filename = `${data.projectName.replace(/\s+/g, '_')}_Budget_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
}
