import { useState, useRef, useCallback, useEffect, useMemo, type DragEvent as ReactDragEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Download, CheckCircle2, AlertCircle, Loader2, ScanLine,
  RefreshCw, Trash2, Upload, Clock, Save, FolderOpen, Database, CopyX, Filter, UserCheck, Pencil
} from 'lucide-react';
import * as _XLSXStyleNS from 'xlsx-js-style';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSXStyle: any = (_XLSXStyleNS as any).default ?? _XLSXStyleNS;
import { format, parse, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { ensureValidSession } from '@/lib/session-health';

type TxRow = {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  transaction_id: string;
  transaction_date: string;
  transaction_time: string;
  from_account: string;
  to_account: string;
  recipient_name: string;
  mobile_number: string;
  comment: string;
  amount: number | string;
  amount_confidence?: number;
};

type SavedSession = {
  id: string;
  session_name: string | null;
  scanned_at: string;
  receipt_count: number;
  total_amount: number;
  receipts: TxRow[];
};

function parseDateTime(raw: string): { date: string; time: string } {
  if (!raw) return { date: '', time: '' };
  const cleaned = raw.trim();
  const parts = cleaned.split(' ');
  if (parts.length >= 2) {
    try {
      const p = parse(parts[0], 'dd-MMM-yyyy', new Date());
      if (isValid(p)) return { date: format(p, 'yyyy-MM-dd'), time: parts[1] };
    } catch {}
    return { date: parts[0], time: parts[1] };
  }
  return { date: cleaned, time: '' };
}

function amountNum(v: number | string): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return isNaN(n) ? 0 : n;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const BATCH_SIZE = 8;

function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.82).split(',')[1], mimeType: 'image/jpeg' });
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function parseTxResult(x: any): Partial<TxRow> {
  const { date, time } = parseDateTime(x?.date_time || '');
  return {
    transaction_id: x?.transaction_id || '',
    transaction_date: date,
    transaction_time: time,
    from_account: x?.from_account || '',
    to_account: x?.to_account || '',
    recipient_name: x?.recipient_name || '',
    mobile_number: x?.mobile_number || 'N/A',
    comment: x?.comment || 'N/A',
    amount: x?.amount ?? 0,
    amount_confidence: typeof x?.amount_confidence === 'number' ? x.amount_confidence : undefined,
  };
}

async function extractBatch(
  images: Array<{ base64: string; mimeType: string }>,
  onStatus?: (msg: string) => void,
): Promise<Array<Partial<TxRow>>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ocrSecret = import.meta.env.VITE_OCR_DEV_SECRET;
    const res = await fetch('/api/extract-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ocrSecret ? { 'Authorization': `Bearer ${ocrSecret}` } : {}),
      },
      body: JSON.stringify({ images }),
    });
    const data = await res.json().catch(() => ({ error: res.statusText }));

    if (res.status === 503 && data.needsGroqKey) {
      throw new Error('__NEEDS_GROQ_KEY__');
    }
    if (res.status === 429) {
      if (data.isDailyExhausted) {
        throw new Error('All AI models at daily quota. Quotas reset at midnight Pacific time.');
      }
      const waitSec = Math.min(data.retryAfterSec ?? 30, 60);
      onStatus?.(`Rate limited — waiting ${waitSec}s…`);
      await sleep(waitSec * 1000);
      continue;
    }
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

    const clean = (data.text || '').replace(/```json\n?|```\n?/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(clean); } catch { throw new Error('Could not parse AI response'); }

    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.slice(0, images.length).map((x: any) => parseTxResult(x));
  }
  throw new Error('All AI models at daily quota. Quotas reset at midnight Pacific time.');
}

function exportToExcel(rows: Array<Partial<TxRow> & Record<string, any>>, sessionName?: string) {
  // Accept rows that have status === 'done', or rows that have no status field at all (loaded from DB)
  const done = rows.filter(r => r.status === 'done' || r.status === undefined);
  if (!done.length) { console.warn('[Export] No rows to export'); return; }

  const sorted = [...done].sort((a, b) => {
    if (a.transaction_date < b.transaction_date) return -1;
    if (a.transaction_date > b.transaction_date) return 1;
    return (a.transaction_time || '').localeCompare(b.transaction_time || '');
  });

  const groups: Record<string, TxRow[]> = {};
  sorted.forEach(row => {
    const d = row.transaction_date || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(row);
  });

  const sTitle  = { font: { bold: true, sz: 14, color: { rgb: '0F2041' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } } };
  const sMeta   = { font: { italic: true, sz: 9, color: { rgb: '888888' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } } };
  const sGrand  = { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0F2041' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  const sGrandN = { font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0F2041' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00' };
  const sSumLbl = { font: { bold: true, sz: 10, color: { rgb: '1D3461' } }, fill: { patternType: 'solid', fgColor: { rgb: 'DCE8FF' } } };
  const sSumNum = { font: { bold: true, sz: 10, color: { rgb: '1D3461' } }, fill: { patternType: 'solid', fgColor: { rgb: 'DCE8FF' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' };
  const sHdr    = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1D3461' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: '0F2041' } } } };
  const sDate   = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1D3461' } }, alignment: { horizontal: 'left', vertical: 'center' } };
  const sSeq    = { font: { sz: 10, color: { rgb: '888888' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }, alignment: { horizontal: 'center' } };
  const sTx     = { font: { sz: 10, name: 'Courier New' }, fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } } };
  const sTxAmt  = { font: { bold: true, sz: 10, name: 'Courier New', color: { rgb: '0F2041' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' };
  const sTxAlt  = { font: { sz: 10, name: 'Courier New' }, fill: { patternType: 'solid', fgColor: { rgb: 'F2F6FF' } } };
  const sTxAltAmt = { font: { bold: true, sz: 10, name: 'Courier New', color: { rgb: '0F2041' } }, fill: { patternType: 'solid', fgColor: { rgb: 'F2F6FF' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' };
  const sSub    = { font: { bold: true, sz: 10, color: { rgb: '1D3461' } }, fill: { patternType: 'solid', fgColor: { rgb: 'E0ECF8' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' };
  const sSubLbl = { font: { bold: true, sz: 10, color: { rgb: '1D3461' } }, fill: { patternType: 'solid', fgColor: { rgb: 'E0ECF8' } } };

  const ws: any = {};
  const COLS = ['#', 'Transaction ID', 'Date', 'Time', 'From Account', 'To Account', 'Recipient Name', 'Mobile', 'Comment', 'Amount (SDG)'];
  const colWidths = [5, 22, 14, 10, 22, 22, 34, 16, 22, 18];

  let r = 0;
  const setCell = (row: number, col: number, v: any, s?: any, t?: string) => {
    const addr = XLSXStyle.utils.encode_cell({ r: row, c: col });
    ws[addr] = { v, t: t ?? (typeof v === 'number' ? 'n' : 's'), s };
  };
  const addMerge = (r1: number, c1: number, r2: number, c2: number) => {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  };
  const setRow = (row: number, ht: number) => {
    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][row] = { hpt: ht };
  };

  const grandTotal = done.reduce((s, x) => s + amountNum(x.amount), 0);

  setCell(r, 0, 'PACT Command Center — Bank Transfer Report', sTitle);
  addMerge(r, 0, r, 9); setRow(r, 22); r++;

  const label = sessionName ? `Session: ${sessionName}   |   ` : '';
  setCell(r, 0, `${label}Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}   |   Total: ${done.length} transactions`, sMeta);
  addMerge(r, 0, r, 9); r++; r++;

  setCell(r, 0, '★  GRAND TOTAL', sGrand); addMerge(r, 0, r, 8);
  setCell(r, 9, grandTotal, sGrandN); setRow(r, 26); r++;

  Object.entries(groups).forEach(([date, items]) => {
    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
    const sub = items.reduce((s, x) => s + amountNum(x.amount), 0);
    setCell(r, 0, `  ${d}  ·  ${items.length} transaction${items.length !== 1 ? 's' : ''}`, sSumLbl);
    addMerge(r, 0, r, 8);
    setCell(r, 9, sub, sSumNum); r++;
  });
  r++;

  COLS.forEach((h, c) => setCell(r, c, h, sHdr)); setRow(r, 20); r++;

  let seq = 1;
  let runningTotal = 0;
  Object.entries(groups).forEach(([date, items]) => {
    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
    setCell(r, 0, `  ${d}`, sDate); addMerge(r, 0, r, 9); setRow(r, 16); r++;

    let sub = 0;
    items.forEach((tx, i) => {
      const amt = amountNum(tx.amount);
      sub += amt;
      const base = i % 2 === 0 ? sTx : sTxAlt;
      const amtStyle = i % 2 === 0 ? sTxAmt : sTxAltAmt;
      setCell(r, 0, seq++, { ...sSeq, fill: base.fill });
      setCell(r, 1, tx.transaction_id, base);
      setCell(r, 2, d, base);
      setCell(r, 3, tx.transaction_time, base);
      setCell(r, 4, tx.from_account, base);
      setCell(r, 5, tx.to_account, base);
      setCell(r, 6, tx.recipient_name, base);
      setCell(r, 7, tx.mobile_number, base);
      setCell(r, 8, tx.comment, base);
      setCell(r, 9, amt, amtStyle);
      r++;
    });

    setCell(r, 0, `Subtotal  —  ${d}`, sSubLbl); addMerge(r, 0, r, 8);
    setCell(r, 9, sub, sSub);
    runningTotal += sub; r++; r++;
  });

  setCell(r, 0, '★  GRAND TOTAL', sGrand); addMerge(r, 0, r, 8);
  setCell(r, 9, runningTotal, sGrandN); setRow(r, 26); r++;

  ws['!ref'] = XLSXStyle.utils.encode_range({ r: 0, c: 0 }, { r, c: 9 });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Transactions');

  // ── Sheet 2: Recipients Summary ─────────────────────────────────────────
  const recipientMap = new Map<string, { name: string; account: string; mobile: string; count: number; total: number }>();
  done.forEach(tx => {
    const key = tx.to_account || tx.recipient_name || 'Unknown';
    const existing = recipientMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += amountNum(tx.amount);
      if (!existing.name && tx.recipient_name) existing.name = tx.recipient_name;
      if (existing.mobile === 'N/A' && tx.mobile_number !== 'N/A') existing.mobile = tx.mobile_number;
    } else {
      recipientMap.set(key, {
        name: tx.recipient_name || '',
        account: tx.to_account || '',
        mobile: tx.mobile_number || 'N/A',
        count: 1,
        total: amountNum(tx.amount),
      });
    }
  });

  const recipients = Array.from(recipientMap.values()).sort((a, b) => b.total - a.total);
  const grandRecipientTotal = recipients.reduce((s, x) => s + x.total, 0);

  const ws2: any = {};
  let r2 = 0;

  const sc = (row: number, col: number, v: any, s?: any) => {
    ws2[XLSXStyle.utils.encode_cell({ r: row, c: col })] = { v, t: typeof v === 'number' ? 'n' : 's', s };
  };
  const sm2 = (r1: number, c1: number, r2e: number, c2: number) => {
    if (!ws2['!merges']) ws2['!merges'] = [];
    ws2['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2e, c: c2 } });
  };

  // Title
  sc(r2, 0, 'PACT Command Center — Recipients Summary', sTitle);
  sm2(r2, 0, r2, 5); ws2[XLSXStyle.utils.encode_cell({ r: r2, c: 0 })].s = { ...sTitle };
  if (!ws2['!rows']) ws2['!rows'] = [];
  ws2['!rows'][r2] = { hpt: 22 }; r2++;

  const lbl2 = sessionName ? `Session: ${sessionName}   |   ` : '';
  sc(r2, 0, `${lbl2}Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}   |   ${recipients.length} unique recipients`, sMeta);
  sm2(r2, 0, r2, 5); r2++; r2++;

  // Grand total banner
  sc(r2, 0, '★  GRAND TOTAL', sGrand); sm2(r2, 0, r2, 4);
  sc(r2, 5, grandRecipientTotal, sGrandN);
  ws2['!rows'][r2] = { hpt: 26 }; r2++; r2++;

  // Column headers
  const RCOLS = ['#', 'Recipient Name', 'Account Number', 'Mobile', '# Transactions', 'Total (SDG)'];
  const rWidths = [5, 36, 24, 18, 14, 20];
  RCOLS.forEach((h, c) => sc(r2, c, h, sHdr));
  ws2['!rows'][r2] = { hpt: 20 }; r2++;

  // Recipient rows
  recipients.forEach((rec, i) => {
    const base = i % 2 === 0 ? sTx : sTxAlt;
    const amtStyle = i % 2 === 0 ? sTxAmt : sTxAltAmt;
    sc(r2, 0, i + 1, { ...sSeq, fill: base.fill });
    sc(r2, 1, rec.name, { ...base, alignment: { horizontal: 'left' } });
    sc(r2, 2, rec.account, base);
    sc(r2, 3, rec.mobile, base);
    sc(r2, 4, rec.count, { ...base, alignment: { horizontal: 'center' } });
    sc(r2, 5, rec.total, amtStyle);
    r2++;
  });

  r2++;
  // Bottom grand total
  sc(r2, 0, '★  GRAND TOTAL', sGrand); sm2(r2, 0, r2, 4);
  sc(r2, 5, grandRecipientTotal, sGrandN);
  ws2['!rows'][r2] = { hpt: 26 }; r2++;

  ws2['!ref'] = XLSXStyle.utils.encode_range({ r: 0, c: 0 }, { r: r2, c: 5 });
  ws2['!cols'] = rWidths.map(w => ({ wch: w }));

  XLSXStyle.utils.book_append_sheet(wb, ws2, 'Recipients Summary');

  const fname = sessionName
    ? `PACT_Transfers_${sessionName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`
    : `PACT_Bank_Transfers_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

  const buf: ArrayBuffer = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fmtDate(iso: string) {
  if (!iso) return '';
  try { return format(new Date(iso), 'dd MMM yyyy'); } catch { return iso; }
}

function fmtAcct(acct: string) {
  if (!acct) return '';
  const d = acct.replace(/\s/g, '');
  return d.length > 8 ? `${d.slice(0, 4)} ··· ${d.slice(-4)}` : d;
}

function computeUniqueRecipients(sourceRows: Array<any>) {
  const map = new Map<string, { name: string; account: string; count: number; total: number }>();
  sourceRows.forEach(r => {
    const key = r.to_account || r.recipient_name || 'Unknown';
    const ex = map.get(key);
    if (ex) { ex.count++; ex.total += amountNum(r.amount); }
    else map.set(key, { name: r.recipient_name || '', account: r.to_account || '', count: 1, total: amountNum(r.amount) });
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export default function TransactionScanner() {
  const { toast } = useToast();

  const handleExportToExcel = (rows: Array<Partial<TxRow> & Record<string, any>>, sessionName?: string) => {
    try {
      exportToExcel(rows, sessionName);
    } catch (err: any) {
      console.error('[Export] Download error:', err);
      toast({ title: 'Export Failed', description: err?.message || 'Unknown error. Please try again.', variant: 'destructive' });
    }
  };

  const [rows, setRows] = useState<TxRow[]>([]);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [filterExportOpen, setFilterExportOpen] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [filterExportSource, setFilterExportSource] = useState<Array<any>>([]);
  const [filterExportSessionName, setFilterExportSessionName] = useState<string | undefined>();
  const [saveMode, setSaveMode] = useState<'new' | 'append'>('new');
  const [appendTargetId, setAppendTargetId] = useState<string>('');
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmountValue, setEditingAmountValue] = useState<string>('');
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const updateRow = useCallback((id: string, patch: Partial<TxRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)), []);

  const removeRow = useCallback((id: string) =>
    setRows(prev => prev.filter(r => r.id !== id)), []);

  const doneRows = rows.filter(r => r.status === 'done');
  const errorRows = rows.filter(r => r.status === 'error');
  const pendingRows = rows.filter(r => r.status === 'pending' || r.status === 'processing');
  const processing = pendingRows.length > 0;
  const statusMsg = rows.find(r => r.status === 'processing' && r.error)?.error;

  // Duplicate detection — find transaction_ids that appear more than once among done rows
  const duplicateIds = useMemo<Set<string>>(() => {
    const counts = new Map<string, number>();
    doneRows.forEach(r => {
      if (r.transaction_id) counts.set(r.transaction_id, (counts.get(r.transaction_id) || 0) + 1);
    });
    const dupes = new Set<string>();
    counts.forEach((count, id) => { if (count > 1) dupes.add(id); });
    return dupes;
  }, [doneRows]);

  // Unique recipients for the filtered export dialog — derived from filterExportSource
  const filterUniqueRecipients = useMemo(() => computeUniqueRecipients(filterExportSource), [filterExportSource]);
  const grandTotal = doneRows.reduce((s, r) => s + amountNum(r.amount), 0);
  const progressPct = rows.length > 0 ? (doneRows.length / rows.length) * 100 : 0;
  const doneCount = doneRows.length;
  const totalCount = rows.length;

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const { data, error } = await supabase
        .from('bank_transaction_scans')
        .select('id, session_name, scanned_at, receipt_count, total_amount, receipts')
        .order('scanned_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('[TransactionScanner] loadSessions error:', error.code, error.message, error.details);
        setSessionsError(`${error.message}${error.details ? ` — ${error.details}` : ''}`);
        return;
      }
      setSavedSessions((data || []) as SavedSession[]);
    } catch (err: any) {
      console.error('[TransactionScanner] loadSessions caught:', err);
      setSessionsError(err.message || 'Unknown error loading records');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const saveSession = useCallback(async (name: string) => {
    if (!doneRows.length) return;
    const session = await ensureValidSession();
    if (!session.success) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const totalAmt = doneRows.reduce((s, r) => s + amountNum(r.amount), 0);

      // Strip frontend-only fields before saving
      const receiptsToSave = doneRows.map(({ id: _id, fileName: _fn, status: _st, error: _er, ...rest }) => rest);

      const { data, error } = await supabase.from('bank_transaction_scans').insert({
        session_name: name.trim() || null,
        scanned_by: user?.id || null,
        receipts: receiptsToSave,
        receipt_count: doneRows.length,
        total_amount: totalAmt,
      }).select('id');

      if (error) {
        console.error('[TransactionScanner] Save error:', error.code, error.message, error.details, error.hint);
        throw new Error(error.message || error.details || 'Database insert failed');
      }

      console.log('[TransactionScanner] Saved successfully, id:', data?.[0]?.id);
      toast({ title: 'Session saved', description: `${doneRows.length} receipts saved${name ? ` as "${name}"` : ''}.` });
      setAutoSaved(true);
      await loadSessions();
    } catch (err: any) {
      console.error('[TransactionScanner] Save caught error:', err);
      toast({ title: 'Save failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [doneRows, loadSessions, toast]);

  const appendToSession = useCallback(async (targetId: string) => {
    if (!doneRows.length || !targetId) return;
    const session = await ensureValidSession();
    if (!session.success) return;
    setSaving(true);
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('bank_transaction_scans')
        .select('receipts, receipt_count, total_amount, session_name')
        .eq('id', targetId)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);

      const existingReceipts: any[] = existing.receipts || [];
      const existingIds = new Set(existingReceipts.map((r: any) => r.transaction_id).filter(Boolean));
      const newReceipts = doneRows.map(({ id: _id, fileName: _fn, status: _st, error: _er, ...rest }) => rest);

      let addedCount = 0;
      const merged = [...existingReceipts];
      for (const r of newReceipts) {
        if (!r.transaction_id || !existingIds.has(r.transaction_id)) {
          merged.push(r);
          addedCount++;
        }
      }

      const newTotal = merged.reduce((s: number, r: any) => s + amountNum(r.amount), 0);
      const { error: updateErr } = await supabase
        .from('bank_transaction_scans')
        .update({ receipts: merged, receipt_count: merged.length, total_amount: newTotal })
        .eq('id', targetId);
      if (updateErr) throw new Error(updateErr.message);

      const skipped = newReceipts.length - addedCount;
      toast({
        title: 'Session updated',
        description: `Added ${addedCount} receipt${addedCount !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped` : ''} to "${existing.session_name || 'Untitled scan'}"`,
      });
      setAutoSaved(true);
      await loadSessions();
    } catch (err: any) {
      console.error('[TransactionScanner] Append error:', err);
      toast({ title: 'Update failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [doneRows, loadSessions, toast]);

  const doDeleteSession = useCallback(async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    const { error } = await supabase.from('bank_transaction_scans').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Session deleted' });
    setSavedSessions(prev => prev.filter(s => s.id !== id));
  }, [toast]);

  const deleteSession = useCallback((id: string) => {
    toast({
      title: 'Delete this session?',
      description: 'All scan receipts in this session will be permanently removed.',
      variant: 'destructive',
      action: <ToastAction altText="Confirm deletion" onClick={() => doDeleteSession(id)}>Delete</ToastAction>,
    });
  }, [toast, doDeleteSession]);

  const loadSession = useCallback((session: SavedSession) => {
    const restored: TxRow[] = (session.receipts || []).map((r: any) => ({
      transaction_id: r.transaction_id || '',
      transaction_date: r.transaction_date || '',
      transaction_time: r.transaction_time || '',
      from_account: r.from_account || '',
      to_account: r.to_account || '',
      recipient_name: r.recipient_name || '',
      mobile_number: r.mobile_number || 'N/A',
      comment: r.comment || 'N/A',
      amount: r.amount ?? 0,
      id: crypto.randomUUID(),
      status: 'done' as const,
      fileName: '',
    }));
    setRows(restored);
    setAutoSaved(true);
    setQuotaError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: 'Session loaded', description: `${restored.length} receipts from "${session.session_name || format(new Date(session.scanned_at), 'dd MMM yyyy HH:mm')}"` });
  }, [toast]);

  useEffect(() => {
    if (rows.length >= 1 && doneRows.length === rows.length && errorRows.length === 0 && !autoSaved && !processing) {
      handleExportToExcel(rows);
    }
  }, [doneRows.length, rows.length, errorRows.length, autoSaved, processing]);

  const processBatch = useCallback(async (batchRowIds: string[], images: Array<{ base64: string; mimeType: string }>): Promise<boolean> => {
    batchRowIds.forEach(id => updateRow(id, { status: 'processing', error: undefined }));
    const onStatus = (msg: string) => batchRowIds.forEach(id => updateRow(id, { error: msg }));
    try {
      const results = await extractBatch(images, onStatus);
      batchRowIds.forEach((id, i) => {
        const r = results[i];
        if (r) updateRow(id, { status: 'done', error: undefined, ...r });
        else updateRow(id, { status: 'error', error: 'No result for this image' });
      });
      return true;
    } catch (err: any) {
      const msg: string = err.message || 'Extraction failed';
      const isGroqKeyMissing = msg === '__NEEDS_GROQ_KEY__';
      const isQuota = isGroqKeyMissing || msg.includes('daily quota') || msg.includes('All AI models');
      const displayMsg = isGroqKeyMissing ? 'Gemini quota exhausted — add GROQ_API_KEY to continue' : msg;
      batchRowIds.forEach(id => updateRow(id, { status: 'error', error: displayMsg }));
      if (isQuota) setQuotaError(isGroqKeyMissing ? '__NEEDS_GROQ_KEY__' : msg);
      return !isQuota;
    }
  }, [updateRow]);

  const retryRow = useCallback(async (rowId: string) => {
    const file = fileMapRef.current.get(rowId);
    if (file) {
      const img = await compressImage(file);
      await processBatch([rowId], [img]);
    }
  }, [processBatch]);

  const processFiles = useCallback(async (files: File[]) => {
    setQuotaError(null);
    setAutoSaved(false);
    const newRows: TxRow[] = files.map(f => ({
      id: crypto.randomUUID(), fileName: f.name, status: 'pending',
      transaction_id: '', transaction_date: '', transaction_time: '',
      from_account: '', to_account: '', recipient_name: '',
      mobile_number: 'N/A', comment: 'N/A', amount: 0,
    }));
    newRows.forEach((r, i) => fileMapRef.current.set(r.id, files[i]));
    setRows(prev => [...prev, ...newRows]);

    // Pre-compress all images upfront in parallel before any API calls
    const allImages = await Promise.all(files.map(compressImage));

    // Build batch list (8 images each)
    const CONCURRENCY = 2;
    const batches: Array<{ rowIds: string[]; imgs: Array<{ base64: string; mimeType: string }> }> = [];
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      batches.push({
        rowIds: newRows.slice(i, i + BATCH_SIZE).map(r => r.id),
        imgs: allImages.slice(i, i + BATCH_SIZE),
      });
    }

    // Run up to 2 batches concurrently; 1 s gap between rounds
    let aborted = false;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      if (aborted) break;
      const chunk = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(b => processBatch(b.rowIds, b.imgs)));
      if (results.some(r => !r)) {
        aborted = true;
        const processedSet = new Set(chunk.flatMap(b => b.rowIds));
        const remaining = newRows.filter(r =>
          !processedSet.has(r.id) && batches.slice(i + CONCURRENCY).some(b => b.rowIds.includes(r.id))
        );
        if (remaining.length > 0) {
          setRows(prev => prev.map(r =>
            remaining.some(nr => nr.id === r.id) && r.status === 'pending'
              ? { ...r, status: 'error', error: 'Quota exhausted — will work tomorrow after midnight Pacific time' }
              : r
          ));
        }
        break;
      }
      if (i + CONCURRENCY < batches.length) await sleep(1000);
    }
  }, [processBatch]);

  const onDrop = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
  }, [processFiles]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const retryAllFailed = useCallback(async () => {
    setQuotaError(null);
    const failed = rows.filter(r => r.status === 'error');
    for (let i = 0; i < failed.length; i += BATCH_SIZE) {
      const batch = failed.slice(i, i + BATCH_SIZE);
      const batchFiles = batch.map(r => fileMapRef.current.get(r.id)!).filter(Boolean);
      const imgs = await Promise.all(batchFiles.map(compressImage));
      const canContinue = await processBatch(batch.map(r => r.id), imgs);
      if (!canContinue) break;
      if (i + BATCH_SIZE < failed.length) await sleep(1000);
    }
  }, [rows, processBatch]);

  const clearAll = () => { setRows([]); fileMapRef.current.clear(); setQuotaError(null); setAutoSaved(false); };

  return (
    <div className="min-h-screen bg-background">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-5 w-5 text-[#1D3461]" />
          <span className="font-bold text-[#1D3461]">Bank Transfer Scanner</span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneCount} of {totalCount} extracted
            </span>
          )}
          {processing && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Processing…</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {doneRows.length > 0 && !processing && (
            <Button
              onClick={() => { setSaveName(''); setSaveDialogOpen(true); }}
              variant="outline"
              className="gap-2 h-8 text-sm border-[#1D3461]/30 text-[#1D3461]"
              disabled={saving}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          )}
          {doneRows.length > 0 && (
            <>
              <Button
                onClick={() => {
                  const recs = computeUniqueRecipients(doneRows);
                  setFilterExportSource(doneRows);
                  setFilterExportSessionName(undefined);
                  setSelectedAccounts(new Set(recs.map(r => r.account || r.name)));
                  setFilterExportOpen(true);
                }}
                variant="outline"
                className="gap-2 h-8 text-sm border-emerald-600/40 text-emerald-700 hover:bg-emerald-50"
              >
                <Filter className="h-3.5 w-3.5" />
                Export by Account
              </Button>
              <Button onClick={() => handleExportToExcel(rows)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm">
                <Download className="h-4 w-4" />
                All ({doneCount})
              </Button>
            </>
          )}
          {rows.length > 0 && !processing && (
            <Button variant="ghost" size="icon" onClick={clearAll} title="Clear all" className="h-8 w-8">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-4">

        {/* Upload zone */}
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !processing && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl transition-all ${
            processing
              ? 'border-[#1D3461]/30 bg-[#1D3461]/5 cursor-default'
              : 'border-[#1D3461]/40 hover:border-[#1D3461] hover:bg-[#1D3461]/5 cursor-pointer'
          } ${rows.length === 0 ? 'py-16' : 'py-4'} flex flex-col items-center justify-center gap-2`}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileChange} />
          {processing ? (
            <div className="w-full max-w-sm px-4 space-y-2">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-center text-xs text-muted-foreground">{doneCount} of {totalCount} images processed</p>
              {statusMsg && (
                <p className="text-center text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">{statusMsg}</p>
              )}
            </div>
          ) : (
            <>
              <Upload className="h-7 w-7 text-[#1D3461]/50" />
              <p className="text-sm font-medium text-[#1D3461]">
                {rows.length > 0 ? 'Drop more screenshots to add' : 'Drop screenshots here or click to upload'}
              </p>
              <p className="text-xs text-muted-foreground">PNG · JPG · WebP · Multiple files · Arabic or English</p>
            </>
          )}
        </div>

        {/* Quota / Groq key banner */}
        {quotaError && (
          quotaError === '__NEEDS_GROQ_KEY__' ? (
            <div className="rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Gemini quota exhausted — activate free Groq fallback</p>
                <p className="text-blue-700 dark:text-blue-400 text-xs">
                  Groq offers <strong>7,000 free requests/day</strong> with no credit card. Follow these steps:
                </p>
                <ol className="text-blue-700 dark:text-blue-400 text-xs list-decimal list-inside space-y-0.5">
                  <li>Go to <strong>console.groq.com</strong> → sign up free → API Keys → Create key</li>
                  <li>In Replit: open <strong>Secrets</strong> (lock icon) → add key <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">GROQ_API_KEY</code></li>
                  <li>Restart the app, then click <strong>Retry All</strong></li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">AI quota exhausted for today</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">
                  All AI models have reached their daily limit.
                  Quotas reset at <strong>midnight Pacific time</strong> (08:00 Sudan time tomorrow).
                  Your images are saved — click <strong>Retry All</strong> tomorrow.
                </p>
              </div>
            </div>
          )
        )}

        {/* Duplicate warning banner */}
        {duplicateIds.size > 0 && (
          <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
            <CopyX className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                {duplicateIds.size} duplicate transaction{duplicateIds.size !== 1 ? 's' : ''} detected
              </p>
              <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                The same receipt was scanned more than once. Duplicates are highlighted in amber below — remove extras before saving or exporting.
              </p>
            </div>
          </div>
        )}

        {/* Receipts table — all rows, live status */}
        {rows.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0F2041] text-white">
                    <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
                    <th className="px-3 py-2.5 text-left font-medium w-24">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Transaction ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Date</th>
                    <th className="px-3 py-2.5 text-left font-medium">Time</th>
                    <th className="px-3 py-2.5 text-left font-medium">From Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">To Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Recipient</th>
                    <th className="px-3 py-2.5 text-left font-medium">Comment</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount (SDG)</th>
                    <th className="px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, idx) => {
                    const isDone = row.status === 'done';
                    const isErr = row.status === 'error';
                    const isPending = row.status === 'pending';
                    const isProcessing = row.status === 'processing';
                    const isDuplicate = isDone && !!row.transaction_id && duplicateIds.has(row.transaction_id);
                    const isLowConfidence = isDone && !isDuplicate && row.amount_confidence !== undefined && row.amount_confidence < 90;

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          isDuplicate ? 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30' :
                          isErr ? 'bg-red-50/60 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20' :
                          isProcessing ? 'bg-blue-50/40 dark:bg-blue-950/10' :
                          isPending ? 'bg-muted/20' :
                          isLowConfidence ? 'bg-yellow-50/70 dark:bg-yellow-950/15 hover:bg-yellow-50 dark:hover:bg-yellow-950/25' :
                          'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10'
                        }`}
                      >
                        <td className={`px-3 py-2 text-muted-foreground font-mono${isDuplicate ? ' border-l-2 border-amber-400' : ''}`}>{idx + 1}</td>
                        <td className="px-3 py-2">
                          {isDone && !isDuplicate && <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>}
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                              <CopyX className="h-3.5 w-3.5" /> Duplicate
                            </span>
                          )}
                          {isProcessing && <span className="inline-flex items-center gap-1 text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</span>}
                          {isPending && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Waiting</span>}
                          {isErr && (
                            <button onClick={() => retryRow(row.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium" title={row.error}>
                              <RefreshCw className="h-3.5 w-3.5" /> Retry
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {isDone ? <span>{row.transaction_id}</span> : (
                            <span className="text-muted-foreground italic truncate max-w-[120px] block" title={row.fileName}>
                              {isErr ? row.error?.slice(0, 40) + (row.error && row.error.length > 40 ? '…' : '') : row.fileName.replace(/\.[^.]+$/, '')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{isDone ? fmtDate(row.transaction_date) : ''}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{isDone ? row.transaction_time : ''}</td>
                        <td className="px-3 py-2 font-mono" title={row.from_account}>{isDone ? fmtAcct(row.from_account) : ''}</td>
                        <td className="px-3 py-2 font-mono" title={row.to_account}>{isDone ? fmtAcct(row.to_account) : ''}</td>
                        <td className="px-3 py-2" dir="auto">{isDone ? row.recipient_name : ''}</td>
                        <td className="px-3 py-2 text-muted-foreground" dir="auto">{isDone && row.comment !== 'N/A' ? row.comment : ''}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {isDone ? (
                            editingAmountId === row.id ? (
                              <input
                                type="text"
                                className="w-28 text-right font-mono text-xs border border-[#1D3461]/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1D3461] bg-white dark:bg-background"
                                value={editingAmountValue}
                                autoFocus
                                onChange={e => setEditingAmountValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const n = parseFloat(editingAmountValue.replace(/,/g, ''));
                                    if (!isNaN(n)) updateRow(row.id, { amount: n, amount_confidence: 100 });
                                    setEditingAmountId(null);
                                  }
                                  if (e.key === 'Escape') setEditingAmountId(null);
                                }}
                                onBlur={() => {
                                  const n = parseFloat(editingAmountValue.replace(/,/g, ''));
                                  if (!isNaN(n)) updateRow(row.id, { amount: n, amount_confidence: 100 });
                                  setEditingAmountId(null);
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1 group/amt">
                                {isLowConfidence && (
                                  <span
                                    title={`AI confidence: ${row.amount_confidence}% — amount may be incorrect, please verify`}
                                    className="text-amber-500 shrink-0 cursor-help"
                                  >
                                    <AlertCircle className="h-3.5 w-3.5" />
                                  </span>
                                )}
                                <span className={isLowConfidence ? 'text-amber-700 dark:text-amber-400' : ''}>
                                  {amountNum(row.amount).toLocaleString('en', { minimumFractionDigits: 2 })}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingAmountId(row.id);
                                    setEditingAmountValue(String(amountNum(row.amount)));
                                  }}
                                  className="opacity-0 group-hover/amt:opacity-100 transition-opacity text-muted-foreground hover:text-[#1D3461] p-0.5 rounded shrink-0"
                                  title="Edit amount"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )
                          ) : ''}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => removeRow(row.id)}
                            title="Remove this receipt"
                            className="text-muted-foreground/40 hover:text-red-500 transition-colors rounded p-0.5 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {doneRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F2041] text-white">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-sm">TOTAL</td>
                      <td colSpan={6} className="px-3 py-2.5 text-white/60 text-xs">
                        {doneCount} transaction{doneCount !== 1 ? 's' : ''}
                        {errorRows.length > 0 && (
                          <span className="ml-3 text-red-300">
                            · {errorRows.length} failed —{' '}
                            <button onClick={retryAllFailed} className="underline hover:no-underline">retry all</button>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-sm font-mono tabular-nums">
                        {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {rows.length > 0 && !processing && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pb-1">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[#1D3461] hover:underline font-medium"
            >
              <Upload className="h-3 w-3" /> Add more images
            </button>
            <span>·</span>
            <button onClick={() => handleExportToExcel(rows)} className="text-[#1D3461] hover:underline font-medium">
              Download Excel
            </button>
            <span>·</span>
            <button onClick={() => { setSaveName(''); setSaveMode('new'); setSaveDialogOpen(true); }} className="text-[#1D3461] hover:underline font-medium">
              Save to records
            </button>
          </div>
        )}

        {/* ── Saved Sessions ──────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#1D3461]" />
              <span className="font-semibold text-sm text-[#1D3461]">Saved Scan Records</span>
              {!sessionsLoading && (
                <span className="text-xs text-muted-foreground">({savedSessions.length})</span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={loadSessions} className="h-7 text-xs gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {sessionsLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved records…
            </div>
          ) : sessionsError ? (
            <div className="flex items-start gap-3 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-950/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
              <div>
                <p className="font-semibold">Could not load saved records</p>
                <p className="text-xs mt-0.5 font-mono">{sessionsError}</p>
              </div>
            </div>
          ) : savedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <FolderOpen className="h-8 w-8 opacity-30" />
              <p className="text-sm">No saved scans yet</p>
              <p className="text-xs">Scan receipts and click <strong>Save</strong> to build your records</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1D3461]/10 text-[#1D3461]">
                    <th className="px-4 py-2.5 text-left font-semibold w-8">#</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Session Name</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Date Saved</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Receipts</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Total (SDG)</th>
                    <th className="px-4 py-2.5 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {savedSessions.map((session, idx) => (
                    <tr key={session.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {session.session_name || (
                          <span className="text-muted-foreground italic">Untitled scan</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(session.scanned_at), 'dd MMM yyyy  HH:mm')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {session.receipt_count}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#0F2041]">
                        {Number(session.total_amount).toLocaleString('en', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => loadSession(session)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[#1D3461] bg-[#1D3461]/10 hover:bg-[#1D3461]/20 transition-colors font-medium"
                            title="Load this session"
                          >
                            <FolderOpen className="h-3 w-3" /> Load
                          </button>
                          <button
                            onClick={() => {
                              const src = session.receipts || [];
                              const recs = computeUniqueRecipients(src);
                              setFilterExportSource(src);
                              setFilterExportSessionName(session.session_name || undefined);
                              setSelectedAccounts(new Set(recs.map(r => r.account || r.name)));
                              setFilterExportOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors font-medium"
                            title="Filter export by account"
                          >
                            <Filter className="h-3 w-3" /> Filter
                          </button>
                          <button
                            onClick={() => handleExportToExcel(session.receipts, session.session_name || undefined)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[#1D3461] bg-[#1D3461]/10 hover:bg-[#1D3461]/20 transition-colors font-medium"
                            title="Download all as Excel"
                          >
                            <Download className="h-3 w-3" /> Excel
                          </button>
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-600 bg-red-50 hover:bg-red-100 transition-colors font-medium"
                            title="Delete this session"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0F2041] text-white">
                    <td colSpan={3} className="px-4 py-2.5 font-bold text-xs">ALL SESSIONS TOTAL</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">
                      {savedSessions.reduce((s, x) => s + x.receipt_count, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums">
                      {savedSessions.reduce((s, x) => s + Number(x.total_amount), 0).toLocaleString('en', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Filter Export Dialog */}
      <Dialog open={filterExportOpen} onOpenChange={setFilterExportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Export by Account
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-1 py-2 min-h-0">
            {/* Select / Deselect all */}
            <div className="flex items-center justify-between px-1 pb-2 border-b mb-2">
              <span className="text-xs text-muted-foreground">
                {selectedAccounts.size} of {filterUniqueRecipients.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedAccounts(new Set(filterUniqueRecipients.map(r => r.account || r.name)))}
                  className="text-xs text-[#1D3461] hover:underline font-medium"
                >Select all</button>
                <span className="text-muted-foreground text-xs">·</span>
                <button
                  onClick={() => setSelectedAccounts(new Set())}
                  className="text-xs text-muted-foreground hover:underline"
                >Clear</button>
              </div>
            </div>

            {/* Recipient list with checkboxes */}
            {filterUniqueRecipients.map(rec => {
              const key = rec.account || rec.name;
              const checked = selectedAccounts.has(key);
              const toggle = () => {
                setSelectedAccounts(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                });
              };
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={toggle}
                    className="accent-emerald-600 h-4 w-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" dir="auto">{rec.name || '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rec.account}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-[#0F2041]">
                      {rec.total.toLocaleString('en', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">{rec.count} tx</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Selected total preview */}
          {selectedAccounts.size > 0 && (() => {
            const selTotal = filterExportSource
              .filter(r => selectedAccounts.has(r.to_account || r.recipient_name || 'Unknown'))
              .reduce((s: number, r: any) => s + amountNum(r.amount), 0);
            const selCount = filterExportSource.filter(r => selectedAccounts.has(r.to_account || r.recipient_name || 'Unknown')).length;
            return (
              <div className="border-t pt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{selCount} transactions · {selectedAccounts.size} accounts</span>
                <span className="font-bold text-[#0F2041]">{selTotal.toLocaleString('en', { minimumFractionDigits: 2 })} SDG</span>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterExportOpen(false)}>Cancel</Button>
            <Button
              disabled={selectedAccounts.size === 0}
              onClick={() => {
                const filtered = filterExportSource.filter(r =>
                  selectedAccounts.has(r.to_account || r.recipient_name || 'Unknown')
                );
                const label = selectedAccounts.size === 1
                  ? Array.from(selectedAccounts)[0].slice(-8)
                  : `${selectedAccounts.size}_accounts`;
                handleExportToExcel(filtered, filterExportSessionName);
                setFilterExportOpen(false);
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Download className="h-4 w-4" />
              Export {selectedAccounts.size > 0 ? `(${selectedAccounts.size} account${selectedAccounts.size !== 1 ? 's' : ''})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Session Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Scan Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setSaveMode('new')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  saveMode === 'new'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                New session
              </button>
              <button
                onClick={() => {
                  setSaveMode('append');
                  if (!appendTargetId && savedSessions.length > 0) setAppendTargetId(savedSessions[0].id);
                }}
                disabled={savedSessions.length === 0}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  saveMode === 'append'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                Add to existing
              </button>
            </div>

            {saveMode === 'new' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Give this scan a name so you can find it later. Optional — you can leave it blank.
                </p>
                <Input
                  placeholder={`e.g. March batch — ${doneRows.length} receipts`}
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setSaveDialogOpen(false); saveSession(saveName); } }}
                  autoFocus
                />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Pick an existing session to add these receipts to. Duplicate transaction IDs will be skipped automatically.
                </p>
                <div className="space-y-1 max-h-52 overflow-y-auto border rounded-lg p-1">
                  {savedSessions.map(s => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                        appendTargetId === s.id
                          ? 'bg-[#1D3461]/8 border border-[#1D3461]/30'
                          : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appendTarget"
                        checked={appendTargetId === s.id}
                        onChange={() => setAppendTargetId(s.id)}
                        className="accent-[#1D3461] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {s.session_name || <span className="italic text-muted-foreground">Untitled scan</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(s.scanned_at)} · {s.receipt_count} receipts · {Number(s.total_amount).toLocaleString('en', { minimumFractionDigits: 0 })} SDG
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              {doneRows.length} receipts ready · Total: {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })} SDG
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setSaveDialogOpen(false);
                if (saveMode === 'new') saveSession(saveName);
                else appendToSession(appendTargetId);
              }}
              disabled={saving || (saveMode === 'append' && !appendTargetId)}
              className="gap-2 bg-[#1D3461] hover:bg-[#0F2041]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMode === 'new' ? 'Save' : 'Add Receipts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
