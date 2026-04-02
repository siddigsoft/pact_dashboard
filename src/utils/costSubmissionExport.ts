import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface ExportableSubmission {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  reference_number: string | null;
  hub_id: string | null;
  project_id: string | null;
  submitted_by: string;
  submitted_at: string | null;
  submitter_role: string | null;
  status: string;
  tier1_status: string | null;
  tier1_approved_by: string | null;
  tier1_approved_at: string | null;
  tier1_notes: string | null;
  tier2_status: string | null;
  tier2_approved_by: string | null;
  tier2_approved_at: string | null;
  tier2_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface UserLookup {
  id: string;
  name?: string;
  email?: string;
}

interface ProjectLookup {
  id: string;
  name: string;
}

function getProjectName(projectId: string | null, projects: ProjectLookup[]): string {
  if (!projectId) return 'N/A';
  return projects.find(p => p.id === projectId)?.name || 'N/A';
}

// Light pastel RGB colours matching the UI project palette (same hash order)
const PDF_PROJECT_RGB: [number, number, number][] = [
  [220, 235, 255], // blue
  [210, 249, 235], // emerald
  [255, 245, 215], // amber
  [235, 225, 255], // violet
  [255, 225, 230], // rose
  [210, 245, 255], // cyan
  [255, 240, 220], // orange
  [215, 250, 245], // teal
  [255, 220, 240], // pink
  [230, 230, 255], // indigo
];

function getProjectRgb(projectId: string | null | undefined): [number, number, number] {
  if (!projectId) return [248, 250, 252]; // neutral for no project
  const hash = projectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PDF_PROJECT_RGB[hash % PDF_PROJECT_RGB.length];
}

// Excel hex fill colours (light pastels matching same hash order)
const EXCEL_PROJECT_HEX: string[] = [
  'DCEBff', 'D2F9EB', 'FFF5D7', 'EBE1FF',
  'FFE1E6', 'D2F5FF', 'FFF0DC', 'D7FAF5',
  'FFDCF0', 'E6E6FF',
];

function getProjectHex(projectId: string | null | undefined): string {
  if (!projectId) return 'F8FAFC';
  const hash = projectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return EXCEL_PROJECT_HEX[hash % EXCEL_PROJECT_HEX.length];
}

const CATEGORY_LABELS: Record<string, string> = {
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

function getDerivedStatus(oc: ExportableSubmission): string {
  if (oc.status === 'paid') return 'Paid';
  if (oc.status === 'reconciled') return 'Reconciled';
  if (oc.tier1_status === 'rejected' || oc.tier2_status === 'rejected' || oc.status === 'rejected') return 'Rejected';
  if (oc.tier1_status === 'approved' && oc.tier2_status === 'approved') return 'Approved';
  if (oc.tier1_status === 'approved' && oc.tier2_status === 'pending') return 'Under Review (Tier 2)';
  if (oc.status === 'under_review') return 'Under Review';
  return 'Pending (Tier 1)';
}

function getUserName(userId: string | null | undefined, users: UserLookup[]): string {
  if (!userId) return 'N/A';
  const u = users.find(x => x.id === userId);
  return u?.name || u?.email || 'Unknown';
}

function cleanDescription(desc: string | null): string {
  if (!desc) return '';
  return desc.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '';
}

function formatAmount(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString()}`;
}

function safeDate(d: string | null): string {
  if (!d) return 'N/A';
  try { return format(new Date(d), 'yyyy-MM-dd HH:mm'); } catch { return d; }
}

function safeDateShort(d: string | null): string {
  if (!d) return 'N/A';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return d; }
}

export function exportSubmissionsToExcel(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  tabLabel: string,
  filename: string = 'cost-submissions',
  projects: ProjectLookup[] = []
): void {
  if (submissions.length === 0) return;

  const data = submissions.map(oc => ({
    'Reference #': oc.reference_number || oc.id.slice(0, 8),
    'Title': cleanDescription(oc.description),
    'Category': CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
    'Project': getProjectName(oc.project_id, projects),
    'Amount': (oc.amount_cents / 100).toFixed(2),
    'Currency': oc.currency || 'SDG',
    'Vendor': oc.vendor || 'N/A',
    'Expense Date': safeDateShort(oc.expense_date),
    'Submitted By': getUserName(oc.submitted_by, users),
    'Submitted At': safeDate(oc.submitted_at || oc.created_at),
    'Role': oc.submitter_role || 'N/A',
    'Status': getDerivedStatus(oc),
    'Tier 1 Status': oc.tier1_status || 'pending',
    'Tier 1 Reviewed By': getUserName(oc.tier1_approved_by, users),
    'Tier 1 Date': safeDate(oc.tier1_approved_at),
    'Tier 1 Notes': oc.tier1_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '',
    'Tier 2 Status': oc.tier2_status || 'pending',
    'Tier 2 Reviewed By': getUserName(oc.tier2_approved_by, users),
    'Tier 2 Date': safeDate(oc.tier2_approved_at),
    'Tier 2 Notes': oc.tier2_notes?.replace(/\n?\[Signed:.*?\]/g, '').trim() || '',
    'Rejection Reason': oc.rejection_reason || '',
    'Created At': safeDate(oc.created_at),
    'Updated At': safeDate(oc.updated_at),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabLabel.slice(0, 31));

  const colWidths = Object.keys(data[0] || {}).map(k => ({
    wch: Math.max(k.length, 15),
  }));
  ws['!cols'] = colWidths;

  // Apply project-colour row fills
  const numCols = Object.keys(data[0] || {}).length;
  submissions.forEach((oc, rowIdx) => {
    const hex = getProjectHex(oc.project_id).replace('#', '');
    for (let c = 0; c < numCols; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx + 1, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        fill: { patternType: 'solid', fgColor: { rgb: hex } },
        alignment: { wrapText: false },
      };
    }
  });

  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function exportSubmissionsToPDF(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  tabLabel: string,
  statusFilter?: string,
  filename: string = 'cost-submissions',
  projects: ProjectLookup[] = []
): void {
  if (submissions.length === 0) return;

  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`PACT - ${tabLabel} Report`, pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, pageWidth / 2, 22, { align: 'center' });

  if (statusFilter && statusFilter !== 'all') {
    doc.text(`Filter: ${statusFilter}`, pageWidth / 2, 28, { align: 'center' });
  }

  const totalAmount = submissions.reduce((s, o) => s + o.amount_cents, 0);
  const currencies = [...new Set(submissions.map(o => o.currency || 'SDG'))];
  const summaryY = (statusFilter && statusFilter !== 'all') ? 34 : 28;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Submissions: ${submissions.length}`, 14, summaryY + 4);
  if (currencies.length === 1) {
    doc.text(`Total Amount: ${currencies[0]} ${(totalAmount / 100).toLocaleString()}`, 14, summaryY + 9);
  }

  const statusCounts: Record<string, number> = {};
  submissions.forEach(o => {
    const s = getDerivedStatus(o);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusSummary = Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | ');
  doc.setFont('helvetica', 'normal');
  doc.text(statusSummary, 14, summaryY + 14);

  const tableData = submissions.map(oc => [
    oc.reference_number || oc.id.slice(0, 8),
    cleanDescription(oc.description).slice(0, 28),
    CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
    getProjectName(oc.project_id, projects).slice(0, 22),
    `${oc.currency || 'SDG'} ${(oc.amount_cents / 100).toLocaleString()}`,
    oc.vendor || '-',
    safeDateShort(oc.expense_date),
    getUserName(oc.submitted_by, users).slice(0, 18),
    getDerivedStatus(oc),
    getUserName(oc.tier1_approved_by, users).slice(0, 14),
    getUserName(oc.tier2_approved_by, users).slice(0, 14),
  ]);

  autoTable(doc, {
    startY: summaryY + 20,
    head: [[
      'Ref #', 'Title', 'Category', 'Project', 'Amount', 'Vendor',
      'Expense Date', 'Submitted By', 'Status', 'T1 Approver', 'T2 Approver',
    ]],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 32, 65], textColor: 255, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      3: { cellWidth: 22 },
      4: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const oc = submissions[data.row.index];
        data.cell.styles.fillColor = getProjectRgb(oc?.project_id);
      }
    },
  });

  doc.setFontSize(7);
  doc.setTextColor(150);
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(
      `Page ${i} of ${totalPages} | PACT Command Center`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function exportOutstandingToExcel(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  filename: string = 'outstanding-advances'
): void {
  if (submissions.length === 0) return;

  const data = submissions.map(oc => ({
    'Reference #': oc.reference_number || oc.id.slice(0, 8),
    'Title': cleanDescription(oc.description),
    'Category': CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
    'Advance Amount': (oc.amount_cents / 100).toFixed(2),
    'Currency': oc.currency || 'SDG',
    'Vendor': oc.vendor || 'N/A',
    'Submitted By': getUserName(oc.submitted_by, users),
    'Role': oc.submitter_role || 'N/A',
    'Approved Date': safeDate(oc.tier2_approved_at || oc.tier1_approved_at),
    'Tier 1 Approved By': getUserName(oc.tier1_approved_by, users),
    'Tier 2 Approved By': getUserName(oc.tier2_approved_by, users),
    'Days Outstanding': (() => {
      const approvedDate = oc.tier2_approved_at || oc.tier1_approved_at || oc.created_at;
      return Math.floor((Date.now() - new Date(approvedDate).getTime()) / (1000 * 60 * 60 * 24));
    })(),
    'Status': 'Outstanding - Pending Reconciliation',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Outstanding Advances');

  const colWidths = Object.keys(data[0] || {}).map(k => ({
    wch: Math.max(k.length, 15),
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function exportOutstandingToPDF(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  filename: string = 'outstanding-advances'
): void {
  if (submissions.length === 0) return;

  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT - Outstanding Advances Report', pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, pageWidth / 2, 22, { align: 'center' });

  const totalAmount = submissions.reduce((s, o) => s + o.amount_cents, 0);
  const currencies = [...new Set(submissions.map(o => o.currency || 'SDG'))];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Outstanding Advances: ${submissions.length}`, 14, 30);
  if (currencies.length === 1) {
    doc.text(`Total Amount: ${currencies[0]} ${(totalAmount / 100).toLocaleString()}`, 14, 35);
  }

  const tableData = submissions.map(oc => {
    const approvedDate = oc.tier2_approved_at || oc.tier1_approved_at || oc.created_at;
    const daysOut = Math.floor((Date.now() - new Date(approvedDate).getTime()) / (1000 * 60 * 60 * 24));
    return [
      oc.reference_number || oc.id.slice(0, 8),
      cleanDescription(oc.description).slice(0, 30),
      CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
      `${oc.currency || 'SDG'} ${(oc.amount_cents / 100).toLocaleString()}`,
      getUserName(oc.submitted_by, users).slice(0, 20),
      safeDateShort(approvedDate),
      `${daysOut} days`,
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: [['Ref #', 'Title', 'Category', 'Advance Amount', 'Submitted By', 'Approved Date', 'Days Outstanding']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [217, 119, 6], textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    columnStyles: {
      3: { halign: 'right' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  doc.setFontSize(7);
  doc.setTextColor(150);
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(
      `Page ${i} of ${totalPages} | PACT Command Center`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function exportReconciledToExcel(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  filename: string = 'reconciliation-report'
): void {
  if (submissions.length === 0) return;

  const data = submissions.map(oc => {
    const reconMatch = oc.description?.match(/\[RECONCILED\] Actual: (\S+ [\d,.]+) \| Balance: (\S+ -?[\d,.]+)/);
    return {
      'Reference #': oc.reference_number || oc.id.slice(0, 8),
      'Title': cleanDescription(oc.description),
      'Category': CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
      'Original Advance': (oc.amount_cents / 100).toFixed(2),
      'Actual Spent': reconMatch ? reconMatch[1] : 'N/A',
      'Balance': reconMatch ? reconMatch[2] : 'N/A',
      'Currency': oc.currency || 'SDG',
      'Submitted By': getUserName(oc.submitted_by, users),
      'Approved Date': safeDate(oc.tier2_approved_at || oc.tier1_approved_at),
      'Reconciled Date': safeDate(oc.updated_at),
      'Status': getDerivedStatus(oc),
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');

  const colWidths = Object.keys(data[0] || {}).map(k => ({
    wch: Math.max(k.length, 15),
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function exportReconciledToPDF(
  submissions: ExportableSubmission[],
  users: UserLookup[],
  filename: string = 'reconciliation-report'
): void {
  if (submissions.length === 0) return;

  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT - Reconciliation Report', pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, pageWidth / 2, 22, { align: 'center' });

  const totalAdvance = submissions.reduce((s, o) => s + o.amount_cents, 0);
  const currencies = [...new Set(submissions.map(o => o.currency || 'SDG'))];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Reconciled: ${submissions.length}`, 14, 30);
  if (currencies.length === 1) {
    doc.text(`Total Advance Amount: ${currencies[0]} ${(totalAdvance / 100).toLocaleString()}`, 14, 35);
  }

  const tableData = submissions.map(oc => {
    const reconMatch = oc.description?.match(/\[RECONCILED\] Actual: (\S+ [\d,.]+) \| Balance: (\S+ -?[\d,.]+)/);
    return [
      oc.reference_number || oc.id.slice(0, 8),
      cleanDescription(oc.description).slice(0, 25),
      CATEGORY_LABELS[oc.expense_category] || oc.expense_category,
      `${oc.currency || 'SDG'} ${(oc.amount_cents / 100).toLocaleString()}`,
      reconMatch ? reconMatch[1] : 'N/A',
      reconMatch ? reconMatch[2] : 'N/A',
      getUserName(oc.submitted_by, users).slice(0, 20),
      safeDateShort(oc.updated_at),
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: [['Ref #', 'Title', 'Category', 'Advance', 'Actual Spent', 'Balance', 'Submitted By', 'Reconciled']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  doc.setFontSize(7);
  doc.setTextColor(150);
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(
      `Page ${i} of ${totalPages} | PACT Command Center`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
