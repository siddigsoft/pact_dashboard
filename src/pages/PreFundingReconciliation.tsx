import { useState, useEffect, useCallback } from 'react';
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
  ExternalLink, ChevronDown, History, Trash2, Filter,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Auto-link retry
  const [unlinkedSubs, setUnlinkedSubs]       = useState<any[]>([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [showUnlinked, setShowUnlinked]       = useState(false);
  const [retryingId, setRetryingId]           = useState<string | null>(null);
  const [unlinkedFrom, setUnlinkedFrom]       = useState('');
  const [unlinkedTo, setUnlinkedTo]           = useState('');

  // Unlink / remove a linked transaction
  const [confirmUnlinkTxn, setConfirmUnlinkTxn] = useState<PreFundTransaction | null>(null);
  const [unlinkingId, setUnlinkingId]           = useState<string | null>(null);

  // Transaction drill-down
  const [drillTxn, setDrillTxn]     = useState<PreFundTransaction | null>(null);
  const [drillSrc, setDrillSrc]     = useState<any | null>(null);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // CSV import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText]         = useState('');
  const [csvParsed, setCsvParsed]     = useState<{ date: string; amount: string; reference: string; description: string }[]>([]);
  const [importing, setImporting]     = useState(false);

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
      setTxns((txnRes.data as any) ?? []);
      setRecons((reconRes.data as any) ?? []);
    } catch (e: any) { toast({ title: 'Failed to load transactions', description: e.message, variant: 'destructive' }); }
    finally { setTxnLoading(false); }
  }, [toast]);

  useEffect(() => { loadFunds(); }, [loadFunds]);
  useEffect(() => {
    if (selectedFund) {
      setTxnForm(p => ({ ...p, currency: selectedFund.currency }));
      loadTxns(selectedFund.id);
      loadUnlinkedPayments(selectedFund.id);
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

      const [ocsRes, dpRes] = await Promise.all([
        supabase
          .from('operational_cost_submissions')
          .select('id,title,description,amount_cents,currency,status,submitted_at,submitted_by')
          .eq('status', 'paid')
          .not('id', 'in', excludeClause(linkedIds)),
        supabase
          .from('down_payment_requests')
          .select('id,justification,requested_amount,approved_amount,status,created_at,requested_by')
          .eq('status', 'fully_paid')
          .not('id', 'in', excludeClause(linkedIds)),
      ]);

      const ocs = (ocsRes.data ?? []).map((r: any) => ({
        ...r,
        _source: 'operational_cost_submissions',
        _date: r.submitted_at ?? r.created_at,
        amount: (r.amount_cents ?? 0) / 100,
        title: r.title ?? r.description ?? `Submission ${r.id.slice(0, 8)}`,
        userId: r.submitted_by ?? null,
      }));
      const dp = (dpRes.data ?? []).map((r: any) => ({
        ...r,
        _source: 'down_payment_requests',
        _date: r.created_at,
        amount: r.approved_amount ?? r.requested_amount ?? 0,
        currency: 'SDG',
        title: r.justification ?? `Down-payment ${r.id.slice(0, 8)}`,
        userId: r.requested_by ?? null,
      }));
      setUnlinkedSubs([...ocs, ...dp].slice(0, 50));
    } catch { setUnlinkedSubs([]); }
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
      const { data: result, error: rpcErr } = await (supabase as any).rpc('add_pre_fund_transaction_rpc', {
        p_fund_id:          selectedFund.id,
        p_fund_name:        selectedFund.name,
        p_transaction_type: 'payment',
        p_amount:           sub.amount,
        p_currency:         sub.currency ?? selectedFund.currency,
        p_reference:        sub.id,
        p_description:      sub.title ?? 'Linked payment',
        p_transaction_date: sub._date ? sub._date.split('T')[0] : new Date().toISOString().split('T')[0],
        p_created_by:       currentUser?.id ?? null,
        p_gl_debit_code:    fd?.gl_liability_account ?? null,
        p_gl_credit_code:   fd?.gl_receipt_account ?? null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
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
  const handleDrillDown = async (txn: PreFundTransaction) => {
    setDrillTxn(txn);
    setDrillSrc(null);
    if (!txn.source_table || !txn.source_id) return;
    setLoadingDrill(true);
    try {
      const { data } = await (supabase as any).from(txn.source_table).select('*').eq('id', txn.source_id).maybeSingle();
      setDrillSrc(data ?? null);
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
        <Button variant="outline" size="sm" onClick={loadFunds}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fund list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Funds</h3>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : funds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No active funds to reconcile.</div>
          ) : funds.map(f => (
            <button key={f.id} onClick={() => setSelected(f)}
              className={cn('w-full text-left p-3 rounded-lg border transition-all',
                selectedFund?.id === f.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-card hover:bg-muted/40'
              )} data-testid={`button-recon-fund-${f.id}`}>
              <div className="font-medium text-sm truncate">{f.name}</div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                <span>{f.currency} {formatNumber(f.available_balance, 0)} available</span>
                <Badge variant="outline" className={cn('text-[10px]',
                  f.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                  f.status === 'closed' ? 'bg-slate-100 text-slate-500' : 'bg-orange-50 text-orange-700'
                )}>{f.status.replace('_', ' ')}</Badge>
              </div>
            </button>
          ))}
        </div>

        {/* Reconciliation panel */}
        <div className="lg:col-span-2 space-y-4">
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
                      { label: 'Total Funded', value: selectedFund.amount, color: 'text-foreground' },
                      { label: 'Paid Out',     value: selectedFund.paid_amount,      color: 'text-sky-600' },
                      { label: 'Committed',    value: selectedFund.committed_amount, color: 'text-violet-600' },
                      { label: 'Available',    value: selectedFund.available_balance,color: selectedFund.available_balance < selectedFund.amount * 0.2 ? 'text-rose-600' : 'text-emerald-600' },
                    ].map(s => (
                      <div key={s.label} className="bg-muted/40 rounded-lg p-2">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className={cn('font-bold font-mono text-sm', s.color)}>{selectedFund.currency} {formatNumber(s.value, 0)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ── Auto-Link Retry Panel ──────────────────────────────────────── */}
              {(unlinkedSubs.length > 0 || loadingUnlinked) && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-sm font-medium transition-colors"
                    onClick={() => setShowUnlinked(p => !p)}
                    data-testid="button-toggle-unlinked"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        {loadingUnlinked ? 'Checking unlinked payments…' : `${unlinkedSubs.length} paid submission${unlinkedSubs.length !== 1 ? 's' : ''} not linked to this fund`}
                      </span>
                      {!loadingUnlinked && unlinkedSubs.length > 0 && (
                        <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1.5">{unlinkedSubs.length}</Badge>
                      )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-amber-600 transition-transform', showUnlinked ? 'rotate-180' : '')} />
                  </button>
                  {showUnlinked && (
                    <div>
                      {/* Date range filter */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b flex-wrap">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground shrink-0">Filter by date:</span>
                        <Input
                          type="date" value={unlinkedFrom}
                          onChange={e => setUnlinkedFrom(e.target.value)}
                          className="h-6 text-xs w-36 px-2"
                          data-testid="input-unlinked-from"
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          type="date" value={unlinkedTo}
                          onChange={e => setUnlinkedTo(e.target.value)}
                          className="h-6 text-xs w-36 px-2"
                          data-testid="input-unlinked-to"
                        />
                        {(unlinkedFrom || unlinkedTo) && (
                          <button onClick={() => { setUnlinkedFrom(''); setUnlinkedTo(''); }} className="text-xs text-muted-foreground hover:text-foreground underline" data-testid="button-clear-date-filter">Clear</button>
                        )}
                      </div>
                      <div className="divide-y max-h-64 overflow-y-auto">
                        {unlinkedSubs
                          .filter(sub => {
                            if (!sub._date) return true;
                            const d = sub._date.split('T')[0];
                            if (unlinkedFrom && d < unlinkedFrom) return false;
                            if (unlinkedTo   && d > unlinkedTo)   return false;
                            return true;
                          })
                          .map(sub => (
                            <div key={sub.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40" data-testid={`row-unlinked-${sub.id}`}>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{sub.title ?? sub.id}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {sub._source === 'down_payment_requests' ? 'Down-payment' : 'Cost submission'} · {sub._date ? format(parseISO(sub._date), 'MMM d, yyyy') : '—'}
                                </p>
                              </div>
                              <span className="font-mono text-sm shrink-0">{sub.currency} {formatNumber(sub.amount, 0)}</span>
                              {/* Custom date override for linking */}
                              <Input
                                type="date"
                                defaultValue={sub._date ? sub._date.split('T')[0] : new Date().toISOString().split('T')[0]}
                                className="h-7 text-xs w-32 px-2 shrink-0"
                                id={`link-date-${sub.id}`}
                                data-testid={`input-link-date-${sub.id}`}
                                title="Override the transaction date for this link"
                              />
                              <Button
                                size="sm" variant="outline"
                                className="h-7 text-xs shrink-0"
                                onClick={() => {
                                  const dateEl = document.getElementById(`link-date-${sub.id}`) as HTMLInputElement | null;
                                  handleRetryLink({ ...sub, _date: dateEl?.value ?? sub._date });
                                }}
                                disabled={retryingId === sub.id}
                                data-testid={`button-link-${sub.id}`}
                              >
                                <Link2 className="h-3.5 w-3.5 mr-1" />{retryingId === sub.id ? 'Linking…' : 'Link Now'}
                              </Button>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Transaction table ──────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Transactions</h3>
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
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-center">Reconciled</TableHead>
                          <TableHead className="text-center w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map(t => (
                          <TableRow
                            key={t.id}
                            data-testid={`row-txn-${t.id}`}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => handleDrillDown(t)}
                          >
                            <TableCell className="text-xs whitespace-nowrap">{format(parseISO(t.transaction_date), 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <span className={cn('text-xs font-medium', TXN_TYPE_CFG[t.transaction_type]?.color)}>
                                {TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.reference ?? '—'}</TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">{t.description ?? '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{t.currency} {formatNumber(t.amount, 0)}</TableCell>
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
                          <TableCell colSpan={4} className="text-xs">Totals</TableCell>

                          <TableCell className="text-right font-mono text-sm">
                            {selectedFund.currency} {formatNumber(accountingTxns.reduce((s, t) => s + t.amount, 0), 0)}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{accountingTxns.filter(t => t.reconciled).length}/{accountingTxns.length}</TableCell>
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
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={showAddTxn} onOpenChange={setShowAddTxn}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type</Label>
              <Select value={txnForm.transaction_type} onValueChange={v => setTxnForm(p => ({ ...p, transaction_type: v }))}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTxn(false)}>Cancel</Button>
            <Button onClick={handleAddTxn} disabled={saving} data-testid="button-save-txn">{saving ? 'Adding…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transaction Drill-Down Dialog ──────────────────────────────────── */}
      <Dialog open={!!drillTxn} onOpenChange={v => { if (!v) { setDrillTxn(null); setDrillSrc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Transaction Detail
            </DialogTitle>
          </DialogHeader>
          {drillTxn && (
            <div className="space-y-4 py-1">
              {/* Core transaction fields */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Date',        format(parseISO(drillTxn.transaction_date), 'MMMM d, yyyy')],
                  ['Type',        TXN_TYPE_CFG[drillTxn.transaction_type]?.label ?? drillTxn.transaction_type],
                  ['Amount',      `${drillTxn.currency} ${formatNumber(drillTxn.amount, 0)}`],
                  ['Reference',   drillTxn.reference ?? '—'],
                  ['Description', drillTxn.description ?? '—'],
                  ['Reconciled',  drillTxn.reconciled ? 'Yes' : 'No'],
                  ['Source',      drillTxn.source_table ? drillTxn.source_table.replace(/_/g, ' ') : '—'],
                ].map(([k, v]) => (
                  <div key={k} className={k === 'Description' ? 'col-span-2' : ''}>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{k}</p>
                    <p className="font-medium mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              {/* Source record details */}
              {drillTxn.source_id && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Source Record {loadingDrill && '(loading…)'}
                    </p>
                    {loadingDrill ? (
                      <div className="space-y-1.5">{[1,2,3].map(i => <Skeleton key={i} className="h-4 w-full" />)}</div>
                    ) : drillSrc ? (
                      <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1.5">
                        {(['title','name','amount','currency','status','submitted_at','created_at','notes'] as const).filter(k => drillSrc[k] != null).map(k => (
                          <div key={k} className="flex justify-between gap-4">
                            <span className="text-muted-foreground capitalize">{String(k).replace(/_/g, ' ')}</span>
                            <span className="font-medium truncate max-w-[220px] text-right">
                              {String(k).includes('_at') ? format(parseISO(drillSrc[k]), 'MMM d, yyyy HH:mm') : String(drillSrc[k])}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No source record found or source table not accessible.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
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
    </div>
  );
}
