/**
 * PACT Cycle Close — Formatted Excel Export Engine
 *
 * Provides branded ExcelJS exports for every step of the Cycle Close Wizard.
 * Replaces the raw XLSX exports in Steps 2–7 with fully-styled workbooks:
 *   - Navy title + mid-navy subtitle header block
 *   - Teal header row with auto-filter + frozen pane
 *   - Alternating row shading; colour-coded reconciliation rows
 *   - Amber totals row; borders on all data cells
 *   - Auto-fitted column widths
 *   - Multi-sheet Final Close workbook with payment & advance detail sheets
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/integrations/supabase/client';
import type { WizardState } from '@/components/cycle/CycleCloseWizard';

// ── Brand palette (matches formattedExcelExport.ts) ──────────────────────────
const C = {
  navy:   '1e3a5f', navyD: '2d5282', teal:  '0891b2',
  white:  'FFFFFF', rowAlt: 'f0f9ff', rowW:  'FFFFFF',
  amber:  'fef3c7', amberF: '92400e',
  green:  'd1fae5', red:   'fee2e2',  blue:  'dbeafe', amberR: 'fffbeb',
  border: 'cbd5e1', text:  '374151',
};

// ── Shared interfaces ─────────────────────────────────────────────────────────

export interface EnumRow {
  enumeratorId: string;
  enumeratorName: string;
  sitesAssigned: number;
  wfpConfirmed: number;
  wfpRejected: number;
  notCovered: number;
  advancePaid: number;
  transportRate: number;
  feeRate: number;
  transportEarned: number;
  feesEarned: number;
  totalEarned: number;
  netToPay: number;
  rowType: 'green' | 'amber' | 'red' | 'blue';
  paymentDone: boolean;
  paymentAction?: 'pay' | 'recover' | 'writeoff' | 'redirect';
}

export interface CheckResult {
  id: number;
  label: string;
  passes: boolean;
  override?: { by: string; at: string; justification: string };
}

export interface RejectedSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  enumerator_name: string;
  status: string;
  rejection_reason?: string;
}

export interface UncoveredSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  hub_office: string;
  enumerator_name: string;
  source: string;
}

export interface CoverageRow {
  label: string;
  total: number;
  confirmed: number;
  notCovered: number;
}

export interface InstallmentEntry {
  amount: number;
  stage: string;
  description?: string;
  paid: boolean;
  paid_at?: string | null;
  transaction_id?: string | null;
  paid_by_name?: string | null;
}

export interface ExceptionSite {
  siteId: string;
  siteName: string;
  state: string;
  locality: string;
  enumeratorId?: string;
  enumeratorName: string;
  /** Actual disbursed amount (0 for approved-not-yet-paid) */
  advancePaid: number;
  /** Original requested/approved amount */
  requestedAmount: number;
  /** Remaining unpaid amount */
  remainingAmount?: number;
  /** Payment status from down_payment_requests */
  advanceStatus: 'paid' | 'fully_paid' | 'partially_paid' | 'approved';
  /** down_payment_requests.id for downstream actions */
  advanceId: string;
  /** Name of the supervisor/admin who approved this advance */
  approvedByName?: string;

  // ── Extended payment detail fields ───────────────────────────────────────
  requestedAt?: string;
  requestedByName?: string;
  paymentType?: 'full_advance' | 'installments';
  supervisorApprovedAt?: string;
  adminProcessedByName?: string;
  adminProcessedAt?: string;
  installmentPlan?: InstallmentEntry[];
  paidInstallments?: InstallmentEntry[];
  walletTransactionIds?: string[];

  /** Enumerator-fee settlement fields, used to show the result of a Redirect. */
  feePaidStatus?: 'unpaid' | 'partially_paid' | 'paid';
  feePaidAmount?: number;
  feeCashPaidAmount?: number;
  feeAdvanceOffsetAmount?: number;
  feeRemainingAmount?: number;
  feePaidAt?: string;
  feePaymentMethod?: string;
  feePaymentNotes?: string;
}

// ── Low-level cell helpers ────────────────────────────────────────────────────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
}
function setFont(cell: ExcelJS.Cell, hex: string, bold = false, size = 10) {
  cell.font = { color: { argb: 'FF' + hex }, bold, size, name: 'Calibri' };
}
function setBorder(cell: ExcelJS.Cell) {
  const s: ExcelJS.BorderStyle = 'thin';
  cell.border = {
    top:    { style: s, color: { argb: 'FF' + C.border } },
    left:   { style: s, color: { argb: 'FF' + C.border } },
    bottom: { style: s, color: { argb: 'FF' + C.border } },
    right:  { style: s, color: { argb: 'FF' + C.border } },
  };
}

type CellVal = string | number | null | undefined;

// ── Generic sheet builder ─────────────────────────────────────────────────────

interface SheetOpts {
  /** Return a hex bg for this row index (0-based data row), or null for alternating default. */
  rowBgFn?: (i: number) => string | null;
  totalsRow?: CellVal[];
}

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  meta: string | null,
  headers: string[],
  rows: CellVal[][],
  opts: SheetOpts = {},
): void {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const nCols = Math.max(headers.length, 1);

  const addHeaderBlock = (text: string, bg: string, size: number, height: number) => {
    const r = ws.addRow([text]);
    r.height = height;
    const c = r.getCell(1);
    setFill(c, bg); setFont(c, C.white, size >= 13, size);
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    if (nCols > 1) ws.mergeCells(r.number, 1, r.number, nCols);
  };

  addHeaderBlock(title, C.navy, 13, 22);
  addHeaderBlock(subtitle, C.navyD, 10, 17);
  if (meta) addHeaderBlock(meta, C.navyD, 9, 15);

  // Header row
  const hr = ws.addRow(headers);
  hr.height = 17;
  hr.eachCell((cell, col) => {
    if (col > nCols) return;
    setFill(cell, C.teal); setFont(cell, C.white, true, 10);
    setBorder(cell);
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  ws.autoFilter = { from: { row: hr.number, column: 1 }, to: { row: hr.number, column: nCols } };
  ws.views = [{ state: 'frozen', ySplit: hr.number }];

  // Data rows
  rows.forEach((rowData, idx) => {
    const dr = ws.addRow(rowData);
    const bg = opts.rowBgFn ? (opts.rowBgFn(idx) ?? (idx % 2 === 1 ? C.rowAlt : C.rowW)) : (idx % 2 === 1 ? C.rowAlt : C.rowW);
    dr.eachCell((cell, col) => {
      if (col > nCols) return;
      setFill(cell, bg); setFont(cell, C.text);
      setBorder(cell);
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  // Totals row
  if (opts.totalsRow) {
    const tr = ws.addRow(opts.totalsRow);
    tr.eachCell((cell, col) => {
      if (col > nCols) return;
      setFill(cell, C.amber); setFont(cell, C.amberF, true, 10);
      setBorder(cell);
      cell.alignment = { vertical: 'middle' };
    });
  }

  // Auto column widths
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    const vals = rows.map(r => String(r[i] ?? ''));
    const maxLen = Math.max(h.length, ...vals.map(v => v.length));
    col.width = Math.min(Math.max(maxLen + 3, 12), 48);
  });
}

async function saveWb(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}

function cycleName(ws: WizardState) {
  return ws.selectedMmp?.name ?? 'Cycle';
}

// ── Step 2: Matching Report ───────────────────────────────────────────────────

export async function exportFormattedMatchingReport(wizardState: WizardState): Promise<void> {
  const pairs = wizardState.matchingPairs.filter(p => p.mmpColumn && p.wfpColumn);
  const wfpHeaders = pairs.map(p => `WFP: ${p.wfpColumn}`);
  const headers = [...wfpHeaders, 'Matched MMP Entry', 'Score %', 'Match Type', 'Method', 'Action'];

  const rows: CellVal[][] = wizardState.matchResults.map(r => [
    ...pairs.map(p => r.wfpRow[p.wfpColumn] ?? ''),
    r.matchedSiteName ?? 'No match',
    r.matchScore,
    r.matchLevel,
    r.manualMatchSiteId ? 'Manual' : 'Auto',
    r.action ?? r.status,
  ]);

  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Matching Report', 'Cycle Close — Matching Report',
    `Cycle: ${cycleName(wizardState)}`,
    `Generated: ${new Date().toLocaleString()} · ${rows.length} rows`,
    headers, rows);
  await saveWb(wb, `matching-report-${cycleName(wizardState)}.xlsx`);
}

// ── Step 3: Rejected Sites Report ────────────────────────────────────────────

export async function exportFormattedRejectedSites(
  sites: RejectedSite[],
  wizardState: WizardState,
): Promise<void> {
  const headers = ['Site Name', 'State', 'Locality', 'Enumerator', 'System Status', 'Rejection Reason', 'Action Taken'];
  const rows: CellVal[][] = sites.map(s => [
    s.site_name, s.state, s.locality, s.enumerator_name, s.status,
    s.rejection_reason ?? '',
    wizardState.resolvedSites[s.id] ?? 'Pending',
  ]);
  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Rejected Sites', 'Cycle Close — Rejected Sites',
    `Cycle: ${cycleName(wizardState)}`,
    `Generated: ${new Date().toLocaleString()} · ${rows.length} sites`,
    headers, rows);
  await saveWb(wb, `rejected-sites-${cycleName(wizardState)}.xlsx`);
}

// ── Step 4: Not-Covered Report (2 sheets) ────────────────────────────────────

export async function exportFormattedNotCovered(
  sites: UncoveredSite[],
  coverageRows: CoverageRow[],
  wizardState: WizardState,
): Promise<void> {
  const sourceLabel = (src: string) =>
    src === 'not_in_wfp'      ? 'Not in WFP File'
    : src === 'rejected_match' ? 'WFP Rejected'
    : src === 'not_covered'    ? 'Unresolved (Step 3)'
    : 'DB: Not Covered';

  const wb = new ExcelJS.Workbook();
  const meta = `Generated: ${new Date().toLocaleString()} · ${sites.length} uncovered sites`;

  // Sheet 1: individual sites
  const siteHeaders = ['Site Name', 'State', 'Locality', 'Hub / Office', 'Enumerator', 'Source', 'Reason', 'Notes', 'Flagged for Follow-Up'];
  const siteRows: CellVal[][] = sites.map(s => {
    const r = wizardState.uncoveredReasons[s.id];
    return [
      s.site_name, s.state, s.locality, s.hub_office, s.enumerator_name,
      sourceLabel(s.source),
      r?.reason ?? 'Not assigned',
      r?.note ?? '',
      r?.flagged ? 'Yes' : 'No',
    ];
  });
  buildSheet(wb, 'Uncovered Sites', 'Cycle Close — Not Covered Sites',
    `Cycle: ${cycleName(wizardState)}`, meta, siteHeaders, siteRows,
    { rowBgFn: (i) => i % 2 === 1 ? C.rowAlt : null });

  // Sheet 2: coverage by state
  const covHeaders = ['State', 'Total Sites', 'Confirmed', 'Not Covered', 'Coverage %'];
  const total = coverageRows.reduce((s, r) => s + r.total, 0);
  const conf  = coverageRows.reduce((s, r) => s + r.confirmed, 0);
  const nc    = coverageRows.reduce((s, r) => s + r.notCovered, 0);
  const covRows: CellVal[][] = coverageRows.map(r => [
    r.label, r.total, r.confirmed, r.notCovered,
    r.total ? `${Math.round((r.confirmed / r.total) * 100)}%` : '0%',
  ]);
  buildSheet(wb, 'Coverage by State', 'Cycle Close — Coverage by State',
    `Cycle: ${cycleName(wizardState)}`, meta, covHeaders, covRows,
    { totalsRow: ['TOTAL', total, conf, nc, total ? `${Math.round((conf / total) * 100)}%` : '0%'] });

  await saveWb(wb, `not-covered-report-${cycleName(wizardState)}.xlsx`);
}

// ── Step 5: Exceptions Report ─────────────────────────────────────────────────

const DECISION_LABELS: Record<string, string> = {
  roll:     'Roll to Next MMP — رحّل للدورة التالية',
  return:   'Return Required — استرداد مطلوب',
  writeoff: 'Write-Off — شطب',
  redirect: 'Redirect to Enumerator Fees — تحويل لأتعاب المعددين',
  cancel:   'Cancel & Void — إلغاء وشطب',
  hold:     'Hold for Next MMP — تعليق للدورة التالية',
  reassign: 'Reassign to Covered Site — إعادة تعيين لموقع مغطى',
  reduce:   'Reduce & Approve — تعديل وتحديد المبلغ',
};

const STATUS_LABELS: Record<string, string> = {
  paid:           '✓ Paid',
  fully_paid:     '✓ Fully Paid',
  partially_paid: '⚡ Partially Paid',
  approved:       '⏳ Approved (Unpaid)',
};

export async function exportFormattedExceptions(
  exceptions: ExceptionSite[],
  wizardState: WizardState,
): Promise<void> {
  const headers = [
    'Site Name', 'State', 'Locality', 'Enumerator',
    'Advance Status', 'Disbursed (SDG)', 'Requested (SDG)',
    'Decision (EN · AR)', 'Amount (SDG)', 'Justification', 'Target Site', 'Approved By',
  ];

  // Split paid vs. approved for colour coding
  const rowBgFn = (i: number): string | null => {
    const site = exceptions[i];
    if (!site) return null;
    const status = site.advanceStatus;
    if (status === 'paid' || status === 'fully_paid') return C.green;
    if (status === 'partially_paid') return C.blue;
    return C.amberR; // approved (unpaid)
  };

  const rows: CellVal[][] = exceptions.map(e => {
    const d = wizardState.exceptionDecisions[e.advanceId];
    return [
      e.siteName, e.state, e.locality, e.enumeratorName,
      STATUS_LABELS[e.advanceStatus] ?? e.advanceStatus,
      e.advancePaid > 0 ? e.advancePaid : '',
      e.requestedAmount > 0 ? e.requestedAmount : '',
      d?.decision ? (DECISION_LABELS[d.decision] ?? d.decision) : 'Pending',
      d?.amount ?? d?.targetSiteId ?? '',
      d?.justification ?? '',
      d?.targetSiteId ?? '',
      d?.approvedBy ?? '',
    ];
  });

  const totalDisbursed = exceptions.reduce((s, e) => s + e.advancePaid, 0);
  const totalRequested = exceptions.reduce((s, e) => s + e.requestedAmount, 0);
  const paid    = exceptions.filter(e => e.advanceStatus !== 'approved');
  const pending = exceptions.filter(e => e.advanceStatus === 'approved');

  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Exceptions', 'Cycle Close — Advance Exceptions',
    `Cycle: ${cycleName(wizardState)}`,
    `Generated: ${new Date().toLocaleString()} · ${paid.length} disbursed · ${pending.length} approved (unpaid)`,
    headers, rows,
    {
      rowBgFn,
      totalsRow: ['TOTAL', '', '', '', '', totalDisbursed, totalRequested, '', '', '', '', ''],
    });
  await saveWb(wb, `exceptions-report-${cycleName(wizardState)}.xlsx`);
}

// ── Step 6: Formatted Reconciliation ─────────────────────────────────────────

const ROW_TYPE_BG: Record<EnumRow['rowType'], string> = {
  green: C.green, red: C.red, blue: C.blue, amber: C.amberR,
};

export async function exportFormattedReconciliation(
  rows: EnumRow[],
  wizardState: WizardState,
): Promise<void> {
  const headers = [
    'Enumerator', 'Sites Assigned', 'WFP Confirmed', 'WFP Rejected', 'Not Covered',
    'Advance Paid (SDG)', 'Transport Earned (SDG)', 'Fees Earned (SDG)',
    'Total Earned (SDG)', 'Net to Pay (SDG)', 'Balance Status', 'Payment Action',
  ];

  const statusLabel = (r: EnumRow) =>
    r.rowType === 'green' ? 'Owed to enumerator'
    : r.rowType === 'red'   ? 'Overpaid (recover)'
    : r.rowType === 'blue'  ? 'No advance — pay in full'
    : 'Balanced';

  const actionLabel = (r: EnumRow) => {
    if (!r.paymentDone) return 'Pending';
    const a = r.paymentAction;
    return a === 'pay' ? 'Payment generated' : a === 'recover' ? 'Recovery scheduled' : a === 'writeoff' ? 'Written off' : 'Done';
  };

  const dataRows: CellVal[][] = rows.map(r => [
    r.enumeratorName, r.sitesAssigned, r.wfpConfirmed, r.wfpRejected, r.notCovered,
    r.advancePaid, r.transportEarned, r.feesEarned, r.totalEarned, r.netToPay,
    statusLabel(r), actionLabel(r),
  ]);

  const totals: CellVal[] = [
    'TOTAL', rows.reduce((s, r) => s + r.sitesAssigned, 0),
    rows.reduce((s, r) => s + r.wfpConfirmed, 0), rows.reduce((s, r) => s + r.wfpRejected, 0),
    rows.reduce((s, r) => s + r.notCovered, 0), rows.reduce((s, r) => s + r.advancePaid, 0),
    rows.reduce((s, r) => s + r.transportEarned, 0), rows.reduce((s, r) => s + r.feesEarned, 0),
    rows.reduce((s, r) => s + r.totalEarned, 0), rows.reduce((s, r) => s + r.netToPay, 0),
    '', '',
  ];

  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Reconciliation', 'Cycle Close — Enumerator Reconciliation',
    `Cycle: ${cycleName(wizardState)}`,
    `Generated: ${new Date().toLocaleString()} · ${rows.length} enumerators`,
    headers, dataRows,
    {
      rowBgFn: (i) => ROW_TYPE_BG[rows[i]?.rowType] ?? C.rowW,
      totalsRow: totals,
    });
  await saveWb(wb, `reconciliation-${cycleName(wizardState)}.xlsx`);
}

// ── Step 6: Formatted Payment Run Sheet ──────────────────────────────────────

export async function exportFormattedPaymentRun(
  rows: EnumRow[],
  wizardState: WizardState,
): Promise<void> {
  const payable = rows.filter(r => r.rowType === 'green' || r.rowType === 'blue');
  const headers = [
    'Enumerator', 'Advance Already Paid (SDG)', 'Transport Earned (SDG)',
    'Fees Earned (SDG)', 'Total Earned (SDG)', 'Net to Pay (SDG)', 'Payment Status',
  ];
  const dataRows: CellVal[][] = payable.map(r => [
    r.enumeratorName, r.advancePaid, r.transportEarned, r.feesEarned, r.totalEarned,
    r.rowType === 'blue' ? r.totalEarned : r.netToPay,
    r.paymentDone ? 'Payment generated' : 'Pending',
  ]);
  const totals: CellVal[] = [
    'TOTAL',
    payable.reduce((s, r) => s + r.advancePaid, 0),
    payable.reduce((s, r) => s + r.transportEarned, 0),
    payable.reduce((s, r) => s + r.feesEarned, 0),
    payable.reduce((s, r) => s + r.totalEarned, 0),
    payable.reduce((s, r) => s + (r.rowType === 'blue' ? r.totalEarned : r.netToPay), 0),
    '',
  ];

  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Payment Run', 'Cycle Close — Payment Run Sheet',
    `Cycle: ${cycleName(wizardState)}`,
    `Generated: ${new Date().toLocaleString()} · ${payable.length} payable enumerators`,
    headers, dataRows,
    { rowBgFn: (i) => ROW_TYPE_BG[payable[i]?.rowType] ?? C.rowW, totalsRow: totals });
  await saveWb(wb, `payment-run-${cycleName(wizardState)}.xlsx`);
}

// ── Step 7: Full Cycle Close Workbook ─────────────────────────────────────────
//
// Async — fetches reconciliation + advance data from DB.
// Sheets included only when they have data:
//   1. Cycle Summary         — always
//   2. All Sites             — if matchResults > 0
//   3. Not Covered Sites     — if uncoveredReasons > 0
//   4. Exceptions (Advances) — if exceptionDecisions > 0
//   5. Enumerator Recon      — if recon rows exist
//   6. Advance Details       — if any advances recorded
//   7. Payment Run           — if payable rows exist
//   8. Override Log          — if overrides exist

export async function exportCycleCloseWorkbook(
  wizardState: WizardState,
  currentUser: any,
  checkResults: CheckResult[],
): Promise<void> {
  const mmpId = wizardState.selectedMmpId!;
  const mmp   = wizardState.selectedMmp;
  const now   = new Date().toLocaleString();
  const cname = cycleName(wizardState);

  // ── Fetch all entries for this MMP ──────────────────────────────────────
  const { data: entries } = await supabase
    .from('mmp_site_entries')
    .select('id, site_name, state, locality, accepted_by, claimed_by, visit_started_by, status, transport_fee, enumerator_fee, additional_data')
    .eq('mmp_file_id', mmpId);

  const entryIds = (entries ?? []).map((e: any) => e.id);
  const entryMap: Record<string, any> = {};
  for (const e of (entries ?? [])) entryMap[e.id] = e;

  // ── Fetch advances (all paid/approved) ──────────────────────────────────
  const { data: advances } = entryIds.length > 0
    ? await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, total_paid_amount, requested_amount, status, created_at')
        .in('mmp_site_entry_id', entryIds)
        .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid'])
    : { data: [] as any[] };

  // ── Fetch enumerator profiles ────────────────────────────────────────────
  const resolveEnumId = (e: any): string | null =>
    e.accepted_by || e.claimed_by || e.visit_started_by || null;

  const allEnumIds = [...new Set(
    (entries ?? []).map((e: any) => resolveEnumId(e)).filter(Boolean) as string[]
  )];
  const { data: profiles } = allEnumIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', allEnumIds)
    : { data: [] as any[] };
  const profileMap: Record<string, string> = {};
  for (const p of (profiles ?? [])) profileMap[p.id] = p.full_name ?? '';

  // ── Build advance maps ───────────────────────────────────────────────────
  const advanceByEntry: Record<string, number> = {};
  const advanceById: Record<string, { siteId: string; amount: number }> = {};
  for (const a of (advances ?? [])) {
    const amt = (a as any).total_paid_amount ?? (a as any).requested_amount ?? 0;
    const siteId = (a as any).mmp_site_entry_id as string;
    advanceByEntry[siteId] = (advanceByEntry[siteId] ?? 0) + Number(amt);
    advanceById[(a as any).id] = { siteId, amount: Number(amt) };
  }
  const entryToEnum: Record<string, string> = {};
  for (const e of (entries ?? [])) {
    const id = resolveEnumId(e);
    if (id) entryToEnum[(e as any).id] = id;
  }
  const advanceByEnum: Record<string, number> = {};
  for (const a of (advances ?? [])) {
    const enumId = entryToEnum[(a as any).mmp_site_entry_id];
    if (!enumId) continue;
    const amt = (a as any).total_paid_amount ?? (a as any).requested_amount ?? 0;
    advanceByEnum[enumId] = (advanceByEnum[enumId] ?? 0) + Number(amt);
  }

  // ── Build reconciliation rows (same logic as Step 6) ────────────────────
  const notCoveredIds = new Set(Object.keys(wizardState.uncoveredReasons));
  const confirmedMatchIds = new Set(
    wizardState.matchResults
      .filter(r => r.status === 'auto' || r.action === 'confirm')
      .map(r => r.matchedSiteId).filter(Boolean) as string[]
  );

  const byEnum: Record<string, { name: string; entries: any[] }> = {};
  for (const e of (entries ?? [])) {
    const id = resolveEnumId(e);
    if (!id) continue;
    const ad = (e as any).additional_data ?? {};
    const adName = ad.collector_name || ad.accepted_by_name || ad.enumerator_name ||
                   ad.data_collector_name || ad.collectorName || 'Unknown';
    if (!byEnum[id]) byEnum[id] = { name: profileMap[id] || adName, entries: [] };
    byEnum[id].entries.push(e);
  }

  const reconRows: EnumRow[] = Object.entries(byEnum).map(([enumId, data]) => {
    const confirmedEntries = data.entries.filter(e => confirmedMatchIds.has(e.id));
    const wfpConfirmed  = confirmedEntries.length;
    const wfpRejected   = data.entries.filter(e =>
      wizardState.matchResults.some(r => r.matchedSiteId === e.id && r.action === 'reject')
    ).length;
    const notCovCount   = data.entries.filter(e => notCoveredIds.has(e.id)).length;
    const advancePaid   = advanceByEnum[enumId] ?? 0;
    const transportEarned = confirmedEntries.reduce((s, e) => s + (Number(e.transport_fee) || 0), 0);
    const feesEarned    = confirmedEntries.reduce((s, e) => s + (Number(e.enumerator_fee) || 0), 0);
    const totalEarned   = transportEarned + feesEarned;
    const netToPay      = totalEarned - advancePaid;
    let rowType: EnumRow['rowType'] = 'amber';
    if (advancePaid === 0) rowType = 'blue';
    else if (netToPay > 0) rowType = 'green';
    else if (netToPay < 0) rowType = 'red';
    const action = wizardState.paymentActions[enumId];
    return {
      enumeratorId: enumId, enumeratorName: data.name,
      sitesAssigned: data.entries.length, wfpConfirmed, wfpRejected, notCovered: notCovCount,
      advancePaid,
      transportRate: confirmedEntries.length ? Math.round(transportEarned / confirmedEntries.length) : 0,
      feeRate:       confirmedEntries.length ? Math.round(feesEarned / confirmedEntries.length) : 0,
      transportEarned, feesEarned, totalEarned, netToPay, rowType,
      paymentDone: !!action?.done,
      paymentAction: action?.action,
    };
  });

  // ── Site name lookup for not-covered / exception sheets ──────────────────
  const siteNameOf = (id: string): { name: string; state: string; locality: string } => {
    const e = entryMap[id];
    if (e) return { name: e.site_name ?? id, state: e.state ?? '', locality: e.locality ?? '' };
    const mr = wizardState.matchResults.find(r => r.matchedSiteId === id);
    return { name: mr?.matchedSiteName ?? id, state: '', locality: '' };
  };

  // ────────────────────────────────────────────────────────────────────────
  // BUILD WORKBOOK
  // ────────────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();

  // ── Sheet 1: Cycle Summary ────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('Summary');
    const addMeta = (label: string, value: string, bg?: string) => {
      const row = ws.addRow([label, value]);
      row.height = 16;
      const lc = row.getCell(1); const vc = row.getCell(2);
      if (bg) { setFill(lc, bg); setFill(vc, bg); }
      setFont(lc, bg ? C.white : C.text, true, 10);
      setFont(vc, bg ? C.white : C.text, false, 10);
      setBorder(lc); setBorder(vc);
      lc.alignment = { vertical: 'middle' };
      vc.alignment = { vertical: 'middle' };
    };

    // Title
    const tr = ws.addRow(['PACT Cycle Close — Official Record']);
    tr.height = 26;
    const tc = tr.getCell(1);
    setFill(tc, C.navy); setFont(tc, C.white, true, 15);
    tc.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(tr.number, 1, tr.number, 4);

    const sr = ws.addRow([`Cycle: ${cname}`]);
    sr.height = 18;
    const sc = sr.getCell(1);
    setFill(sc, C.navyD); setFont(sc, C.white, false, 11);
    sc.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(sr.number, 1, sr.number, 4);

    ws.addRow([]); // spacer

    // Cycle info
    addMeta('Cycle Name', mmp?.name ?? '', C.teal);
    addMeta('Closed By', currentUser?.full_name ?? 'Unknown');
    addMeta('Closed At', now);
    addMeta('Total Sites', String(wizardState.matchResults.length));
    const confirmed = wizardState.matchResults.filter(r => r.status === 'auto' || r.action === 'confirm').length;
    const ncTotal = Object.keys(wizardState.uncoveredReasons).length;
    const exCount = Object.keys(wizardState.exceptionDecisions).length;
    addMeta('Confirmed Sites', String(confirmed));
    addMeta('Not Covered Sites', String(ncTotal));
    addMeta('Exceptions (Advances on NC)', String(exCount));
    addMeta('Enumerators Reconciled', String(reconRows.length));

    ws.addRow([]); // spacer

    // Financial summary
    const totAdv  = reconRows.reduce((s, r) => s + r.advancePaid, 0);
    const totEarn = reconRows.reduce((s, r) => s + r.totalEarned, 0);
    const totPay  = reconRows.filter(r => r.netToPay > 0).reduce((s, r) => s + r.netToPay, 0);
    const totRec  = reconRows.filter(r => r.netToPay < 0).reduce((s, r) => s + Math.abs(r.netToPay), 0);
    addMeta('Total Advances Paid (SDG)', `SDG ${totAdv.toLocaleString()}`, C.teal);
    addMeta('Total Earned — WFP Confirmed (SDG)', `SDG ${totEarn.toLocaleString()}`);
    addMeta('Total to Pay Out (SDG)', `SDG ${totPay.toLocaleString()}`);
    addMeta('Total to Recover (SDG)', `SDG ${totRec.toLocaleString()}`);
    addMeta('Net Cycle Cost (SDG)', `SDG ${(totEarn - totAdv).toLocaleString()}`);

    ws.addRow([]); // spacer

    // Readiness checks
    const chkHdr = ws.addRow(['#', 'Check', 'Status', 'Override / Note']);
    chkHdr.height = 17;
    [1, 2, 3, 4].forEach(col => {
      const c = chkHdr.getCell(col);
      setFill(c, C.teal); setFont(c, C.white, true, 10);
      setBorder(c); c.alignment = { vertical: 'middle' };
    });

    checkResults.forEach(ck => {
      const status = ck.passes ? '✅ Passed' : ck.override ? '⚠️ Overridden' : '❌ Failed';
      const note   = ck.override ? `Override by ${ck.override.by}: ${ck.override.justification}` : '';
      const row = ws.addRow([ck.id, ck.label, status, note]);
      const bg  = ck.passes ? C.green : ck.override ? C.amberR : C.red;
      [1, 2, 3, 4].forEach(col => {
        const c = row.getCell(col);
        setFill(c, bg); setFont(c, C.text);
        setBorder(c); c.alignment = { vertical: 'middle', wrapText: true };
      });
      row.height = 16;
    });

    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 38;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 55;
  }

  // ── Sheet 2: All Sites ────────────────────────────────────────────────────
  if (wizardState.matchResults.length > 0) {
    const pairs = wizardState.matchingPairs.filter(p => p.mmpColumn && p.wfpColumn);
    const wfpCols = pairs.length > 0
      ? pairs.slice(0, 3).map(p => `WFP: ${p.wfpColumn}`)
      : ['WFP: Site Name'];
    const headers = ['MMP Site Name', ...wfpCols, 'Score %', 'Match Type', 'Method', 'Action', 'Advance Paid (SDG)'];
    const rows: CellVal[][] = wizardState.matchResults.map(r => {
      const entryId = r.matchedSiteId;
      const advance = entryId ? (advanceByEntry[entryId] ?? 0) : 0;
      const wfpVals = pairs.length > 0
        ? pairs.slice(0, 3).map(p => r.wfpRow[p.wfpColumn] ?? '')
        : [r.wfpRow['site_name'] ?? r.wfpRow['Site Name'] ?? ''];
      return [
        r.matchedSiteName ?? 'No match', ...wfpVals,
        r.matchScore, r.matchLevel,
        r.manualMatchSiteId ? 'Manual' : 'Auto',
        r.action ?? r.status, advance || '',
      ];
    });

    const actionBg = (r: typeof wizardState.matchResults[0]) => {
      if (r.action === 'confirm' || r.status === 'auto') return C.green;
      if (r.action === 'reject' || r.status === 'unmatched') return C.red;
      if (r.status === 'review') return C.amberR;
      return C.rowW;
    };

    buildSheet(wb, 'All Sites', 'Cycle Close — All Sites',
      `Cycle: ${cname}`,
      `Generated: ${now} · ${rows.length} sites`,
      headers, rows,
      { rowBgFn: (i) => actionBg(wizardState.matchResults[i]) });
  }

  // ── Sheet 3: Not Covered Sites ────────────────────────────────────────────
  if (Object.keys(wizardState.uncoveredReasons).length > 0) {
    const headers = [
      'Site Name', 'State', 'Locality', 'Reason', 'Notes',
      'Flagged for Follow-Up', 'Advance Outstanding (SDG)', 'Exception Decision',
    ];
    const rows: CellVal[][] = Object.entries(wizardState.uncoveredReasons).map(([id, r]) => {
      const s = siteNameOf(id);
      const adv = advanceByEntry[id] ?? 0;
      const decisions = Object.entries(advanceById)
        .filter(([, advance]) => advance.siteId === id)
        .map(([advanceId]) => wizardState.exceptionDecisions[advanceId]?.decision)
        .filter(Boolean);
      return [
        s.name, s.state, s.locality,
        r.reason, r.note, r.flagged ? 'Yes' : 'No',
        adv || '', decisions.length > 0 ? decisions.join(', ') : (adv > 0 ? 'Pending' : 'No advance'),
      ];
    });
    buildSheet(wb, 'Not Covered Sites', 'Cycle Close — Not Covered Sites',
      `Cycle: ${cname}`, `Generated: ${now} · ${rows.length} not covered sites`,
      headers, rows, { rowBgFn: (i) => i % 2 === 1 ? C.rowAlt : C.rowW });
  }

  // ── Sheet 4: Exceptions — Advance Decisions ───────────────────────────────
  if (Object.keys(wizardState.exceptionDecisions).length > 0) {
    const headers = [
      'Site Name', 'State', 'Locality', 'Advance ID',
      'Advance Paid (SDG)', 'Decision', 'Amount Redirected / Rolled (SDG)',
      'Justification', 'Approved By',
    ];
    const rows: CellVal[][] = Object.entries(wizardState.exceptionDecisions).map(([advanceId, d]) => {
      const advance = advanceById[advanceId];
      const s = siteNameOf(advance?.siteId ?? advanceId);
      const adv = advance?.amount ?? 0;
      return [
        s.name, s.state, s.locality, advanceId, adv,
        d.decision ?? 'Pending', d.amount ?? '',
        d.justification ?? '', d.approvedBy ?? '',
      ];
    });
    const totalAdv = rows.reduce((s, r) => s + (Number(r[4]) || 0), 0);
    buildSheet(wb, 'Exceptions — Advances', 'Cycle Close — Advance Exception Decisions',
      `Cycle: ${cname}`, `Generated: ${now} · ${rows.length} exception advances · Total: SDG ${totalAdv.toLocaleString()}`,
      headers, rows,
      { totalsRow: ['TOTAL', '', '', '', totalAdv, '', '', '', ''] });
  }

  // ── Sheet 5: Enumerator Reconciliation ───────────────────────────────────
  if (reconRows.length > 0) {
    const statusLabel = (r: EnumRow) =>
      r.rowType === 'green' ? 'Owed to enumerator'
      : r.rowType === 'red' ? 'Overpaid — recover'
      : r.rowType === 'blue' ? 'No advance — pay full'
      : 'Balanced';
    const actionLabel = (r: EnumRow) => {
      if (!r.paymentDone) return 'Pending';
      const a = r.paymentAction;
      return a === 'pay' ? 'Payment generated' : a === 'recover' ? 'Recovery scheduled' : a === 'writeoff' ? 'Written off' : 'Done';
    };
    const headers = [
      'Enumerator', 'Assigned', 'Confirmed', 'Rejected', 'Not Covered',
      'Advance Paid (SDG)', 'Transport Earned (SDG)', 'Fees Earned (SDG)',
      'Total Earned (SDG)', 'Net to Pay (SDG)', 'Status', 'Action',
    ];
    const dataRows: CellVal[][] = reconRows.map(r => [
      r.enumeratorName, r.sitesAssigned, r.wfpConfirmed, r.wfpRejected, r.notCovered,
      r.advancePaid, r.transportEarned, r.feesEarned, r.totalEarned, r.netToPay,
      statusLabel(r), actionLabel(r),
    ]);
    const totalsRow: CellVal[] = [
      'TOTAL',
      reconRows.reduce((s, r) => s + r.sitesAssigned, 0),
      reconRows.reduce((s, r) => s + r.wfpConfirmed, 0),
      reconRows.reduce((s, r) => s + r.wfpRejected, 0),
      reconRows.reduce((s, r) => s + r.notCovered, 0),
      reconRows.reduce((s, r) => s + r.advancePaid, 0),
      reconRows.reduce((s, r) => s + r.transportEarned, 0),
      reconRows.reduce((s, r) => s + r.feesEarned, 0),
      reconRows.reduce((s, r) => s + r.totalEarned, 0),
      reconRows.reduce((s, r) => s + r.netToPay, 0),
      '', '',
    ];
    buildSheet(wb, 'Enumerator Reconciliation', 'Cycle Close — Enumerator Reconciliation',
      `Cycle: ${cname}`, `Generated: ${now} · ${reconRows.length} enumerators`,
      headers, dataRows,
      { rowBgFn: (i) => ROW_TYPE_BG[reconRows[i]?.rowType] ?? C.rowW, totalsRow });
  }

  // ── Sheet 6: Advance Details per Site ────────────────────────────────────
  if ((advances ?? []).length > 0) {
    const headers = [
      'Site Name', 'State', 'Locality', 'Enumerator',
      'Advance Amount (SDG)', 'Payment Status', 'Recorded At',
    ];
    const rows: CellVal[][] = (advances ?? []).map((a: any) => {
      const entry = entryMap[a.mmp_site_entry_id];
      const enumId = entry ? resolveEnumId(entry) : null;
      const enumName = enumId ? (profileMap[enumId] || 'Unknown') : 'Unknown';
      const amount = Number(a.total_paid_amount ?? a.requested_amount ?? 0);
      return [
        entry?.site_name ?? a.mmp_site_entry_id,
        entry?.state ?? '', entry?.locality ?? '',
        enumName, amount, a.status,
        a.created_at ? new Date(a.created_at).toLocaleDateString() : '',
      ];
    });
    const total = rows.reduce((s, r) => s + (Number(r[4]) || 0), 0);
    buildSheet(wb, 'Advance Details', 'Cycle Close — Advance Details by Site',
      `Cycle: ${cname}`, `Generated: ${now} · ${rows.length} advance records · Total: SDG ${total.toLocaleString()}`,
      headers, rows,
      { totalsRow: ['TOTAL', '', '', '', total, '', ''] });
  }

  // ── Sheet 7: Payment Run ──────────────────────────────────────────────────
  const payable = reconRows.filter(r => r.rowType === 'green' || r.rowType === 'blue');
  if (payable.length > 0) {
    const headers = [
      'Enumerator', 'Advance Paid (SDG)', 'Transport Earned (SDG)',
      'Fees Earned (SDG)', 'Total Earned (SDG)', 'Net to Pay (SDG)', 'Action Status',
    ];
    const rows: CellVal[][] = payable.map(r => [
      r.enumeratorName, r.advancePaid, r.transportEarned, r.feesEarned, r.totalEarned,
      r.rowType === 'blue' ? r.totalEarned : r.netToPay,
      r.paymentDone ? 'Payment generated' : 'Pending',
    ]);
    const totRow: CellVal[] = [
      'TOTAL',
      payable.reduce((s, r) => s + r.advancePaid, 0),
      payable.reduce((s, r) => s + r.transportEarned, 0),
      payable.reduce((s, r) => s + r.feesEarned, 0),
      payable.reduce((s, r) => s + r.totalEarned, 0),
      payable.reduce((s, r) => s + (r.rowType === 'blue' ? r.totalEarned : r.netToPay), 0),
      '',
    ];
    buildSheet(wb, 'Payment Run', 'Cycle Close — Payment Run Sheet',
      `Cycle: ${cname}`, `Generated: ${now} · ${payable.length} payable enumerators`,
      headers, rows,
      { rowBgFn: (i) => ROW_TYPE_BG[payable[i]?.rowType] ?? C.rowW, totalsRow: totRow });
  }

  // ── Sheet 8: Override Log ─────────────────────────────────────────────────
  const overrideEntries = Object.entries(wizardState.overrides);
  if (overrideEntries.length > 0) {
    const headers = ['Check #', 'Check Name', 'Override By', 'Date / Time', 'Justification'];
    const rows: CellVal[][] = overrideEntries.map(([id, ov]) => [
      Number(id),
      checkResults.find(c => c.id === Number(id))?.label ?? `Check ${id}`,
      ov.by, new Date(ov.at).toLocaleString(), ov.justification,
    ]);
    buildSheet(wb, 'Override Log', 'Cycle Close — Override Log',
      `Cycle: ${cname}`, `Generated: ${now} · ${rows.length} override(s)`,
      headers, rows, { rowBgFn: () => C.amberR });
  }

  await saveWb(wb, `cycle-close-workbook-${cname}.xlsx`);
}
