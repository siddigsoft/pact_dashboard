import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  RotateCcw, RefreshCw, AlertTriangle, CheckCircle2, Lock,
  Download, FileText, ChevronRight, DollarSign, ArrowRight,
  Calendar, Plus, Banknote, Shuffle, Upload, X,
  ExternalLink, ChevronDown, History, Trash2, AlertCircle,
  Info, Receipt, User, Clock, FileSpreadsheet, Hash, Loader2,
  UserPlus, Filter, Search, MapPin, ClipboardList, Link2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

/** Fetch ALL rows from a Supabase query — auto-paginates 1000 rows at a time. */
async function fetchAll<T = any>(queryFn: () => any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Batched .in() fetch — splits large ID lists into 500-ID chunks. */
async function fetchAllIn<T = any>(queryFn: (chunk: string[]) => any, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const CHUNK = 500;
  const batches: Promise<T[]>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    batches.push(fetchAll<T>(() => queryFn(ids.slice(i, i + CHUNK))));
  }
  return (await Promise.all(batches)).flat();
}
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { exportStandardExcel } from '@/utils/standardExcelExport';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { FilePreviewDialog } from '@/components/ui/FilePreviewDialog';
import { Checkbox } from '@/components/ui/checkbox';

interface PreFundSummary {
  id: string; name: string; source: string | null; currency: string;
  amount: number; available_balance: number; committed_amount: number; paid_amount: number;
  status: string; start_date: string | null; end_date: string | null;
}
interface PreFundTransaction {
  id: string; pre_fund_request_id: string; transaction_type: string;
  amount: number; currency: string; reference: string | null; description: string | null;
  transaction_date: string; reconciled: boolean; reconciled_at: string | null;
  source_table: string | null; source_id: string | null; created_at: string;
  user_id: string | null; created_by: string | null; receipt_url: string | null;
  gl_journal_entry_id: string | null;
}
interface Reconciliation {
  id: string; pre_fund_request_id: string; period_start: string | null; period_end: string | null;
  total_funded: number; total_paid: number; total_committed: number; variance: number;
  surplus_action: string; carry_forward_amount: number; return_amount: number; reserve_amount: number;
  status: string; closed_at: string | null; pdf_url: string | null; notes: string | null;
}

interface ReconciliationFilterMetadata {
  state: string | null;
  mmpId: string | null;
  mmpName: string | null;
  people: string[];
}

const FILTER_ALL = '__all__';
const FILTER_UNASSIGNED = '__unassigned__';

interface PaidOutBreakdown {
  downPayments: number;
  costSubmissions: number;
  other: number;
  total: number;
}

function getPaidOutBreakdown(transactions: PreFundTransaction[]): PaidOutBreakdown {
  const paidEvents = transactions.filter(t => ['payment', 'reversal', 'return'].includes(t.transaction_type));
  const signedAmount = (transaction: PreFundTransaction) =>
    ['reversal', 'return'].includes(transaction.transaction_type) ? -transaction.amount : transaction.amount;
  const downPayments = paidEvents
    .filter(t => t.source_table === 'down_payment_requests')
    .reduce((sum, t) => sum + signedAmount(t), 0);
  const costSubmissions = paidEvents
    .filter(t => t.source_table === 'operational_cost_submissions')
    .reduce((sum, t) => sum + signedAmount(t), 0);
  const other = paidEvents
    .filter(t => !t.source_table || !['down_payment_requests', 'operational_cost_submissions'].includes(t.source_table))
    .reduce((sum, t) => sum + signedAmount(t), 0);
  return { downPayments, costSubmissions, other, total: downPayments + costSubmissions + other };
}

interface ExceptionQueueItem {
  exception_key: string;
  exception_type: string;
  fund_id?: string | null;
  source_table: string | null;
  source_description: string | null;
  source_status: string | null;
  historic_amount: number | null;
  current_paid_amount: number | null;
  unmatched_amount: number | null;
  resolution: string | null;
  currency?: string | null;
}

interface UnlinkedPayment {
  id: string;
  _source: 'operational_cost_submissions' | 'down_payment_requests' | 'mmp_site_entries';
  _category: 'ocs' | 'dp' | 'ef';
  _date: string | null;
  amount: number;
  paidAmount: number;
  coveredAmount: number;
  currency: string;
  title: string;
  userId: string | null;
  submitterName: string | null;
  sourceStatus: string | null;
  state: string | null;
  mmpName: string | null;
}

type UnlinkedPaymentGroups = {
  ocs: UnlinkedPayment[];
  dp: UnlinkedPayment[];
  ef: UnlinkedPayment[];
};

interface LinkedPaymentFinderResult {
  event_id: string;
  original_payment_event_id: string;
  reversal_of_id: string | null;
  event_type: 'payment' | 'reversal';
  link_status: 'active' | 'reversed' | 'reversal';
  fund_id: string;
  fund_name: string;
  amount: number;
  currency: string;
  payment_date: string | null;
  occurred_at: string | null;
  reference: string | null;
  description: string | null;
  receipt_url: string | null;
  source_table: string | null;
  source_id: string | null;
  source_title: string | null;
  source_status: string | null;
  submitter_id: string | null;
  submitter_name: string | null;
  event_user_id: string | null;
  event_user_name: string | null;
  event_created_by: string | null;
  event_created_by_name: string | null;
}

const TXN_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  receipt:       { label: 'Receipt',        color: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  commitment:    { label: 'Commitment',     color: 'text-violet-700',  bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  payment:       { label: 'Payment',        color: 'text-sky-700',     bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800' },
  reversal:      { label: 'Reversal',       color: 'text-orange-700',  bg: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  carry_forward: { label: 'Carry-Forward',  color: 'text-indigo-700',  bg: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  return:        { label: 'Return',         color: 'text-rose-700',    bg: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  adjustment:    { label: 'Adjustment',     color: 'text-amber-700',   bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
};

// Organised field layout for known source tables inside the drill-down modal
const SOURCE_SECTIONS: Record<string, Array<{ label: string; keys: string[] }>> = {
  down_payment_requests: [
    { label: 'Site & Request',   keys: ['site_name','mmp_site_entry_id','requested_by','requested_at','requester_role','status'] },
    { label: 'Financial',        keys: ['total_transportation_budget','requested_amount','payment_type','installment_plan','paid_installments','amount_per_installment'] },
    { label: 'Hub',              keys: ['hub_id','hub_name','locality','state_name'] },
    { label: 'Notes & Docs',     keys: ['justification','notes','rejection_reason','supporting_documents'] },
  ],
  operational_cost_submissions: [
    { label: 'Request',          keys: ['title','expense_category','submitted_by','submitted_at','status','hub_id','hub_name'] },
    { label: 'Financial',        keys: ['total_amount','approved_amount','currency','payment_method'] },
    { label: 'Notes & Docs',     keys: ['description','notes','rejection_reason','supporting_documents'] },
  ],
};

function getInitials(name: string | null | undefined): string {
  return (name?.trim() || '?').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
}

// Hue derived from first char so each person gets a consistent colour
const AVATAR_COLORS = [
  'bg-blue-600','bg-violet-600','bg-emerald-600','bg-rose-600',
  'bg-amber-600','bg-cyan-600','bg-indigo-600','bg-pink-600',
];
function avatarColor(name: string | null | undefined): string {
  const c = (name?.trim() || '?').charCodeAt(0) || 0;
  return AVATAR_COLORS[c % AVATAR_COLORS.length];
}

function datePart(value: unknown): string {
  return typeof value === 'string' && value ? value.split('T')[0] : '';
}

function formatIsoDate(value: unknown, pattern: string, fallback = '—'): string {
  if (typeof value !== 'string' || !value) return fallback;

  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? fallback : format(parsed, pattern);
  } catch {
    return fallback;
  }
}

const SURPLUS_OPTIONS = [
  { value: 'carry_forward',    label: 'Carry Full Surplus to Next Period' },
  { value: 'return',           label: 'Return to Donor' },
  { value: 'return_bank',      label: 'Return to Bank Account' },
  { value: 'return_finance',   label: 'Return to Finance Department' },
  { value: 'split',            label: 'Split (Partial Carry + Return)' },
  { value: 'reserve',          label: 'Leave in Reserve' },
];

// ── PDF colour constants ──────────────────────────────────────────────────────
const NAVY: [number, number, number]      = [15, 32, 65];
const NAVY_LIGHT: [number, number, number] = [30, 58, 138];
const WHITE: [number, number, number]      = [255, 255, 255];
const GREY_BG: [number, number, number]    = [248, 250, 252];

interface ApprovalStepRow {
  step_no: number;
  label: string;
  assigned_name: string;
  status: string;
  decided_at: string | null;
}
interface GlEntryRow {
  event_type: string;
  posting_date: string;
  description_en: string;
  entry_no: string | null;
  status: string;
}

function addPdfHeader(doc: jsPDF, title: string, subtitle: string) {
  // Navy header bar
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text('PACT Command Center', 15, 11);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(title, 15, 18);
  doc.setFontSize(8);
  doc.text(subtitle, 15, 24);
  doc.setTextColor(0, 0, 0);
}

function addPdfFooter(doc: jsPDF, pageCount: number) {
  const now = format(new Date(), 'MMM d, yyyy HH:mm');
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...NAVY);
    doc.rect(0, 287, 210, 10, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...WHITE);
    doc.text(`PACT Command Center — Confidential`, 15, 293);
    doc.text(`Generated: ${now}`, 105, 293, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, 195, 293, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}

function sectionHeader(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...GREY_BG);
  doc.rect(13, y - 4, 184, 7, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_LIGHT);
  doc.text(text, 15, y);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

async function generateReconciliationPDF(
  fund: PreFundSummary,
  transactions: PreFundTransaction[],
  recon: Partial<Reconciliation>,
  approvalSteps: ApprovalStepRow[],
  glEntries: GlEntryRow[],
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const period = fund.start_date && fund.end_date
    ? `${formatIsoDate(fund.start_date, 'MMM d, yyyy')} – ${formatIsoDate(fund.end_date, 'MMM d, yyyy')}`
    : '—';

  addPdfHeader(doc, 'Pre-Fund Reconciliation Report', `${fund.name}  ·  ${period}`);

  let y = 36;

  // ── Fund details ──────────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Fund Details', y);
  const details: [string, string][] = [
    ['Fund Name', fund.name],
    ['Source / Donor', fund.source ?? '—'],
    ['Currency', fund.currency],
    ['Total Amount', `${fund.currency} ${formatNumber(fund.amount, 0)}`],
    ['Period', period],
    ['Status', fund.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
    ['Close Action', recon.surplus_action ? recon.surplus_action.replace(/_/g, ' ') : '—'],
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  details.forEach(([k, v]) => { doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, 15, y); doc.setFont('helvetica', 'normal'); doc.text(v, 65, y); y += 5.5; });
  y += 4;

  // ── Financial summary ─────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Financial Summary', y);
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Currency', 'Amount']],
    body: [
      ['Total Funded',       fund.currency, formatNumber(fund.amount, 0)],
      ['Total Paid Out',     fund.currency, formatNumber(fund.paid_amount, 0)],
      ['Total Committed',    fund.currency, formatNumber(fund.committed_amount, 0)],
      ['Available Balance',  fund.currency, formatNumber(fund.available_balance, 0)],
      ['Period Variance',    fund.currency, formatNumber(recon.variance ?? 0, 0)],
      ...(recon.carry_forward_amount ? [['Carry Forward', fund.currency, formatNumber(recon.carry_forward_amount, 0)]] : []),
      ...(recon.return_amount ? [['Returned to Source', fund.currency, formatNumber(recon.return_amount, 0)]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: { 2: { halign: 'right' } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Transactions ──────────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Transactions', y);
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Type', 'Reference', 'Description', `Amount (${fund.currency})`, 'Reconciled']],
    body: transactions.map(t => [
      formatIsoDate(t.transaction_date, 'MMM d, yyyy'),
      TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type,
      t.reference ?? '—',
      t.description ?? '—',
      formatNumber(t.amount, 0),
      t.reconciled ? '✓' : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'center' } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── GL Journal Trail ──────────────────────────────────────────────────────
  if (glEntries.length > 0) {
    if (y > 240) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, 'GL Journal Entries Posted', y);
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Event', 'Description', 'Entry No.', 'Status']],
      body: glEntries.map(e => [
        e.posting_date,
        e.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        e.description_en,
        e.entry_no ?? '—',
        e.status.replace(/\b\w/g, c => c.toUpperCase()),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: GREY_BG },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Approval Chain ────────────────────────────────────────────────────────
  if (approvalSteps.length > 0) {
    if (y > 240) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, 'Approval Chain', y);
    autoTable(doc, {
      startY: y,
      head: [['Step', 'Role / Label', 'Approver', 'Decision', 'Date']],
      body: approvalSteps.map(s => [
        String(s.step_no),
        s.label,
        s.assigned_name,
        s.status.replace(/\b\w/g, c => c.toUpperCase()),
        s.decided_at ? formatIsoDate(s.decided_at, 'MMM d, yyyy HH:mm') : '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: GREY_BG },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw ?? '');
          if (val.toLowerCase() === 'approved') data.cell.styles.textColor = [5, 150, 105];
          else if (val.toLowerCase() === 'rejected') data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
  }

  // Footer on all pages
  addPdfFooter(doc, (doc as any).internal.getNumberOfPages());

  const filename = `PreFund-Reconciliation-${fund.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

async function generateDonorStatementPDF(
  fund: PreFundSummary,
  transactions: PreFundTransaction[],
  approvalSteps: ApprovalStepRow[],
  categoryMap?: Map<string, string>,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const period = fund.start_date && fund.end_date
    ? `${formatIsoDate(fund.start_date, 'MMM d, yyyy')} – ${formatIsoDate(fund.end_date, 'MMM d, yyyy')}`
    : '—';

  addPdfHeader(doc, 'Donor Pre-Fund Statement', `${fund.name}  ·  ${period}`);

  let y = 36;

  // ── Fund information ──────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Fund Information', y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const info: [string, string][] = [
    ['Fund', fund.name],
    ['Donor / Source', fund.source ?? '—'],
    ['Currency', fund.currency],
    ['Reporting Period', period],
    ['Fund Status', fund.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
  ];
  info.forEach(([k, v]) => { doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, 15, y); doc.setFont('helvetica', 'normal'); doc.text(v, 65, y); y += 5.5; });
  y += 4;

  // ── Utilisation summary ───────────────────────────────────────────────────
  y = sectionHeader(doc, 'Fund Utilisation', y);
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: [
      ['Total Amount Received',  `${fund.currency} ${formatNumber(fund.amount, 0)}`],
      ['Total Disbursed',        `${fund.currency} ${formatNumber(fund.paid_amount, 0)}`],
      ['Total Committed',        `${fund.currency} ${formatNumber(fund.committed_amount, 0)}`],
      ['Remaining Balance',      `${fund.currency} ${formatNumber(fund.available_balance, 0)}`],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: { 1: { halign: 'right' } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Transactions grouped by type (enhanced for donors) ───────────────────
  const typeGroups: Record<string, PreFundTransaction[]> = {};
  transactions.forEach(t => {
    if (!typeGroups[t.transaction_type]) typeGroups[t.transaction_type] = [];
    typeGroups[t.transaction_type].push(t);
  });
  const typeOrder = ['receipt','payment','commitment','carry_forward','return','reversal','adjustment'];
  const sortedTypes = typeOrder.filter(k => typeGroups[k]?.length);
  const typeSummary: [string, string, string][] = [];

  for (const txType of sortedTypes) {
    const group = typeGroups[txType];
    const label = (TXN_TYPE_CFG[txType]?.label ?? txType).toUpperCase();
    const subtotal = group.reduce((s, t) => s + t.amount, 0);
    typeSummary.push([label, `${group.length} transactions`, `${fund.currency} ${formatNumber(subtotal, 0)}`]);

    if (y > 230) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, `${TXN_TYPE_CFG[txType]?.label ?? txType} Detail`, y);
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Reference', 'Description', `Amount (${fund.currency})`]],
      body: group.map(t => [
        formatIsoDate(t.transaction_date, 'MMM d, yyyy'),
        t.reference ?? '—',
        t.description ?? '—',
        formatNumber(t.amount, 0),
      ]),
      foot: [[{ content: `${label} SUBTOTAL`, colSpan: 3, styles: { fontStyle: 'bold' } }, { content: formatNumber(subtotal, 0), styles: { fontStyle: 'bold', halign: 'right' } }]],
      showFoot: 'lastPage',
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      footStyles: { fillColor: GREY_BG, textColor: NAVY_LIGHT },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Summary by transaction type ───────────────────────────────────────────
  if (typeSummary.length > 1) {
    if (y > 230) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, 'Summary by Transaction Type', y);
    autoTable(doc, {
      startY: y,
      head: [['Type', 'Count', 'Total Amount']],
      body: typeSummary,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: { 2: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Expenditure by cost category (from source OCS records) ───────────────
  if (categoryMap && categoryMap.size > 0) {
    const catPayments = transactions.filter(t =>
      t.transaction_type === 'payment' && t.source_id && categoryMap.has(t.source_id)
    );
    if (catPayments.length > 0) {
      const catGroups: Record<string, { txns: PreFundTransaction[]; total: number }> = {};
      catPayments.forEach(t => {
        const cat = categoryMap.get(t.source_id!) ?? 'General';
        if (!catGroups[cat]) catGroups[cat] = { txns: [], total: 0 };
        catGroups[cat].txns.push(t);
        catGroups[cat].total += t.amount;
      });
      const grandTotal = catPayments.reduce((s, t) => s + t.amount, 0);

      if (y > 230) { doc.addPage(); y = 36; }
      y = sectionHeader(doc, 'Expenditure by Category', y);
      autoTable(doc, {
        startY: y,
        head: [['Cost Category', 'Transactions', `Amount (${fund.currency})`, '% of Total']],
        body: Object.entries(catGroups)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([cat, g]) => [
            cat,
            String(g.txns.length),
            formatNumber(g.total, 0),
            grandTotal > 0 ? `${Math.round((g.total / grandTotal) * 100)}%` : '—',
          ]),
        foot: [['TOTAL', String(catPayments.length), formatNumber(grandTotal, 0), '100%']],
        showFoot: 'lastPage',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
        footStyles: { fillColor: GREY_BG, textColor: NAVY_LIGHT, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GREY_BG },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // ── Approval signatories ──────────────────────────────────────────────────
  if (approvalSteps.length > 0) {
    if (y > 230) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, 'Approval Signatories', y);
    autoTable(doc, {
      startY: y,
      head: [['Step', 'Role', 'Signatory', 'Decision', 'Date']],
      body: approvalSteps.filter(s => s.status === 'approved').map(s => [
        String(s.step_no),
        s.label,
        s.assigned_name,
        'Approved',
        s.decided_at ? formatIsoDate(s.decided_at, 'MMM d, yyyy') : '—',
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: { 3: { textColor: [5, 150, 105] as [number,number,number] } },
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    // Signature blocks for approved steps
    if (y > 240) { doc.addPage(); y = 36; }
    y = sectionHeader(doc, 'Signatures', y);
    y += 4;
    const sigCols = Math.min(3, approvalSteps.filter(s => s.status === 'approved').length);
    const approved = approvalSteps.filter(s => s.status === 'approved');
    const colW = 58;
    approved.forEach((s, i) => {
      const x = 15 + (i % sigCols) * (colW + 5);
      if (i > 0 && i % sigCols === 0) y += 28;
      doc.setDrawColor(180, 180, 180);
      doc.line(x, y + 14, x + colW, y + 14);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(s.assigned_name, x, y + 18);
      doc.setFont('helvetica', 'normal');
      doc.text(s.label, x, y + 22);
      doc.text(s.decided_at ? formatIsoDate(s.decided_at, 'MMM d, yyyy') : '—', x, y + 26);
    });
    y += 34;
  }

  addPdfFooter(doc, (doc as any).internal.getNumberOfPages());

  const filename = `Donor-Statement-${fund.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

// ── Excel Reconciliation Export ───────────────────────────────────────────
async function handleExportReconciliationExcel(
  fund: PreFundSummary,
  transactions: PreFundTransaction[],
  profileMap: Map<string, string>,
  reconciliations: Reconciliation[],
) {
  const period = fund.start_date && fund.end_date
    ? `${formatIsoDate(fund.start_date, 'MMM d, yyyy')} – ${formatIsoDate(fund.end_date, 'MMM d, yyyy')}`
    : '—';
  const paidOutBreakdown = getPaidOutBreakdown(transactions);
  const breakdownRows: (string | number)[][] = [
    ['Category', `Total Paid Out (${fund.currency})`],
    ['Down Payments', paidOutBreakdown.downPayments],
    ['Cost Submissions', paidOutBreakdown.costSubmissions],
    ...(paidOutBreakdown.other !== 0
      ? [['Other', paidOutBreakdown.other] as (string | number)[]]
      : []),
    ['Total Paid Out by Category', paidOutBreakdown.total],
  ];

  await exportStandardExcel({
    reportTitle: 'PACT Command Center - Pre-Fund Reconciliation Report',
    subtitleLine: `Fund: ${fund.name} | Donor: ${fund.source ?? '—'} | Period: ${period} | Generated: ${format(new Date(), 'PPP p')}`,
    metaLine: `Total Funded: ${fund.currency} ${formatNumber(fund.amount, 0)} | Available: ${fund.currency} ${formatNumber(fund.available_balance, 0)}`,
    filenamePrefix: `PreFund-Recon-${fund.name.replace(/\s+/g, '-')}`,
    mainSheet: {
      sheetName: 'Transactions',
      headers: [
        'Date', 'Created At', 'Type', 'Reference', 'Description',
        'Source Module', 'Source Record ID',
        `Amount (${fund.currency})`, 'Reconciled', 'Reconciled At',
        'Paid By (User)', 'Recorded By',
        'Receipt URL', 'GL Journal Entry'
      ],
      rows: transactions.map(t => [
        t.transaction_date,
        t.created_at ? formatIsoDate(t.created_at, 'yyyy-MM-dd HH:mm:ss') : '—',
        TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type,
        t.reference ?? '—',
        t.description ?? '—',
        t.source_table ? t.source_table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—',
        t.source_id ?? '—',
        t.amount,
        t.reconciled ? 'Yes' : 'No',
        t.reconciled_at ? formatIsoDate(t.reconciled_at, 'yyyy-MM-dd HH:mm:ss') : '—',
        t.user_id ? (profileMap.get(t.user_id) ?? t.user_id) : '—',
        t.created_by ? (profileMap.get(t.created_by) ?? t.created_by) : '—',
        t.receipt_url ?? '—',
        t.gl_journal_entry_id ?? '—',
      ]),
      colWidths: {
        0: 12, 1: 20, 2: 14, 3: 18, 4: 36, 5: 26, 6: 38, 7: 16, 8: 10, 9: 20, 10: 24, 11: 24, 12: 54, 13: 38
      }
    },
    summarySheet: {
      title: 'Fund Summary',
      rows: [
        ['Fund Name', fund.name],
        ['Donor / Source', fund.source ?? '—'],
        ['Currency', fund.currency],
        ['Reporting Period', period],
        ['Status', fund.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
        [],
        ['FINANCIAL SUMMARY'],
        ['Total Funded', fund.amount],
        ['Total Paid Out', fund.paid_amount],
        ['Total Committed', fund.committed_amount],
        ['Available Balance', fund.available_balance],
         [],
         ['PAID-OUT BREAKDOWN'],
         ...breakdownRows,
      ]
    },
    breakdownSheets: reconciliations.length > 0 ? [
      {
        title: 'Reconciliation History',
        sheetName: 'Reconciliation History',
        headers: ['Period Start', 'Period End', 'Closed At', 'Total Funded', 'Total Paid', 'Total Committed', 'Variance', 'Surplus Action', 'Carry Forward', 'Returned', 'Notes'],
        rows: reconciliations.map(r => [
          r.period_start ?? '—',
          r.period_end ?? '—',
          r.closed_at ? formatIsoDate(r.closed_at, 'yyyy-MM-dd HH:mm:ss') : '—',
          r.total_funded ?? 0,
          r.total_paid ?? 0,
          r.total_committed ?? 0,
          r.variance ?? 0,
          r.surplus_action?.replace(/_/g, ' ') ?? '—',
          r.carry_forward_amount ?? 0,
          r.return_amount ?? 0,
          r.notes ?? '—',
        ])
      }
    ] : []
  });
}

async function uploadPdfToStorage(blob: Blob, filename: string, fundId: string): Promise<string | null> {
  const path = `pre-fund-pdfs/${fundId}/${filename}`;
  const { error } = await supabase.storage.from('financial-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('financial-documents').getPublicUrl(path);
  return data.publicUrl ?? null;
}

export default function PreFundingReconciliation() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const isCD = hasAnyRole(['countryDirector']);
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']) || isCD;
  const canManageExceptions = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]             = useState<PreFundSummary[]>([]);
  const [fundsComputedAvail, setFundsComputedAvail] = useState<Map<string, number>>(new Map());
  const [selectedFund, setSelected]   = useState<PreFundSummary | null>(null);
  const [transactions, setTxns]       = useState<PreFundTransaction[]>([]);
  const transactionLoadVersion = useRef(0);
  const [reconciliations, setRecons]  = useState<Reconciliation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [txnLoading, setTxnLoading]   = useState(false);
  const [showAddTxn, setShowAddTxn]   = useState(false);
  const [showCloseDialog, setShowClose] = useState(false);
  const [txnForm, setTxnForm]         = useState({ transaction_type: 'adjustment', amount: '', currency: '', reference: '', description: '', transaction_date: new Date().toISOString().split('T')[0] });
  const [closeForm, setCloseForm]     = useState({ surplus_action: 'carry_forward', carry_forward_amount: '', return_amount: '', notes: '' });
  const [saving, setSaving]           = useState(false);
  const [closing, setClosing]         = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [matchingFeed, setMatchingFeed] = useState(false);
  const [matchResults, setMatchResults] = useState<{ matched: number; unmatched: number } | null>(null);

  // Unattributed filter + inline staff assignment
  const [showUnattributed, setShowUnattributed] = useState(false);
  const [assignTxn, setAssignTxn]       = useState<PreFundTransaction | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assigning, setAssigning]       = useState(false);

  // The ledger migration maintains these cache fields from the canonical,
  // reversal-aware event view. Recomputing raw payment rows in the browser would
  // reintroduce legacy-source and reversal discrepancies.
  const effectivePaidAmount = useMemo(() => {
    return Number(selectedFund?.paid_amount ?? 0);
  }, [selectedFund]);
  const effectiveAvailableBalance = useMemo(() =>
    Number(selectedFund?.available_balance ?? 0),
  [selectedFund]);

  // True when paid_amount DB column is stale (no txn rows back it up).
  // Suppressed while txnLoading=true so we don't flash a false warning
  // during the window between fund switch (transactions cleared) and load completing.
  const isStaleBalance = useMemo(() => {
    if (!selectedFund || txnLoading) return false;
    return false;
  }, [selectedFund, transactions, txnLoading]);

  const handleResetBalance = async () => {
    if (!selectedFund) return;
    toast({
      title: 'Direct balance reset disabled',
      description: 'Use the Finance exceptions queue and a controlled historic correction. Fund balances are derived from immutable payment events.',
      variant: 'destructive',
    });
  };

  // Paid source coverage review. This is deliberately read-only: a missing
  // Pre-Fund link is not proof of which fund should have covered a payment.
  const [unlinkedSubs, setUnlinkedSubs]       = useState<UnlinkedPaymentGroups>({ ocs: [], dp: [], ef: [] });
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [showUnlinked, setShowUnlinked]       = useState(false);
  /** True while a stale-balance reset is in progress */
  const [resettingBalance, setResettingBalance] = useState(false);
  const [openCategories, setOpenCategories]   = useState<Record<string, boolean>>({ ocs: true, dp: true, ef: true });

  // ── Linked payment finder ─────────────────────────────────────────────────
  // Finance-only, cross-fund, and deliberately read-only. The server RPC uses
  // the immutable ledger so a search shows the original payment and reversal.
  const [finderAmount, setFinderAmount] = useState('');
  const [finderCurrency, setFinderCurrency] = useState(FILTER_ALL);
  const [finderResults, setFinderResults] = useState<LinkedPaymentFinderResult[]>([]);
  const [finderSearched, setFinderSearched] = useState(false);
  const [findingPayments, setFindingPayments] = useState(false);

  // ── Finance exception queue ──────────────────────────────────────────────
  const [exceptionQueue, setExceptionQueue]     = useState<ExceptionQueueItem[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [exceptionQueueStatus, setExceptionQueueStatus] = useState<'ready' | 'migration_required' | 'unavailable'>('ready');
  const [exceptionQueueMessage, setExceptionQueueMessage] = useState<string | null>(null);
  const [showExceptions, setShowExceptions]     = useState(false);
  const [reviewException, setReviewException]   = useState<ExceptionQueueItem | null>(null);
  const [exceptionNote, setExceptionNote]       = useState('');
  const [exceptionRef, setExceptionRef]         = useState('');
  const [exceptionConfirmedAmount, setExceptionConfirmedAmount] = useState('');
  const [exceptionAction, setExceptionAction]   = useState<'keep_excluded' | 'confirm_evidence' | null>(null);
  const [exceptionIdempotencyKey, setExceptionIdempotencyKey] = useState<string | null>(null);
  const [submittingException, setSubmittingException] = useState(false);
  const reviewCurrency = reviewException?.currency?.trim() || null;

  // Unlink / remove a linked transaction
  const [confirmUnlinkTxn, setConfirmUnlinkTxn] = useState<PreFundTransaction | null>(null);
  const [unlinkingId, setUnlinkingId]           = useState<string | null>(null);
  const [correctionTxn, setCorrectionTxn]       = useState<PreFundTransaction | null>(null);
  const [correctionFundId, setCorrectionFundId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctingTxn, setCorrectingTxn]       = useState(false);
  // ── Bulk-select state ────────────────────────────────────────────────────
  const [selectedTxnIds, setSelectedTxnIds]   = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting]        = useState(false);
  const [groupByRef, setGroupByRef]            = useState('');
  const [groupByCollector, setGroupByCollector]= useState('');
  const [groupByDate, setGroupByDate]          = useState('');
  const [reconcilingAll, setReconcilingAll]     = useState(false);

  // ── Transaction review filters ───────────────────────────────────────────
  // Values use explicit sentinels because Radix Select reserves "" for clearing.
  const [transactionFilterMetadata, setTransactionFilterMetadata] = useState<Map<string, ReconciliationFilterMetadata>>(new Map());
  const [stateFilter, setStateFilter] = useState(FILTER_ALL);
  const [mmpFilter, setMmpFilter] = useState(FILTER_ALL);
  const [nameSearch, setNameSearch] = useState('');

  // Transaction drill-down
  const [drillTxn, setDrillTxn]     = useState<PreFundTransaction | null>(null);
  const [drillSrc, setDrillSrc]     = useState<any | null>(null);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [deletePaidRequestTxn, setDeletePaidRequestTxn] = useState<PreFundTransaction | null>(null);
  const [deletingPaidRequest, setDeletingPaidRequest] = useState(false);

  // CSV import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText]         = useState('');
  const [csvParsed, setCsvParsed]     = useState<{ date: string; amount: string; reference: string; description: string }[]>([]);
  const [importing, setImporting]     = useState(false);

  // Profile name map (user_id → full name) for transaction table
  const [profileMap, setProfileMap]       = useState<Map<string, string>>(new Map());
  const [profileEmailMap, setProfileEmailMap] = useState<Map<string, string>>(new Map());
  const [exportingExcel, setExportingExcel] = useState(false);

  const stateOptions = useMemo(() => [...new Set(
    [...transactionFilterMetadata.values()]
      .map(metadata => metadata.state)
      .filter((state): state is string => Boolean(state)),
  )].sort((a, b) => a.localeCompare(b)), [transactionFilterMetadata]);

  const mmpOptions = useMemo(() => {
    const options = new Map<string, string>();
    transactionFilterMetadata.forEach(metadata => {
      if (metadata.mmpId) options.set(metadata.mmpId, metadata.mmpName ?? metadata.mmpId);
    });
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [transactionFilterMetadata]);
  const finderCurrencies = useMemo(
    () => [...new Set(funds.map(fund => fund.currency).filter(Boolean))].sort(),
    [funds],
  );

  const hasTransactionFilters = stateFilter !== FILTER_ALL || mmpFilter !== FILTER_ALL || Boolean(nameSearch.trim());
  const filteredTransactions = useMemo(() => {
    const normalizedName = nameSearch.trim().toLocaleLowerCase();
    return transactions.filter(transaction => {
      const metadata = transactionFilterMetadata.get(transaction.id);
      const stateValue = metadata?.state ?? null;
      const mmpValue = metadata?.mmpId ?? null;
      const people = [
        ...(metadata?.people ?? []),
        transaction.user_id ? profileMap.get(transaction.user_id) : null,
        transaction.created_by ? profileMap.get(transaction.created_by) : null,
      ]
        .filter((name): name is string => Boolean(name))
        .join(' ')
        .toLocaleLowerCase();

      if (stateFilter === FILTER_UNASSIGNED ? stateValue !== null : stateFilter !== FILTER_ALL && stateValue !== stateFilter) return false;
      if (mmpFilter === FILTER_UNASSIGNED ? mmpValue !== null : mmpFilter !== FILTER_ALL && mmpValue !== mmpFilter) return false;
      return !normalizedName || people.includes(normalizedName);
    });
  }, [transactions, transactionFilterMetadata, stateFilter, mmpFilter, nameSearch, profileMap]);

  const reviewTransactions = useMemo(() => showUnattributed
    ? filteredTransactions.filter(transaction => transaction.transaction_type === 'payment' && !transaction.user_id)
    : filteredTransactions, [filteredTransactions, showUnattributed]);
  const displayTxns = useMemo(() => showOnlySelected && selectedTxnIds.size > 0
    ? reviewTransactions.filter(transaction => selectedTxnIds.has(transaction.id))
    : reviewTransactions, [reviewTransactions, showOnlySelected, selectedTxnIds]);
  const visibleSelectedTransactions = useMemo(
    () => displayTxns.filter(transaction => selectedTxnIds.has(transaction.id)),
    [displayTxns, selectedTxnIds],
  );

  useEffect(() => {
    const visibleIds = new Set(reviewTransactions.map(transaction => transaction.id));
    setSelectedTxnIds(previous => {
      const next = new Set([...previous].filter(id => visibleIds.has(id)));
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [reviewTransactions]);

  useEffect(() => {
    setStateFilter(FILTER_ALL);
    setMmpFilter(FILTER_ALL);
    setNameSearch('');
    setSelectedTxnIds(new Set());
    setShowOnlySelected(false);
  }, [selectedFund?.id]);

  // Inline receipt preview
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  // Normalize receipt_url — may be stored as a JSON array string e.g. ["url"] due to legacy bug
  const normalizeReceiptUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? (p[0] ?? null) : raw; } catch { return raw; }
  };

  // Super-admin allocation deduction — user picker for manual payments
  const isSuperAdmin = hasAnyRole(['super_admin']);
  const [txnAllocUserId, setTxnAllocUserId] = useState<string | null>(null);
  const [allocUsers, setAllocUsers] = useState<{ id: string; name: string; allocated: number; spent: number; currency: string }[]>([]);

  // Group transactions that share the same receipt_url (batch receipts)
  const receiptGroupMap = useMemo(() => {
    const map = new Map<string, PreFundTransaction[]>();
    for (const t of transactions) {
      if (!t.receipt_url) continue;
      const group = map.get(t.receipt_url) ?? [];
      group.push(t);
      map.set(t.receipt_url, group);
    }
    // Keep only groups with 2+ transactions (true batch)
    for (const [url, group] of map) {
      if (group.length < 2) map.delete(url);
    }
    return map;
  }, [transactions]);
  const filteredReceiptGroupMap = useMemo(() => {
    const map = new Map<string, PreFundTransaction[]>();
    for (const transaction of reviewTransactions) {
      if (!transaction.receipt_url) continue;
      const group = map.get(transaction.receipt_url) ?? [];
      group.push(transaction);
      map.set(transaction.receipt_url, group);
    }
    for (const [url, group] of map) {
      if (group.length < 2) map.delete(url);
    }
    return map;
  }, [reviewTransactions]);

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('pre_fund_requests')
        .select('id,name,source,currency,amount,available_balance,committed_amount,paid_amount,status,start_date,end_date')
        .in('status', ['active', 'low_balance', 'closed', 'period_locked'])
        .order('created_at', { ascending: false });
      // CD sees only their own held funds
      if (isCD && !hasAnyRole(['super_admin', 'admin', 'financialAdmin'])) {
        q = (q as any).eq('holder_user_id', currentUser?.id);
      }
      const { data, error: e } = await q;
      if (e && !e.message.includes('does not exist')) throw e;
      const loaded: PreFundSummary[] = (data as any) ?? [];
      setFunds(loaded);
      // Open the reconciliation view with the newest available fund instead
      // of leaving the page in an empty "Select a fund" state. Preserve an
      // existing selection when refreshing, and fall back if it disappeared.
      setSelected(current => {
        if (current && loaded.some(fund => fund.id === current.id)) return current;
        return loaded[0] ?? null;
      });
      // The selector only needs the primary fund list. Do not keep the whole
      // page blocked while the optional cross-fund balance validation queries
      // below scan historical transactions and Down Payments.
      setLoading(false);

      // Compute accurate available balance per fund using 3 global batched queries
      // (was N per-fund queries — one transaction fetch + two DP validation queries per fund).
      const DP_NO_DISBURSE = new Set(['pending', 'pending_supervisor', 'pending_admin', 'draft', 'rejected', 'cancelled']);
      const avMap = new Map<string, number>();
      if (loaded.length > 0) {
        const fundIds = loaded.map(f => f.id);

        // ONE batched transaction query for all funds
        const allTxns: any[] = await fetchAllIn(
          (chunk) => supabase.from('pre_fund_transactions')
            .select('id,transaction_type,amount,source_table,source_id,pre_fund_request_id')
            .in('pre_fund_request_id', chunk)
            .eq('transaction_type', 'payment'),
          fundIds,
        );

        // Group by fund
        const txnsByFund = new Map<string, any[]>();
        for (const t of allTxns) {
          const bucket = txnsByFund.get(t.pre_fund_request_id);
          if (bucket) bucket.push(t);
          else txnsByFund.set(t.pre_fund_request_id, [t]);
        }

        // Two global DP validation queries (was 2N)
        const allDpIds  = [...new Set(allTxns.filter((t: any) => t.source_table === 'down_payment_requests' && t.source_id).map((t: any) => t.source_id as string))];
        const allTxnIds = allTxns.map((t: any) => t.id as string).filter(Boolean);
        const [validDpData, backLinked] = await Promise.all([
          allDpIds.length  ? fetchAllIn((chunk) => supabase.from('down_payment_requests').select('id,status,metadata').in('id', chunk), allDpIds)                                                               : Promise.resolve([] as any[]),
          allTxnIds.length ? fetchAllIn((chunk) => supabase.from('down_payment_requests').select('pre_fund_transaction_id,status,metadata').in('pre_fund_transaction_id', chunk), allTxnIds) : Promise.resolve([] as any[]),
        ]);

        const paidDpSet      = new Set<string>((validDpData as any[]).filter((d: any) => !DP_NO_DISBURSE.has(d.status) && d.metadata?.deleted !== true).map((d: any) => d.id as string));
        const nonPaidBackIds = new Set<string>((backLinked as any[]).filter((d: any) => DP_NO_DISBURSE.has(d.status) || d.metadata?.deleted === true).map((d: any) => d.pre_fund_transaction_id as string));

        for (const fund of loaded) {
          const rawTxns = txnsByFund.get(fund.id) ?? [];
          if (rawTxns.length === 0) {
            avMap.set(fund.id, fund.amount - Number(fund.paid_amount ?? 0));
            continue;
          }
          let paid = 0;
          for (const t of rawTxns) {
            if (t.source_table === 'down_payment_requests') {
              if (!t.source_id || paidDpSet.has(t.source_id)) paid += Number(t.amount ?? 0);
            } else if (!t.source_table) {
              if (!nonPaidBackIds.has(t.id)) paid += Number(t.amount ?? 0);
            } else {
              paid += Number(t.amount ?? 0);
            }
          }
          avMap.set(fund.id, Math.max(0, fund.amount - paid));
        }
        // The server-owned cache is the sole balance authority. The preceding
        // legacy scan remains useful for the exception queue, not for balances.
        loaded.forEach(fund => avMap.set(fund.id, Number(fund.available_balance ?? 0)));
      }
      setFundsComputedAvail(new Map(avMap));
    } catch (e: any) { toast({ title: 'Load failed', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);

  const loadTxns = useCallback(async (fundId: string) => {
    const loadVersion = ++transactionLoadVersion.current;
    const isCurrentLoad = () => transactionLoadVersion.current === loadVersion;
    setTxnLoading(true);
    // Do not let a newly selected fund be acted on until its source metadata
    // has been resolved. Missing metadata means unknown while loading, not
    // "unassigned" for State/MMP filter purposes.
    setTxns([]);
    setRecons([]);
    setTransactionFilterMetadata(new Map());
    setProfileMap(new Map());
    setProfileEmailMap(new Map());
    try {
      const [rawTxns, reconData] = await Promise.all([
        // The canonical view excludes invalid source events and includes
        // compensating reversals, so paid-out displays agree with the fund cache.
        fetchAll(() => (supabase as any).from('pre_fund_event_ledger_v')
          .select('*')
          .eq('pre_fund_request_id', fundId)
          .eq('source_is_verified', true)
          .order('transaction_date', { ascending: false })),
        fetchAll(() => supabase.from('pre_fund_reconciliations').select('*').eq('pre_fund_request_id', fundId).order('created_at', { ascending: false })),
      ]);

      const txns = rawTxns;

      // Source metadata lives on the linked Down Payment / Cost Submission rather
      // than on the immutable Pre-Fund event. Resolve it in batched reads so the
      // reconciliation filters can include legacy and current payment records.
      const isUuid = (value: unknown): value is string =>
        typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      const firstText = (...values: unknown[]): string | null => {
        for (const value of values) {
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return null;
      };
      const asRecord = (value: unknown): Record<string, any> =>
        value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

      const downPaymentIds = [...new Set(txns
        .filter((t: PreFundTransaction) => t.source_table === 'down_payment_requests' && isUuid(t.source_id))
        .map((t: PreFundTransaction) => t.source_id!))];
      const costSubmissionIds = [...new Set(txns
        .filter((t: PreFundTransaction) => t.source_table === 'operational_cost_submissions' && isUuid(t.source_id))
        .map((t: PreFundTransaction) => t.source_id!))];

      const [downPayments, costSubmissions] = await Promise.all([
        fetchAllIn((chunk) => (supabase as any).from('down_payment_requests').select('*').in('id', chunk), downPaymentIds),
        fetchAllIn((chunk) => (supabase as any).from('operational_cost_submissions').select('*').in('id', chunk), costSubmissionIds),
      ]);
      const downPaymentsById = new Map((downPayments as any[]).map(row => [row.id, row]));
      const costSubmissionsById = new Map((costSubmissions as any[]).map(row => [row.id, row]));

      const siteEntryIds = [...new Set((downPayments as any[])
        .map(row => row.mmp_site_entry_id)
        .filter(isUuid))];
      const siteEntries = await fetchAllIn(
        (chunk) => (supabase as any).from('mmp_site_entries').select('*').in('id', chunk),
        siteEntryIds,
      );
      const siteEntriesById = new Map((siteEntries as any[]).map(row => [row.id, row]));

      const mmpReferences = [...new Set([
        ...(siteEntries as any[]).flatMap(row => [row.mmp_file_id, row.mmp_id]),
        ...(downPayments as any[]).flatMap(row => {
          const metadata = asRecord(row.metadata);
          return [row.mmp_id, row.mmp_file_id, row.mmp_name, metadata.mmp_id, metadata.mmp_name];
        }),
        ...(costSubmissions as any[]).flatMap(row => {
          const metadata = asRecord(row.metadata);
          return [row.mmp_id, row.mmp_file_id, row.mmp_name, metadata.mmp_id, metadata.mmp_name];
        }),
      ].filter((value): value is string => typeof value === 'string' && value.trim()))];
      const mmpFileIds = mmpReferences.filter(isUuid);
      const [mmpByIdRows, mmpByCodeRows] = await Promise.all([
        fetchAllIn((chunk) => (supabase as any).from('mmp_files').select('*').in('id', chunk), mmpFileIds),
        fetchAllIn((chunk) => (supabase as any).from('mmp_files').select('*').in('mmp_id', chunk), mmpReferences),
      ]);
      const mmpByReference = new Map<string, any>();
      [...(mmpByIdRows as any[]), ...(mmpByCodeRows as any[])].forEach(row => {
        if (row.id) mmpByReference.set(row.id, row);
        if (row.mmp_id) mmpByReference.set(row.mmp_id, row);
      });

      // Load people referenced by the ledger and source records in the same
      // lookup so a partial typed name works for payer, recorder, and requester.
      const userIds = new Set<string>();
      txns.forEach((t: PreFundTransaction) => {
        if (t.user_id)    userIds.add(t.user_id);
        if (t.created_by) userIds.add(t.created_by);
      });
      [...(downPayments as any[]), ...(costSubmissions as any[])].forEach(row => {
        ['requested_by', 'submitted_by', 'created_by', 'requester_id', 'user_id'].forEach(key => {
          if (isUuid(row[key])) userIds.add(row[key]);
        });
      });
      const profileIds = [...userIds].filter(isUuid);
      const profileNames = new Map<string, string>();
      const profileEmails = new Map<string, string>();
      if (profileIds.length > 0) {
        const profiles = await fetchAllIn(
          (chunk) => supabase.from('profiles').select('id,full_name,email').in('id', chunk),
          profileIds,
        );
        (profiles ?? []).forEach((p: any) => {
          profileNames.set(p.id, p.full_name || p.email || 'Unknown');
          if (p.email) profileEmails.set(p.id, p.email);
        });
      }

      const personName = (value: unknown) => {
        const text = firstText(value);
        return text ? (profileNames.get(text) ?? text) : null;
      };
      const filterMetadata = new Map<string, ReconciliationFilterMetadata>();
      txns.forEach((txn: PreFundTransaction) => {
        const source = txn.source_table === 'down_payment_requests'
          ? downPaymentsById.get(txn.source_id ?? '')
          : txn.source_table === 'operational_cost_submissions'
            ? costSubmissionsById.get(txn.source_id ?? '')
            : null;
        const sourceMetadata = asRecord(source?.metadata);
        const siteEntry = source?.mmp_site_entry_id ? siteEntriesById.get(source.mmp_site_entry_id) : null;
        const siteMetadata = asRecord(siteEntry?.metadata);
        const mmpReference = firstText(
          siteEntry?.mmp_file_id, siteEntry?.mmp_id,
          source?.mmp_file_id, source?.mmp_id,
          sourceMetadata.mmp_file_id, sourceMetadata.mmp_id,
        );
        const legacyMmpName = firstText(source?.mmp_name, sourceMetadata.mmp_name, siteEntry?.mmp_name);
        const mmp = mmpReference ? mmpByReference.get(mmpReference) : null;
        const people = [
          personName(txn.user_id),
          personName(txn.created_by),
          personName(source?.requested_by),
          personName(source?.submitted_by),
          personName(source?.created_by),
          firstText(source?.requester_name, source?.submitted_by_name, sourceMetadata.requester_name, sourceMetadata.submitted_by_name),
        ].filter((name): name is string => Boolean(name));

        filterMetadata.set(txn.id, {
          state: firstText(
            siteEntry?.state_name, siteEntry?.state, siteMetadata.state_name, siteMetadata.state,
            source?.state_name, source?.state, sourceMetadata.state_name, sourceMetadata.state,
          ),
          mmpId: mmpReference ?? (legacyMmpName ? `legacy-name:${legacyMmpName.toLocaleLowerCase()}` : null),
          mmpName: firstText(mmp?.name, mmp?.mmp_id, legacyMmpName, mmpReference),
          people: [...new Set(people)],
        });
      });
      if (!isCurrentLoad()) return;
      setProfileMap(profileNames);
      setProfileEmailMap(profileEmails);
      setTransactionFilterMetadata(filterMetadata);
      setTxns(txns);
      setRecons(reconData as any);
    } catch (e: any) {
      if (isCurrentLoad()) toast({ title: 'Failed to load transactions', description: e.message, variant: 'destructive' });
    } finally {
      if (isCurrentLoad()) setTxnLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadFunds(); }, [loadFunds]);
  // Keep selectedFund fresh whenever the funds list is refreshed (loadFunds,
  // handleResetBalance and other fund refreshes — without this, selectedFund
  // holds a stale object and computed values like effectivePaidAmount lag behind
  useEffect(() => {
    if (!selectedFund) return;
    const fresh = funds.find(f => f.id === selectedFund.id);
    if (fresh) setSelected(fresh);
  }, [funds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedFund) {
      // Clear stale data immediately so effectivePaidAmount doesn't compute
      // from the PREVIOUS fund's transactions while the new ones are loading
      setTxns([]);
      setRecons([]);
      setSelectedTxnIds(new Set());
      setTxnForm(p => ({ ...p, currency: selectedFund.currency }));
      loadTxns(selectedFund.id);
       if (canManageExceptions) loadUnlinkedPayments();
       else setUnlinkedSubs({ ocs: [], dp: [], ef: [] });
      // Load allocated users for this fund (for super-admin user picker)
      (async () => {
        const { data: allocs } = await (supabase as any)
          .from('pre_fund_allocations')
          .select('user_id,allocated_amount,spent_amount,currency')
          .eq('pre_fund_request_id', selectedFund.id);
        if (!allocs || allocs.length === 0) { setAllocUsers([]); return; }
        const uids = allocs.map((a: any) => a.user_id).filter(Boolean);
        const { data: profiles } = await supabase.from('profiles').select('id,full_name,email').in('id', uids);
        const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id.slice(0,8)]));
        setAllocUsers(allocs.map((a: any) => ({
          id:        a.user_id,
          name:      pMap.get(a.user_id) ?? a.user_id.slice(0, 8),
          allocated: Number(a.allocated_amount),
          spent:     Number(a.spent_amount ?? 0),
          currency:  a.currency ?? selectedFund.currency,
        })));
      })();
    }
   }, [selectedFund, loadTxns, canManageExceptions]);

  // ── Paid sources without active Pre-Fund coverage ─────────────────────────
  const loadUnlinkedPayments = useCallback(async () => {
    // The coverage report intentionally aggregates every fund. It is limited to
    // Finance/Admin users so a Country Director never receives unrelated source
    // payment data in the browser; their queue remains holder-scoped by RPC.
    if (!canManageExceptions) {
      setUnlinkedSubs({ ocs: [], dp: [], ef: [] });
      return;
    }
    setLoadingUnlinked(true);
    try {
      const [coverageRows, ocsRows, dpRows, efRows] = await Promise.all([
        fetchAll(() => supabase
          .from('pre_fund_transactions')
          .select('source_table,source_id,transaction_type,amount')
          .in('transaction_type', ['payment', 'reversal', 'return'])
          .not('source_id', 'is', null)),
        fetchAll(() => supabase
          .from('operational_cost_submissions')
          .select('id,description,amount_paid_cents,currency,status,submitted_at,submitted_by,paid_at,created_at')
          .in('status', ['partially_paid', 'paid', 'reconciled'])
          .order('paid_at', { ascending: false })),
        fetchAll(() => (supabase as any)
          .from('down_payment_requests')
          // Keep this query to the original Down Payment schema. Some deployed
          // databases do not yet have fully_paid_at or the later linkage fields.
          .select('id,justification,requested_amount,total_paid_amount,status,metadata,created_at,requested_by')
          .in('status', ['partially_paid', 'fully_paid', 'paid', 'reconciled'])
          .gt('total_paid_amount', 0)
          .order('created_at', { ascending: false })),
        // Enumerator / transport fees from MMP site entries
        fetchAll(() => (supabase as any)
          .from('mmp_site_entries')
          .select('id,site_name,visit_date,accepted_by,transport_fee,enumerator_fee,fee_paid_amount,fee_paid_status,fee_paid_at,additional_data')
          .eq('fee_paid_status', 'paid')
          .order('fee_paid_at', { ascending: false })),
      ]);

      const coveredAmounts = new Map<string, number>();
      for (const event of coverageRows as any[]) {
        if (!event.source_table || !event.source_id) continue;
        const key = `${event.source_table}:${event.source_id}`;
        const signedAmount = event.transaction_type === 'payment'
          ? Number(event.amount ?? 0)
          : -Number(event.amount ?? 0);
        coveredAmounts.set(key, (coveredAmounts.get(key) ?? 0) + signedAmount);
      }
      const asRecord = (value: unknown): Record<string, any> =>
        value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
      const firstText = (...values: unknown[]): string | null => {
        for (const value of values) {
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return null;
      };
      const isUuid = (value: unknown): value is string =>
        typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      const profileIds = [...new Set([
        ...(ocsRows as any[]).map(row => row.submitted_by),
        ...(dpRows as any[]).map(row => row.requested_by),
        ...(efRows as any[]).map(row => row.accepted_by),
      ].filter(isUuid))];
      let profiles: any[] = [];
      try {
        profiles = await fetchAllIn(
          (chunk) => supabase.from('profiles').select('id,full_name,email').in('id', chunk),
          profileIds,
        );
      } catch (profileError) {
        // This review list remains useful even when a legacy user profile has
        // been removed or is outside the current read scope.
        console.warn('[PRE_FUND_COVERAGE] Could not resolve submitter names:', profileError);
      }
      const profileNames = new Map((profiles as any[]).map(profile => [
        profile.id,
        profile.full_name || profile.email || 'Unknown user',
      ]));
      const submitterName = (value: unknown) => {
        const person = firstText(value);
        return person ? (profileNames.get(person) ?? person) : null;
      };
      const sourceContext = (record: any, extra: Record<string, any> = {}) => {
        const metadata = asRecord(record.metadata);
        return {
          state: firstText(
            record.state_name, record.state,
            metadata.state_name, metadata.state,
            extra.state_name, extra.state,
          ),
          mmpName: firstText(
            record.mmp_name, record.mmp_id,
            metadata.mmp_name, metadata.mmp_id,
            extra.mmp_name, extra.mmp_id,
          ),
        };
      };
      const uncovered = (sourceTable: string, record: any, paidAmount: number) => {
        const coveredAmount = Math.max(0, coveredAmounts.get(`${sourceTable}:${record.id}`) ?? 0);
        return { coveredAmount, uncoveredAmount: Math.max(0, paidAmount - coveredAmount) };
      };

      const ocs: UnlinkedPayment[] = (ocsRows as any[]).map((r: any) => {
        const paidAmount = Number(r.amount_paid_cents ?? 0) / 100;
        const coverage = uncovered('operational_cost_submissions', r, paidAmount);
        const context = sourceContext(r);
        return {
          id: r.id,
          _source: 'operational_cost_submissions',
          _category: 'ocs',
          _date: r.paid_at ?? r.submitted_at ?? r.created_at ?? null,
          amount: coverage.uncoveredAmount,
          paidAmount,
          coveredAmount: coverage.coveredAmount,
          currency: r.currency ?? 'SDG',
          title: firstText(r.description, `Submission ${r.id.slice(0, 8)}`) ?? r.id,
          userId: r.submitted_by ?? null,
          submitterName: submitterName(r.submitted_by),
          sourceStatus: r.status ?? null,
          ...context,
        };
      }).filter(r => r.amount > 0);
      const dp: UnlinkedPayment[] = (dpRows as any[])
        // A legacy marker does not prove current event coverage; the net ledger
        // total above remains the source of truth.
        .map((r: any) => {
          const paidAmount = Number(r.total_paid_amount ?? 0);
          const coverage = uncovered('down_payment_requests', r, paidAmount);
          const metadata = asRecord(r.metadata);
          const context = sourceContext(r, metadata);
          return {
            id: r.id,
            _source: 'down_payment_requests',
            _category: 'dp',
            _date: metadata.paid_at ?? r.created_at ?? null,
            amount: coverage.uncoveredAmount,
            paidAmount,
            coveredAmount: coverage.coveredAmount,
            currency: 'SDG',
            title: firstText(r.justification, `Down-payment ${r.id.slice(0, 8)}`) ?? r.id,
            userId: r.requested_by ?? null,
            submitterName: submitterName(r.requested_by),
            sourceStatus: r.status ?? null,
            ...context,
          };
        }).filter(r => r.amount > 0);
      // Enumerator fees: sum transport_fee + enumerator_fee per entry
      const ef: UnlinkedPayment[] = (efRows as any[]).map((r: any) => {
        const grossFee = Number(r.transport_fee ?? 0) + Number(r.enumerator_fee ?? 0);
        const paidAmount = Number(r.fee_paid_amount ?? grossFee);
        const coverage = uncovered('mmp_site_entries', r, paidAmount);
        const additionalData = asRecord(r.additional_data);
        const context = sourceContext(r, additionalData);
        return {
          id: r.id,
          _source: 'mmp_site_entries',
          _category: 'ef',
          _date: r.fee_paid_at ?? r.visit_date ?? null,
          amount: coverage.uncoveredAmount,
          paidAmount,
          coveredAmount: coverage.coveredAmount,
          // MMP fee payment records are SDG-denominated; mmp_site_entries has
          // no currency column and the fee bridge posts these payments as SDG.
          currency: 'SDG',
          title: `${r.site_name ?? 'Site'} — ${additionalData.enumerator_name ?? submitterName(r.accepted_by) ?? 'Enumerator'}`,
          userId: r.accepted_by ?? null,
          submitterName: submitterName(r.accepted_by),
          sourceStatus: r.fee_paid_status ?? null,
          ...context,
        };
      }).filter(r => r.amount > 0);
      setUnlinkedSubs({ ocs, dp, ef });
    } catch (e: any) {
      setUnlinkedSubs({ ocs: [], dp: [], ef: [] });
      toast({ title: 'Could not check Pre-Fund coverage', description: e.message, variant: 'destructive' });
    }
    finally { setLoadingUnlinked(false); }
  }, [toast, canManageExceptions]);

  const loadExceptions = useCallback(async (fundId?: string) => {
    setLoadingExceptions(true);
    setExceptionQueueStatus('ready');
    setExceptionQueueMessage(null);
    try {
      // Finance sees the global exception queue. Country Directors pass their
      // selected fund and the database enforces that they can only read funds
      // they hold; unassigned records are never exposed to them.
      const { data, error } = await (supabase as any).rpc('get_pre_fund_finance_exception_queue_rpc', {
        p_fund_id: canManageExceptions ? null : (fundId ?? null),
      });
      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42883') {
          setExceptionQueue([]);
          setExceptionQueueStatus('migration_required');
          setExceptionQueueMessage('Apply the Pre-Fund ledger and Finance exception migrations, including 20260820f_pre_fund_finance_exception_reviews.sql and 20260821a_pre_fund_exception_visibility.sql, in Supabase before reviewing exceptions.');
          return;
        }
        throw error;
      }
      setExceptionQueue((data as ExceptionQueueItem[]) ?? []);
    } catch (e: any) {
      setExceptionQueue([]);
      setExceptionQueueStatus('unavailable');
      setExceptionQueueMessage(e?.message ?? 'The Finance exception queue could not be loaded.');
    } finally {
      setLoadingExceptions(false);
    }
  }, [canManageExceptions]);

  useEffect(() => {
    if (canAccess) loadExceptions(selectedFund?.id);
  }, [canAccess, loadExceptions, selectedFund?.id]);

  const handleExceptionDecision = async (action: 'keep_excluded' | 'confirm_evidence') => {
    if (!reviewException) return;
    if (!exceptionNote.trim()) {
      toast({ title: 'Note required', description: 'Please enter a mandatory evidence note.', variant: 'destructive' });
      return;
    }
    if (action === 'confirm_evidence' && !exceptionRef.trim()) {
      toast({ title: 'Evidence reference required', description: 'Please enter an evidence reference for Confirm Evidence.', variant: 'destructive' });
      return;
    }
    setSubmittingException(true);
    try {
      const sourceType = reviewException.source_table?.toLowerCase();
      if (action === 'keep_excluded') {
        const { error } = await (supabase as any).rpc('record_pre_fund_exception_decision_rpc', {
          p_exception_key: reviewException.exception_key,
          p_evidence_note: exceptionNote.trim(),
          p_evidence_reference: exceptionRef.trim() || null,
        });
        if (error) throw new Error(error.message);
      } else if (sourceType === 'operational_cost_submissions') {
        if (!exceptionIdempotencyKey) throw new Error('Unable to prepare a safe retry key. Close and reopen this review before confirming evidence.');
        const { error } = await (supabase as any).rpc('confirm_pre_fund_ocs_exception_with_evidence_rpc', {
          p_exception_key: reviewException.exception_key,
          p_evidence_note: exceptionNote.trim(),
          p_evidence_reference: exceptionRef.trim(),
          p_idempotency_key: exceptionIdempotencyKey,
        });
        if (error) throw new Error(error.message);
      } else if (sourceType === 'down_payment_requests') {
        const confirmedAmt = parseFloat(exceptionConfirmedAmount);
        if (isNaN(confirmedAmt) || confirmedAmt <= 0) {
          toast({ title: 'Valid confirmed amount required', description: 'Enter the confirmed paid amount for this down payment.', variant: 'destructive' });
          setSubmittingException(false);
          return;
        }
        if (!exceptionIdempotencyKey) throw new Error('Unable to prepare a safe retry key. Close and reopen this review before confirming evidence.');
        const { error } = await (supabase as any).rpc('confirm_pre_fund_down_payment_exception_with_evidence_rpc', {
          p_exception_key: reviewException.exception_key,
          p_confirmed_amount: confirmedAmt,
          p_evidence_note: exceptionNote.trim(),
          p_evidence_reference: exceptionRef.trim(),
          p_idempotency_key: exceptionIdempotencyKey,
        });
        if (error) throw new Error(error.message);
      } else {
        throw new Error('This source cannot be restored automatically because it has no eligible, fund-linked payment event. Keep it excluded until Finance can reconcile it separately.');
      }
      toast({
        title: action === 'keep_excluded' ? 'Exception recorded' : 'Evidence confirmed',
        description: action === 'keep_excluded'
          ? 'The exception remains excluded; no fund balance or payment event was changed.'
          : 'The source and immutable payment ledger were updated together.',
      });
      setReviewException(null);
      setExceptionNote('');
      setExceptionRef('');
      setExceptionConfirmedAmount('');
      setExceptionAction(null);
      setExceptionIdempotencyKey(null);
      // Reload all relevant data
      await Promise.all([
        loadFunds(),
        selectedFund ? loadTxns(selectedFund.id) : Promise.resolve(),
        loadUnlinkedPayments(),
        loadExceptions(selectedFund?.id),
      ]);
    } catch (e: any) {
      toast({ title: 'Failed to resolve exception', description: e.message, variant: 'destructive' });
    } finally {
      setSubmittingException(false);
    }
  };

  // ── Unlink / remove a linked transaction ────────────────────────────────
  const handleUnlinkTxn = async () => {
    const txn = confirmUnlinkTxn;
    if (!txn || !selectedFund) return;
    setUnlinkingId(txn.id);
    setConfirmUnlinkTxn(null);
    try {
      if (txn.transaction_type !== 'payment' || !txn.source_table || !txn.source_id) {
        throw new Error('Only source-linked payment events can be reversed here. Use a Finance correction with evidence for manual entries.');
      }
      if (txn.source_table !== 'down_payment_requests') {
        throw new Error('Do not remove a paid source from the ledger. Use the Finance correction workflow to move it to another Pre-Fund.');
      }
      const { cancelPaidDownPaymentRequest } = await import('@/utils/preFundLinkage');
      await cancelPaidDownPaymentRequest(txn.source_id);

      toast({ title: 'Down Payment cancelled', description: `The request was cancelled and its compensating event restored ${selectedFund.currency} ${formatNumber(txn.amount, 0)} to the fund.` });
      loadFunds();
      loadTxns(selectedFund.id);
      loadUnlinkedPayments();
    } catch (e: any) {
      toast({ title: 'Unlink failed', description: e.message, variant: 'destructive' });
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleDeletePaidOperationalCostRequest = async () => {
    const txn = deletePaidRequestTxn;
    if (!isSuperAdmin || !txn?.source_id || txn.transaction_type !== 'payment' ||
      txn.reconciled || txn.source_table !== 'operational_cost_submissions') {
      toast({
        title: 'Delete not available',
        description: 'Only an unreconciled, source-linked Operational Cost payment can be deleted here.',
        variant: 'destructive',
      });
      return;
    }
    setDeletingPaidRequest(true);
    try {
      const { revertOperationalCostPaymentsAtomically } = await import('@/utils/preFundLinkage');
      const result = await revertOperationalCostPaymentsAtomically([txn.source_id], 'delete');
      if (!result.success) throw new Error(result.message);

      setDeletePaidRequestTxn(null);
      setDrillTxn(null);
      setDrillSrc(null);
      setSelectedTxnIds(previous => {
        const next = new Set(previous);
        next.delete(txn.id);
        return next;
      });
      setFinderResults(previous => previous.filter(result => result.source_id !== txn.source_id));
      toast({
        title: 'Payment and request deleted',
        description: `The payment was reversed and ${txn.currency} ${formatNumber(txn.amount, 0)} was restored to the Pre-Fund.`,
      });
      await Promise.all([
        loadFunds(),
        selectedFund ? loadTxns(selectedFund.id) : Promise.resolve(),
        loadUnlinkedPayments(),
        loadExceptions(selectedFund?.id),
      ]);
    } catch (error: any) {
      toast({
        title: 'Could not delete payment',
        description: error.message ?? 'The request and its linked payment were not changed.',
        variant: 'destructive',
      });
    } finally {
      setDeletingPaidRequest(false);
    }
  };

  const handleCorrectFund = async () => {
    const txn = correctionTxn;
    if (!txn || !selectedFund) return;
    if (!correctionFundId) {
      toast({ title: 'Replacement Pre-Fund required', description: 'Select the Pre-Fund that actually paid this request.', variant: 'destructive' });
      return;
    }
    if (!correctionReason.trim()) {
      toast({ title: 'Correction reason required', description: 'Explain why the original funding source was incorrect.', variant: 'destructive' });
      return;
    }
    setCorrectingTxn(true);
    try {
      const { correctRequiredPreFundPaymentLink } = await import('@/utils/preFundLinkage');
      await correctRequiredPreFundPaymentLink({
        originalPaymentEventId: txn.id,
        replacementFundId: correctionFundId,
        reason: correctionReason.trim(),
      });
      toast({
        title: 'Pre-Fund corrected',
        description: 'The original event was reversed and a new immutable event was recorded against the replacement Pre-Fund.',
      });
      setCorrectionTxn(null);
      setCorrectionFundId('');
      setCorrectionReason('');
      await Promise.all([loadFunds(), loadTxns(selectedFund.id), loadUnlinkedPayments()]);
    } catch (error: any) {
      toast({ title: 'Correction failed', description: error.message, variant: 'destructive' });
    } finally {
      setCorrectingTxn(false);
    }
  };

  // ── Bulk delete handler ─────────────────────────────────────────────────
  const handleBulkUnlink = async () => {
    if (!selectedFund || visibleSelectedTransactions.length === 0) return;
    setBulkDeleting(true);
    setConfirmBulkDelete(false);
    const toDelete = visibleSelectedTransactions;
    try {
      if (toDelete.some(t => t.transaction_type !== 'payment' || t.source_table !== 'down_payment_requests' || !t.source_id)) {
        throw new Error('Bulk cancellation only supports Down Payment events. Finance corrections must retain their immutable audit trail.');
      }
      const uniqueSources = new Map(toDelete.map(t => [`${t.source_table}:${t.source_id}`, t]));
      const { cancelPaidDownPaymentRequest } = await import('@/utils/preFundLinkage');
      for (const txn of uniqueSources.values()) {
        await cancelPaidDownPaymentRequest(txn.source_id!);
      }

      setSelectedTxnIds(new Set());
      loadFunds();
      loadTxns(selectedFund.id);
      toast({ title: `${uniqueSources.size} Down Payment${uniqueSources.size !== 1 ? 's' : ''} cancelled`, description: 'Compensating events restored their fund balances.' });
    } catch (err) {
      console.error('[BULK_UNLINK] Error:', err);
      toast({ title: 'Removal failed', description: 'Could not complete removal. Please try again.', variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── Transaction drill-down ───────────────────────────────────────────────
  // Fields in source records that hold user UUIDs and need name resolution
  const USER_ID_FIELDS = new Set([
    'requested_by','submitted_by','accepted_by','approved_by','rejected_by',
    'reviewed_by','paid_by','received_by','processed_by','created_by',
    'updated_by','cancelled_by','confirmed_by','verified_by',
  ]);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const handleDrillDown = async (txn: PreFundTransaction) => {
    setDrillTxn(txn);
    setDrillSrc(null);
    if (!txn.source_table || !txn.source_id) return;
    setLoadingDrill(true);
    try {
      const { data } = await (supabase as any).from(txn.source_table).select('*').eq('id', txn.source_id).maybeSingle();
      setDrillSrc(data ?? null);

      // Resolve any user-id fields in the source record into profileMap
      if (data) {
        const newIds = new Set<string>();
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string' && UUID_RE.test(v) &&
              (USER_ID_FIELDS.has(k) || k.endsWith('_by') || k.endsWith('_user_id'))) {
            newIds.add(v);
          }
        }
        if (newIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles').select('id,full_name,email').in('id', [...newIds]);
          setProfileMap(prev => {
            const next = new Map(prev);
            (profiles ?? []).forEach((p: any) => next.set(p.id, p.full_name || p.email || 'Unknown'));
            return next;
          });
          setProfileEmailMap(prev => {
            const next = new Map(prev);
            (profiles ?? []).forEach((p: any) => { if (p.email) next.set(p.id, p.email); });
            return next;
          });
        }
      }
    } catch { setDrillSrc(null); }
    finally { setLoadingDrill(false); }
  };

  const handleFindLinkedPayments = async () => {
    const amount = Number(finderAmount.replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', description: 'Use a payment amount greater than zero, for example 4,000,000.', variant: 'destructive' });
      return;
    }
    setFindingPayments(true);
    setFinderSearched(true);
    setFinderResults([]);
    try {
      const { data, error } = await (supabase as any).rpc('find_pre_fund_payment_events_rpc', {
        p_amount: amount,
        p_currency: finderCurrency === FILTER_ALL ? null : finderCurrency,
      });
      if (error) {
        if (/find_pre_fund_payment_events_rpc|does not exist/i.test(error.message)) {
          throw new Error('The Linked Payment Finder database migration has not been applied yet. Apply the latest Pre-Fund migration, then try again.');
        }
        throw error;
      }
      setFinderResults((data ?? []) as LinkedPaymentFinderResult[]);
    } catch (error: any) {
      setFinderResults([]);
      toast({ title: 'Payment search failed', description: error.message ?? 'Unable to search the immutable payment ledger.', variant: 'destructive' });
    } finally {
      setFindingPayments(false);
    }
  };

  const handleOpenFinderResult = (result: LinkedPaymentFinderResult) => {
    const possiblePeople: Array<[string | null, string | null]> = [
      [result.submitter_id, result.submitter_name],
      [result.event_user_id, result.event_user_name],
      [result.event_created_by, result.event_created_by_name],
    ];
    const people = possiblePeople.filter((person): person is [string, string] => Boolean(person[0] && person[1]));
    if (people.length > 0) {
      setProfileMap(previous => {
        const next = new Map(previous);
        people.forEach(([id, name]) => next.set(id, name));
        return next;
      });
    }
    void handleDrillDown({
      id: result.event_id,
      pre_fund_request_id: result.fund_id,
      transaction_type: result.event_type,
      amount: Number(result.amount),
      currency: result.currency,
      reference: result.reference,
      description: result.description ?? result.source_title,
      transaction_date: result.payment_date ?? datePart(result.occurred_at),
      reconciled: false,
      reconciled_at: null,
      source_table: result.source_table,
      source_id: result.source_id,
      created_at: result.occurred_at ?? new Date().toISOString(),
      user_id: result.event_user_id,
      created_by: result.event_created_by,
      receipt_url: result.receipt_url,
      gl_journal_entry_id: null,
    });
  };

  // ── CSV import ───────────────────────────────────────────────────────────
  const parseCsv = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) { setCsvParsed([]); return; }
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const dateIdx = header.findIndex(h => h.includes('date'));
    const amtIdx  = header.findIndex(h => h.includes('amount') || h.includes('amt'));
    const refIdx  = header.findIndex(h => h.includes('ref') || h.includes('reference'));
    const descIdx = header.findIndex(h => h.includes('desc') || h.includes('description') || h.includes('narration'));
    const parsed = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return {
        date:        dateIdx >= 0 ? cols[dateIdx] ?? '' : '',
        amount:      amtIdx  >= 0 ? cols[amtIdx]  ?? '' : '',
        reference:   refIdx  >= 0 ? cols[refIdx]  ?? '' : '',
        description: descIdx >= 0 ? cols[descIdx] ?? '' : cols.join(' '),
      };
    }).filter(r => r.amount && parseFloat(r.amount) > 0);
    setCsvParsed(parsed);
  };

  const handleCsvImport = async () => {
    if (!selectedFund || csvParsed.length === 0) return;
    setImporting(true);
    try {
      // CSV import creates bank_statement rows — these are reconciliation helpers ONLY.
      // They do NOT affect available_balance / paid_amount and do NOT trigger GL postings.
      // Use type 'bank_statement' (not 'payment') so they are excluded from accounting totals
      // and the GL bridge never picks them up.
      const rows = csvParsed.map((r, index) => ({
        pre_fund_request_id: selectedFund.id,
        transaction_type: 'bank_statement',
        amount: Math.abs(parseFloat(r.amount)),
        currency: selectedFund.currency,
        reference: r.reference || null,
        description: r.description ? `[Bank Statement] ${r.description}` : '[Bank Statement Import]',
        transaction_date: r.date || new Date().toISOString().split('T')[0],
        reconciled: false,
        idempotency_key: `bank-statement:${selectedFund.id}:${r.date || ''}:${r.reference || ''}:${r.amount}:${index}`,
        event_actor_id: currentUser?.id ?? null,
        event_reason: 'bank_statement_import',
        event_metadata: { import_source: 'reconciliation_csv' },
      }));
      const { error } = await supabase
        .from('pre_fund_transactions')
        .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      if (error) throw error;
      toast({ title: `${rows.length} bank statement row${rows.length !== 1 ? 's' : ''} imported for reconciliation matching`, description: 'These are reference-only entries and do not affect fund balances or GL.' });
      setShowCsvImport(false);
      setCsvText('');
      setCsvParsed([]);
      loadTxns(selectedFund.id);
    } catch (e: any) { toast({ title: 'Import failed', description: e.message, variant: 'destructive' }); }
    finally { setImporting(false); }
  };

  const handleAssignStaff = async () => {
    if (!assignTxn || !assignUserId) return;
    setAssigning(true);
    try {
      throw new Error('Posted event attribution is immutable. Reverse and reprocess the source payment with the correct allocation holder, or record a Finance correction with evidence.');
    } catch (e: any) {
      toast({ title: 'Failed to assign', description: e.message, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  const handleAddTxn = async () => {
    if (!selectedFund || !txnForm.amount || !txnForm.transaction_date) { toast({ title: 'Required fields missing', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const amount   = parseFloat(txnForm.amount);
      const currency = txnForm.currency || selectedFund.currency;

      // Determine GL account codes for types that require a journal entry
      const GL_EVENT: Record<string, string> = {
        payment:      'pre_fund_paid',
        commitment:   'pre_fund_committed',
        carry_forward:'pre_fund_carry_forward',
      };
      const glEvent = GL_EVENT[txnForm.transaction_type];

      let glDebitCode: string | null = null;
      let glCreditCode: string | null = null;

      if (glEvent) {
        const { data: fundDetail } = await supabase.from('pre_fund_requests')
          .select('gl_receipt_account,gl_liability_account,gl_expense_account,gl_cf_account')
          .eq('id', selectedFund.id).maybeSingle();

        const fd = fundDetail as any;

        // Enforce configured GL accounts — no silent hardcoded fallbacks
        if (glEvent === 'pre_fund_committed') {
          if (!fd?.gl_liability_account) throw new Error('GL Liability Account not configured on this fund. Go to Registry → Edit Fund to set GL mappings before posting commitments.');
          glDebitCode  = fd.gl_liability_account;
          glCreditCode = fd.gl_receipt_account ?? null; // credit back to receipt account if set, else RPC handles defaults from COA settings
        } else if (glEvent === 'pre_fund_carry_forward') {
          if (!fd?.gl_liability_account) throw new Error('GL Liability Account not configured on this fund. Go to Registry → Edit Fund to set GL mappings before posting carry-forwards.');
          if (!fd?.gl_cf_account)        throw new Error('GL Carry-Forward Account not configured on this fund. Go to Registry → Edit Fund to set the carry-forward GL account.');
          glDebitCode  = fd.gl_liability_account;
          glCreditCode = fd.gl_cf_account;
        } else {
          // payment type
          if (!fd?.gl_liability_account) throw new Error('GL Liability Account not configured on this fund. Go to Registry → Edit Fund to set GL mappings before posting payments.');
          if (!fd?.gl_receipt_account)   throw new Error('GL Receipt Account not configured on this fund. Go to Registry → Edit Fund to set the receipt GL account.');
          glDebitCode  = fd.gl_liability_account;
          glCreditCode = fd.gl_receipt_account;
        }
      }

      // All writes (txn insert + optional GL JE + lines + bridge log) run inside
      // a single Postgres transaction via the RPC — any failure rolls back everything.
      const { data: result, error: rpcErr } = await (supabase as any).rpc(
        'add_pre_fund_transaction_rpc', {
          p_fund_id:          selectedFund.id,
          p_fund_name:        selectedFund.name,
          p_transaction_type: txnForm.transaction_type,
          p_amount:           amount,
          p_currency:         currency,
          p_reference:        txnForm.reference || null,
          p_description:      txnForm.description || null,
          p_transaction_date: txnForm.transaction_date,
          p_created_by:       currentUser?.id ?? null,
          p_gl_debit_code:    glDebitCode,
          p_gl_credit_code:   glCreditCode,
          // Super-admin: deduct from selected user's allocation (null = no deduction)
          p_user_id: null,
          p_payment_event_key: `manual:${selectedFund.id}:${txnForm.transaction_type}:${txnForm.transaction_date}:${amount}:${txnForm.reference || txnForm.description || ''}`,
        }
      );
      if (rpcErr) throw new Error(rpcErr.message);
      if (result && result.success === false) throw new Error(result.error ?? 'Transaction RPC failed.');

      toast({ title: 'Transaction added', description: result?.gl_posted ? 'GL journal entry created (draft).' : undefined });
      setShowAddTxn(false);
      setTxnForm(p => ({ ...p, amount: '', reference: '', description: '' }));
      await loadTxns(selectedFund.id);
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const handleReconcileTxn = async (txnId: string, reconciled: boolean) => {
    await supabase.from('pre_fund_transactions').update({ reconciled, reconciled_at: reconciled ? new Date().toISOString() : null }).eq('id', txnId);
    if (selectedFund) await loadTxns(selectedFund.id);
  };

  const handleReconcileAll = async (reconcile: boolean) => {
    if (!selectedFund || reconcilingAll) return;
    const targets = displayTxns.filter(t => t.reconciled !== reconcile);
    if (targets.length === 0) return;
    setReconcilingAll(true);
    try {
      const ids = targets.map(t => t.id);
      const { error } = await supabase.from('pre_fund_transactions')
        .update({ reconciled: reconcile, reconciled_at: reconcile ? new Date().toISOString() : null })
        .in('id', ids);
      if (error) throw new Error(error.message);
      await loadTxns(selectedFund.id);
      toast({ title: reconcile ? `${ids.length} transactions reconciled` : `${ids.length} transactions unreconciled` });
    } catch (err: any) {
      toast({ title: 'Bulk reconcile failed', description: err.message, variant: 'destructive' });
    } finally {
      setReconcilingAll(false);
    }
  };

  const handleClosePeriod = async () => {
    if (!selectedFund) return;
    const surplus = selectedFund.available_balance;

    // Validate split amounts don't exceed surplus
    if (closeForm.surplus_action === 'split') {
      const carryAmt  = parseFloat(closeForm.carry_forward_amount) || 0;
      const returnAmt = parseFloat(closeForm.return_amount) || 0;
      if (carryAmt < 0 || returnAmt < 0) {
        toast({ title: 'Amounts cannot be negative', variant: 'destructive' });
        return;
      }
      if (carryAmt + returnAmt > surplus + 0.005) {
        toast({
          title: 'Split amounts exceed available surplus',
          description: `Carry-forward (${carryAmt}) + Return (${returnAmt}) = ${carryAmt + returnAmt} exceeds surplus of ${surplus}.`,
          variant: 'destructive',
        });
        return;
      }
    }
    setClosing(true);
    try {
      const isReturnAction = ['return', 'return_bank', 'return_finance'].includes(closeForm.surplus_action);
      const carryAmt   = closeForm.surplus_action === 'carry_forward' ? surplus : parseFloat(closeForm.carry_forward_amount) || 0;
      const returnAmt  = isReturnAction ? surplus : parseFloat(closeForm.return_amount) || 0;
      const reserveAmt = closeForm.surplus_action === 'reserve' ? surplus : Math.max(0, surplus - carryAmt - returnAmt);

      // Fetch GL account codes from fund settings — ALL four are required for period close
      const { data: fundDetail } = await supabase.from('pre_fund_requests')
        .select('gl_receipt_account,gl_liability_account,gl_expense_account,gl_cf_account')
        .eq('id', selectedFund.id).maybeSingle();

      const fd = fundDetail as any;

      // Enforce fully-configured GL accounts before period close — no silent hardcoded fallbacks
      const glErrors: string[] = [];
      if (!fd?.gl_liability_account) glErrors.push('GL Liability Account');
      if (!fd?.gl_receipt_account)   glErrors.push('GL Receipt Account');
      if (!fd?.gl_expense_account)   glErrors.push('GL Expense Account');
      if (!fd?.gl_cf_account && (closeForm.surplus_action === 'carry_forward' || closeForm.surplus_action === 'split'))
        glErrors.push('GL Carry-Forward Account');

      if (glErrors.length > 0) {
        throw new Error(
          `Cannot close period: the following GL accounts are not configured on this fund: ${glErrors.join(', ')}. ` +
          `Go to Registry → Edit Fund to set GL mappings before closing the period.`
        );
      }

      // All writes (recon insert + fund close + GL JEs + bridge logs) run inside
      // a single Postgres transaction via the RPC — any failure rolls back everything.
      const { data: result, error: rpcErr } = await (supabase as any).rpc(
        'close_pre_fund_period_rpc', {
          p_fund_id:           selectedFund.id,
          p_fund_name:         selectedFund.name,
          p_period_start:      selectedFund.start_date,
          p_period_end:        selectedFund.end_date,
          p_total_funded:      selectedFund.amount,
          p_total_paid:        selectedFund.paid_amount,
          p_total_committed:   selectedFund.committed_amount,
          p_surplus:           surplus,
          p_surplus_action:    closeForm.surplus_action,
          p_carry_forward_amt: carryAmt,
          p_return_amt:        returnAmt,
          p_reserve_amt:       reserveAmt,
          p_currency:          selectedFund.currency,
          p_notes:             closeForm.notes || null,
          p_closed_by:         currentUser?.id ?? null,
          p_gl_liability_code: fd.gl_liability_account,
          p_gl_receipt_code:   fd.gl_receipt_account,
          p_gl_expense_code:   fd.gl_expense_account,
          p_gl_cf_code:        fd.gl_cf_account ?? null,
        }
      );
      if (rpcErr) throw new Error(rpcErr.message);
      if (result && result.success === false) throw new Error(result.error ?? 'Period close RPC failed.');

      toast({ title: 'Period closed', description: 'GL journal entry created (draft) — review in GL module.' });
      try {
        await supabase.from('notification_events' as any).insert({
          event_type: 'pre_fund_period_closed',
          actor_id: currentUser?.id ?? null,
          entity_id: selectedFund.id,
          entity_type: 'pre_fund_request',
          payload: {
            fund_name: selectedFund.name,
            currency: selectedFund.currency,
            surplus: surplus,
            surplus_action: closeForm.surplus_action,
          },
        });
        dispatchNotification({
          event: 'pre_fund_period_closed',
          recipientRoles: ['super_admin', 'admin', 'financialAdmin'],
          titleEn: 'Pre-Fund Period Closed', titleAr: 'تم إغلاق فترة التمويل المسبق',
          messageEn: `Fund "${selectedFund.name}" (${selectedFund.currency}) period has been closed. Surplus action: ${closeForm.surplus_action}.`,
          messageAr: `تم إغلاق فترة صندوق "${selectedFund.name}" (${selectedFund.currency}). إجراء الفائض: ${closeForm.surplus_action}.`,
          entityType: 'pre_fund_request', entityId: selectedFund.id,
          triggeredBy: currentUser?.id, priority: 'normal',
          metadata: { fund_name: selectedFund.name, currency: selectedFund.currency, surplus: surplus, surplus_action: closeForm.surplus_action },
        });
      } catch { /* notifications are non-blocking */ }
      setShowClose(false);
      await Promise.all([loadFunds(), loadTxns(selectedFund.id)]);
      setSelected(null);
    } catch (e: any) { toast({ title: 'Close failed', description: e.message, variant: 'destructive' }); }
    finally { setClosing(false); }
  };

  // ── Bank Feed Matching ─────────────────────────────────────────────────────
  // Queries the pre_fund_bank_unmatched queue, attempts amount±tolerance
  // matching against open pre_fund_transactions, and marks matched rows.
  const handleMatchBankFeed = async () => {
    if (!selectedFund) return;
    setMatchingFeed(true);
    setMatchResults(null);
    let matched = 0;
    let unmatched = 0;
    try {
      // Load global unmatched bank feed entries (pre_fund_bank_unmatched has no fund FK
      // until matched; we filter by currency to narrow candidates)
      const { data: feedRows, error: fErr } = await supabase
        .from('pre_fund_bank_unmatched')
        .select('id,amount,currency,transaction_date,description,raw_reference')
        .eq('match_status', 'unmatched')
        .eq('currency', selectedFund.currency);
      if (fErr && !fErr.message.includes('does not exist')) throw fErr;
      const feed: any[] = (feedRows as any) ?? [];

      // Load open (unreconciled payment) transactions for this fund
      const { data: txnRows } = await supabase
        .from('pre_fund_transactions')
        .select('id,amount,currency,reconciled')
        .eq('pre_fund_request_id', selectedFund.id)
        .eq('reconciled', false)
        .eq('transaction_type', 'payment');
      const openTxns: any[] = [...((txnRows as any) ?? [])];

      // Fetch configurable tolerance from settings (same as Registry bank-API path)
      const { data: bankFeedSettings } = await supabase
        .from('pre_fund_settings')
        .select('bank_match_tolerance_pct')
        .limit(1)
        .maybeSingle();
      const feedTolerancePct = ((bankFeedSettings as any)?.bank_match_tolerance_pct ?? 2) / 100;

      for (const row of feed) {
        const tolerance = Math.max(0.01, row.amount * feedTolerancePct);
        const candidate = openTxns.find(
          t => Math.abs(t.amount - row.amount) <= tolerance && t.currency === row.currency
        );
        if (candidate) {
          // Mark bank feed row as matched — use actual schema columns:
          // matched_fund_id, match_status, reviewed_by, reviewed_at
          await supabase.from('pre_fund_bank_unmatched')
            .update({
              matched_fund_id: selectedFund.id,
              match_status: 'matched',
              reviewed_by: currentUser?.id ?? null,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          // Mark transaction as reconciled
          await supabase.from('pre_fund_transactions')
            .update({ reconciled: true, reconciled_at: new Date().toISOString() })
            .eq('id', candidate.id);
          // Remove from openTxns to avoid double-match
          const idx = openTxns.indexOf(candidate);
          if (idx > -1) openTxns.splice(idx, 1);
          matched++;
        } else {
          unmatched++;
        }
      }
      setMatchResults({ matched, unmatched });
      toast({
        title: `Bank feed matched: ${matched} transaction${matched !== 1 ? 's' : ''}`,
        description: unmatched > 0 ? `${unmatched} feed entr${unmatched !== 1 ? 'ies' : 'y'} remain unmatched.` : 'All feed entries matched.',
      });
      if (matched > 0) await loadTxns(selectedFund.id);
    } catch (e: any) {
      toast({ title: 'Bank feed matching failed', description: e.message, variant: 'destructive' });
    } finally {
      setMatchingFeed(false);
    }
  };

  // ── Fetch approval steps — supports both single-user and multi-user/quorum model ──
  const fetchApprovalSteps = async (fundId: string): Promise<ApprovalStepRow[]> => {
    // Fetch step configuration (supports both assigned_user_id legacy and assigned_user_ids array + quorum)
    const { data: steps } = await supabase
      .from('pre_fund_approval_steps' as any)
      .select('id,step_order,step_label,assigned_user_id,assigned_user_ids,required_approvals,status,approved_at')
      .eq('pre_fund_request_id', fundId)
      .order('step_order');
    if (!steps || !(steps as any[]).length) return [];

    // Collect all unique user IDs across both legacy and array fields
    const allUserIds = new Set<string>();
    (steps as any[]).forEach((s: any) => {
      if (s.assigned_user_id)   allUserIds.add(s.assigned_user_id);
      if (Array.isArray(s.assigned_user_ids)) s.assigned_user_ids.forEach((uid: string) => allUserIds.add(uid));
    });
    const userIdList = [...allUserIds].filter(Boolean);

    // Fetch per-user votes from pre_fund_step_approvals (quorum model)
    const stepIds = (steps as any[]).map((s: any) => s.id).filter(Boolean);
    const [profileRes, votesRes] = await Promise.all([
      userIdList.length
        ? supabase.from('profiles').select('id,full_name,email').in('id', userIdList)
        : Promise.resolve({ data: [] }),
      stepIds.length
        ? (supabase as any).from('pre_fund_step_approvals').select('step_id,user_id,action,created_at').in('step_id', stepIds)
        : Promise.resolve({ data: [] }),
    ]);

    const nameMap  = new Map((profileRes.data ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Unknown']));
    // Map stepId → array of votes
    const votesMap = new Map<string, any[]>();
    for (const v of (votesRes.data ?? []) as any[]) {
      if (!votesMap.has(v.step_id)) votesMap.set(v.step_id, []);
      votesMap.get(v.step_id)!.push(v);
    }

    const result: ApprovalStepRow[] = [];
    for (const s of steps as any[]) {
      const assignedIds: string[] = Array.isArray(s.assigned_user_ids) && s.assigned_user_ids.length > 0
        ? s.assigned_user_ids
        : s.assigned_user_id ? [s.assigned_user_id] : [];
      const quorum   = s.required_approvals ?? 1;
      const votes    = votesMap.get(s.id) ?? [];

      if (assignedIds.length <= 1) {
        // Legacy / single-approver: one row per step
        const uid = assignedIds[0];
        const vote = votes.find((v: any) => v.user_id === uid);
        result.push({
          step_no:       s.step_order,
          label:         s.step_label ?? `Step ${s.step_order}`,
          assigned_name: nameMap.get(uid ?? '') ?? '—',
          status:        vote?.action ?? s.status ?? 'pending',
          decided_at:    vote?.created_at ?? s.approved_at ?? null,
        });
      } else {
        // Multi-approver / quorum: one row per assigned user showing their individual vote
        const approvedCount = votes.filter((v: any) => v.action === 'approved').length;
        for (const uid of assignedIds) {
          const vote = votes.find((v: any) => v.user_id === uid);
          result.push({
            step_no:       s.step_order,
            label:         `${s.step_label ?? `Step ${s.step_order}`} (${approvedCount}/${quorum} approved)`,
            assigned_name: nameMap.get(uid) ?? '—',
            status:        vote ? vote.action : 'pending',
            decided_at:    vote?.created_at ?? null,
          });
        }
      }
    }
    return result;
  };

  // ── Fetch GL journal entries for this fund ────────────────────────────────
  // Covers all three source tables: pre_fund_requests (receipt/activation),
  // pre_fund_transactions (payments/commitments), pre_fund_reconciliations (period close)
  const fetchGlEntries = async (fundId: string): Promise<GlEntryRow[]> => {
    // Step 1: collect all child IDs that GL logs might reference
    const [txnRes, reconRes] = await Promise.all([
      supabase.from('pre_fund_transactions').select('id').eq('pre_fund_request_id', fundId),
      supabase.from('pre_fund_reconciliations').select('id').eq('pre_fund_request_id', fundId),
    ]);
    const txnIds  = ((txnRes.data  as any) ?? []).map((r: any) => r.id as string);
    const reconIds = ((reconRes.data as any) ?? []).map((r: any) => r.id as string);
    const allSourceIds = [fundId, ...txnIds, ...reconIds];

    // Step 2: query bridge log for all relevant source IDs in one call
    const { data: logs } = await supabase
      .from('acct_gl_bridge_log' as any)
      .select('event_type,journal_entry_id,created_at,source_table')
      .in('source_id', allSourceIds)
      .eq('status', 'success')
      .order('created_at');
    if (!logs || !(logs as any[]).length) return [];
    const jeIds = (logs as any[]).map((l: any) => l.journal_entry_id).filter(Boolean);
    const { data: entries } = jeIds.length
      ? await supabase.from('acct_journal_entries').select('id,description_en,posting_date,entry_no,status').in('id', jeIds)
      : { data: [] };
    const jeMap = new Map((entries ?? []).map((e: any) => [e.id, e]));
    return (logs as any[]).map((l: any) => {
      const je = jeMap.get(l.journal_entry_id);
      return {
        event_type: l.event_type,
        posting_date: je?.posting_date ?? (datePart(l.created_at) || '—'),
        description_en: je?.description_en ?? '—',
        entry_no: je?.entry_no ?? null,
        status: je?.status ?? '—',
      };
    });
  };

  const handleExportPDF = async () => {
    if (!selectedFund) return;
    setGeneratingPdf(true);
    try {
      const [approvalSteps, glEntries] = await Promise.all([
        fetchApprovalSteps(selectedFund.id),
        fetchGlEntries(selectedFund.id),
      ]);
      const { blob, filename } = await generateReconciliationPDF(
        selectedFund, transactions, reconciliations[0] ?? {}, approvalSteps, glEntries,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      const reconId = reconciliations[0]?.id;
      try {
        const publicUrl = await uploadPdfToStorage(blob, filename, selectedFund.id);
        if (publicUrl && reconId) {
          await supabase.from('pre_fund_reconciliations').update({ pdf_url: publicUrl }).eq('id', reconId);
          toast({ title: 'PDF saved', description: 'Reconciliation report with GL trail & approval chain saved.' });
          await Promise.all([loadFunds(), loadTxns(selectedFund.id)]);
        } else {
          toast({ title: 'PDF downloaded', description: 'Could not persist to storage — check financial-documents bucket.' });
        }
      } catch (storageErr: any) {
        toast({ title: 'PDF downloaded', description: `Storage upload failed: ${storageErr.message}` });
      }
    } catch (e: any) { toast({ title: 'PDF failed', description: e.message, variant: 'destructive' }); }
    finally { setGeneratingPdf(false); }
  };

  const handleDonorPDF = async () => {
    if (!selectedFund) return;
    setGeneratingPdf(true);
    try {
      // Build category map from source OCS records (expense_category field)
      const categoryMap = new Map<string, string>();
      const ocsLinked = transactions.filter(t => t.source_table === 'operational_cost_submissions' && t.source_id);
      if (ocsLinked.length > 0) {
        const sourceIds = [...new Set(ocsLinked.map(t => t.source_id!))];
        const { data: srcData } = await supabase
          .from('operational_cost_submissions')
          .select('id,expense_category')
          .in('id', sourceIds);
        (srcData ?? []).forEach((r: any) => {
          if (r.expense_category) categoryMap.set(r.id, r.expense_category);
        });
      }

      const approvalSteps = await fetchApprovalSteps(selectedFund.id);
      const { blob, filename } = await generateDonorStatementPDF(selectedFund, transactions, approvalSteps, categoryMap.size > 0 ? categoryMap : undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      try {
        const publicUrl = await uploadPdfToStorage(blob, filename, selectedFund.id);
        if (publicUrl) toast({ title: 'Donor statement saved', description: 'Donor PDF with signatories saved to storage.' });
      } catch { /* storage error — download still succeeded */ }
    } catch (e: any) { toast({ title: 'PDF failed', description: e.message, variant: 'destructive' }); }
    finally { setGeneratingPdf(false); }
  };

  const handleExportExcel = async () => {
    if (!selectedFund) return;
    setExportingExcel(true);
    try {
       await handleExportReconciliationExcel(selectedFund, transactions, profileMap, reconciliations);
      toast({ title: 'Excel exported', description: `${transactions.length} transactions included` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    } finally { setExportingExcel(false); }
  };

  // Exclude bank_statement rows (reconciliation-only references) from all financial totals
  const accountingTxns = transactions.filter(t => t.transaction_type !== 'bank_statement');
  const totalReconciled = accountingTxns.filter(t => t.reconciled).reduce((s, t) => s + t.amount, 0);
  const totalUnreconciled = accountingTxns.filter(t => !t.reconciled).reduce((s, t) => s + t.amount, 0);
  // Unattributed = payment txns with no user_id assigned
  const filteredUnattributedPayments = filteredTransactions.filter(t => t.transaction_type === 'payment' && !t.user_id);

  if (!canAccess) return (
    <div className="p-8 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" /><p className="text-muted-foreground">Access denied.</p></div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><RotateCcw className="h-5 w-5 text-sky-600" />Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Reconcile transactions, close periods, and export reports</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadFunds(); if (canManageExceptions) loadUnlinkedPayments(); loadExceptions(selectedFund?.id); if (selectedFund) loadTxns(selectedFund.id); }}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
      </div>

      {/* ── Fund selector bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Active Fund:</span>
        {loading ? (
          <Skeleton className="h-9 w-64 rounded-md" />
        ) : (
          <Select
            value={selectedFund?.id ?? ''}
            onValueChange={id => setSelected(funds.find(f => f.id === id) ?? null)}
          >
            <SelectTrigger className="h-9 w-72 text-sm" data-testid="select-recon-fund">
              <SelectValue placeholder="Select a fund to reconcile…" />
            </SelectTrigger>
            <SelectContent>
              {funds.map(f => (
                <SelectItem key={f.id} value={f.id} data-testid={`option-fund-${f.id}`}>
                  <span className="font-medium">{f.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    · {f.currency} {formatNumber(fundsComputedAvail.has(f.id) ? fundsComputedAvail.get(f.id)! : f.available_balance, 0)} avail.
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedFund && (
          <>
            <Badge className={cn('text-[11px]',
              selectedFund.status === 'active'       ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              selectedFund.status === 'closed'       ? 'bg-slate-100 text-slate-500 border-slate-200' :
              selectedFund.status === 'low_balance'  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                       'bg-orange-100 text-orange-700 border-orange-200'
            )}>{selectedFund.status.replace(/_/g, ' ')}</Badge>
            <span className="text-[11px] text-muted-foreground ml-auto">{funds.length} fund{funds.length !== 1 ? 's' : ''} total</span>
          </>
        )}
      </div>

      {/* ── Full-width reconciliation panel ─────────────────────────────────── */}
      <div className="space-y-4">
          {!selectedFund ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border rounded-xl bg-muted/20">Select a fund to reconcile</div>
          ) : (
            <>
              {/* Fund summary */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">{selectedFund.name}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">{selectedFund.source}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDonorPDF} disabled={generatingPdf}>
                        <FileText className="h-3.5 w-3.5 mr-1" />Donor PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportPDF} disabled={generatingPdf}>
                        <Download className="h-3.5 w-3.5 mr-1" />{generatingPdf ? 'Generating…' : 'Recon PDF'}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportExcel} disabled={exportingExcel} data-testid="button-export-excel">
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />{exportingExcel ? 'Exporting…' : 'Export Excel'}
                      </Button>
                      {!isCD && ['active', 'low_balance'].includes(selectedFund.status) && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleMatchBankFeed} disabled={matchingFeed} data-testid="button-match-bank-feed">
                          <Shuffle className="h-3.5 w-3.5 mr-1" />{matchingFeed ? 'Matching…' : 'Match Bank Feed'}
                        </Button>
                      )}
                      {!isCD && matchResults && (
                        <span className="text-[11px] text-muted-foreground self-center">
                          ✓ {matchResults.matched} matched{matchResults.unmatched > 0 ? `, ${matchResults.unmatched} unmatched` : ''}
                        </span>
                      )}
                      {!isCD && ['active', 'low_balance'].includes(selectedFund.status) && (
                        <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700" onClick={() => setShowClose(true)}>
                          <Lock className="h-3.5 w-3.5 mr-1" />Close Period
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { label: 'Total Funded', value: selectedFund.amount, color: 'text-foreground', tip: null },
                      { label: 'Paid Out',     value: effectivePaidAmount,           color: 'text-sky-600',    tip: null },
                      { label: 'Committed',    value: selectedFund.committed_amount, color: 'text-violet-600', tip: 'Funds reserved for approved plans or pending payments that have not yet been physically disbursed. They reduce your Available balance immediately — like a hold — so the money cannot be double-spent.' },
                      { label: 'Available',    value: effectiveAvailableBalance,     color: effectiveAvailableBalance < selectedFund.amount * 0.2 ? 'text-rose-600' : 'text-emerald-600', tip: null },
                    ].map(s => (
                      <div key={s.label} className="bg-muted/40 rounded-lg p-2">
                        <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          {s.label}
                          {s.tip && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">{s.tip}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </p>
                        <p className={cn('font-bold font-mono text-sm', s.color)}>{selectedFund.currency} {formatNumber(s.value, 0)}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Category Breakdown ─────────────────────────────────────── */}
                  {transactions.length > 0 && (() => {
                    const { downPayments: dpTotal, costSubmissions: ocsTotal, other: otherTotal, total: grandTotal } = getPaidOutBreakdown(transactions);
                    if (grandTotal === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 font-medium">Paid-Out Breakdown</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Down Payments', value: dpTotal, color: 'text-sky-600' },
                            { label: 'Cost Submissions', value: ocsTotal, color: 'text-violet-600' },
                            ...(otherTotal > 0 ? [{ label: 'Other', value: otherTotal, color: 'text-muted-foreground' }] : []),
                          ].map(s => (
                            <div key={s.label} className="bg-muted/30 rounded-md p-1.5 text-center">
                              <p className="text-[9px] text-muted-foreground truncate">{s.label}</p>
                              <p className={`text-xs font-bold font-mono ${s.color}`}>{selectedFund.currency} {formatNumber(s.value, 0)}</p>
                              <p className="text-[9px] text-muted-foreground">{grandTotal > 0 ? Math.round(s.value / grandTotal * 100) : 0}%</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* ── Stale Balance Warning ───────────────────────────────────────── */}
              {isStaleBalance && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Stale Paid-Out balance detected</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      The database shows <span className="font-mono font-semibold">{selectedFund.currency} {formatNumber(Number(selectedFund.paid_amount), 0)}</span> paid
                      out but there are no transaction records to support it — the payments were likely cancelled or removed
                      after the balance was deducted. Click <strong>Reset</strong> to clear the Paid-Out figure and restore
                      the full fund to Available.
                    </p>
                  </div>
                  {!isCD && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-900/40"
                      disabled={resettingBalance}
                      onClick={handleResetBalance}
                    >
                      {resettingBalance ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                      Reset Balance
                    </Button>
                  )}
                </div>
              )}

              {/* ── Linked Payment Finder ─────────────────────────────────────── */}
              {canManageExceptions && (
                <Card className="border-sky-200 dark:border-sky-900" data-testid="panel-linked-payment-finder">
                  <CardHeader className="px-4 pt-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Search className="h-4 w-4 text-sky-600" />
                      Linked Payment Finder
                    </CardTitle>
                    <p className="text-xs font-normal text-muted-foreground">
                      Find an exact payment across every Pre-Fund, including any immutable reversal. This lookup never changes a payment, fund, or balance.
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={finderAmount}
                        onChange={event => setFinderAmount(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') void handleFindLinkedPayments(); }}
                        inputMode="decimal"
                        placeholder="Exact amount, e.g. 4,000,000"
                        className="h-9 sm:max-w-xs"
                        data-testid="input-linked-payment-amount"
                      />
                      <Select value={finderCurrency} onValueChange={setFinderCurrency}>
                        <SelectTrigger className="h-9 w-full sm:w-40" data-testid="select-linked-payment-currency">
                          <SelectValue placeholder="All currencies" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FILTER_ALL}>All currencies</SelectItem>
                          {finderCurrencies.map(currency => (
                            <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => void handleFindLinkedPayments()}
                        disabled={findingPayments}
                        className="h-9"
                        data-testid="button-find-linked-payment"
                      >
                        {findingPayments ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                        {findingPayments ? 'Searching…' : 'Find payment'}
                      </Button>
                    </div>

                    {finderSearched && (
                      <div className="mt-4 border-t pt-3">
                        {findingPayments ? (
                          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
                        ) : finderResults.length === 0 ? (
                          <div className="rounded-md border border-dashed px-4 py-5 text-center text-sm text-muted-foreground" data-testid="linked-payment-no-results">
                            No payment or reversal matched this exact amount{finderCurrency === FILTER_ALL ? '' : ` in ${finderCurrency}`}.
                          </div>
                        ) : (
                          <div className="space-y-2" data-testid="linked-payment-results">
                            <p className="text-xs text-muted-foreground">
                              {finderResults.length} immutable ledger event{finderResults.length !== 1 ? 's' : ''} found. A reversed payment appears alongside its compensating reversal.
                            </p>
                            {finderResults.map(result => {
                              const statusStyle = result.link_status === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : result.link_status === 'reversed'
                                  ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300';
                              const statusLabel = result.link_status === 'active'
                                ? 'Active payment'
                                : result.link_status === 'reversed'
                                  ? 'Payment reversed'
                                  : 'Reversal event';
                              return (
                                <div key={result.event_id} className="rounded-md border bg-muted/20 px-3 py-3" data-testid={`linked-payment-result-${result.event_id}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm">{result.source_title ?? result.description ?? 'Pre-Fund payment event'}</p>
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        Fund: <span className="font-medium text-foreground">{result.fund_name}</span>
                                        {result.submitter_name && <> · {result.source_table === 'down_payment_requests' ? 'Requested by' : result.source_table === 'operational_cost_submissions' ? 'Submitted by' : 'Paid by'} {result.submitter_name}</>}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-mono text-sm font-semibold">{result.currency} {formatNumber(Number(result.amount), 0)}</p>
                                      <Badge variant="outline" className={cn('mt-1 h-5 text-[10px] font-medium', statusStyle)}>{statusLabel}</Badge>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatIsoDate(result.payment_date ?? result.occurred_at, 'MMM d, yyyy')}</span>
                                    <span>{result.source_table ? result.source_table.replace(/_/g, ' ') : 'Manual Pre-Fund event'}</span>
                                    <span>Source status: {result.source_status?.replace(/_/g, ' ') ?? 'Not recorded'}</span>
                                    {result.reference && <span className="font-mono">Ref: {result.reference}</span>}
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => handleOpenFinderResult(result)}
                                      disabled={!result.source_id || !result.source_table}
                                      data-testid={`button-open-linked-payment-${result.event_id}`}
                                    >
                                      <ExternalLink className="mr-1 h-3.5 w-3.5" />Open source details
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Paid outside Pre-Funding coverage ───────────────────────────── */}
              {canManageExceptions && (() => {
                const totalUnlinked = unlinkedSubs.ocs.length + unlinkedSubs.dp.length + unlinkedSubs.ef.length;
                const currencyTotals = new Map<string, number>();
                Object.values(unlinkedSubs).flat().forEach((sub: any) => {
                  currencyTotals.set(sub.currency ?? 'SDG', (currencyTotals.get(sub.currency ?? 'SDG') ?? 0) + Number(sub.amount ?? 0));
                });

                const CategorySection = ({ catKey, label, items, color }: { catKey: string; label: string; items: any[]; color: string }) => {
                  if (!items.length) return null;
                  const open = openCategories[catKey] !== false;
                  return (
                    <div className="border-b last:border-b-0">
                      <button
                        className={cn('w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-muted/40', color)}
                        onClick={() => setOpenCategories(p => ({ ...p, [catKey]: !open }))}
                        data-testid={`button-cat-${catKey}`}
                      >
                        <span>{label} <span className="font-normal normal-case tracking-normal opacity-70">({items.length})</span></span>
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '')} />
                      </button>
                      {open && items.map(sub => (
                        <div key={sub.id} className="px-4 py-3 text-sm hover:bg-muted/30 border-t border-muted/40" data-testid={`row-unlinked-${sub.id}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs leading-5">{sub.title ?? sub.id}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User className="h-3 w-3 shrink-0" />
                                {sub._category === 'dp' ? 'Requested by' : sub._category === 'ef' ? 'Accepted by' : 'Submitted by'}: {sub.submitterName ?? 'Not recorded'}
                              </p>
                            </div>
                            <span className="font-mono text-xs shrink-0 text-amber-700 dark:text-amber-400">
                              Uncovered: {sub.currency} {formatNumber(sub.amount, 0)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="h-5 text-[10px] font-normal">
                              {sub._category === 'dp' ? 'Down Payment' : sub._category === 'ef' ? 'Enumerator / Transport Fee' : 'Cost Submission'}
                            </Badge>
                            <Badge variant="outline" className="h-5 text-[10px] font-normal">
                              Status: {sub.sourceStatus?.replace(/_/g, ' ') ?? 'Not recorded'}
                            </Badge>
                            <Badge variant="outline" className="h-5 text-[10px] font-normal">
                              <MapPin className="mr-1 h-3 w-3" /> State: {sub.state ?? 'Not recorded'}
                            </Badge>
                            <Badge variant="outline" className="h-5 text-[10px] font-normal">
                              <ClipboardList className="mr-1 h-3 w-3" /> MMP: {sub.mmpName ?? 'Not recorded'}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatIsoDate(sub._date, 'MMM d, yyyy')}</span>
                            <span>Paid: <span className="font-mono text-foreground">{sub.currency} {formatNumber(sub.paidAmount ?? sub.amount, 0)}</span></span>
                            {Number(sub.coveredAmount ?? 0) > 0 && (
                              <span>Linked: <span className="font-mono text-foreground">{sub.currency} {formatNumber(sub.coveredAmount, 0)}</span></span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                };

                return (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-sm font-medium transition-colors"
                    onClick={() => setShowUnlinked(p => !p)}
                    data-testid="button-toggle-unlinked"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        {loadingUnlinked ? 'Checking Pre-Fund coverage…' : `${totalUnlinked} paid source record${totalUnlinked !== 1 ? 's' : ''} outside Pre-Funding coverage`}
                      </span>
                      {!loadingUnlinked && totalUnlinked > 0 && (
                        <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1.5">{totalUnlinked}</Badge>
                      )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-amber-600 transition-transform', showUnlinked ? 'rotate-180' : '')} />
                  </button>
                  {showUnlinked && (
                    <div>
                      <div className="px-4 py-3 bg-amber-50/50 dark:bg-amber-950/10 border-b text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                        <strong>Review only.</strong> An amount appears here only when the paid source amount exceeds its net linked Pre-Fund events across <em>all</em> funds.
                        The app will not guess which fund should cover it or create a payment event automatically. Use Finance evidence review to resolve eligible records.
                        {!loadingUnlinked && currencyTotals.size > 0 && (
                          <div className="mt-1.5 font-mono text-[11px]">
                            Uncovered totals: {[...currencyTotals.entries()].map(([currency, amount]) => `${currency} ${formatNumber(amount, 0)}`).join(' · ')}
                          </div>
                        )}
                      </div>
                      {loadingUnlinked ? (
                        <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                      ) : totalUnlinked === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">No paid source amount is currently outside net Pre-Fund coverage.</div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          <CategorySection catKey="ocs" label="Cost Submissions" items={unlinkedSubs.ocs} color="text-sky-700 dark:text-sky-400 bg-sky-50/60 dark:bg-sky-950/20" />
                          <CategorySection catKey="dp"  label="Down Payments"    items={unlinkedSubs.dp}  color="text-violet-700 dark:text-violet-400 bg-violet-50/60 dark:bg-violet-950/20" />
                          <CategorySection catKey="ef"  label="Enumerator / Transport Fees" items={unlinkedSubs.ef} color="text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ── Finance Exception Queue Panel ─────────────────────────────── */}
              {(() => {
                const canAction = canManageExceptions;
                return (
                  <div className="border rounded-lg overflow-hidden" data-testid="panel-exception-queue">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/20 text-sm font-medium transition-colors"
                      onClick={() => setShowExceptions(p => !p)}
                      data-testid="button-toggle-exceptions"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                        <span className="text-rose-700 dark:text-rose-400">
                          {loadingExceptions
                            ? 'Loading finance exceptions…'
                            : exceptionQueueStatus === 'migration_required'
                              ? 'Finance exception review needs its database migration'
                              : exceptionQueueStatus === 'unavailable'
                                ? 'Finance exception review is temporarily unavailable'
                                : `${exceptionQueue.length} finance exception${exceptionQueue.length !== 1 ? 's' : ''} require${exceptionQueue.length === 1 ? 's' : ''} review`}
                        </span>
                        {!loadingExceptions && exceptionQueue.length > 0 && (
                          <Badge className="bg-rose-500 text-white text-[10px] h-4 px-1.5">{exceptionQueue.length}</Badge>
                        )}
                      </div>
                      <ChevronDown className={cn('h-4 w-4 text-rose-600 transition-transform', showExceptions ? 'rotate-180' : '')} />
                    </button>
                    {showExceptions && (
                      <div className="max-h-96 overflow-y-auto">
                        {loadingExceptions ? (
                          <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                        ) : exceptionQueueStatus !== 'ready' ? (
                          <div className="flex items-start gap-2 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <p>{exceptionQueueMessage}</p>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start gap-2 px-4 py-3 border-b bg-muted/30 text-xs text-muted-foreground leading-relaxed">
                              <Info className="h-4 w-4 mt-0.5 shrink-0" />
                              <p>
                                These records are excluded from verified Paid Out until Finance reviews evidence. Missing, deleted, rejected, pending, or unassigned sources cannot be restored automatically because the app would have to guess the fund. Finance may keep an exception excluded, or confirm evidence only for an eligible source-linked event.
                              </p>
                            </div>
                            {exceptionQueue.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                {isCD ? 'No exceptions are assigned to funds you hold.' : 'No open or previously reviewed Finance exceptions were found across accessible funds.'}
                              </div>
                            ) : (
                              <div className="divide-y">
                                {exceptionQueue.map(ex => {
                                  const sourceType = ex.source_table?.toLowerCase();
                                  const typeLabel = sourceType === 'operational_cost_submissions' ? 'OCS' : sourceType === 'down_payment_requests' ? 'Down Payment' : (ex.exception_type ?? 'Unknown');
                                  const typeColor = sourceType === 'operational_cost_submissions' ? 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/30 dark:border-sky-800' : sourceType === 'down_payment_requests' ? 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800' : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800';
                                  return (
                                    <div key={ex.exception_key} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 text-sm" data-testid={`row-exception-${ex.exception_key}`}>
                                      <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', typeColor)}>{typeLabel}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {ex.fund_id ? (funds.find(f => f.id === ex.fund_id)?.name ?? 'Fund') : 'Unassigned source'}
                                          </span>
                                          {ex.source_status && (
                                            <span className="text-[10px] text-muted-foreground">{ex.source_status}</span>
                                          )}
                                        </div>
                                        {ex.source_description && (
                                          <p className="text-xs font-medium truncate">{ex.source_description}</p>
                                        )}
                                        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                          {ex.historic_amount != null && (
                                            <span>Historic: <span className="font-mono font-medium text-foreground">{ex.currency ?? selectedFund?.currency ?? ''} {formatNumber(ex.historic_amount, 0)}</span></span>
                                          )}
                                          {ex.current_paid_amount != null && (
                                            <span>Current paid: <span className="font-mono font-medium text-foreground">{ex.currency ?? selectedFund?.currency ?? ''} {formatNumber(ex.current_paid_amount, 0)}</span></span>
                                          )}
                                          {ex.unmatched_amount != null && (
                                            <span>Unmatched: <span className="font-mono font-medium text-rose-600">{ex.currency ?? selectedFund?.currency ?? ''} {formatNumber(ex.unmatched_amount, 0)}</span></span>
                                          )}
                                        </div>
                                        {ex.resolution && (
                                          <p className="text-[11px] italic text-muted-foreground">{ex.resolution}</p>
                                        )}
                                      </div>
                                      {canAction && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs shrink-0 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                          onClick={() => {
                                            setReviewException(ex);
                                            setExceptionNote('');
                                            setExceptionRef('');
                                            setExceptionConfirmedAmount('');
                                            setExceptionAction(null);
                                            setExceptionIdempotencyKey(null);
                                          }}
                                          data-testid={`button-review-exception-${ex.exception_key}`}
                                        >
                                          Review
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Transaction table ──────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    Transactions
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {hasTransactionFilters ? `${reviewTransactions.length} of ${transactions.length}` : transactions.length}
                    </Badge>
                    {reviewTransactions.some(t => t.receipt_url) && (() => {
                      const withReceipt = reviewTransactions.filter(t => t.receipt_url).length;
                      const batchCount  = filteredReceiptGroupMap.size;
                      const batchTxns   = [...filteredReceiptGroupMap.values()].reduce((s, g) => s + g.length, 0);
                      const batchTotal  = [...filteredReceiptGroupMap.values()].reduce((s, g) => s + g.reduce((a, t) => a + t.amount, 0), 0);
                      const currency    = reviewTransactions.find(t => t.currency)?.currency ?? '';
                      return (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-1">
                            <Receipt className="h-3 w-3" />{withReceipt} with receipt
                          </span>
                          {batchCount > 0 && (
                            <span className="text-[10px] font-normal flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">
                              <Shuffle className="h-2.5 w-2.5" />
                              {batchCount} batch {batchCount === 1 ? 'receipt' : 'receipts'} · {batchTxns} txns · {currency} {formatNumber(batchTotal, 0)}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </h3>
                  {!isCD && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCsvImport(true)} data-testid="button-csv-import">
                        <Upload className="h-3.5 w-3.5 mr-1" />Import CSV
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddTxn(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />Add Transaction
                      </Button>
                    </div>
                  )}
                </div>

                {transactions.length > 0 && (
                  <div className="mb-3 rounded-xl border bg-muted/20 p-3 space-y-2.5" data-testid="reconciliation-filters">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
                        <Filter className="h-3.5 w-3.5" /> Filter ledger
                      </div>
                      <Select value={stateFilter} onValueChange={setStateFilter}>
                        <SelectTrigger className="h-8 w-[175px] text-xs" data-testid="select-recon-state-filter">
                          <MapPin className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                          <SelectValue placeholder="All states" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FILTER_ALL}>All states</SelectItem>
                          <SelectItem value={FILTER_UNASSIGNED}>No state assigned</SelectItem>
                          {stateOptions.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={mmpFilter} onValueChange={setMmpFilter}>
                        <SelectTrigger className="h-8 w-[200px] text-xs" data-testid="select-recon-mmp-filter">
                          <ClipboardList className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                          <SelectValue placeholder="All MMPs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FILTER_ALL}>All MMPs</SelectItem>
                          <SelectItem value={FILTER_UNASSIGNED}>No MMP assigned</SelectItem>
                          {mmpOptions.map(mmp => <SelectItem key={mmp.id} value={mmp.id}>{mmp.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="relative min-w-[210px] flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={nameSearch}
                          onChange={event => setNameSearch(event.target.value)}
                          placeholder="Search a person by name…"
                          className="h-8 pl-8 text-xs"
                          data-testid="input-recon-name-search"
                        />
                      </div>
                      {hasTransactionFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground"
                          onClick={() => { setStateFilter(FILTER_ALL); setMmpFilter(FILTER_ALL); setNameSearch(''); }}
                          data-testid="button-clear-recon-filters"
                        >
                          <X className="mr-1 h-3.5 w-3.5" />Clear filters
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground">
                        Showing <span className="font-semibold text-foreground">{reviewTransactions.length}</span> of {transactions.length} ledger transaction{transactions.length !== 1 ? 's' : ''}
                      </span>
                      {stateFilter !== FILTER_ALL && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                          State: {stateFilter === FILTER_UNASSIGNED ? 'Unassigned' : stateFilter}
                          <button aria-label="Remove state filter" onClick={() => setStateFilter(FILTER_ALL)}><X className="h-3 w-3" /></button>
                        </Badge>
                      )}
                      {mmpFilter !== FILTER_ALL && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                          MMP: {mmpFilter === FILTER_UNASSIGNED ? 'Unassigned' : mmpOptions.find(option => option.id === mmpFilter)?.name ?? mmpFilter}
                          <button aria-label="Remove MMP filter" onClick={() => setMmpFilter(FILTER_ALL)}><X className="h-3 w-3" /></button>
                        </Badge>
                      )}
                      {nameSearch.trim() && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                          Name: {nameSearch.trim()}
                          <button aria-label="Clear name search" onClick={() => setNameSearch('')}><X className="h-3 w-3" /></button>
                        </Badge>
                      )}
                      {hasTransactionFilters && <span className="ml-auto text-muted-foreground">Fund balances above remain the full fund totals.</span>}
                    </div>
                  </div>
                )}

                {/* ── Group-select + bulk action toolbar ─────────────────── */}
                {!isCD && reviewTransactions.length > 0 && (() => {
                  const allSelected = reviewTransactions.length > 0 && reviewTransactions.every(t => selectedTxnIds.has(t.id));
                  const someSelected = selectedTxnIds.size > 0;
                  const selectedTotal = reviewTransactions.filter(t => selectedTxnIds.has(t.id)).reduce((s, t) => s + t.amount, 0);
                  const currency = reviewTransactions[0]?.currency ?? '';

                  // Unique groups for quick-select dropdowns
                  const uniqueRefs = [...new Set(reviewTransactions.filter(t => t.reference).map(t => t.reference!))];
                  const uniqueCollectors = [...new Map(
                    reviewTransactions.filter(t => t.user_id).map(t => [t.user_id!, profileMap.get(t.user_id!) ?? t.user_id!.slice(0, 8)])
                  ).entries()];
                  const uniqueDates = [...new Set(reviewTransactions.map(t => datePart(t.transaction_date)).filter(Boolean))].sort().reverse();

                  // Cycle indicator: none → some → all
                  const cycleState: 'none' | 'some' | 'all' = allSelected ? 'all' : someSelected ? 'some' : 'none';

                  return (
                    <div className={cn(
                      'rounded-xl border mb-3 overflow-hidden transition-all',
                      someSelected
                        ? 'border-[#1D3461]/30 shadow-sm'
                        : 'border-border'
                    )}>
                      {/* ── Main select/filter row ── */}
                      <div className="flex items-center gap-0 px-3 py-2 bg-muted/20">

                        {/* Cycle select-all button */}
                        <button
                          onClick={() => setSelectedTxnIds(allSelected ? new Set() : new Set(reviewTransactions.map(t => t.id)))}
                          className="flex items-center gap-2 pr-3 mr-3 border-r border-border/60 shrink-0 group"
                          data-testid="button-select-all-txns"
                        >
                          {/* Animated ring indicator */}
                          <div className={cn(
                            'relative h-5 w-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center shrink-0',
                            cycleState === 'all'  ? 'bg-[#1D3461] border-[#1D3461]' :
                            cycleState === 'some' ? 'bg-blue-50 border-blue-500 dark:bg-blue-950/40' :
                            'border-muted-foreground/40 bg-background group-hover:border-[#1D3461]/60'
                          )}>
                            {cycleState === 'all'  && <div className="h-2 w-2 rounded-full bg-white" />}
                            {cycleState === 'some' && <div className="h-0.5 w-2.5 rounded-full bg-blue-500" />}
                          </div>
                          <span className={cn(
                            'text-[11px] font-medium transition-colors whitespace-nowrap',
                            cycleState === 'all'  ? 'text-[#1D3461]' :
                            cycleState === 'some' ? 'text-blue-600 dark:text-blue-400' :
                            'text-muted-foreground group-hover:text-foreground'
                          )}>
                            {cycleState === 'all' ? 'Deselect all' : 'Select all'}
                          </span>
                        </button>

                        {/* Group-select pills */}
                        <div className="flex items-center gap-1.5 flex-wrap flex-1">
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 mr-0.5 shrink-0">Group:</span>

                          {/* By Reference */}
                          {uniqueRefs.length > 0 && (
                            <Select value={groupByRef} onValueChange={val => {
                              setGroupByRef('');
                              setSelectedTxnIds(prev => {
                                const next = new Set(prev);
                                reviewTransactions.filter(t => t.reference === val).forEach(t => next.add(t.id));
                                return next;
                              });
                            }}>
                              <SelectTrigger
                                className="h-6 text-[10px] font-medium w-auto px-2.5 rounded-full border bg-background hover:bg-[#1D3461]/5 hover:border-[#1D3461]/40 gap-1 [&>svg]:hidden transition-colors"
                                data-testid="select-group-by-ref"
                              >
                                <Hash className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="By Reference" />
                                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueRefs.map(r => (
                                  <SelectItem key={r} value={r} className="text-xs">
                                    <span className="font-mono">{r}</span>
                                    <span className="text-muted-foreground ml-1">· {reviewTransactions.filter(t => t.reference === r).length} txns</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {/* By Collector */}
                          {uniqueCollectors.length > 0 && (
                            <Select value={groupByCollector} onValueChange={val => {
                              setGroupByCollector('');
                              setSelectedTxnIds(prev => {
                                const next = new Set(prev);
                                reviewTransactions.filter(t => t.user_id === val).forEach(t => next.add(t.id));
                                return next;
                              });
                            }}>
                              <SelectTrigger
                                className="h-6 text-[10px] font-medium w-auto px-2.5 rounded-full border bg-background hover:bg-[#1D3461]/5 hover:border-[#1D3461]/40 gap-1 [&>svg]:hidden transition-colors"
                                data-testid="select-group-by-collector"
                              >
                                <User className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="By Collector" />
                                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueCollectors.map(([uid, name]) => (
                                  <SelectItem key={uid} value={uid} className="text-xs">
                                    {name}
                                    <span className="text-muted-foreground ml-1">· {reviewTransactions.filter(t => t.user_id === uid).length} txns</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {/* By Date */}
                          <Select value={groupByDate} onValueChange={val => {
                            setGroupByDate('');
                            setSelectedTxnIds(prev => {
                              const next = new Set(prev);
                                reviewTransactions.filter(t => datePart(t.transaction_date).startsWith(val)).forEach(t => next.add(t.id));
                              return next;
                            });
                          }}>
                            <SelectTrigger
                              className="h-6 text-[10px] font-medium w-auto px-2.5 rounded-full border bg-background hover:bg-[#1D3461]/5 hover:border-[#1D3461]/40 gap-1 [&>svg]:hidden transition-colors"
                              data-testid="select-group-by-date"
                            >
                              <Calendar className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              <SelectValue placeholder="By Date" />
                              <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                            </SelectTrigger>
                            <SelectContent>
                              {uniqueDates.map(d => (
                                <SelectItem key={d} value={d} className="text-xs">
                                  {formatIsoDate(d, 'MMM d, yyyy')}
                                  <span className="text-muted-foreground ml-1">· {reviewTransactions.filter(t => datePart(t.transaction_date).startsWith(d)).length} txns</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Unattributed filter chip — inside the group pill row */}
                          {(filteredUnattributedPayments.length > 0 || showUnattributed) && (
                            <button
                              onClick={() => setShowUnattributed(v => !v)}
                              className={cn(
                                'flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[10px] font-semibold transition-colors shrink-0',
                                showUnattributed
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                              )}
                              data-testid="button-filter-unattributed"
                              title="Show only payment transactions with no staff assigned"
                            >
                              <UserPlus className="h-2.5 w-2.5 shrink-0" />
                              Unattributed ({filteredUnattributedPayments.length})
                              {showUnattributed && <X className="h-2.5 w-2.5 shrink-0" />}
                            </button>
                          )}
                        </div>

                        {/* Count badge (always visible, shows 0 when none) */}
                        <div className={cn(
                          'flex items-center gap-1.5 ml-2 pl-3 border-l border-border/60 shrink-0 transition-all',
                          someSelected ? 'opacity-100' : 'opacity-40'
                        )}>
                          <span className={cn(
                            'text-[10px] font-semibold tabular-nums transition-colors',
                            someSelected ? 'text-[#1D3461]' : 'text-muted-foreground'
                          )}>
                            {selectedTxnIds.size} of {reviewTransactions.length}
                          </span>
                        </div>
                      </div>

                      {/* ── Bulk action strip (slides in when selected) ── */}
                      {someSelected && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-[#1D3461]/5 border-t border-[#1D3461]/15">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className="h-1.5 w-1.5 rounded-full bg-[#1D3461] shrink-0" />
                            <span className="text-[11px] font-semibold text-[#1D3461] truncate">
                              {selectedTxnIds.size} transaction{selectedTxnIds.size !== 1 ? 's' : ''} selected
                            </span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              · {currency} {formatNumber(selectedTotal, 0)}
                            </span>
                          </div>
                          {/* Show-only-selected toggle */}
                          <button
                            onClick={() => setShowOnlySelected(v => !v)}
                            className={cn(
                              'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors shrink-0',
                              showOnlySelected
                                ? 'bg-[#1D3461] text-white border-[#1D3461]'
                                : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-[#1D3461]/40'
                            )}
                            data-testid="button-show-only-selected"
                          >
                            <Filter className="h-2.5 w-2.5" />
                            {showOnlySelected ? 'Showing selected' : 'Show selected only'}
                          </button>
                          <button
                            onClick={() => { setSelectedTxnIds(new Set()); setShowOnlySelected(false); }}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            data-testid="button-clear-selection"
                          >
                            <X className="h-3 w-3" /> Clear
                          </button>
                          <Button
                            size="sm" variant="destructive"
                            className="h-7 text-xs px-3 gap-1.5 rounded-lg shrink-0"
                            onClick={() => setConfirmBulkDelete(true)}
                            disabled={bulkDeleting}
                            data-testid="button-bulk-delete"
                          >
                            {bulkDeleting
                              ? <><RefreshCw className="h-3 w-3 animate-spin" />Removing…</>
                              : <><Trash2 className="h-3 w-3" />Delete {selectedTxnIds.size}</>
                            }
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {txnLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No transactions yet for this fund</p>
                  </div>
                ) : displayTxns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Filter className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No transactions match these filters</p>
                    <p className="mt-1 text-xs">Try another State, MMP, or person name.</p>
                    {hasTransactionFilters && (
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => { setStateFilter(FILTER_ALL); setMmpFilter(FILTER_ALL); setNameSearch(''); }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="w-8 text-center px-2">
                            <button
                              onClick={() => setSelectedTxnIds(
                                reviewTransactions.every(t => selectedTxnIds.has(t.id))
                                  ? new Set()
                                  : new Set(reviewTransactions.map(t => t.id))
                              )}
                              className="group mx-auto flex items-center justify-center"
                              data-testid="checkbox-select-all-header"
                            >
                              <div className={cn(
                                'h-4 w-4 rounded-full border-2 transition-all duration-150 flex items-center justify-center',
                                reviewTransactions.length > 0 && reviewTransactions.every(t => selectedTxnIds.has(t.id))
                                  ? 'bg-[#1D3461] border-[#1D3461]'
                                  : selectedTxnIds.size > 0
                                  ? 'bg-blue-50 border-blue-400 dark:bg-blue-950/30'
                                  : 'border-muted-foreground/30 group-hover:border-[#1D3461]/50'
                              )}>
                                {reviewTransactions.length > 0 && reviewTransactions.every(t => selectedTxnIds.has(t.id)) && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                )}
                                {selectedTxnIds.size > 0 && !reviewTransactions.every(t => selectedTxnIds.has(t.id)) && (
                                  <div className="h-px w-2 rounded-full bg-blue-500" />
                                )}
                              </div>
                            </button>
                          </TableHead>
                          <TableHead className="whitespace-nowrap">Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead><span className="flex items-center gap-1"><User className="h-3 w-3" />Paid By</span></TableHead>
                          <TableHead><span className="flex items-center gap-1"><Clock className="h-3 w-3" />Recorded</span></TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-center w-8"><Receipt className="h-3 w-3 mx-auto" /></TableHead>
                          <TableHead className="text-center" onClick={e => e.stopPropagation()}>
                            {isCD ? (
                              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Recon</span>
                            ) : (() => {
                              const total = displayTxns.length;
                              const reconciled = displayTxns.filter(t => t.reconciled).length;
                              const allDone = total > 0 && reconciled === total;
                              const someDone = reconciled > 0 && reconciled < total;
                              return (
                                <button
                                  title={allDone ? 'Unreconcile all' : 'Reconcile all'}
                                  disabled={reconcilingAll || total === 0}
                                  onClick={() => handleReconcileAll(!allDone)}
                                  className={cn(
                                    'h-5 w-5 rounded border-2 transition-colors mx-auto flex items-center justify-center',
                                    allDone
                                      ? 'bg-emerald-500 border-emerald-500 text-white'
                                      : someDone
                                      ? 'bg-emerald-200 border-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-600'
                                      : 'border-muted-foreground hover:border-emerald-500',
                                    reconcilingAll && 'opacity-50 cursor-wait'
                                  )}
                                  data-testid="button-reconcile-all"
                                >
                                  {allDone && <CheckCircle2 className="h-3 w-3" />}
                                  {someDone && !allDone && <span className="block h-1.5 w-1.5 rounded-sm bg-emerald-500" />}
                                </button>
                              );
                            })()}
                          </TableHead>
                          <TableHead className="text-center w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayTxns.map(t => (
                          <TableRow
                            key={t.id}
                            data-testid={`row-txn-${t.id}`}
                            className={cn('cursor-pointer hover:bg-muted/40 text-xs', selectedTxnIds.has(t.id) && 'bg-blue-50/60 dark:bg-blue-950/20')}
                            onClick={() => handleDrillDown(t)}
                          >
                            <TableCell className="w-8 text-center px-2" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setSelectedTxnIds(prev => {
                                  const next = new Set(prev);
                                  next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                  return next;
                                })}
                                className="group mx-auto flex items-center justify-center"
                                data-testid={`checkbox-txn-${t.id}`}
                              >
                                <div className={cn(
                                  'h-4 w-4 rounded-full border-2 transition-all duration-150 flex items-center justify-center',
                                  selectedTxnIds.has(t.id)
                                    ? 'bg-[#1D3461] border-[#1D3461]'
                                    : 'border-muted-foreground/25 group-hover:border-[#1D3461]/50 bg-background'
                                )}>
                                  {selectedTxnIds.has(t.id) && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                              </button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div>{formatIsoDate(t.transaction_date, 'MMM d, yyyy')}</div>
                              <div className="text-[10px] text-muted-foreground/70">{formatIsoDate(t.created_at, 'HH:mm')}</div>
                            </TableCell>
                            <TableCell>
                              <span className={cn('font-medium', TXN_TYPE_CFG[t.transaction_type]?.color)}>
                                {TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[100px] truncate">{t.reference ?? '—'}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <span className="line-clamp-2">{t.description ?? '—'}</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {t.source_table ? t.source_table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Down Payment Requests', 'Down-Payment').replace('Operational Cost Submissions', 'Op.Cost').replace('Pre Fund Transactions', 'Manual') : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              {t.user_id ? (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                  {profileMap.get(t.user_id) ?? <span className="text-muted-foreground italic">Unknown</span>}
                                </span>
                              ) : !isCD && t.transaction_type === 'payment' && allocUsers.length > 0 ? (
                                <button
                                  onClick={() => { setAssignTxn(t); setAssignUserId(''); }}
                                  className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-[10px] font-medium border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                                  data-testid={`button-assign-staff-${t.id}`}
                                  title="Assign this payment to a staff allocation"
                                >
                                  <UserPlus className="h-2.5 w-2.5 shrink-0" />
                                  Assign
                                </button>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {t.created_by ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                  <span className="text-muted-foreground">{profileMap.get(t.created_by) ?? t.created_by.slice(0, 8)}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50">{formatIsoDate(t.created_at, 'MMM d HH:mm')}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{t.currency} {formatNumber(t.amount, 0)}</TableCell>
                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              {t.receipt_url ? (() => {
                                const cleanTxnUrl = normalizeReceiptUrl(t.receipt_url);
                                const batchGroup = receiptGroupMap.get(t.receipt_url);
                                const isBatch = !!batchGroup;
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => setPreviewReceiptUrl(cleanTxnUrl)}
                                          className="flex flex-col items-center justify-center gap-0.5 mx-auto rounded px-1 py-0.5 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-sky-600 transition-colors"
                                          data-testid={`button-receipt-${t.id}`}
                                        >
                                          <Receipt className="h-3.5 w-3.5" />
                                          {isBatch && (
                                            <span className="text-[9px] font-bold leading-none bg-amber-500 text-white rounded-full px-1">{batchGroup!.length}×</span>
                                          )}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-xs max-w-[200px]">
                                        {isBatch
                                          ? `Batch receipt — covers ${batchGroup!.length} transactions totalling ${t.currency} ${formatNumber(batchGroup!.reduce((s, x) => s + x.amount, 0), 0)}`
                                          : 'View receipt'
                                        }
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })() : (
                                <span className="text-muted-foreground/30 text-[10px]">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              {isCD ? (
                                <div className={cn('h-5 w-5 rounded-full border-2 mx-auto flex items-center justify-center',
                                  t.reconciled ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/30'
                                )}>
                                  {t.reconciled && <CheckCircle2 className="h-3 w-3" />}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleReconcileTxn(t.id, !t.reconciled)}
                                  className={cn('h-5 w-5 rounded-full border-2 transition-colors mx-auto flex items-center justify-center',
                                    t.reconciled ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground hover:border-emerald-500'
                                  )}
                                  data-testid={`button-reconcile-${t.id}`}
                                >
                                  {t.reconciled && <CheckCircle2 className="h-3 w-3" />}
                                </button>
                              )}
                            </TableCell>
                            {!isCD && (
                              <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  {t.transaction_type === 'payment' && t.source_table && t.source_id && (
                                    <button
                                      onClick={() => {
                                        setCorrectionTxn(t);
                                        setCorrectionFundId('');
                                        setCorrectionReason('');
                                      }}
                                      disabled={correctingTxn}
                                      title="Correct the selected Pre-Fund without editing payment history"
                                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-sky-50 dark:hover:bg-sky-950/30 text-muted-foreground hover:text-sky-600 transition-colors disabled:opacity-40"
                                      data-testid={`button-correct-fund-${t.id}`}
                                    >
                                      <Shuffle className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {t.source_table === 'down_payment_requests' && (
                                    <button
                                      onClick={() => setConfirmUnlinkTxn(t)}
                                      disabled={unlinkingId === t.id}
                                      title="Cancel Down Payment — reverses its payment and restores the fund balance"
                                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-muted-foreground hover:text-rose-600 transition-colors disabled:opacity-40"
                                      data-testid={`button-unlink-${t.id}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={8} className="text-xs">Canonical paid out (including reversals)</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {selectedFund.currency} {formatNumber(effectivePaidAmount, 0)}
                          </TableCell>
                          <TableCell />
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {displayTxns.filter(t => t.transaction_type === 'payment' && t.reconciled).length}/{displayTxns.filter(t => t.transaction_type === 'payment').length}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* ── Past Reconciliations Timeline ─────────────────────────── */}
              {reconciliations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Reconciliation History</h3>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{reconciliations.length}</Badge>
                  </div>
                  <div className="relative space-y-0 pl-4">
                    {/* Timeline line */}
                    <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
                    {reconciliations.map((r, idx) => (
                      <div key={r.id} className="relative mb-3 last:mb-0" data-testid={`card-recon-${r.id}`}>
                        {/* Timeline dot */}
                        <div className="absolute -left-[17px] top-3 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                        <div className="border rounded-lg p-3 bg-card ml-2 text-sm">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <span className="font-semibold">
                                {r.period_start && r.period_end
                                  ? `${formatIsoDate(r.period_start, 'MMM d')} – ${formatIsoDate(r.period_end, 'MMM d, yyyy')}`
                                  : `Reconciliation #${idx + 1}`}
                              </span>
                              {r.closed_at && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Closed {formatIsoDate(r.closed_at, 'MMM d, yyyy HH:mm')}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                <Lock className="h-3 w-3 mr-1" />Closed
                              </Badge>
                              {r.pdf_url && (
                                <a href={r.pdf_url} target="_blank" rel="noreferrer">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="h-3.5 w-3.5" /></Button>
                                </a>
                              )}
                            </div>
                          </div>
                          {/* Financial summary grid */}
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="bg-muted/40 rounded p-1.5">
                              <p className="text-muted-foreground">Total Funded</p>
                              <p className="font-mono font-semibold">{selectedFund.currency} {formatNumber(r.total_funded ?? 0, 0)}</p>
                            </div>
                            <div className="bg-muted/40 rounded p-1.5">
                              <p className="text-muted-foreground">Total Paid</p>
                              <p className="font-mono font-semibold text-sky-600">{selectedFund.currency} {formatNumber(r.total_paid ?? 0, 0)}</p>
                            </div>
                            <div className="bg-muted/40 rounded p-1.5">
                              <p className="text-muted-foreground">Variance</p>
                              <p className={cn('font-mono font-semibold', (r.variance ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                {selectedFund.currency} {formatNumber(r.variance ?? 0, 0)}
                              </p>
                            </div>
                            <div className="bg-muted/40 rounded p-1.5">
                              <p className="text-muted-foreground">{SURPLUS_OPTIONS.find(o => o.value === r.surplus_action)?.label?.split(' ')[0] ?? 'Surplus'}</p>
                              <p className="font-mono font-semibold">
                                {r.surplus_action === 'carry_forward'  && r.carry_forward_amount > 0 && `${formatNumber(r.carry_forward_amount, 0)} CF`}
                                {r.surplus_action === 'return'         && r.return_amount > 0 && `${formatNumber(r.return_amount, 0)} → Donor`}
                                {r.surplus_action === 'return_bank'    && r.return_amount > 0 && `${formatNumber(r.return_amount, 0)} → Bank`}
                                {r.surplus_action === 'return_finance' && r.return_amount > 0 && `${formatNumber(r.return_amount, 0)} → Finance`}
                                {r.surplus_action === 'reserve'        && r.reserve_amount > 0 && `${formatNumber(r.reserve_amount, 0)} RV`}
                                {r.surplus_action === 'split'          && `CF ${formatNumber(r.carry_forward_amount ?? 0, 0)} / RT ${formatNumber(r.return_amount ?? 0, 0)}`}
                                {!r.surplus_action && '—'}
                              </p>
                            </div>
                          </div>
                          {r.notes && (
                            <p className="mt-2 text-[11px] text-muted-foreground italic">{r.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* Add Transaction Dialog */}
      <Dialog open={showAddTxn} onOpenChange={(o) => { setShowAddTxn(o); if (!o) setTxnAllocUserId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type</Label>
              <Select value={txnForm.transaction_type} onValueChange={v => { setTxnForm(p => ({ ...p, transaction_type: v })); if (v !== 'payment') setTxnAllocUserId(null); }}>
                <SelectTrigger data-testid="select-txn-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TXN_TYPE_CFG)
                    .filter(([k]) => k !== 'payment' && k !== 'reversal')
                    .map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount *</Label>
                <Input type="number" value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" data-testid="input-txn-amount" />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={txnForm.currency} onChange={e => setTxnForm(p => ({ ...p, currency: e.target.value }))} data-testid="input-txn-currency" />
              </div>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={txnForm.transaction_date} onChange={e => setTxnForm(p => ({ ...p, transaction_date: e.target.value }))} data-testid="input-txn-date" />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={txnForm.reference} onChange={e => setTxnForm(p => ({ ...p, reference: e.target.value }))} placeholder="TXN-001" data-testid="input-txn-ref" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} rows={2} data-testid="textarea-txn-desc" />
            </div>

            {/* Super-admin only: deduct from a specific user's allocation */}
            {isSuperAdmin && txnForm.transaction_type === 'payment' && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Deduct from staff allocation <span className="font-normal opacity-70">(super-admin only)</span>
                </p>
                {allocUsers.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 opacity-80">No allocations set up for this fund yet.</p>
                ) : (
                  <>
                    <Select value={txnAllocUserId ?? '__none__'} onValueChange={v => setTxnAllocUserId(v === '__none__' ? null : v)} data-testid="select-alloc-user">
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-background">
                        <SelectValue placeholder="No deduction (skip allocation)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No deduction</SelectItem>
                        {allocUsers.map(u => {
                          const remaining = u.allocated - u.spent;
                          return (
                            <SelectItem key={u.id} value={u.id} data-testid={`option-alloc-user-${u.id}`}>
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{u.name}</span>
                                <span className="text-muted-foreground text-[10px]">
                                  {u.currency} {formatNumber(remaining, 0)} remaining
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {txnAllocUserId && (() => {
                      const u = allocUsers.find(x => x.id === txnAllocUserId);
                      if (!u) return null;
                      const remaining = u.allocated - u.spent;
                      const amt = parseFloat(txnForm.amount) || 0;
                      const overBudget = amt > remaining;
                      return (
                        <div className={`text-xs rounded px-2 py-1 ${overBudget ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'}`}>
                          {u.name}: {u.currency} {formatNumber(u.spent, 0)} spent / {formatNumber(u.allocated, 0)} allocated · {formatNumber(remaining, 0)} remaining
                          {overBudget && <span className="font-semibold ml-1">⚠ Payment exceeds remaining allocation</span>}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddTxn(false); setTxnAllocUserId(null); }}>Cancel</Button>
            <Button onClick={handleAddTxn} disabled={saving} data-testid="button-save-txn">{saving ? 'Adding…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Staff Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!assignTxn} onOpenChange={v => { if (!v) { setAssignTxn(null); setAssignUserId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-amber-600" />
              Assign Staff to Transaction
            </DialogTitle>
          </DialogHeader>
          {assignTxn && (
            <div className="space-y-4 py-1">
              {/* Transaction summary */}
              <div className="rounded-lg bg-muted/40 border px-3 py-2.5 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{formatIsoDate(assignTxn.transaction_date, 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold">{assignTxn.currency} {formatNumber(assignTxn.amount, 0)}</span>
                </div>
                {assignTxn.description && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Description</span>
                    <span className="text-right truncate">{assignTxn.description}</span>
                  </div>
                )}
                {assignTxn.reference && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-mono">{assignTxn.reference}</span>
                  </div>
                )}
              </div>
              {/* Staff picker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Assign to staff member</Label>
                {allocUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded p-2">
                    No staff allocations found for this fund. Set up allocations first in the Fund Registry.
                  </p>
                ) : (
                  <Select value={assignUserId} onValueChange={setAssignUserId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-assign-user">
                      <SelectValue placeholder="Select staff member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allocUsers.map(u => {
                        const remaining = u.allocated - u.spent;
                        const overBudget = assignTxn.amount > remaining && remaining >= 0;
                        return (
                          <SelectItem key={u.id} value={u.id} data-testid={`option-assign-user-${u.id}`}>
                            <div className="flex flex-col">
                              <span className="font-medium">{u.name}</span>
                              <span className={cn('text-[10px]', overBudget ? 'text-rose-500' : 'text-muted-foreground')}>
                                {u.currency} {formatNumber(remaining, 0)} remaining
                                {overBudget && ' — exceeds remaining allocation'}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {/* Preview badge for selected user */}
              {assignUserId && (() => {
                const u = allocUsers.find(x => x.id === assignUserId);
                if (!u) return null;
                const remaining = u.allocated - u.spent;
                const after = remaining - assignTxn.amount;
                return (
                  <div className={cn('text-xs rounded px-3 py-2', after < 0 ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800')}>
                    <div className="flex justify-between">
                      <span>Before:</span>
                      <span className="font-mono">{u.currency} {formatNumber(remaining, 0)} remaining</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>After:</span>
                      <span className="font-mono">{u.currency} {formatNumber(after, 0)} remaining</span>
                    </div>
                    {after < 0 && <p className="mt-1 font-semibold">⚠ This exceeds {u.name}'s allocation</p>}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignTxn(null); setAssignUserId(''); }}>Cancel</Button>
            <Button
              onClick={handleAssignStaff}
              disabled={assigning || !assignUserId}
              data-testid="button-confirm-assign-staff"
            >
              {assigning ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Assigning…</> : 'Assign Staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transaction Drill-Down Dialog ──────────────────────────────────── */}
      <Dialog open={!!drillTxn} onOpenChange={v => { if (!v) { setDrillTxn(null); setDrillSrc(null); } }}>
        <DialogContent className="max-w-xl flex flex-col max-h-[90vh] p-0 gap-0 overflow-hidden">
          {/* ── Sticky header ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-base">Transaction Detail</span>
            </div>
            {drillTxn && (
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
                TXN_TYPE_CFG[drillTxn.transaction_type]?.bg ?? 'bg-muted border-border',
                TXN_TYPE_CFG[drillTxn.transaction_type]?.color ?? 'text-foreground',
              )}>
                {TXN_TYPE_CFG[drillTxn.transaction_type]?.label ?? drillTxn.transaction_type}
              </div>
            )}
          </div>

          {drillTxn && (
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* ── Hero: amount + status badges ── */}
              <div className="rounded-xl border bg-gradient-to-br from-[#1D3461]/6 to-transparent p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-3xl font-bold tabular-nums text-[#1D3461] dark:text-blue-300 tracking-tight">
                      {drillTxn.currency} {formatNumber(drillTxn.amount, 0)}
                    </p>
                    {drillTxn.description && (
                      <p className="text-sm text-muted-foreground mt-1 leading-snug line-clamp-2">{drillTxn.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {drillTxn.reconciled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />Reconciled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                          Pending reconciliation
                        </span>
                      )}
                      {drillTxn.gl_journal_entry_id && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                          GL Posted
                        </span>
                      )}
                    </div>
                  </div>
                  {drillTxn.reference && (
                    <div className="text-right shrink-0 bg-background rounded-lg border px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reference</p>
                      <p className="font-mono font-semibold text-sm mt-0.5">{drillTxn.reference}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Date timeline ── */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 border rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                    <Calendar className="h-2.5 w-2.5" /> Payment Date
                  </p>
                  <p className="text-sm font-semibold">{formatIsoDate(drillTxn.transaction_date, 'MMM d, yyyy')}</p>
                  <p className="text-[11px] text-muted-foreground">{formatIsoDate(drillTxn.transaction_date, 'EEEE')}</p>
                </div>
                <div className="bg-muted/30 border rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="h-2.5 w-2.5" /> Recorded At
                  </p>
                  <p className="text-sm font-semibold">{formatIsoDate(drillTxn.created_at, 'MMM d, yyyy')}</p>
                  <p className="text-[11px] text-muted-foreground">{formatIsoDate(drillTxn.created_at, 'HH:mm')}</p>
                </div>
              </div>

              {/* ── People ── */}
              {(drillTxn.user_id || drillTxn.created_by) && (() => {
                const people: Array<{ label: string; uid: string }> = [];
                if (drillTxn.user_id)    people.push({ label: 'Paid By',     uid: drillTxn.user_id });
                if (drillTxn.created_by) people.push({ label: 'Recorded By', uid: drillTxn.created_by });
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">People</p>
                    <div className={cn('grid gap-2', people.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                      {people.map(({ label, uid }) => {
                        const name  = profileMap.get(uid) ?? uid.slice(0,8) + '…';
                        const email = profileEmailMap.get(uid);
                        const initials = getInitials(name);
                        const bgCls = avatarColor(name);
                        return (
                          <div key={uid} className="flex items-center gap-3 border rounded-xl px-3 py-2.5 bg-background">
                            <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0', bgCls)}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
                              <p className="text-sm font-semibold leading-tight truncate">{name}</p>
                              {email && <p className="text-[11px] text-muted-foreground truncate">{email}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Transaction metadata ── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Transaction Info</p>
                <div className="rounded-xl border overflow-hidden">
                  {([
                    ['Source Module',  drillTxn.source_table
                      ? drillTxn.source_table.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
                      : 'Manual Entry'],
                    ['GL Journal',     drillTxn.gl_journal_entry_id ?? null],
                    ['Reconciled At',  drillTxn.reconciled && drillTxn.reconciled_at
                      ? formatIsoDate(drillTxn.reconciled_at, 'MMM d, yyyy HH:mm')
                      : null],
                    ['Transaction ID', drillTxn.id],
                  ] as [string, string | null][])
                    .filter(([,v]) => v != null)
                    .map(([k, v], i, arr) => (
                      <div key={k} className={cn(
                        'flex items-center justify-between gap-4 px-3 py-2 text-sm',
                        i < arr.length - 1 && 'border-b'
                      )}>
                        <span className="text-muted-foreground text-xs shrink-0">{k}</span>
                        <span className={cn(
                          'font-medium text-xs text-right truncate max-w-[240px]',
                          k === 'Transaction ID' && 'font-mono text-muted-foreground'
                        )}>
                          {k === 'Transaction ID' ? `${v!.slice(0,8)}…${v!.slice(-4)}` : v}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* ── Receipt ── */}
              {drillTxn.receipt_url && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <Receipt className="h-3 w-3" /> Receipt / Proof of Payment
                  </p>
                  {receiptGroupMap.has(drillTxn.receipt_url) && (() => {
                    const group = receiptGroupMap.get(drillTxn.receipt_url)!;
                    const total = group.reduce((s, t) => s + t.amount, 0);
                    return (
                      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-300 mb-2">
                        <Shuffle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                        <div>
                          <p className="font-semibold">Batch receipt — 1 receipt covers {group.length} transactions</p>
                          <p className="text-amber-700 dark:text-amber-400 mt-0.5">Total: {drillTxn.currency} {formatNumber(total, 0)}</p>
                          <div className="mt-1.5 space-y-0.5">
                            {group.map((t, i) => (
                              <div key={t.id} className="flex justify-between gap-4">
                                <span className="text-amber-700/80 dark:text-amber-400/80">
                                  {i + 1}. {t.description ?? t.reference ?? `Txn ${t.id.slice(0,8)}`}
                                </span>
                                <span className="font-mono font-medium shrink-0">{t.currency} {formatNumber(t.amount, 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const cleanUrl = normalizeReceiptUrl(drillTxn.receipt_url);
                    if (!cleanUrl) return null;
                    return cleanUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                      <button onClick={() => setPreviewReceiptUrl(cleanUrl)} className="w-full text-left">
                        <img src={cleanUrl} alt="Receipt" className="max-h-48 rounded-xl border object-contain w-full hover:opacity-90 transition-opacity cursor-pointer" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setPreviewReceiptUrl(cleanUrl)}
                        className="flex items-center gap-2 text-sky-600 hover:text-sky-700 text-sm font-medium bg-sky-50 dark:bg-sky-950/20 rounded-xl px-3 py-2.5 border border-sky-200 dark:border-sky-800 w-full transition-colors"
                      >
                        <Receipt className="h-4 w-4 shrink-0" />
                        View Receipt / Attachment
                        <ExternalLink className="h-3.5 w-3.5 ml-auto shrink-0" />
                      </button>
                    );
                  })()}
                </div>
              )}

              {/* ── Source record ── */}
              {drillTxn.source_id && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" />
                    {drillTxn.source_table
                      ? drillTxn.source_table.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
                      : 'Source Record'}
                    {loadingDrill && <span className="text-[10px] font-normal text-muted-foreground">(loading…)</span>}
                  </p>

                  {loadingDrill ? (
                    <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-5 w-full" />)}</div>
                  ) : drillSrc ? (() => {
                    // Helper to render a single source field value
                    const renderVal = (k: string, v: unknown): React.ReactNode => {
                      if (v == null || v === '') return null;
                      const str = String(v);
                      if (k.includes('_at') || k.includes('_date')) {
                        try { return format(parseISO(str), 'MMM d, yyyy HH:mm'); } catch { return str; }
                      }
                      if (k.includes('receipt') || k.includes('url') || k.includes('proof') || k.includes('document')) {
                        return <a href={str} target="_blank" rel="noreferrer" className="text-sky-600 underline text-xs">View file ↗</a>;
                      }
                      if (UUID_RE.test(str) && (USER_ID_FIELDS.has(k) || k.endsWith('_by') || k.endsWith('_user_id'))) {
                        const uname = profileMap.get(str);
                        return (
                          <span className="flex items-center gap-1.5">
                            {uname ? (
                              <>
                                <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0', avatarColor(uname))}>
                                  {getInitials(uname)}
                                </span>
                                <span>{uname}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{str.slice(0,8)}…</span>
                            )}
                          </span>
                        );
                      }
                      if (UUID_RE.test(str)) return <span className="font-mono text-muted-foreground text-[11px]">{str.slice(0,8)}…</span>;
                      // Numeric-looking values — just show as-is (they may be budget amounts)
                      return str;
                    };

                    const sections = SOURCE_SECTIONS[drillTxn.source_table ?? ''];
                    const SKIP_KEYS = new Set(['id','pre_fund_request_id','mmp_id','mmp_file_id','pre_fund_transaction_id']);

                    if (sections) {
                      // Structured layout for known tables
                      return (
                        <div className="space-y-3">
                          {sections.map(sec => {
                            const rows = sec.keys
                              .map(k => [k, drillSrc[k]] as [string, unknown])
                              .filter(([, v]) => v != null && v !== '');
                            if (rows.length === 0) return null;
                            return (
                              <div key={sec.label} className="rounded-xl border overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{sec.label}</p>
                                </div>
                                <div className="divide-y">
                                  {rows.map(([k, v]) => {
                                    const display = renderVal(k, v);
                                    if (display == null) return null;
                                    const label = k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
                                    return (
                                      <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
                                        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                                        <span className="text-xs font-medium text-right max-w-[220px] truncate">{display}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          {/* Any leftover keys not in the section map */}
                          {(() => {
                            const coveredKeys = new Set(sections.flatMap(s => s.keys));
                            const leftover = Object.entries(drillSrc)
                              .filter(([k, v]) => !coveredKeys.has(k) && !SKIP_KEYS.has(k) && v != null && v !== '');
                            if (leftover.length === 0) return null;
                            return (
                              <div className="rounded-xl border overflow-hidden">
                                <div className="bg-muted/40 px-3 py-1.5 border-b">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Other</p>
                                </div>
                                <div className="divide-y">
                                  {leftover.map(([k, v]) => {
                                    const display = renderVal(k, v);
                                    if (display == null) return null;
                                    return (
                                      <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
                                        <span className="text-xs text-muted-foreground shrink-0">{k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                                        <span className="text-xs font-medium text-right max-w-[220px] truncate">{display}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    }

                    // Generic fallback for unknown source tables
                    const rows = Object.entries(drillSrc)
                      .filter(([k, v]) => v != null && v !== '' && !SKIP_KEYS.has(k))
                      .slice(0, 20);
                    return (
                      <div className="rounded-xl border overflow-hidden">
                        <div className="divide-y">
                          {rows.map(([k, v]) => {
                            const display = renderVal(k, v);
                            if (display == null) return null;
                            return (
                              <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
                                <span className="text-xs text-muted-foreground shrink-0">{k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                                <span className="text-xs font-medium text-right max-w-[220px] truncate">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (
                    <p className="text-sm text-muted-foreground italic">No source record found or not accessible.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="shrink-0 px-5 py-3 border-t flex items-center justify-between gap-3">
            {isSuperAdmin && drillTxn?.transaction_type === 'payment' && drillTxn.source_table === 'operational_cost_submissions' && drillTxn.source_id && !drillTxn.reconciled && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDeletePaidRequestTxn(drillTxn);
                  setDrillTxn(null);
                  setDrillSrc(null);
                }}
                data-testid="button-delete-paid-operational-cost-request"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />Delete payment
              </Button>
            )}
            <Button variant="outline" onClick={() => { setDrillTxn(null); setDrillSrc(null); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletePaidRequestTxn}
        onOpenChange={open => { if (!open && !deletingPaidRequest) setDeletePaidRequestTxn(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-4 w-4" />Delete payment and request
            </DialogTitle>
          </DialogHeader>
          {deletePaidRequestTxn && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                This will delete the Operational Cost Submission and reverse its linked payment. The amount will no longer appear as active paid-out spend in Reconciliation.
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{deletePaidRequestTxn.description ?? 'Operational Cost Submission'}</p>
                <p className="mt-1 font-mono font-semibold">
                  {deletePaidRequestTxn.currency} {formatNumber(deletePaidRequestTxn.amount, 0)}
                </p>
              </div>
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                  The original payment is kept only as a reversed audit event. This action cannot delete a reconciled submission.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePaidRequestTxn(null)} disabled={deletingPaidRequest}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeletePaidOperationalCostRequest()}
              disabled={deletingPaidRequest}
              data-testid="button-confirm-delete-paid-operational-cost-request"
            >
              {deletingPaidRequest
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Deleting…</>
                : <><Trash2 className="mr-1.5 h-4 w-4" />Delete payment</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showCsvImport} onOpenChange={v => { setShowCsvImport(v); if (!v) { setCsvText(''); setCsvParsed([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import Transactions from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <Alert>
              <AlertDescription className="text-xs">
                Expected columns (in any order): <strong>date</strong>, <strong>amount</strong>, <strong>reference</strong>, <strong>description</strong>.
                First row must be a header. All rows will be imported as <em>Payment</em> transactions for the selected fund.
              </AlertDescription>
            </Alert>
            <div>
              <Label>Paste CSV content</Label>
              <Textarea
                value={csvText}
                onChange={e => { setCsvText(e.target.value); parseCsv(e.target.value); }}
                rows={8}
                placeholder={`date,amount,reference,description\n2025-01-15,5000,TXN-001,Field supplies\n2025-01-20,2500,TXN-002,Transport costs`}
                className="font-mono text-xs mt-1"
                data-testid="textarea-csv-content"
              />
            </div>
            {csvParsed.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{csvParsed.length} row{csvParsed.length !== 1 ? 's' : ''} parsed — preview:</p>
                <div className="rounded-lg border overflow-x-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvParsed.slice(0, 10).map((r, i) => (
                        <TableRow key={i} data-testid={`row-csv-preview-${i}`}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-xs font-mono">{selectedFund?.currency} {r.amount}</TableCell>
                          <TableCell className="text-xs">{r.reference || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{r.description}</TableCell>
                        </TableRow>
                      ))}
                      {csvParsed.length > 10 && (
                        <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground text-center">…and {csvParsed.length - 10} more</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCsvImport(false); setCsvText(''); setCsvParsed([]); }}>Cancel</Button>
            <Button onClick={handleCsvImport} disabled={csvParsed.length === 0 || importing} data-testid="button-confirm-csv-import">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {importing ? 'Importing…' : `Import ${csvParsed.length} Row${csvParsed.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Period Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Close Period</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Alert>
              <AlertDescription className="text-sm">
                This will lock all transactions, post GL entries, and set the fund status to Closed. This cannot be undone.
              </AlertDescription>
            </Alert>
            {selectedFund && (
              <div className="bg-muted/40 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span>Available Surplus</span><span className="font-mono font-semibold">{selectedFund.currency} {formatNumber(selectedFund.available_balance, 0)}</span></div>
              </div>
            )}
            <div>
              <Label>Surplus Action</Label>
              <Select value={closeForm.surplus_action} onValueChange={v => setCloseForm(p => ({ ...p, surplus_action: v }))}>
                <SelectTrigger data-testid="select-surplus-action"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SURPLUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {closeForm.surplus_action === 'split' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Carry Forward Amount</Label>
                  <Input type="number" value={closeForm.carry_forward_amount} onChange={e => setCloseForm(p => ({ ...p, carry_forward_amount: e.target.value }))} data-testid="input-carry-amount" />
                </div>
                <div>
                  <Label>Return Amount</Label>
                  <Input type="number" value={closeForm.return_amount} onChange={e => setCloseForm(p => ({ ...p, return_amount: e.target.value }))} data-testid="input-return-amount" />
                </div>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Closure notes…" data-testid="textarea-close-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClose(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClosePeriod} disabled={closing} data-testid="button-confirm-close">
              {closing ? 'Closing…' : 'Close Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk delete confirmation dialog ─────────────────────────────────── */}
      <Dialog open={confirmBulkDelete || bulkDeleting} onOpenChange={open => { if (!open && !bulkDeleting) setConfirmBulkDelete(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-4 w-4" /> Remove {visibleSelectedTransactions.length} Transaction{visibleSelectedTransactions.length !== 1 ? 's' : ''}
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              This will permanently remove the selected {visibleSelectedTransactions.length} transaction{visibleSelectedTransactions.length !== 1 ? 's' : ''} and restore the fund balance.
            </p>
          </DialogHeader>

          {bulkDeleting ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
              <div className="text-center">
                <p className="font-medium text-sm">Removing {visibleSelectedTransactions.length} transactions…</p>
                <p className="text-xs text-muted-foreground mt-1">Unlinking fund records and restoring balance. Please wait.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {selectedFund && (
                <div className="rounded-lg border p-4 space-y-2 bg-muted/30 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Selected transactions</span>
                    <span className="font-semibold tabular-nums">{visibleSelectedTransactions.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Balance to restore</span>
                    <span className="font-mono font-semibold text-emerald-600 tabular-nums">
                      {selectedFund.currency} {formatNumber(visibleSelectedTransactions.reduce((s, t) => s + t.amount, 0), 0)}
                    </span>
                  </div>
                  {/* Type breakdown */}
                  {(() => {
                    const sel = transactions.filter(t => selectedTxnIds.has(t.id));
                    const byType = sel.reduce((m, t) => { m[t.transaction_type] = (m[t.transaction_type] ?? 0) + 1; return m; }, {} as Record<string, number>);
                    return (
                      <div className="flex gap-1.5 flex-wrap pt-1 border-t">
                        {Object.entries(byType).map(([type, count]) => (
                          <span key={type} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted', TXN_TYPE_CFG[type]?.color)}>
                            {TXN_TYPE_CFG[type]?.label ?? type} ×{count}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                  Original payment records are not deleted — only the fund linkage is removed.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting} data-testid="button-cancel-bulk-delete">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkUnlink} disabled={bulkDeleting} data-testid="button-confirm-bulk-delete">
              {bulkDeleting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Removing…</>
                : <><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove {visibleSelectedTransactions.length} & Restore Balance</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unlink confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={!!confirmUnlinkTxn} onOpenChange={open => { if (!open) setConfirmUnlinkTxn(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-4 w-4" /> Cancel Paid Down Payment
            </DialogTitle>
          </DialogHeader>
          {confirmUnlinkTxn && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                This will cancel the underlying Down Payment and add a compensating reversal that restores the fund balance.
              </p>
              <div className="rounded-lg border p-3 space-y-1 bg-muted/30 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{TXN_TYPE_CFG[confirmUnlinkTxn.transaction_type]?.label ?? confirmUnlinkTxn.transaction_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{formatIsoDate(confirmUnlinkTxn.transaction_date, 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold">{confirmUnlinkTxn.currency} {formatNumber(confirmUnlinkTxn.amount, 0)}</span>
                </div>
                {confirmUnlinkTxn.description && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Description</span>
                    <span className="text-right max-w-[180px] truncate">{confirmUnlinkTxn.description}</span>
                  </div>
                )}
              </div>
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                  Balance will be restored by {confirmUnlinkTxn.currency} {formatNumber(confirmUnlinkTxn.amount, 0)}. The original payment event remains immutable for audit.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnlinkTxn(null)} data-testid="button-cancel-unlink">Cancel</Button>
            <Button variant="destructive" onClick={handleUnlinkTxn} data-testid="button-confirm-unlink">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Cancel & Restore Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!correctionTxn} onOpenChange={open => {
        if (!open && !correctingTxn) {
          setCorrectionTxn(null);
          setCorrectionFundId('');
          setCorrectionReason('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-700">
              <Shuffle className="h-4 w-4" /> Correct Pre-Fund
            </DialogTitle>
          </DialogHeader>
          {correctionTxn && (
            <div className="space-y-4 py-1">
              <Alert className="border-sky-200 bg-sky-50 dark:bg-sky-950/20">
                <Info className="h-4 w-4 text-sky-700" />
                <AlertDescription className="text-xs text-sky-800 dark:text-sky-200">
                  This does not edit history. Finance will create a compensating reversal on the original fund and a new payment event on the replacement fund.
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label>Replacement Pre-Fund</Label>
                <Select value={correctionFundId} onValueChange={setCorrectionFundId} disabled={correctingTxn}>
                  <SelectTrigger data-testid="select-correction-pre-fund">
                    <SelectValue placeholder="Select the actual funding source" />
                  </SelectTrigger>
                  <SelectContent>
                    {funds
                      .filter(fund => fund.id !== correctionTxn.pre_fund_request_id && ['active', 'low_balance'].includes(fund.status))
                      .map(fund => (
                        <SelectItem key={fund.id} value={fund.id}>
                          {fund.name} — {fund.currency} {formatNumber(fund.available_balance, 0)} available
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea
                  value={correctionReason}
                  onChange={event => setCorrectionReason(event.target.value)}
                  placeholder="Explain the evidence for the correct funding source"
                  disabled={correctingTxn}
                  data-testid="input-correction-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionTxn(null)} disabled={correctingTxn}>Cancel</Button>
            <Button onClick={handleCorrectFund} disabled={correctingTxn || !correctionFundId || !correctionReason.trim()} data-testid="button-confirm-correct-fund">
              {correctingTxn ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Correcting…</> : <><Shuffle className="h-3.5 w-3.5 mr-1.5" />Reverse & Relink</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Finance Exception Review Dialog ─────────────────────────────────── */}
      <Dialog
        open={!!reviewException}
        onOpenChange={open => {
          if (!open) {
            setReviewException(null);
            setExceptionNote('');
            setExceptionRef('');
            setExceptionConfirmedAmount('');
            setExceptionAction(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              Review Finance Exception
            </DialogTitle>
          </DialogHeader>
          {reviewException && (
            <div className="space-y-4 py-1">
              {/* Exception summary */}
              <div className="rounded-lg bg-muted/40 border px-3 py-2.5 space-y-2 text-xs">
                {(() => {
                  const exTypeLower = reviewException.exception_type?.toLowerCase();
                  const typeLabel = exTypeLower === 'ocs' ? 'OCS (Operational Cost Submission)' : exTypeLower === 'dp' ? 'Down Payment' : (reviewException.exception_type ?? 'Unknown');
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-semibold">{typeLabel}</span>
                      </div>
                      {reviewException.source_description && (
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground shrink-0">Description</span>
                          <span className="text-right truncate font-medium">{reviewException.source_description}</span>
                        </div>
                      )}
                      {reviewException.source_status && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Source Status</span>
                          <span>{reviewException.source_status}</span>
                        </div>
                      )}
                      <div className="pt-1 border-t flex flex-wrap gap-3">
                        {reviewException.historic_amount != null && (
                          <div>
                            <p className="text-muted-foreground">Historic Amount</p>
                            <p className="font-mono font-semibold">{reviewCurrency ?? '—'} {formatNumber(reviewException.historic_amount, 0)}</p>
                          </div>
                        )}
                        {reviewException.current_paid_amount != null && (
                          <div>
                            <p className="text-muted-foreground">Current Paid</p>
                            <p className="font-mono font-semibold">{reviewCurrency ?? '—'} {formatNumber(reviewException.current_paid_amount, 0)}</p>
                          </div>
                        )}
                        {reviewException.unmatched_amount != null && (
                          <div>
                            <p className="text-muted-foreground">Unmatched</p>
                            <p className="font-mono font-semibold text-rose-600">{reviewCurrency ?? '—'} {formatNumber(reviewException.unmatched_amount, 0)}</p>
                          </div>
                        )}
                      </div>
                      {reviewException.resolution && (
                        <p className="italic text-muted-foreground text-[11px] pt-1 border-t">{reviewException.resolution}</p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Action selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Action</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExceptionAction('keep_excluded')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left',
                      exceptionAction === 'keep_excluded'
                        ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-950/30 dark:border-amber-600 dark:text-amber-300'
                        : 'bg-background border-border text-muted-foreground hover:border-amber-300 hover:text-foreground'
                    )}
                    data-testid="button-action-keep-excluded"
                  >
                    <div className="font-semibold">Keep Excluded</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Record that this exception is deliberately excluded from the fund</div>
                  </button>
                  <button
                    onClick={() => {
                      setExceptionAction('confirm_evidence');
                      setExceptionIdempotencyKey(key => key ?? crypto.randomUUID());
                    }}
                    disabled={
                      !reviewException.exception_key.startsWith('txn:') ||
                      !reviewCurrency ||
                      (reviewException.source_table === 'operational_cost_submissions' && reviewException.source_status !== 'approved') ||
                      (reviewException.source_table === 'down_payment_requests' && reviewException.source_status === 'missing') ||
                      !['operational_cost_submissions', 'down_payment_requests'].includes(reviewException.source_table ?? '')
                    }
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left disabled:cursor-not-allowed disabled:opacity-50',
                      exceptionAction === 'confirm_evidence'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-600 dark:text-emerald-300'
                        : 'bg-background border-border text-muted-foreground hover:border-emerald-300 hover:text-foreground'
                    )}
                    data-testid="button-action-confirm-evidence"
                  >
                    <div className="font-semibold">Confirm Evidence</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Confirm payment with supporting evidence and link to the fund</div>
                  </button>
                </div>
              </div>

              {/* DP confirmed amount — only for Down Payment + Confirm Evidence */}
              {exceptionAction === 'confirm_evidence' && reviewException.source_table === 'down_payment_requests' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Confirmed Paid Amount * <span className="text-muted-foreground font-normal">({reviewCurrency ?? 'currency unavailable'} actual disbursed)</span>
                  </Label>
                  <Input
                    type="number"
                    value={exceptionConfirmedAmount}
                    onChange={e => setExceptionConfirmedAmount(e.target.value)}
                    placeholder={reviewCurrency ? `${reviewCurrency} 0` : 'Currency unavailable'}
                    className="text-sm"
                    disabled={!reviewCurrency}
                    data-testid="input-exception-confirmed-amount"
                  />
                </div>
              )}

              {/* Evidence note (mandatory always) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Evidence Note * <span className="text-muted-foreground font-normal">(required)</span>
                </Label>
                <Textarea
                  value={exceptionNote}
                  onChange={e => setExceptionNote(e.target.value)}
                  rows={3}
                  placeholder="Describe the evidence or reason for this decision…"
                  className="text-sm"
                  data-testid="textarea-exception-note"
                />
              </div>

              {/* Evidence reference (mandatory for Confirm Evidence) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Evidence Reference
                  {exceptionAction === 'confirm_evidence' && <span className="text-rose-500 ml-1">*</span>}
                  {exceptionAction !== 'confirm_evidence' && <span className="text-muted-foreground font-normal ml-1">(optional)</span>}
                </Label>
                <Input
                  value={exceptionRef}
                  onChange={e => setExceptionRef(e.target.value)}
                  placeholder="Receipt no., bank reference, document ID…"
                  className="text-sm"
                  data-testid="input-exception-ref"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewException(null);
                setExceptionNote('');
                setExceptionRef('');
                setExceptionConfirmedAmount('');
                setExceptionAction(null);
                setExceptionIdempotencyKey(null);
              }}
              disabled={submittingException}
            >
              Cancel
            </Button>
            <Button
              onClick={() => exceptionAction && handleExceptionDecision(exceptionAction)}
              disabled={submittingException || !exceptionAction || !exceptionNote.trim()}
              data-testid="button-submit-exception"
            >
              {submittingException
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Submitting…</>
                : exceptionAction === 'keep_excluded' ? 'Keep Excluded'
                : exceptionAction === 'confirm_evidence' ? 'Confirm Evidence & Link'
                : 'Select an action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!previewReceiptUrl}
        onOpenChange={(o) => { if (!o) setPreviewReceiptUrl(null); }}
        url={normalizeReceiptUrl(previewReceiptUrl) ?? ''}
        filename={normalizeReceiptUrl(previewReceiptUrl)?.split('/').pop()?.split('?')[0]}
      />
    </div>
  );
}
