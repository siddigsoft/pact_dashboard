import * as _XLSXStyleNS from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

const XLSXStyle: any = (_XLSXStyleNS as any).default ?? _XLSXStyleNS;

export interface ReportSiteRow {
  id: string;
  siteName: string;
  siteCode: string;
  locality: string;
  hub: string;
  cpName: string;
  activityType: string;
  status: string;
  statusCategory: 'verified' | 'in_progress' | 'returned' | 'rejected' | 'pending';
  coordinatorName: string;
  dataCollectorName: string;
  daysInCurrentStatus: number;
  planReceivedAt: string;
  dispatchedAt: string;
  acceptedAt: string;
  visitStartedAt: string;
  visitCompletedAt: string;
  verifiedAt: string;
  rejectedAt: string;
  dispatchedBy: string;
  acceptedByName: string;
  verifiedByName: string;
  advanceStatus: string;
  advanceRequested: number;
  advanceApproved: number;
  advancePaid: number;
  transportBudget: number;
  comments: string;
  nextStep: string;
  updatedAt: string;
}

export interface ReportCoordinatorRow {
  name: string;
  sitesAssigned: number;
  completed: number;
  inProgress: number;
  pending: number;
  returned: number;
  planReceivedAt: string;
  firstActionAt: string;
  lastActionAt: string;
  daysActive: number;
  staleSites: number;
  advancesIssued: number;
  totalAdvanceRequested: number;
}

export interface ReportCollectorRow {
  name: string;
  claimedSites: number;
  completedSites: number;
  inProgressSites: number;
  firstClaimAt: string;
  lastActivityAt: string;
  advancesRequested: number;
  advancesApproved: number;
  totalAmountRequested: number;
}

export interface ReportAuditRow {
  timestamp: string;
  siteName: string;
  actorName: string;
  action: string;
  description: string;
  fromStatus: string;
  toStatus: string;
}

export interface AttentionRow {
  category: string;
  siteName: string;
  locality: string;
  coordinator: string;
  dataCollector: string;
  detail: string;
  daysAffected: number;
}

export interface MmpReportData {
  mmpName: string;
  stateName: string;
  generatedBy: string;
  generatedAt: Date;
  sites: ReportSiteRow[];
  coordinators: ReportCoordinatorRow[];
  collectors: ReportCollectorRow[];
  auditLog: ReportAuditRow[];
  attentionItems: AttentionRow[];
  cycleSummary: {
    totalSites: number;
    verified: number;
    inProgress: number;
    pending: number;
    returned: number;
    rejected: number;
    coveragePct: number;
    noAdvance: number;
    totalAdvanceRequested: number;
    totalAdvanceApproved: number;
    totalAdvancePaid: number;
    activityTypeBreakdown: { type: string; count: number; verified: number }[];
  };
  cycleTimeline: { milestone: string; dateTime: string; doneBy: string }[];
}

// ── Style tokens ───────────────────────────────────────────────────────────────

const DARK_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '1e3a5f' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } },
};
const SUB_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '334155' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};
const TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: '1e3a5f' } },
  alignment: { horizontal: 'left' },
};
const META_STYLE = {
  font: { sz: 9, color: { rgb: '64748b' } },
  alignment: { horizontal: 'left' },
};
const LABEL_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: '374151' } },
  fill: { fgColor: { rgb: 'f1f5f9' } },
  alignment: { horizontal: 'right' },
};
const VALUE_STYLE = {
  font: { sz: 10, color: { rgb: '1f2937' } },
  alignment: { horizontal: 'left' },
};

const STATUS_FILL: Record<string, any> = {
  verified:    { fgColor: { rgb: 'd1fae5' } },
  in_progress: { fgColor: { rgb: 'dbeafe' } },
  pending:     { fgColor: { rgb: 'fef3c7' } },
  returned:    { fgColor: { rgb: 'ffedd5' } },
  rejected:    { fgColor: { rgb: 'fee2e2' } },
};
const ATTENTION_FILL: Record<string, any> = {
  'Stale Site':          { fgColor: { rgb: 'fff7ed' } },
  'Missing Advance':     { fgColor: { rgb: 'fef9c3' } },
  'Returned – Needs Re-dispatch': { fgColor: { rgb: 'ffedd5' } },
  'Rejected Site':       { fgColor: { rgb: 'fee2e2' } },
  'Unassigned Site':     { fgColor: { rgb: 'f3e8ff' } },
  'Pending Too Long':    { fgColor: { rgb: 'fce7f3' } },
};

function c(v: any, s?: any): any {
  const t = typeof v === 'number' ? 'n' : (v instanceof Date ? 'd' : 's');
  return s ? { v, t, s } : { v, t };
}
function d(raw: any): string {
  if (!raw) return '';
  try { return format(new Date(raw), 'yyyy-MM-dd HH:mm'); } catch { return String(raw); }
}
function dShort(raw: any): string {
  if (!raw) return '';
  try { return format(new Date(raw), 'MMM d, yyyy'); } catch { return ''; }
}
function mergeRange(ws: any, r1: number, c1: number, r2: number, c2: number) {
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}
function setW(ws: any, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}
function setR(ws: any, heights: { r: number; hpx: number }[]) {
  if (!ws['!rows']) ws['!rows'] = [];
  heights.forEach(({ r, hpx }) => { ws['!rows'][r] = { hpx }; });
}
function writeCell(ws: any, r: number, col: number, cell: any) {
  const addr = XLSXStyle.utils.encode_cell({ r, c: col });
  ws[addr] = cell;
}
function setRef(ws: any, maxR: number, maxC: number) {
  ws['!ref'] = XLSXStyle.utils.encode_range({ r: 0, c: 0 }, { r: maxR, c: maxC });
}

// ── Sheet 1: Summary ──────────────────────────────────────────────────────────

function buildSummarySheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  // Title block
  writeCell(ws, r, 0, c(`MMP Operational Report — ${data.stateName}`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 5); r++;
  writeCell(ws, r, 0, c(`MMP: ${data.mmpName}`, META_STYLE));
  mergeRange(ws, r, 0, r, 5); r++;
  writeCell(ws, r, 0, c(`Generated: ${d(data.generatedAt)} by ${data.generatedBy}`, META_STYLE));
  mergeRange(ws, r, 0, r, 5); r++;
  r++; // blank

  // Coverage dashboard
  writeCell(ws, r, 0, c('COVERAGE DASHBOARD', { ...DARK_HEADER, alignment: { horizontal: 'left' } }));
  mergeRange(ws, r, 0, r, 5); r++;

  const coverRows = [
    ['Total Sites in State',   data.cycleSummary.totalSites,   'Coverage %',         `${data.cycleSummary.coveragePct}%`],
    ['Verified / Approved',    data.cycleSummary.verified,     'Missing Advances',   data.cycleSummary.noAdvance],
    ['In Progress',            data.cycleSummary.inProgress,   'Total Adv. Requested (SDG)', data.cycleSummary.totalAdvanceRequested],
    ['Pending / Not Started',  data.cycleSummary.pending,      'Total Adv. Approved (SDG)',  data.cycleSummary.totalAdvanceApproved],
    ['Returned',               data.cycleSummary.returned,     'Total Adv. Paid (SDG)',      data.cycleSummary.totalAdvancePaid],
    ['Rejected',               data.cycleSummary.rejected,     '', ''],
  ];
  coverRows.forEach(([l1, v1, l2, v2]) => {
    writeCell(ws, r, 0, c(l1, LABEL_STYLE));
    writeCell(ws, r, 1, c(v1, VALUE_STYLE));
    writeCell(ws, r, 2, c('', {}));
    writeCell(ws, r, 3, c(l2, LABEL_STYLE));
    writeCell(ws, r, 4, c(v2, VALUE_STYLE));
    r++;
  });
  r++;

  // Activity Type Breakdown
  if (data.cycleSummary.activityTypeBreakdown.length > 0) {
    writeCell(ws, r, 0, c('ACTIVITY TYPE BREAKDOWN', { ...DARK_HEADER, alignment: { horizontal: 'left' } }));
    mergeRange(ws, r, 0, r, 5); r++;
    const atHeaders = ['Activity Type', 'Total Sites', 'Verified', 'Coverage %'];
    atHeaders.forEach((h, i) => writeCell(ws, r, i, c(h, SUB_HEADER)));
    r++;
    data.cycleSummary.activityTypeBreakdown.forEach(({ type, count, verified }) => {
      const pct = count > 0 ? `${Math.round((verified / count) * 100)}%` : '0%';
      writeCell(ws, r, 0, c(type,      VALUE_STYLE));
      writeCell(ws, r, 1, c(count,     VALUE_STYLE));
      writeCell(ws, r, 2, c(verified,  VALUE_STYLE));
      writeCell(ws, r, 3, c(pct,       VALUE_STYLE));
      r++;
    });
    r++;
  }

  // Cycle timeline
  writeCell(ws, r, 0, c('CYCLE TIMELINE', { ...DARK_HEADER, alignment: { horizontal: 'left' } }));
  mergeRange(ws, r, 0, r, 5); r++;

  const tlHeaders = ['Milestone', 'Date & Time', 'Done By'];
  tlHeaders.forEach((h, i) => writeCell(ws, r, i, c(h, SUB_HEADER)));
  r++;
  data.cycleTimeline.forEach(tl => {
    writeCell(ws, r, 0, c(tl.milestone, VALUE_STYLE));
    writeCell(ws, r, 1, c(tl.dateTime,  VALUE_STYLE));
    writeCell(ws, r, 2, c(tl.doneBy,    VALUE_STYLE));
    r++;
  });

  setRef(ws, r, 5);
  setW(ws, [38, 20, 14, 36, 20, 14]);
  setR(ws, [{ r: 0, hpx: 24 }]);
  return ws;
}

// ── Sheet 2: Coordinators ─────────────────────────────────────────────────────

function buildCoordinatorsSheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  writeCell(ws, r, 0, c(`Coordinator Activity — ${data.stateName}`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 13); r++;
  r++;

  const headers = [
    '#', 'Coordinator Name', 'Assigned', 'Completed', 'In Progress', 'Pending',
    'Returned', 'Plan Received At', 'First Action At', 'Last Action At',
    'Days Active', 'Stale Sites', 'Advances Issued', 'Total Adv. Requested (SDG)',
  ];
  headers.forEach((h, i) => writeCell(ws, r, i, c(h, DARK_HEADER)));
  r++;

  data.coordinators.forEach((coord, idx) => {
    const row = [
      idx + 1, coord.name, coord.sitesAssigned, coord.completed,
      coord.inProgress, coord.pending, coord.returned,
      coord.planReceivedAt, coord.firstActionAt, coord.lastActionAt,
      coord.daysActive, coord.staleSites, coord.advancesIssued, coord.totalAdvanceRequested,
    ];
    const stale = coord.staleSites > 0;
    const fill = stale ? { fgColor: { rgb: 'fff7ed' } } : (idx % 2 === 0 ? { fgColor: { rgb: 'f8fafc' } } : { fgColor: { rgb: 'ffffff' } });
    row.forEach((v, i) => writeCell(ws, r, i, c(v, { font: { sz: 10 }, fill, alignment: { horizontal: i > 1 ? 'center' : 'left' } })));
    r++;
  });

  setRef(ws, r, headers.length - 1);
  setW(ws, [4, 28, 10, 12, 12, 10, 10, 18, 18, 18, 12, 12, 14, 22]);
  return ws;
}

// ── Sheet 3: Data Collectors ──────────────────────────────────────────────────

function buildCollectorsSheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  writeCell(ws, r, 0, c(`Data Collector Activity — ${data.stateName}`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 8); r++;
  r++;

  const headers = [
    '#', 'Collector Name', 'Claimed Sites', 'Completed', 'In Progress',
    'First Claim At', 'Last Activity At', 'Advances Requested', 'Total Amt. Requested (SDG)',
  ];
  headers.forEach((h, i) => writeCell(ws, r, i, c(h, DARK_HEADER)));
  r++;

  if (data.collectors.length === 0) {
    writeCell(ws, r, 0, c('No data collector activity recorded for this state.', META_STYLE));
    mergeRange(ws, r, 0, r, 8);
    r++;
  } else {
    data.collectors.forEach((col, idx) => {
      const row = [
        idx + 1, col.name, col.claimedSites, col.completedSites,
        col.inProgressSites, col.firstClaimAt, col.lastActivityAt,
        col.advancesRequested, col.totalAmountRequested,
      ];
      const fill = idx % 2 === 0 ? { fgColor: { rgb: 'f8fafc' } } : { fgColor: { rgb: 'ffffff' } };
      row.forEach((v, i) => writeCell(ws, r, i, c(v, { font: { sz: 10 }, fill, alignment: { horizontal: i > 1 ? 'center' : 'left' } })));
      r++;
    });
  }

  setRef(ws, r, headers.length - 1);
  setW(ws, [4, 30, 14, 12, 12, 18, 18, 18, 24]);
  return ws;
}

// ── Sheet 4: All Sites ────────────────────────────────────────────────────────

function buildAllSitesSheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  writeCell(ws, r, 0, c(`All Sites — ${data.stateName} (A→Z)`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 18); r++;
  r++;

  const headers = [
    '#', 'Site Name', 'Site Code', 'Locality', 'Hub', 'CP Name',
    'Status', 'Coordinator', 'Data Collector', 'Days in Status',
    'Plan Received', 'Dispatched', 'Accepted', 'Visit Started', 'Completed/Verified',
    'Advance Status', 'Adv. Requested', 'Adv. Approved', 'Next Step',
  ];
  headers.forEach((h, i) => writeCell(ws, r, i, c(h, DARK_HEADER)));
  r++;

  const sorted = [...data.sites].sort((a, b) => a.siteName.localeCompare(b.siteName));
  sorted.forEach((site, idx) => {
    const fill = STATUS_FILL[site.statusCategory] || (idx % 2 === 0 ? { fgColor: { rgb: 'f8fafc' } } : { fgColor: { rgb: 'ffffff' } });
    const row = [
      idx + 1, site.siteName, site.siteCode, site.locality, site.hub, site.cpName,
      site.status, site.coordinatorName, site.dataCollectorName, site.daysInCurrentStatus,
      site.planReceivedAt, site.dispatchedAt, site.acceptedAt, site.visitStartedAt,
      site.verifiedAt || site.visitCompletedAt,
      site.advanceStatus || '—', site.advanceRequested || 0, site.advanceApproved || 0,
      site.nextStep,
    ];
    row.forEach((v, i) => writeCell(ws, r, i, c(v, { font: { sz: 9 }, fill, alignment: { horizontal: i > 1 ? 'center' : 'left', wrapText: i === 18 } })));
    r++;
  });

  setRef(ws, r, headers.length - 1);
  setW(ws, [4, 30, 14, 20, 18, 22, 18, 26, 26, 14, 16, 16, 16, 16, 18, 16, 16, 16, 30]);
  return ws;
}

// ── Sheet 5: Attention Items ──────────────────────────────────────────────────

function buildAttentionSheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  writeCell(ws, r, 0, c(`Attention Items — ${data.stateName}`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 6); r++;
  writeCell(ws, r, 0, c(`Auto-flagged items requiring action as of ${dShort(data.generatedAt)}`, META_STYLE));
  mergeRange(ws, r, 0, r, 6); r++;
  r++;

  const headers = ['#', 'Category', 'Site Name', 'Locality', 'Coordinator', 'Data Collector', 'Detail / Action Required', 'Days Affected'];
  headers.forEach((h, i) => writeCell(ws, r, i, c(h, DARK_HEADER)));
  r++;

  if (data.attentionItems.length === 0) {
    writeCell(ws, r, 0, c('No attention items flagged — all sites are on track.', { font: { sz: 10, color: { rgb: '16a34a' }, bold: true } }));
    mergeRange(ws, r, 0, r, 7); r++;
  } else {
    data.attentionItems.forEach((item, idx) => {
      const fill = ATTENTION_FILL[item.category] || { fgColor: { rgb: 'f8fafc' } };
      const row = [idx + 1, item.category, item.siteName, item.locality, item.coordinator, item.dataCollector, item.detail, item.daysAffected];
      row.forEach((v, i) => writeCell(ws, r, i, c(v, { font: { sz: 10 }, fill, alignment: { horizontal: i > 1 && i !== 6 ? 'center' : 'left', wrapText: i === 6 } })));
      r++;
    });
  }

  setRef(ws, r, headers.length - 1);
  setW(ws, [4, 26, 30, 20, 26, 26, 40, 12]);
  return ws;
}

// ── Sheet 6: Audit Log ────────────────────────────────────────────────────────

function buildAuditSheet(data: MmpReportData): any {
  const ws: any = {};
  let r = 0;

  writeCell(ws, r, 0, c(`Full Audit Log — ${data.stateName}`, TITLE_STYLE));
  mergeRange(ws, r, 0, r, 5); r++;
  writeCell(ws, r, 0, c(`${data.auditLog.length} events recorded`, META_STYLE));
  mergeRange(ws, r, 0, r, 5); r++;
  r++;

  const headers = ['Timestamp', 'Site Name', 'Changed By', 'Action', 'From Status', 'To Status', 'Description'];
  headers.forEach((h, i) => writeCell(ws, r, i, c(h, DARK_HEADER)));
  r++;

  data.auditLog.forEach((log, idx) => {
    const fill = idx % 2 === 0 ? { fgColor: { rgb: 'f8fafc' } } : { fgColor: { rgb: 'ffffff' } };
    const row = [log.timestamp, log.siteName, log.actorName, log.action, log.fromStatus, log.toStatus, log.description];
    row.forEach((v, i) => writeCell(ws, r, i, c(v, { font: { sz: 9 }, fill, alignment: { horizontal: i > 0 && i !== 6 ? 'center' : 'left', wrapText: i === 6 } })));
    r++;
  });

  setRef(ws, r, headers.length - 1);
  setW(ws, [18, 30, 26, 20, 18, 18, 50]);
  return ws;
}

// ── Main export function ──────────────────────────────────────────────────────

export function exportMmpStateReport(data: MmpReportData): void {
  const wb = XLSXStyle.utils.book_new();

  XLSXStyle.utils.book_append_sheet(wb, buildSummarySheet(data),      'Summary');
  XLSXStyle.utils.book_append_sheet(wb, buildCoordinatorsSheet(data),  'Coordinators');
  XLSXStyle.utils.book_append_sheet(wb, buildCollectorsSheet(data),    'Data Collectors');
  XLSXStyle.utils.book_append_sheet(wb, buildAllSitesSheet(data),      'All Sites');
  XLSXStyle.utils.book_append_sheet(wb, buildAttentionSheet(data),     'Attention Items');
  XLSXStyle.utils.book_append_sheet(wb, buildAuditSheet(data),         'Audit Log');

  const safeName  = data.stateName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = format(data.generatedAt, 'yyyy-MM-dd');
  const filename  = `MMP_Operational_Report_${safeName}_${timestamp}.xlsx`;

  const buf: ArrayBuffer = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), filename);
}
