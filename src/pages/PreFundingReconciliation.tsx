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
  Calendar, Plus, Banknote, Shuffle,
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
  { value: 'carry_forward', label: 'Carry Full Surplus to Next Period' },
  { value: 'return',        label: 'Return to Source / Donor' },
  { value: 'split',         label: 'Split (Partial Carry + Return)' },
  { value: 'reserve',       label: 'Leave in Reserve' },
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

  // ── Disbursement breakdown ────────────────────────────────────────────────
  const payments = transactions.filter(t => t.transaction_type === 'payment');
  if (payments.length > 0) {
    y = sectionHeader(doc, 'Disbursement Detail', y);
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Reference', 'Description', `Amount (${fund.currency})`]],
      body: payments.map(t => [
        format(parseISO(t.transaction_date), 'MMM d, yyyy'),
        t.reference ?? '—',
        t.description ?? '—',
        formatNumber(t.amount, 0),
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
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
    }
  }, [selectedFund, loadTxns]);

  const handleAddTxn = async () => {
    if (!selectedFund || !txnForm.amount || !txnForm.transaction_date) { toast({ title: 'Required fields missing', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const amount   = parseFloat(txnForm.amount);
      const currency = txnForm.currency || selectedFund.currency;
      const { data: txn, error: e } = await supabase.from('pre_fund_transactions').insert({
        pre_fund_request_id: selectedFund.id,
        transaction_type: txnForm.transaction_type,
        amount,
        currency,
        reference: txnForm.reference || null,
        description: txnForm.description || null,
        transaction_date: txnForm.transaction_date,
        reconciled: false,
        created_by: currentUser?.id ?? null,
      }).select('id').maybeSingle();
      if (e) throw e;

      // ── GL Bridge posting (fail-closed): if GL fails, roll back transaction ─
      const GL_EVENT: Record<string, string> = {
        payment:      'pre_fund_paid',
        commitment:   'pre_fund_committed',
        carry_forward:'pre_fund_carry_forward',
      };
      const glEvent = GL_EVENT[txnForm.transaction_type];
      if (glEvent) {
        // GL posting failure rolls back the transaction (delete + rethrow)
        const txnId = (txn as any)?.id;
        try {
          const { data: fundDetail } = await supabase.from('pre_fund_requests')
            .select('gl_receipt_account,gl_liability_account,gl_expense_account,gl_cf_account')
            .eq('id', selectedFund.id).maybeSingle();

          let drCode = '2400';
          let crCode = '1200';
          if (glEvent === 'pre_fund_committed') {
            drCode = (fundDetail as any)?.gl_liability_account ?? '2400';
            crCode = '2105';
          } else if (glEvent === 'pre_fund_carry_forward') {
            drCode = (fundDetail as any)?.gl_liability_account ?? '2400';
            crCode = (fundDetail as any)?.gl_cf_account ?? '2401';
          } else {
            drCode = (fundDetail as any)?.gl_liability_account ?? '2400';
            crCode = (fundDetail as any)?.gl_receipt_account   ?? '1200';
          }

          const [{ data: drAcct }, { data: crAcct }] = await Promise.all([
            supabase.from('acct_accounts' as any).select('id').eq('code', drCode).maybeSingle(),
            supabase.from('acct_accounts' as any).select('id').eq('code', crCode).maybeSingle(),
          ]);

          const { data: je, error: jeErr } = await supabase.from('acct_journal_entries').insert({
            description_en: `Pre-Fund ${txnForm.transaction_type} — ${selectedFund.name}`,
            posting_date: txnForm.transaction_date,
            status: 'draft',
            source_type: 'pre_fund_transactions',
            source_id: txnId ?? selectedFund.id,
            idempotency_key: `pf-${txnForm.transaction_type}-${txnId ?? Date.now()}`,
            created_by: currentUser?.id ?? null,
          }).select('id').maybeSingle();
          if (jeErr) throw jeErr;

          if (je) {
            const lines: any[] = [];
            if ((drAcct as any)?.id) lines.push({ entry_id: (je as any).id, line_no: 1, account_id: (drAcct as any).id, debit_credit: 'DR', original_amount: amount, original_currency: currency, functional_amount: amount, functional_currency: currency, description: `${glEvent} — ${selectedFund.name}`, function: 'program' });
            if ((crAcct as any)?.id) lines.push({ entry_id: (je as any).id, line_no: 2, account_id: (crAcct as any).id, debit_credit: 'CR', original_amount: amount, original_currency: currency, functional_amount: amount, functional_currency: currency, description: `${glEvent} — ${selectedFund.name}`, function: 'program' });
            if (lines.length > 0) {
              const { error: lErr } = await supabase.from('acct_journal_lines').insert(lines);
              if (lErr) throw lErr;
            }
            await supabase.from('acct_gl_bridge_log' as any).insert({
              source_table: 'pre_fund_transactions', source_id: txnId ?? selectedFund.id,
              event_type: glEvent, status: 'success', journal_entry_id: (je as any).id,
            });
          }
        } catch (glErr: any) {
          // GL failed — roll back the transaction record to keep DB consistent
          if (txnId) await supabase.from('pre_fund_transactions').delete().eq('id', txnId);
          throw new Error(`GL Bridge failed — transaction rolled back: ${(glErr as any).message}`);
        }
      }

      toast({ title: 'Transaction added', description: glEvent ? 'GL journal entry created (draft).' : undefined });
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
      const carryAmt = parseFloat(closeForm.carry_forward_amount) || 0;
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
      const carryAmt = closeForm.surplus_action === 'carry_forward' ? surplus : parseFloat(closeForm.carry_forward_amount) || 0;
      const returnAmt = closeForm.surplus_action === 'return' ? surplus : parseFloat(closeForm.return_amount) || 0;
      const reserveAmt = closeForm.surplus_action === 'reserve' ? surplus : Math.max(0, surplus - carryAmt - returnAmt);

      const { data: recon, error: e } = await supabase.from('pre_fund_reconciliations').insert({
        pre_fund_request_id: selectedFund.id,
        period_start: selectedFund.start_date,
        period_end: selectedFund.end_date,
        total_funded: selectedFund.amount,
        total_paid: selectedFund.paid_amount,
        total_committed: selectedFund.committed_amount,
        variance: surplus,
        surplus_action: closeForm.surplus_action,
        carry_forward_amount: carryAmt,
        return_amount: returnAmt,
        reserve_amount: reserveAmt,
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: currentUser?.id ?? null,
        notes: closeForm.notes || null,
      }).select('id').maybeSingle();
      if (e) throw e;
      await supabase.from('pre_fund_requests').update({ status: 'closed' }).eq('id', selectedFund.id);

      // ── GL Bridge: post pre_fund_closed journal entry ──────────────────────
      // Template: Dr {gl_liability_account} → Cr {gl_receipt_account} (return portion)
      //           Dr {gl_liability_account} → Cr {gl_expense_account} (variance/expense portion)
      try {
        const { data: fundDetail } = await supabase.from('pre_fund_requests')
          .select('gl_receipt_account,gl_liability_account,gl_expense_account,gl_cf_account,currency')
          .eq('id', selectedFund.id).maybeSingle();
        const currency = selectedFund.currency;

        // Resolve account IDs from COA
        const codes = [
          (fundDetail as any)?.gl_liability_account ?? '2400',
          (fundDetail as any)?.gl_receipt_account   ?? '1200',
          (fundDetail as any)?.gl_expense_account   ?? '5600',
        ];
        const { data: accts } = await supabase.from('acct_accounts' as any)
          .select('id,code').in('code', codes);
        const acctMap: Record<string, string> = {};
        ((accts as any) ?? []).forEach((a: any) => { acctMap[a.code] = a.id; });

        const { data: je } = await supabase.from('acct_journal_entries').insert({
          description_en: `Pre-Fund Period Close — ${selectedFund.name}`,
          description_ar: `إغلاق فترة التمويل المسبق — ${selectedFund.name}`,
          posting_date: new Date().toISOString().split('T')[0],
          status: 'draft',
          source_type: 'pre_fund_reconciliations',
          source_id: (recon as any)?.id ?? selectedFund.id,
          idempotency_key: `pf-closed-${selectedFund.id}`,
          created_by: currentUser?.id ?? null,
        }).select('id').maybeSingle();

        if (je) {
          const lines: any[] = [];
          const liabId = acctMap[codes[0]];
          const bankId  = acctMap[codes[1]];
          const expId   = acctMap[codes[2]];
          const varianceAmt = Math.max(0, surplus - returnAmt - carryAmt);

          // Lines 1-2: return portion (Dr liability → Cr bank)
          if (liabId && bankId && returnAmt > 0) {
            lines.push({ entry_id: (je as any).id, line_no: 1, account_id: liabId, debit_credit: 'DR', original_amount: returnAmt, original_currency: currency, functional_amount: returnAmt, functional_currency: currency, description: `Pre-fund close — return to donor`, function: 'program' });
            lines.push({ entry_id: (je as any).id, line_no: 2, account_id: bankId,  debit_credit: 'CR', original_amount: returnAmt, original_currency: currency, functional_amount: returnAmt, functional_currency: currency, description: `Donor refund — cash out`, function: 'program' });
          }
          // Lines 3-4: variance/expense treatment (Dr liability → Cr expense)
          if (liabId && expId && varianceAmt > 0) {
            lines.push({ entry_id: (je as any).id, line_no: 3, account_id: liabId, debit_credit: 'DR', original_amount: varianceAmt, original_currency: currency, functional_amount: varianceAmt, functional_currency: currency, description: `Pre-fund close — variance treated as expense`, function: 'program' });
            lines.push({ entry_id: (je as any).id, line_no: 4, account_id: expId,  debit_credit: 'CR', original_amount: varianceAmt, original_currency: currency, functional_amount: varianceAmt, functional_currency: currency, description: `Programme expense — residual balance`, function: 'program' });
          }
          if (lines.length > 0) await supabase.from('acct_journal_lines').insert(lines);

          await supabase.from('acct_gl_bridge_log' as any).insert({
            source_table: 'pre_fund_reconciliations',
            source_id: (recon as any)?.id ?? selectedFund.id,
            event_type: 'pre_fund_closed',
            status: 'success',
            journal_entry_id: (je as any).id,
          });

          // ── Carry-forward GL entry: Dr {gl_receipt_account} → Cr {gl_liability_account} ──
          // Executed when surplus_action === 'carry_forward' and carry amount > 0.
          // This creates an opening entry for the carried balance in the next period.
          if (closeForm.surplus_action === 'carry_forward' && carryAmt > 0) {
            const { data: cfJe } = await supabase.from('acct_journal_entries').insert({
              description_en: `Pre-Fund Carry-Forward — ${selectedFund.name} (surplus carried to next period)`,
              description_ar: `ترحيل رصيد التمويل المسبق — ${selectedFund.name}`,
              posting_date: new Date().toISOString().split('T')[0],
              status: 'draft',
              source_type: 'pre_fund_reconciliations',
              source_id: (recon as any)?.id ?? selectedFund.id,
              idempotency_key: `pf-carry-fwd-${selectedFund.id}`,
              created_by: currentUser?.id ?? null,
            }).select('id').maybeSingle();

            if (cfJe) {
              const cfLines: any[] = [];
              const cfCode = (fundDetail as any)?.gl_cf_account ?? '2401';
              const { data: cfAcct } = await supabase.from('acct_accounts' as any)
                .select('id').eq('code', cfCode).maybeSingle();
              const cfId = (cfAcct as any)?.id;
              // Dr old-period pre-fund liability (reduce closing period balance)
              if (liabId) cfLines.push({ entry_id: (cfJe as any).id, line_no: 1, account_id: liabId, debit_credit: 'DR', original_amount: carryAmt, original_currency: currency, functional_amount: carryAmt, functional_currency: currency, description: `Carry-forward — close old-period pre-fund liability`, function: 'program' });
              // Cr new-period pre-fund liability (open balance in next period)
              if (cfId)   cfLines.push({ entry_id: (cfJe as any).id, line_no: 2, account_id: cfId,   debit_credit: 'CR', original_amount: carryAmt, original_currency: currency, functional_amount: carryAmt, functional_currency: currency, description: `Carry-forward — open next-period pre-fund liability`, function: 'program' });
              if (cfLines.length > 0) await supabase.from('acct_journal_lines').insert(cfLines);

              await supabase.from('acct_gl_bridge_log' as any).insert({
                source_table: 'pre_fund_reconciliations',
                source_id: (recon as any)?.id ?? selectedFund.id,
                event_type: 'pre_fund_carry_forward',
                status: 'success',
                journal_entry_id: (cfJe as any).id,
              });
            }
          }
        }
      } catch (glErr: any) {
        // GL failed — roll back recon record and revert fund status to keep DB consistent
        const reconId = (recon as any)?.id;
        if (reconId) await supabase.from('pre_fund_reconciliations').delete().eq('id', reconId);
        await supabase.from('pre_fund_requests').update({ status: 'active' }).eq('id', selectedFund.id);
        throw new Error(`GL Bridge failed — period close rolled back: ${(glErr as any).message}`);
      }

      toast({ title: 'Period closed', description: 'GL journal entry created (draft) — review in GL module.' });
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

  // ── Fetch approval steps with resolved user names ─────────────────────────
  const fetchApprovalSteps = async (fundId: string): Promise<ApprovalStepRow[]> => {
    const { data: steps } = await supabase
      .from('pre_fund_approval_steps' as any)
      .select('step_order,step_label,assigned_user_id,status,approved_at')
      .eq('pre_fund_request_id', fundId)
      .order('step_order');
    if (!steps || !(steps as any[]).length) return [];
    const userIds = [...new Set((steps as any[]).map((s: any) => s.assigned_user_id).filter(Boolean))];
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles').select('id,full_name,email').in('id', userIds)
      : { data: [] };
    const nameMap = new Map((profileRows ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Unknown']));
    return (steps as any[]).map((s: any) => ({
      step_no: s.step_order,
      label: s.step_label ?? `Step ${s.step_order}`,
      assigned_name: nameMap.get(s.assigned_user_id) ?? '—',
      status: s.status,
      decided_at: s.approved_at,
    }));
  };

  // ── Fetch GL journal entries for this fund ────────────────────────────────
  const fetchGlEntries = async (fundId: string): Promise<GlEntryRow[]> => {
    const { data: logs } = await supabase
      .from('acct_gl_bridge_log' as any)
      .select('event_type,journal_entry_id,created_at')
      .eq('source_table', 'pre_fund_requests')
      .eq('source_id', fundId)
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
      const approvalSteps = await fetchApprovalSteps(selectedFund.id);
      const { blob, filename } = await generateDonorStatementPDF(selectedFund, transactions, approvalSteps);
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

  const totalReconciled = transactions.filter(t => t.reconciled).reduce((s, t) => s + t.amount, 0);
  const totalUnreconciled = transactions.filter(t => !t.reconciled).reduce((s, t) => s + t.amount, 0);

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

              {/* Transaction table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Transactions</h3>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddTxn(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Transaction
                  </Button>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map(t => (
                          <TableRow key={t.id} data-testid={`row-txn-${t.id}`}>
                            <TableCell className="text-xs whitespace-nowrap">{format(parseISO(t.transaction_date), 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <span className={cn('text-xs font-medium', TXN_TYPE_CFG[t.transaction_type]?.color)}>
                                {TXN_TYPE_CFG[t.transaction_type]?.label ?? t.transaction_type}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.reference ?? '—'}</TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">{t.description ?? '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{t.currency} {formatNumber(t.amount, 0)}</TableCell>
                            <TableCell className="text-center">
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
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={4} className="text-xs">Totals</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {selectedFund.currency} {formatNumber(transactions.reduce((s, t) => s + t.amount, 0), 0)}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{transactions.filter(t => t.reconciled).length}/{transactions.length}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Past reconciliations */}
              {reconciliations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Past Reconciliations</h3>
                  <div className="space-y-2">
                    {reconciliations.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg text-sm" data-testid={`card-recon-${r.id}`}>
                        <div>
                          <span className="font-medium">{r.period_start && r.period_end ? `${format(parseISO(r.period_start), 'MMM d')} – ${format(parseISO(r.period_end), 'MMM d, yyyy')}` : '—'}</span>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Surplus action: {SURPLUS_OPTIONS.find(o => o.value === r.surplus_action)?.label ?? r.surplus_action}
                            {r.closed_at && ` · Closed ${format(parseISO(r.closed_at), 'MMM d, yyyy')}`}
                          </div>
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
    </div>
  );
}
