import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Download, CheckCircle2, AlertCircle, Loader2, ScanLine,
  RefreshCw, Trash2, Upload, Clock
} from 'lucide-react';
import XLSXStyle from 'xlsx-js-style';
import { format, parse, isValid } from 'date-fns';

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

const BATCH_SIZE = 5;

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
  };
}

async function extractBatch(
  images: Array<{ base64: string; mimeType: string }>,
  onStatus?: (msg: string) => void,
): Promise<Array<Partial<TxRow>>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('/api/extract-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
    const data = await res.json().catch(() => ({ error: res.statusText }));

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

function exportToExcel(rows: TxRow[]) {
  const done = rows.filter(r => r.status === 'done');
  if (!done.length) return;

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

  // Style definitions
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

  // Row 0 — Title
  setCell(r, 0, 'PACT Command Center — Bank Transfer Report', sTitle);
  addMerge(r, 0, r, 9); setRow(r, 22); r++;

  // Row 1 — Meta
  setCell(r, 0, `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}   |   Total: ${done.length} transactions`, sMeta);
  addMerge(r, 0, r, 9); r++; r++;

  // Row 3 — Grand Total banner
  setCell(r, 0, '★  GRAND TOTAL', sGrand); addMerge(r, 0, r, 8);
  setCell(r, 9, grandTotal, sGrandN); setRow(r, 26); r++;

  // Rows 4..n — Per-date summary
  Object.entries(groups).forEach(([date, items]) => {
    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
    const sub = items.reduce((s, x) => s + amountNum(x.amount), 0);
    setCell(r, 0, `  ${d}  ·  ${items.length} transaction${items.length !== 1 ? 's' : ''}`, sSumLbl);
    addMerge(r, 0, r, 8);
    setCell(r, 9, sub, sSumNum); r++;
  });
  r++;

  // Column headers
  COLS.forEach((h, c) => setCell(r, c, h, sHdr)); setRow(r, 20); r++;

  // Data rows grouped by date
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

    // Subtotal row
    setCell(r, 0, `Subtotal  —  ${d}`, sSubLbl); addMerge(r, 0, r, 8);
    setCell(r, 9, sub, sSub);
    runningTotal += sub; r++; r++;
  });

  // Grand Total at bottom
  setCell(r, 0, '★  GRAND TOTAL', sGrand); addMerge(r, 0, r, 8);
  setCell(r, 9, runningTotal, sGrandN); setRow(r, 26); r++;

  ws['!ref'] = XLSXStyle.utils.encode_range({ r: 0, c: 0 }, { r, c: 9 });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSXStyle.writeFile(wb, `PACT_Bank_Transfers_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
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

export default function TransactionScanner() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const updateRow = useCallback((id: string, patch: Partial<TxRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)), []);

  const doneRows = rows.filter(r => r.status === 'done');
  const errorRows = rows.filter(r => r.status === 'error');
  const pendingRows = rows.filter(r => r.status === 'pending' || r.status === 'processing');
  const processing = pendingRows.length > 0;
  const statusMsg = rows.find(r => r.status === 'processing' && r.error)?.error;

  useEffect(() => {
    if (rows.length >= 2 && doneRows.length === rows.length && errorRows.length === 0) {
      exportToExcel(rows);
    }
  }, [doneRows.length, rows.length, errorRows.length]);

  const processBatch = useCallback(async (batchRowIds: string[], batchFiles: File[]) => {
    batchRowIds.forEach(id => updateRow(id, { status: 'processing', error: undefined }));
    const onStatus = (msg: string) => batchRowIds.forEach(id => updateRow(id, { error: msg }));
    try {
      const images = await Promise.all(batchFiles.map(compressImage));
      const results = await extractBatch(images, onStatus);
      batchRowIds.forEach((id, i) => {
        const r = results[i];
        if (r) updateRow(id, { status: 'done', error: undefined, ...r });
        else updateRow(id, { status: 'error', error: 'No result for this image' });
      });
    } catch (err: any) {
      batchRowIds.forEach(id => updateRow(id, { status: 'error', error: err.message }));
    }
  }, [updateRow]);

  const retryRow = useCallback(async (rowId: string) => {
    const file = fileMapRef.current.get(rowId);
    if (file) await processBatch([rowId], [file]);
  }, [processBatch]);

  const processFiles = useCallback(async (files: File[]) => {
    const newRows: TxRow[] = files.map(f => ({
      id: crypto.randomUUID(), fileName: f.name, status: 'pending',
      transaction_id: '', transaction_date: '', transaction_time: '',
      from_account: '', to_account: '', recipient_name: '',
      mobile_number: 'N/A', comment: 'N/A', amount: 0,
    }));
    newRows.forEach((r, i) => fileMapRef.current.set(r.id, files[i]));
    setRows(prev => [...prev, ...newRows]);

    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batchRows = newRows.slice(i, i + BATCH_SIZE);
      const batchFiles = files.slice(i, i + BATCH_SIZE);
      await processBatch(batchRows.map(r => r.id), batchFiles);
      if (i + BATCH_SIZE < newRows.length) await sleep(3000);
    }
  }, [processBatch]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
  }, [processFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const retryAllFailed = useCallback(async () => {
    const failed = rows.filter(r => r.status === 'error');
    for (let i = 0; i < failed.length; i += BATCH_SIZE) {
      const batch = failed.slice(i, i + BATCH_SIZE);
      const files = batch.map(r => fileMapRef.current.get(r.id)!).filter(Boolean);
      await processBatch(batch.map(r => r.id), files);
      if (i + BATCH_SIZE < failed.length) await sleep(3000);
    }
  }, [rows, processBatch]);

  const clearAll = () => { setRows([]); fileMapRef.current.clear(); };

  const totalCount = rows.length;
  const doneCount = doneRows.length;
  const grandTotal = doneRows.reduce((s, r) => s + amountNum(r.amount), 0);
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

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
          {doneRows.length > 0 && (
            <Button onClick={() => exportToExcel(rows)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm">
              <Download className="h-4 w-4" />
              Download Excel
              <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-mono">{doneCount}</span>
            </Button>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, idx) => {
                    const isDone = row.status === 'done';
                    const isErr = row.status === 'error';
                    const isPending = row.status === 'pending';
                    const isProcessing = row.status === 'processing';

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          isDone ? 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10' :
                          isErr ? 'bg-red-50/60 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20' :
                          isProcessing ? 'bg-blue-50/40 dark:bg-blue-950/10' :
                          'bg-muted/20'
                        }`}
                      >
                        {/* # */}
                        <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>

                        {/* Status */}
                        <td className="px-3 py-2">
                          {isDone && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Done
                            </span>
                          )}
                          {isProcessing && (
                            <span className="inline-flex items-center gap-1 text-blue-600">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" /> Waiting
                            </span>
                          )}
                          {isErr && (
                            <button
                              onClick={() => retryRow(row.id)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
                              title={row.error}
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Retry
                            </button>
                          )}
                        </td>

                        {/* Transaction ID */}
                        <td className="px-3 py-2 font-mono">
                          {isDone ? (
                            <span>{row.transaction_id}</span>
                          ) : (
                            <span className="text-muted-foreground italic truncate max-w-[120px] block" title={row.fileName}>
                              {isErr ? row.error?.slice(0, 40) + (row.error && row.error.length > 40 ? '…' : '') : row.fileName.replace(/\.[^.]+$/, '')}
                            </span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isDone ? fmtDate(row.transaction_date) : ''}
                        </td>

                        {/* Time */}
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {isDone ? row.transaction_time : ''}
                        </td>

                        {/* From Account */}
                        <td className="px-3 py-2 font-mono" title={row.from_account}>
                          {isDone ? fmtAcct(row.from_account) : ''}
                        </td>

                        {/* To Account */}
                        <td className="px-3 py-2 font-mono" title={row.to_account}>
                          {isDone ? fmtAcct(row.to_account) : ''}
                        </td>

                        {/* Recipient */}
                        <td className="px-3 py-2" dir="auto">
                          {isDone ? row.recipient_name : ''}
                        </td>

                        {/* Comment */}
                        <td className="px-3 py-2 text-muted-foreground" dir="auto">
                          {isDone && row.comment !== 'N/A' ? row.comment : ''}
                        </td>

                        {/* Amount */}
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {isDone ? amountNum(row.amount).toLocaleString('en', { minimumFractionDigits: 2 }) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Grand total footer */}
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
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Download hint */}
        {!processing && doneRows.length > 0 && (
          <p className="text-center text-xs text-muted-foreground pb-2">
            Excel auto-downloads when all images complete ·{' '}
            <button onClick={() => exportToExcel(rows)} className="text-[#1D3461] hover:underline font-medium">
              Download now
            </button>
          </p>
        )}

      </div>
    </div>
  );
}
