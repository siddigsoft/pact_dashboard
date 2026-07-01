import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  Calendar, Plus, Banknote, Shuffle, Link2, Upload, X,
  ExternalLink, ChevronDown, History, Trash2, Filter, AlertCircle,
  Info, Receipt, User, Clock, FileSpreadsheet,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { FilePreviewDialog } from '@/components/ui/FilePreviewDialog';

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

const TXN_TYPE_CFG: Record<string, { label: string; color: string }> = {
  receipt:       { label: 'Receipt',        color: 'text-emerald-600' },
  commitment:    { label: 'Commitment',     color: 'text-violet-600' },
  payment:       { label: 'Payment',        color: 'text-sky-600' },
  reversal:      { label: 'Reversal',       color: 'text-orange-600' },
  carry_forward: { label: 'Carry-Forward',  color: 'text-indigo-600' },
  return:        { label: 'Return',         color: 'text-rose-600' },
  adjustment:    { label: 'Adjustment',     color: 'text-amber-600' },
};

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
    ? `${format(parseISO(fund.start_date), 'MMM d, yyyy')} – ${format(parseISO(fund.end_date), 'MMM d, yyyy')}`
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
      format(parseISO(t.transaction_date), 'MMM d, yyyy'),
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
        s.decided_at ? format(parseISO(s.decided_at), 'MMM d, yyyy HH:mm') : '—',
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
    ? `${format(parseISO(fund.start_date), 'MMM d, yyyy')} – ${format(parseISO(fund.end_date), 'MMM d, yyyy')}`
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
        format(parseISO(t.transaction_date), 'MMM d, yyyy'),
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
        s.decided_at ? format(parseISO(s.decided_at), 'MMM d, yyyy') : '—',
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
      doc.text(s.decided_at ? format(parseISO(s.decided_at), 'MMM d, yyyy') : '—', x, y + 26);
    });
    y += 34;
  }

  addPdfFooter(doc, (doc as any).internal.getNumberOfPages());

  const filename = `Donor-Statement-${fund.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

// ── Excel Reconciliation Export ───────────────────────────────────────────
function generateReconciliationExcel(
  fund: PreFundSummary,
  transactions: PreFundTransaction[],
  profileMap: Map<string, string>,
  reconciliations: Reconciliation[],
): { buffer: ArrayBuffer; filename: string } {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Fund Summary ─────────────────────────────────────────────
  const period = fund.start_date && fund.end_date
    ? `${format(parseISO(fund.start_date), 'MMM d, yyyy')} – ${format(parseISO(fund.end_date), 'MMM d, yyyy')}`
    : '—';
  const summaryRows = [
    ['PACT – Pre-Fund Reconciliation Report'],
    ['Generated', format(new Date(), 'MMMM d, yyyy HH:mm')],
    [],
    ['FUND DETAILS'],
    ['Fund Name',       fund.name],
    ['Donor / Source',  fund.source ?? '—'],
    ['Currency',        fund.currency],
    ['Reporting Period',period],
    ['Status',          fund.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
    [],
    ['FINANCIAL SUMMARY'],
    ['Item',            'Amount'],
    ['Total Funded',    fund.amount],
    ['Total Paid Out',  fund.paid_amount],
    ['Total Committed', fund.committed_amount],
    ['Available Balance',fund.available_balance],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Fund Summary');

  // ── Sheet 2: All Transactions ─────────────────────────────────────────
  const txnHeader = [
    'Date', 'Created At', 'Type', 'Reference', 'Description',
    'Source Module', 'Source Record ID',
    `Amount (${fund.currency})`, 'Reconciled', 'Reconciled At',
    'Paid By (User)', 'Recorded By',
    'Receipt URL', 'GL Journal Entry',
  ];
  const txnRows = transactions.map(t => [
    t.transaction_date,
    t.created_at ? format(parseISO(t.created_at), 'yyyy-MM-dd HH:mm:ss') : '—',
    TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type,
    t.reference ?? '—',
    t.description ?? '—',
    t.source_table ? t.source_table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—',
    t.source_id ?? '—',
    t.amount,
    t.reconciled ? 'Yes' : 'No',
    t.reconciled_at ? format(parseISO(t.reconciled_at), 'yyyy-MM-dd HH:mm:ss') : '—',
    t.user_id ? (profileMap.get(t.user_id) ?? t.user_id) : '—',
    t.created_by ? (profileMap.get(t.created_by) ?? t.created_by) : '—',
    t.receipt_url ?? '—',
    t.gl_journal_entry_id ?? '—',
  ]);
  const wsTxns = XLSX.utils.aoa_to_sheet([txnHeader, ...txnRows]);
  wsTxns['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 36 },
    { wch: 26 }, { wch: 38 }, { wch: 16 }, { wch: 10 }, { wch: 20 },
    { wch: 24 }, { wch: 24 }, { wch: 54 }, { wch: 38 },
  ];
  // Bold header row
  const range = XLSX.utils.decode_range(wsTxns['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = wsTxns[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '0F2041' } }, font_color: { rgb: 'FFFFFF' } };
  }
  XLSX.utils.book_append_sheet(wb, wsTxns, 'Transactions');

  // ── Sheet 3: Reconciliation History ──────────────────────────────────
  if (reconciliations.length > 0) {
    const reconHeader = ['Period Start', 'Period End', 'Closed At', 'Total Funded', 'Total Paid', 'Total Committed', 'Variance', 'Surplus Action', 'Carry Forward', 'Returned', 'Notes'];
    const reconRows = reconciliations.map(r => [
      r.period_start ?? '—',
      r.period_end ?? '—',
      r.closed_at ? format(parseISO(r.closed_at), 'yyyy-MM-dd HH:mm:ss') : '—',
      r.total_funded ?? 0,
      r.total_paid ?? 0,
      r.total_committed ?? 0,
      r.variance ?? 0,
      r.surplus_action?.replace(/_/g, ' ') ?? '—',
      r.carry_forward_amount ?? 0,
      r.return_amount ?? 0,
      r.notes ?? '—',
    ]);
    const wsRecon = XLSX.utils.aoa_to_sheet([reconHeader, ...reconRows]);
    wsRecon['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, ...Array(8).fill({ wch: 14 })];
    XLSX.utils.book_append_sheet(wb, wsRecon, 'Reconciliation History');
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const filename = `PreFund-Recon-${fund.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  return { buffer, filename };
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
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]             = useState<PreFundSummary[]>([]);
  const [selectedFund, setSelected]   = useState<PreFundSummary | null>(null);
  const [transactions, setTxns]       = useState<PreFundTransaction[]>([]);
  const [reconciliations, setRecons]  = useState<Reconciliation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [txnLoading, setTxnLoading]   = useState(false);
  const [showAddTxn, setShowAddTxn]   = useState(false);
  const [showCloseDialog, setShowClose] = useState(false);
  const [txnForm, setTxnForm]         = useState({ transaction_type: 'payment', amount: '', currency: '', reference: '', description: '', transaction_date: new Date().toISOString().split('T')[0] });
  const [closeForm, setCloseForm]     = useState({ surplus_action: 'carry_forward', carry_forward_amount: '', return_amount: '', notes: '' });
  const [saving, setSaving]           = useState(false);
  const [closing, setClosing]         = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [matchingFeed, setMatchingFeed] = useState(false);
  const [matchResults, setMatchResults] = useState<{ matched: number; unmatched: number } | null>(null);

  // Effective paid/available derived from the already-filtered transactions state.
  // This stays correct even when orphan transactions exist in the DB (e.g. from deleted DPs),
  // because loadTxns filters those out before setting the `transactions` state.
  const effectivePaidAmount = useMemo(() =>
    transactions
      .filter(t => ['payment', 'commitment'].includes(t.transaction_type))
      .reduce((s, t) => s + Number(t.amount), 0),
    [transactions]
  );
  const effectiveAvailableBalance = useMemo(() =>
    selectedFund ? selectedFund.amount - effectivePaidAmount : 0,
    [selectedFund, effectivePaidAmount]
  );

  // Auto-link retry
  const [unlinkedSubs, setUnlinkedSubs]       = useState<{ ocs: any[]; dp: any[]; ef: any[] }>({ ocs: [], dp: [], ef: [] });
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [showUnlinked, setShowUnlinked]       = useState(false);
  const [retryingId, setRetryingId]           = useState<string | null>(null);
  const [unlinkedFrom, setUnlinkedFrom]       = useState('');
  const [unlinkedTo, setUnlinkedTo]           = useState('');
  /** True when the link RPC is missing from the DB — prompts Finance to run the SQL migration */
  const [rpcMissing, setRpcMissing]           = useState(false);
  const [openCategories, setOpenCategories]   = useState<Record<string, boolean>>({ ocs: true, dp: true, ef: true });

  // Unlink / remove a linked transaction
  const [confirmUnlinkTxn, setConfirmUnlinkTxn] = useState<PreFundTransaction | null>(null);
  const [unlinkingId, setUnlinkingId]           = useState<string | null>(null);
  const [reconcilingAll, setReconcilingAll]     = useState(false);

  // Transaction drill-down
  const [drillTxn, setDrillTxn]     = useState<PreFundTransaction | null>(null);
  const [drillSrc, setDrillSrc]     = useState<any | null>(null);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // CSV import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText]         = useState('');
  const [csvParsed, setCsvParsed]     = useState<{ date: string; amount: string; reference: string; description: string }[]>([]);
  const [importing, setImporting]     = useState(false);

  // Profile name map (user_id → full name) for transaction table
  const [profileMap, setProfileMap]   = useState<Map<string, string>>(new Map());
  const [exportingExcel, setExportingExcel] = useState(false);

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

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: e } = await supabase.from('pre_fund_requests')
        .select('id,name,source,currency,amount,available_balance,committed_amount,paid_amount,status,start_date,end_date')
        .in('status', ['active', 'low_balance', 'closed', 'period_locked'])
        .order('created_at', { ascending: false });
      if (e && !e.message.includes('does not exist')) throw e;
      setFunds((data as any) ?? []);
    } catch (e: any) { toast({ title: 'Load failed', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);

  const loadTxns = useCallback(async (fundId: string) => {
    setTxnLoading(true);
    try {
      const [txnRes, reconRes] = await Promise.all([
        supabase.from('pre_fund_transactions').select('*').eq('pre_fund_request_id', fundId).order('transaction_date', { ascending: false }),
        supabase.from('pre_fund_reconciliations').select('*').eq('pre_fund_request_id', fundId).order('created_at', { ascending: false }),
      ]);
      const rawTxns: any[] = (txnRes.data as any) ?? [];

      // Filter out transactions whose source DP/OCS has been deleted or cancelled
      const dpIds = [...new Set(rawTxns.filter(t => t.source_table === 'down_payment_requests' && t.source_id).map(t => t.source_id as string))];
      const ocsIds = [...new Set(rawTxns.filter(t => t.source_table === 'operational_cost_submissions' && t.source_id).map(t => t.source_id as string))];

      // For old txns with NULL source_table, the DP stores the back-link via pre_fund_transaction_id
      const rawTxnIds = rawTxns.map(t => t.id).filter(Boolean);
      const [validDpRes, validOcsRes, backLinkedDpsRes] = await Promise.all([
        dpIds.length > 0
          ? (supabase as any).from('down_payment_requests').select('id,status,metadata').in('id', dpIds)
          : Promise.resolve({ data: [] }),
        ocsIds.length > 0
          ? (supabase as any).from('operational_cost_submissions').select('id').in('id', ocsIds)
          : Promise.resolve({ data: [] }),
        // Fetch DPs whose pre_fund_transaction_id points to one of these txn rows
        rawTxnIds.length > 0
          ? (supabase as any).from('down_payment_requests').select('pre_fund_transaction_id,status,metadata').in('pre_fund_transaction_id', rawTxnIds)
          : Promise.resolve({ data: [] }),
      ]);

      const validDpSet  = new Set((validDpRes.data ?? []).filter((d: any) => d.status !== 'cancelled' && d.metadata?.deleted !== true).map((d: any) => d.id as string));
      const validOcsSet = new Set((validOcsRes.data ?? []).map((o: any) => o.id as string));

      // pre_fund_transactions IDs that are back-linked from deleted/cancelled DPs
      const deletedDpTxnIds = new Set<string>(
        (backLinkedDpsRes.data ?? [])
          .filter((d: any) => d.status === 'cancelled' || d.metadata?.deleted === true)
          .map((d: any) => d.pre_fund_transaction_id as string)
      );

      const txns = rawTxns.filter(t => {
        if (t.source_table === 'down_payment_requests')        return !t.source_id || validDpSet.has(t.source_id);
        if (t.source_table === 'operational_cost_submissions') return !t.source_id || validOcsSet.has(t.source_id);
        // Old rows with NULL source_table: excluded if a deleted DP back-links to this txn ID
        if (!t.source_table && ['payment', 'commitment'].includes(t.transaction_type)) {
          return !deletedDpTxnIds.has(t.id);
        }
        return true;
      });

      setTxns(txns);
      setRecons((reconRes.data as any) ?? []);

      // Load profiles for user_id + created_by in transactions
      const userIds = new Set<string>();
      txns.forEach((t: PreFundTransaction) => {
        if (t.user_id)    userIds.add(t.user_id);
        if (t.created_by) userIds.add(t.created_by);
      });
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id,full_name,email').in('id', [...userIds]);
        const map = new Map<string, string>();
        (profiles ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.email || 'Unknown'));
        setProfileMap(map);
      } else {
        setProfileMap(new Map());
      }
    } catch (e: any) { toast({ title: 'Failed to load transactions', description: e.message, variant: 'destructive' }); }
    finally { setTxnLoading(false); }
  }, [toast]);

  useEffect(() => { loadFunds(); }, [loadFunds]);
  useEffect(() => {
    if (selectedFund) {
      setTxnForm(p => ({ ...p, currency: selectedFund.currency }));
      loadTxns(selectedFund.id);
      loadUnlinkedPayments(selectedFund.id);
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
  }, [selectedFund, loadTxns]);

  // ── Auto-link retry ──────────────────────────────────────────────────────
  const loadUnlinkedPayments = useCallback(async (fundId: string) => {
    setLoadingUnlinked(true);
    try {
      const { data: linked } = await supabase
        .from('pre_fund_transactions')
        .select('source_id')
        .eq('pre_fund_request_id', fundId)
        .not('source_id', 'is', null);
      const linkedIds = (linked ?? []).map((r: any) => r.source_id).filter(Boolean);

      const excludeClause = (ids: string[]) =>
        ids.length ? `(${ids.join(',')})` : '(00000000-0000-0000-0000-000000000000)';

      const [ocsRes, dpRes, efRes] = await Promise.all([
        supabase
          .from('operational_cost_submissions')
          .select('id,title,description,amount_cents,currency,status,submitted_at,submitted_by')
          .eq('status', 'paid')
          .not('id', 'in', excludeClause(linkedIds))
          .order('submitted_at', { ascending: false }),
        supabase
          .from('down_payment_requests')
          .select('id,justification,requested_amount,approved_amount,status,created_at,requested_by,fully_paid_at')
          .eq('status', 'fully_paid')
          .not('id', 'in', excludeClause(linkedIds))
          .order('fully_paid_at', { ascending: false }),
        // Enumerator / transport fees from MMP site entries
        (supabase as any)
          .from('mmp_site_entries')
          .select('id,site_name,visit_date,accepted_by,transport_fee,enumerator_fee,currency,payment_status,paid_at,enumerator_name')
          .eq('payment_status', 'paid')
          .not('id', 'in', excludeClause(linkedIds))
          .order('visit_date', { ascending: false }),
      ]);

      const ocs = (ocsRes.data ?? []).map((r: any) => ({
        ...r,
        _source: 'operational_cost_submissions',
        _category: 'ocs',
        _date: r.submitted_at ?? r.created_at,
        amount: (r.amount_cents ?? 0) / 100,
        currency: r.currency ?? 'SDG',
        title: r.title ?? r.description ?? `Submission ${r.id.slice(0, 8)}`,
        userId: r.submitted_by ?? null,
      }));
      const dp = (dpRes.data ?? []).map((r: any) => ({
        ...r,
        _source: 'down_payment_requests',
        _category: 'dp',
        _date: r.fully_paid_at ?? r.created_at,
        amount: r.approved_amount ?? r.requested_amount ?? 0,
        currency: 'SDG',
        title: r.justification ?? `Down-payment ${r.id.slice(0, 8)}`,
        userId: r.requested_by ?? null,
      }));
      // Enumerator fees: sum transport_fee + enumerator_fee per entry
      const ef = (efRes.data ?? []).map((r: any) => ({
        ...r,
        _source: 'mmp_site_entries',
        _category: 'ef',
        _date: r.paid_at ?? r.visit_date,
        amount: (r.transport_fee ?? 0) + (r.enumerator_fee ?? 0),
        currency: r.currency ?? 'SDG',
        title: `${r.site_name ?? 'Site'} — ${r.enumerator_name ?? 'Enumerator'}`,
        userId: r.accepted_by ?? null,
      })).filter((r: any) => r.amount > 0);
      setUnlinkedSubs({ ocs, dp, ef });
    } catch { setUnlinkedSubs({ ocs: [], dp: [], ef: [] }); }
    finally { setLoadingUnlinked(false); }
  }, []);

  const handleRetryLink = async (sub: any) => {
    if (!selectedFund) return;
    setRetryingId(sub.id);
    try {
      // Fetch GL codes — optional, only used when both are configured
      const { data: fd } = await supabase
        .from('pre_fund_requests')
        .select('gl_liability_account,gl_receipt_account')
        .eq('id', selectedFund.id)
        .maybeSingle();

      // Route through the canonical atomic RPC — updates available_balance, paid_amount, and GL
      const txnDate = sub._date ? sub._date.split('T')[0] : new Date().toISOString().split('T')[0];
      const { data: result, error: rpcErr } = await (supabase as any).rpc('add_pre_fund_transaction_rpc', {
        p_fund_id:          selectedFund.id,
        p_fund_name:        selectedFund.name,
        p_transaction_type: 'payment',
        p_amount:           sub.amount,
        p_currency:         sub.currency ?? selectedFund.currency,
        p_reference:        sub.id,
        p_description:      sub.title ?? 'Linked payment',
        p_transaction_date: txnDate,
        p_created_by:       currentUser?.id ?? null,
        p_gl_debit_code:    fd?.gl_liability_account ?? null,
        p_gl_credit_code:   fd?.gl_receipt_account ?? null,
        // Pass the field-staff user so their allocation is deducted automatically
        p_user_id:          sub.userId ?? null,
      });
      if (rpcErr) {
        const isNotDeployed =
          (rpcErr as any).code === 'PGRST202' ||
          String(rpcErr.message).toLowerCase().includes('could not find the function') ||
          String(rpcErr.message).toLowerCase().includes('does not exist');
        if (isNotDeployed) setRpcMissing(true);
        throw new Error(
          isNotDeployed
            ? 'SQL migration required — run pre_funding_atomic_rpcs.sql in the Supabase SQL Editor.'
            : rpcErr.message
        );
      }
      if (result && result.success === false) throw new Error(result.error ?? 'Link RPC failed.');

      // Back-link the source record so it knows which fund transaction covers it
      if (sub._source && sub.id) {
        await (supabase as any).from(sub._source).update({ pre_fund_transaction_id: result?.transaction_id ?? null }).eq('id', sub.id);
      }

      toast({ title: 'Linked', description: `${sub.title ?? sub.id} linked to ${selectedFund.name}${result?.gl_posted ? ' — GL entry posted.' : ''}` });
      loadTxns(selectedFund.id);
      loadUnlinkedPayments(selectedFund.id);
    } catch (e: any) { toast({ title: 'Link failed', description: e.message, variant: 'destructive' }); }
    finally { setRetryingId(null); }
  };

  // ── Unlink / remove a linked transaction ────────────────────────────────
  const handleUnlinkTxn = async () => {
    const txn = confirmUnlinkTxn;
    if (!txn || !selectedFund) return;
    setUnlinkingId(txn.id);
    setConfirmUnlinkTxn(null);
    try {
      // 1. Delete the pre_fund_transactions row
      const { error: delErr } = await supabase
        .from('pre_fund_transactions')
        .delete()
        .eq('id', txn.id);
      if (delErr) throw new Error(delErr.message);

      // 2. Restore fund balance (reverse the payment deduction)
      const { error: balErr } = await supabase
        .from('pre_fund_requests')
        .update({
          available_balance: selectedFund.available_balance + txn.amount,
          paid_amount:       Math.max(0, selectedFund.paid_amount - txn.amount),
        })
        .eq('id', selectedFund.id);
      if (balErr) throw new Error(balErr.message);

      // 3. If transaction was linked to a source record, clear the back-link
      if (txn.source_table && txn.source_id) {
        await (supabase as any)
          .from(txn.source_table)
          .update({ pre_fund_transaction_id: null })
          .eq('id', txn.source_id);
      }

      // 4. Restore allocation spent_amount if there is an allocation for the source
      if (txn.source_table && txn.source_id) {
        const { data: srcRow } = await (supabase as any)
          .from(txn.source_table)
          .select('requested_by,submitted_by')
          .eq('id', txn.source_id)
          .maybeSingle();
        const userId = srcRow?.requested_by ?? srcRow?.submitted_by ?? null;
        if (userId) {
          const { data: alloc } = await supabase
            .from('pre_fund_allocations')
            .select('id,spent_amount')
            .eq('pre_fund_request_id', selectedFund.id)
            .eq('user_id', userId)
            .maybeSingle();
          if (alloc) {
            await supabase
              .from('pre_fund_allocations')
              .update({ spent_amount: Math.max(0, (alloc.spent_amount ?? 0) - txn.amount) })
              .eq('id', alloc.id);
          }
        }
      }

      toast({ title: 'Unlinked', description: `Transaction removed and balance of ${selectedFund.currency} ${formatNumber(txn.amount, 0)} restored to fund.` });
      loadFunds();
      loadTxns(selectedFund.id);
      loadUnlinkedPayments(selectedFund.id);
    } catch (e: any) {
      toast({ title: 'Unlink failed', description: e.message, variant: 'destructive' });
    } finally {
      setUnlinkingId(null);
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
        }
      }
    } catch { setDrillSrc(null); }
    finally { setLoadingDrill(false); }
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
      const rows = csvParsed.map(r => ({
        pre_fund_request_id: selectedFund.id,
        transaction_type: 'bank_statement',
        amount: Math.abs(parseFloat(r.amount)),
        currency: selectedFund.currency,
        reference: r.reference || null,
        description: r.description ? `[Bank Statement] ${r.description}` : '[Bank Statement Import]',
        transaction_date: r.date || new Date().toISOString().split('T')[0],
        reconciled: false,
      }));
      const { error } = await supabase.from('pre_fund_transactions').insert(rows);
      if (error) throw error;
      toast({ title: `${rows.length} bank statement row${rows.length !== 1 ? 's' : ''} imported for reconciliation matching`, description: 'These are reference-only entries and do not affect fund balances or GL.' });
      setShowCsvImport(false);
      setCsvText('');
      setCsvParsed([]);
      loadTxns(selectedFund.id);
    } catch (e: any) { toast({ title: 'Import failed', description: e.message, variant: 'destructive' }); }
    finally { setImporting(false); }
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
          p_user_id: (isSuperAdmin && txnForm.transaction_type === 'payment' && txnAllocUserId)
            ? txnAllocUserId
            : null,
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
    const targets = transactions.filter(t => t.reconciled !== reconcile);
    if (targets.length === 0) return;
    setReconcilingAll(true);
    try {
      const ids = targets.map(t => t.id);
      await supabase.from('pre_fund_transactions')
        .update({ reconciled: reconcile, reconciled_at: reconcile ? new Date().toISOString() : null })
        .in('id', ids);
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
        posting_date: je?.posting_date ?? l.created_at?.split('T')[0] ?? '—',
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
      const { buffer, filename } = generateReconciliationExcel(selectedFund, transactions, profileMap, reconciliations);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Excel exported', description: `${filename} — ${transactions.length} transactions` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    } finally { setExportingExcel(false); }
  };

  // Exclude bank_statement rows (reconciliation-only references) from all financial totals
  const accountingTxns = transactions.filter(t => t.transaction_type !== 'bank_statement');
  const totalReconciled = accountingTxns.filter(t => t.reconciled).reduce((s, t) => s + t.amount, 0);
  const totalUnreconciled = accountingTxns.filter(t => !t.reconciled).reduce((s, t) => s + t.amount, 0);

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
        <Button variant="outline" size="sm" onClick={() => { loadFunds(); if (selectedFund) { loadTxns(selectedFund.id); loadUnlinkedPayments(selectedFund.id); } }}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
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
                  <span className="ml-2 text-muted-foreground text-xs">· {f.currency} {formatNumber(f.available_balance, 0)} avail.</span>
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
                      {['active', 'low_balance'].includes(selectedFund.status) && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleMatchBankFeed} disabled={matchingFeed} data-testid="button-match-bank-feed">
                          <Shuffle className="h-3.5 w-3.5 mr-1" />{matchingFeed ? 'Matching…' : 'Match Bank Feed'}
                        </Button>
                      )}
                      {matchResults && (
                        <span className="text-[11px] text-muted-foreground self-center">
                          ✓ {matchResults.matched} matched{matchResults.unmatched > 0 ? `, ${matchResults.unmatched} unmatched` : ''}
                        </span>
                      )}
                      {['active', 'low_balance'].includes(selectedFund.status) && (
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
                </CardContent>
              </Card>

              {/* ── Auto-Link Retry Panel ──────────────────────────────────────── */}
              {(() => {
                const totalUnlinked = unlinkedSubs.ocs.length + unlinkedSubs.dp.length + unlinkedSubs.ef.length;
                if (!totalUnlinked && !loadingUnlinked) return null;

                const filterSub = (sub: any) => {
                  if (!sub._date) return true;
                  const d = sub._date.split('T')[0];
                  if (unlinkedFrom && d < unlinkedFrom) return false;
                  if (unlinkedTo   && d > unlinkedTo)   return false;
                  return true;
                };

                const CategorySection = ({ catKey, label, items, color }: { catKey: string; label: string; items: any[]; color: string }) => {
                  const filtered = items.filter(filterSub);
                  if (!filtered.length) return null;
                  const open = openCategories[catKey] !== false;
                  return (
                    <div className="border-b last:border-b-0">
                      <button
                        className={cn('w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-muted/40', color)}
                        onClick={() => setOpenCategories(p => ({ ...p, [catKey]: !open }))}
                        data-testid={`button-cat-${catKey}`}
                      >
                        <span>{label} <span className="font-normal normal-case tracking-normal opacity-70">({filtered.length})</span></span>
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '')} />
                      </button>
                      {open && filtered.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30 border-t border-muted/40" data-testid={`row-unlinked-${sub.id}`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-xs">{sub.title ?? sub.id}</p>
                            <p className="text-[11px] text-muted-foreground">{sub._date ? format(parseISO(sub._date), 'MMM d, yyyy') : '—'}</p>
                          </div>
                          <span className="font-mono text-xs shrink-0 text-muted-foreground">{sub.currency} {formatNumber(sub.amount, 0)}</span>
                          <Input
                            type="date"
                            defaultValue={sub._date ? sub._date.split('T')[0] : new Date().toISOString().split('T')[0]}
                            className="h-6 text-xs w-28 px-1.5 shrink-0"
                            id={`link-date-${sub.id}`}
                            data-testid={`input-link-date-${sub.id}`}
                            title="Override the transaction date for this link"
                          />
                          <Button
                            size="sm" variant="outline"
                            className="h-6 text-xs shrink-0 px-2"
                            onClick={() => {
                              const dateEl = document.getElementById(`link-date-${sub.id}`) as HTMLInputElement | null;
                              handleRetryLink({ ...sub, _date: dateEl?.value ?? sub._date });
                            }}
                            disabled={retryingId === sub.id}
                            data-testid={`button-link-${sub.id}`}
                          >
                            <Link2 className="h-3 w-3 mr-1" />{retryingId === sub.id ? 'Linking…' : 'Link Now'}
                          </Button>
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
                      <Link2 className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        {loadingUnlinked ? 'Checking unlinked payments…' : `${totalUnlinked} paid payment${totalUnlinked !== 1 ? 's' : ''} not linked to this fund`}
                      </span>
                      {!loadingUnlinked && totalUnlinked > 0 && (
                        <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1.5">{totalUnlinked}</Badge>
                      )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-amber-600 transition-transform', showUnlinked ? 'rotate-180' : '')} />
                  </button>
                  {showUnlinked && (
                    <div>
                      {/* SQL migration required banner */}
                      {rpcMissing && (
                        <div className="flex items-start gap-2 px-4 py-3 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-800">
                          <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <div className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                            <strong>SQL migration required</strong> — the pre-funding database functions are not yet deployed.
                            Run <code className="font-mono bg-rose-100 dark:bg-rose-900/40 px-1 rounded">pre_funding_atomic_rpcs.sql</code> in the{' '}
                            <strong>Supabase SQL Editor</strong> to enable linking. Payments shown below are waiting to be linked.
                          </div>
                        </div>
                      )}
                      {/* Date range filter */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b flex-wrap">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground shrink-0">Filter by date:</span>
                        <Input type="date" value={unlinkedFrom} onChange={e => setUnlinkedFrom(e.target.value)} className="h-6 text-xs w-36 px-2" data-testid="input-unlinked-from" />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input type="date" value={unlinkedTo} onChange={e => setUnlinkedTo(e.target.value)} className="h-6 text-xs w-36 px-2" data-testid="input-unlinked-to" />
                        {(unlinkedFrom || unlinkedTo) && (
                          <button onClick={() => { setUnlinkedFrom(''); setUnlinkedTo(''); }} className="text-xs text-muted-foreground hover:text-foreground underline" data-testid="button-clear-date-filter">Clear</button>
                        )}
                      </div>
                      {/* Category sections */}
                      <div className="max-h-80 overflow-y-auto">
                        <CategorySection catKey="ocs" label="Cost Submissions" items={unlinkedSubs.ocs} color="text-sky-700 dark:text-sky-400 bg-sky-50/60 dark:bg-sky-950/20" />
                        <CategorySection catKey="dp"  label="Down Payments"    items={unlinkedSubs.dp}  color="text-violet-700 dark:text-violet-400 bg-violet-50/60 dark:bg-violet-950/20" />
                        <CategorySection catKey="ef"  label="Enumerator / Transport Fees" items={unlinkedSubs.ef} color="text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" />
                      </div>
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
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{transactions.length}</Badge>
                    {transactions.some(t => t.receipt_url) && (() => {
                      const withReceipt = transactions.filter(t => t.receipt_url).length;
                      const batchCount  = receiptGroupMap.size;
                      const batchTxns   = [...receiptGroupMap.values()].reduce((s, g) => s + g.length, 0);
                      const batchTotal  = [...receiptGroupMap.values()].reduce((s, g) => s + g.reduce((a, t) => a + t.amount, 0), 0);
                      const currency    = transactions.find(t => t.currency)?.currency ?? '';
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
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCsvImport(true)} data-testid="button-csv-import">
                      <Upload className="h-3.5 w-3.5 mr-1" />Import CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddTxn(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add Transaction
                    </Button>
                  </div>
                </div>
                {txnLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No transactions yet for this fund</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
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
                            {(() => {
                              const total = transactions.length;
                              const reconciled = transactions.filter(t => t.reconciled).length;
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
                        {transactions.map(t => (
                          <TableRow
                            key={t.id}
                            data-testid={`row-txn-${t.id}`}
                            className="cursor-pointer hover:bg-muted/40 text-xs"
                            onClick={() => handleDrillDown(t)}
                          >
                            <TableCell className="whitespace-nowrap">
                              <div>{format(parseISO(t.transaction_date), 'MMM d, yyyy')}</div>
                              <div className="text-[10px] text-muted-foreground/70">{format(parseISO(t.created_at), 'HH:mm')}</div>
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
                            <TableCell className="whitespace-nowrap">
                              {t.user_id ? (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                  {profileMap.get(t.user_id) ?? <span className="text-muted-foreground italic">Unknown</span>}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {t.created_by ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                  <span className="text-muted-foreground">{profileMap.get(t.created_by) ?? t.created_by.slice(0, 8)}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50">{format(parseISO(t.created_at), 'MMM d HH:mm')}</span>
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
                              <button
                                onClick={() => handleReconcileTxn(t.id, !t.reconciled)}
                                className={cn('h-5 w-5 rounded-full border-2 transition-colors mx-auto flex items-center justify-center',
                                  t.reconciled ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground hover:border-emerald-500'
                                )}
                                data-testid={`button-reconcile-${t.id}`}
                              >
                                {t.reconciled && <CheckCircle2 className="h-3 w-3" />}
                              </button>
                            </TableCell>
                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setConfirmUnlinkTxn(t)}
                                disabled={unlinkingId === t.id}
                                title="Unlink — removes this transaction and restores the fund balance"
                                className="h-6 w-6 flex items-center justify-center mx-auto rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-muted-foreground hover:text-rose-600 transition-colors disabled:opacity-40"
                                data-testid={`button-unlink-${t.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={7} className="text-xs">Totals</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {selectedFund.currency} {formatNumber(accountingTxns.reduce((s, t) => s + t.amount, 0), 0)}
                          </TableCell>
                          <TableCell />
                          <TableCell className="text-center text-xs text-muted-foreground">{accountingTxns.filter(t => t.reconciled).length}/{accountingTxns.length}</TableCell>
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
                                  ? `${format(parseISO(r.period_start), 'MMM d')} – ${format(parseISO(r.period_end), 'MMM d, yyyy')}`
                                  : `Reconciliation #${idx + 1}`}
                              </span>
                              {r.closed_at && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Closed {format(parseISO(r.closed_at), 'MMM d, yyyy HH:mm')}
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
                  {Object.entries(TXN_TYPE_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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

      {/* ── Transaction Drill-Down Dialog ──────────────────────────────────── */}
      <Dialog open={!!drillTxn} onOpenChange={v => { if (!v) { setDrillTxn(null); setDrillSrc(null); } }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Transaction Detail
            </DialogTitle>
          </DialogHeader>
          {drillTxn && (
            <div className="space-y-4 py-1 overflow-y-auto flex-1 pr-1">
              {/* Core transaction fields */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ['Payment Date',    format(parseISO(drillTxn.transaction_date), 'MMMM d, yyyy')],
                  ['Recorded At',     format(parseISO(drillTxn.created_at), 'MMM d, yyyy HH:mm')],
                  ['Type',            TXN_TYPE_CFG[drillTxn.transaction_type]?.label ?? drillTxn.transaction_type],
                  ['Amount',          `${drillTxn.currency} ${formatNumber(drillTxn.amount, 0)}`],
                  ['Reference',       drillTxn.reference ?? '—'],
                  ['Source Module',   drillTxn.source_table ? drillTxn.source_table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Manual Entry'],
                  ['Reconciled',      drillTxn.reconciled ? `Yes — ${drillTxn.reconciled_at ? format(parseISO(drillTxn.reconciled_at), 'MMM d, yyyy HH:mm') : ''}` : 'No'],
                  ['GL Journal',      drillTxn.gl_journal_entry_id ?? '—'],
                ] as [string,string][]).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{k}</p>
                    <p className="font-medium mt-0.5 text-sm">{v}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Description</p>
                  <p className="font-medium mt-0.5 text-sm">{drillTxn.description ?? '—'}</p>
                </div>
              </div>

              {/* People */}
              {(drillTxn.user_id || drillTxn.created_by) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {drillTxn.user_id && (
                      <div>
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1"><User className="h-3 w-3" />Paid By</p>
                        <p className="font-medium mt-0.5">{profileMap.get(drillTxn.user_id) ?? drillTxn.user_id.slice(0,8)}</p>
                      </div>
                    )}
                    {drillTxn.created_by && (
                      <div>
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1"><Clock className="h-3 w-3" />Recorded By</p>
                        <p className="font-medium mt-0.5">{profileMap.get(drillTxn.created_by) ?? drillTxn.created_by.slice(0,8)}</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Receipt */}
              {drillTxn.receipt_url && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1"><Receipt className="h-3 w-3" />Receipt / Proof of Payment</p>

                    {/* Batch receipt banner */}
                    {receiptGroupMap.has(drillTxn.receipt_url) && (() => {
                      const group = receiptGroupMap.get(drillTxn.receipt_url)!;
                      const total = group.reduce((s, t) => s + t.amount, 0);
                      return (
                        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                          <Shuffle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                          <div>
                            <p className="font-semibold">Batch receipt — 1 receipt covers {group.length} transactions</p>
                            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                              Total covered: {drillTxn.currency} {formatNumber(total, 0)}
                            </p>
                            <div className="mt-1.5 space-y-0.5">
                              {group.map((t, i) => (
                                <div key={t.id} className="flex justify-between gap-4">
                                  <span className="text-amber-700/80 dark:text-amber-400/80">
                                    {i + 1}. {t.description ?? t.reference ?? `Txn ${t.id.slice(0, 8)}`}
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
                          <img src={cleanUrl} alt="Receipt" className="max-h-48 rounded-lg border object-contain w-full hover:opacity-90 transition-opacity cursor-pointer" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setPreviewReceiptUrl(cleanUrl)}
                          className="flex items-center gap-2 text-sky-600 hover:text-sky-700 text-sm font-medium bg-sky-50 dark:bg-sky-950/20 rounded-lg px-3 py-2 border border-sky-200 dark:border-sky-800 w-full"
                        >
                          <Receipt className="h-4 w-4 shrink-0" />
                          View Receipt / Attachment
                          <ExternalLink className="h-3.5 w-3.5 ml-auto shrink-0" />
                        </button>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Source record details */}
              {drillTxn.source_id && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Source Record {loadingDrill && <span className="text-[10px] font-normal">(loading…)</span>}
                    </p>
                    {loadingDrill ? (
                      <div className="space-y-1.5">{[1,2,3].map(i => <Skeleton key={i} className="h-4 w-full" />)}</div>
                    ) : drillSrc ? (
                      <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1.5">
                        {Object.entries(drillSrc)
                          .filter(([k, v]) => v != null && v !== '' && !['id','pre_fund_request_id','mmp_id','mmp_file_id'].includes(k))
                          .slice(0, 14)
                          .map(([k, v]) => {
                            // Friendly label
                            const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                            // Resolve value
                            let display: React.ReactNode;
                            const str = String(v);
                            if (k.includes('_at') || k.includes('_date')) {
                              try { display = format(parseISO(str), 'MMM d, yyyy HH:mm'); } catch { display = str; }
                            } else if (k.includes('receipt') || k.includes('url') || k.includes('proof')) {
                              display = <a href={str} target="_blank" rel="noreferrer" className="text-sky-600 underline">View file</a>;
                            } else if (
                              UUID_RE.test(str) &&
                              (USER_ID_FIELDS.has(k) || k.endsWith('_by') || k.endsWith('_user_id'))
                            ) {
                              // Resolve UUID to name
                              display = (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {profileMap.get(str) ?? str.slice(0, 8) + '…'}
                                </span>
                              );
                            } else if (UUID_RE.test(str)) {
                              // Generic UUID — show shortened
                              display = str.slice(0, 8) + '…';
                            } else {
                              display = str;
                            }
                            return (
                              <div key={k} className="flex justify-between gap-4">
                                <span className="text-muted-foreground shrink-0">{label}</span>
                                <span className="font-medium truncate max-w-[240px] text-right">{display}</span>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No source record found or not accessible.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button variant="outline" onClick={() => { setDrillTxn(null); setDrillSrc(null); }}>Close</Button>
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

      {/* ── Unlink confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={!!confirmUnlinkTxn} onOpenChange={open => { if (!open) setConfirmUnlinkTxn(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-4 w-4" /> Remove Linked Transaction
            </DialogTitle>
          </DialogHeader>
          {confirmUnlinkTxn && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                This will permanently remove this transaction from the fund and restore the balance.
              </p>
              <div className="rounded-lg border p-3 space-y-1 bg-muted/30 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{TXN_TYPE_CFG[confirmUnlinkTxn.transaction_type]?.label ?? confirmUnlinkTxn.transaction_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{format(parseISO(confirmUnlinkTxn.transaction_date), 'MMM d, yyyy')}</span>
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
                  Balance will be restored by {confirmUnlinkTxn.currency} {formatNumber(confirmUnlinkTxn.amount, 0)}. The original payment record is not deleted.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnlinkTxn(null)} data-testid="button-cancel-unlink">Cancel</Button>
            <Button variant="destructive" onClick={handleUnlinkTxn} data-testid="button-confirm-unlink">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove & Restore Balance
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
