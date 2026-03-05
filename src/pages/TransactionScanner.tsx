import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Download, CheckCircle2, AlertCircle, Loader2, ScanLine,
  RefreshCw, Trash2, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
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

function parseTxResult(x: any, fileName: string): Partial<TxRow> {
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
      const waitSec = data.retryAfterSec ?? 60;
      onStatus?.(`Waiting ${waitSec}s — all AI models at quota…`);
      await sleep(waitSec * 1000);
      continue;
    }
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

    const clean = (data.text || '').replace(/```json\n?|```\n?/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(clean); } catch { throw new Error('Could not parse AI response'); }

    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.slice(0, images.length).map((x: any) => parseTxResult(x, ''));
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
  sorted.forEach(r => {
    const d = r.transaction_date || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  const G = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 }, fill: { fgColor: { rgb: '0F2041' } } };
  const H = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1D3461' } }, alignment: { horizontal: 'center' } };
  const D = { font: { bold: true, sz: 11, color: { rgb: '1D3461' } }, fill: { fgColor: { rgb: 'D9E8FF' } } };
  const S = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: 'E8F5E9' } } };
  const SUM = { font: { bold: true, sz: 10, color: { rgb: '1D3461' } }, fill: { fgColor: { rgb: 'EEF3FB' } } };

  const ws: XLSX.WorkSheet = {};
  const cols = ['#', 'Transaction ID', 'Date', 'Time', 'From Account', 'To Account', 'Recipient Name', 'Mobile', 'Comment', 'Amount (SDG)'];
  const colWidths = [5, 20, 14, 10, 24, 24, 32, 18, 22, 18];

  let r = 0;
  const setCell = (row: number, col: number, v: any, s?: any) => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    ws[addr] = { v, t: typeof v === 'number' ? 'n' : 's', s };
  };
  const merge = (r1: number, c1: number, r2: number, c2: number) => {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  };

  // Title
  setCell(r, 0, 'PACT Command Center — Bank Transfer Report', { font: { bold: true, sz: 14, color: { rgb: '0F2041' } } });
  merge(r, 0, r, 9); r++;
  setCell(r, 0, `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}  |  Total transactions: ${done.length}`, { font: { italic: true, sz: 10, color: { rgb: '666666' } } });
  merge(r, 0, r, 9); r++; r++;

  // Grand Total at top
  const grandTotal = done.reduce((s, x) => s + amountNum(x.amount), 0);
  setCell(r, 0, 'GRAND TOTAL', G); merge(r, 0, r, 8);
  setCell(r, 9, grandTotal, { ...G, numFmt: '#,##0.00' }); r++;

  // Per-date summary
  Object.entries(groups).forEach(([date, items]) => {
    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
    const sub = items.reduce((s, x) => s + amountNum(x.amount), 0);
    setCell(r, 0, `  ${d}`, SUM); merge(r, 0, r, 7);
    setCell(r, 8, `${items.length} txn`, { ...SUM, alignment: { horizontal: 'center' } });
    setCell(r, 9, sub, { ...SUM, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }); r++;
  });
  r++;

  // Column headers
  cols.forEach((h, c) => setCell(r, c, h, H)); r++;

  // Data
  let seq = 1;
  let runningTotal = 0;
  Object.entries(groups).forEach(([date, items]) => {
    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
    setCell(r, 0, d, D); merge(r, 0, r, 9); r++;

    let sub = 0;
    items.forEach(tx => {
      const amt = amountNum(tx.amount);
      sub += amt;
      setCell(r, 0, seq++);
      setCell(r, 1, tx.transaction_id);
      setCell(r, 2, d);
      setCell(r, 3, tx.transaction_time);
      setCell(r, 4, tx.from_account);
      setCell(r, 5, tx.to_account);
      setCell(r, 6, tx.recipient_name);
      setCell(r, 7, tx.mobile_number);
      setCell(r, 8, tx.comment);
      setCell(r, 9, amt); r++;
    });

    setCell(r, 0, `Subtotal — ${d}`, S); merge(r, 0, r, 8);
    setCell(r, 9, sub, { ...S, numFmt: '#,##0.00' });
    runningTotal += sub; r++; r++;
  });

  // Grand Total at bottom
  setCell(r, 0, 'GRAND TOTAL', G); merge(r, 0, r, 8);
  setCell(r, 9, runningTotal, { ...G, numFmt: '#,##0.00' }); r++;

  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r, c: 9 });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `PACT_Bank_Transfers_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
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

  // Auto-download Excel when all done (no errors) and >= 2 files
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

  // Group done rows by date for display
  const sorted = [...doneRows].sort((a, b) => {
    if (a.transaction_date < b.transaction_date) return -1;
    if (a.transaction_date > b.transaction_date) return 1;
    return (a.transaction_time || '').localeCompare(b.transaction_time || '');
  });
  const groups: Record<string, TxRow[]> = {};
  sorted.forEach(r => {
    const d = r.transaction_date || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-[#1D3461]" />
          <span className="font-bold text-[#1D3461]">Bank Transfer Scanner</span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {doneCount}/{totalCount} processed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {doneRows.length > 0 && (
            <Button onClick={() => exportToExcel(rows)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="h-4 w-4" />
              Download Excel
              {doneCount > 0 && <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-mono">{doneCount}</span>}
            </Button>
          )}
          {rows.length > 0 && !processing && (
            <Button variant="ghost" size="icon" onClick={clearAll} title="Clear all">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">

        {/* Grand total banner — shown when there are results */}
        {doneRows.length > 0 && (
          <div className="rounded-xl bg-[#0F2041] text-white p-5 flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Grand Total</p>
              <p className="text-sm text-white/80">{doneCount} transaction{doneCount !== 1 ? 's' : ''} · {Object.keys(groups).length} date{Object.keys(groups).length !== 1 ? 's' : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs uppercase tracking-wider mb-1">SDG</p>
              <p className="font-bold text-3xl font-mono tabular-nums">
                {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

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
          } ${rows.length === 0 ? 'py-16' : 'py-6'} flex flex-col items-center justify-center gap-2`}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileChange} />
          {processing ? (
            <div className="w-full max-w-sm px-4 space-y-3">
              <div className="flex items-center justify-center gap-2 text-[#1D3461]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Extracting transactions…</span>
              </div>
              <Progress value={progressPct} className="h-2" />
              <p className="text-center text-xs text-muted-foreground">
                {doneCount} of {totalCount} images processed
              </p>
              {statusMsg && (
                <p className="text-center text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">{statusMsg}</p>
              )}
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-[#1D3461]/50" />
              <p className="text-sm font-medium text-[#1D3461]">
                {rows.length > 0 ? 'Drop more screenshots to add' : 'Drop screenshots here or click to upload'}
              </p>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP · Multiple files · Arabic or English</p>
            </>
          )}
        </div>

        {/* Progress chips */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {rows.map(r => (
              <div
                key={r.id}
                title={r.fileName + (r.error ? `\n${r.error}` : '')}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border max-w-[160px] ${
                  r.status === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  r.status === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
                  r.status === 'processing' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  'bg-muted border-border text-muted-foreground'
                }`}
              >
                {r.status === 'done' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                {r.status === 'error' && (
                  <button onClick={() => retryRow(r.id)} title="Retry">
                    <RefreshCw className="h-3 w-3 shrink-0 hover:text-red-700" />
                  </button>
                )}
                {r.status === 'processing' && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                {r.status === 'pending' && <div className="h-3 w-3 shrink-0 rounded-full border-2 border-current opacity-40" />}
                <span className="truncate">{r.fileName.replace(/\.[^.]+$/, '')}</span>
              </div>
            ))}

            {!processing && errorRows.length > 0 && (
              <button
                onClick={retryAllFailed}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium px-2 py-1 rounded-full border border-amber-200 bg-amber-50"
              >
                <RefreshCw className="h-3 w-3" /> Retry {errorRows.length} failed
              </button>
            )}
          </div>
        )}

        {/* Results table — compact, read-only, grouped by date */}
        {doneRows.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1D3461] text-white">
                    <th className="text-left px-3 py-2 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium">Transaction ID</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Time</th>
                    <th className="text-left px-3 py-2 font-medium">From Account</th>
                    <th className="text-left px-3 py-2 font-medium">To Account</th>
                    <th className="text-left px-3 py-2 font-medium">Recipient</th>
                    <th className="text-left px-3 py-2 font-medium">Comment</th>
                    <th className="text-right px-3 py-2 font-medium">Amount (SDG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(groups).map(([date, items]) => {
                    let d = date; try { d = format(new Date(date), 'dd MMM yyyy'); } catch {}
                    const sub = items.reduce((s, r) => s + amountNum(r.amount), 0);
                    return (
                      <React.Fragment key={date}>
                        <tr className="bg-blue-50/60 dark:bg-blue-950/20">
                          <td colSpan={9} className="px-3 py-1.5 font-semibold text-[#1D3461] text-xs">
                            {d} · {items.length} transaction{items.length !== 1 ? 's' : ''} · SDG {sub.toLocaleString('en', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {items.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-mono">{row.transaction_id}</td>
                            <td className="px-3 py-1.5">{d}</td>
                            <td className="px-3 py-1.5 font-mono">{row.transaction_time}</td>
                            <td className="px-3 py-1.5 font-mono">{row.from_account}</td>
                            <td className="px-3 py-1.5 font-mono">{row.to_account}</td>
                            <td className="px-3 py-1.5" dir="auto">{row.recipient_name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground" dir="auto">{row.comment}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-medium">
                              {amountNum(row.amount).toLocaleString('en', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0F2041] text-white font-bold">
                    <td colSpan={8} className="px-3 py-2 text-sm">GRAND TOTAL</td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums">
                      {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Error details */}
        {errorRows.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {errorRows.length} failed extraction{errorRows.length !== 1 ? 's' : ''}
            </p>
            {errorRows.map(r => (
              <div key={r.id} className="flex items-start justify-between gap-3 text-xs text-red-600">
                <span className="font-medium shrink-0">{r.fileName}</span>
                <span className="text-red-500 text-right">{r.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Done message */}
        {!processing && rows.length > 0 && doneRows.length > 0 && (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground">
              Excel file auto-downloads when all images complete.
              <button onClick={() => exportToExcel(rows)} className="ml-1 text-[#1D3461] hover:underline font-medium">Download now</button>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
