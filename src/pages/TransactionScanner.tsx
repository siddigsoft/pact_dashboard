import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import {
  Upload, FileImage, X, Download, Save, CheckCircle2, AlertCircle,
  Loader2, ScanLine, RefreshCw, Trash2, ChevronRight
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
  currency: string;
};

function parseDateTime(raw: string): { date: string; time: string } {
  if (!raw) return { date: '', time: '' };
  const cleaned = raw.trim();
  const parts = cleaned.split(' ');
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts[1];
    try {
      const parsed = parse(datePart, 'dd-MMM-yyyy', new Date());
      if (isValid(parsed)) return { date: format(parsed, 'yyyy-MM-dd'), time: timePart };
    } catch {}
    return { date: datePart, time: timePart };
  }
  return { date: cleaned, time: '' };
}

function amountNum(v: number | string): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return isNaN(n) ? 0 : n;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const BATCH_SIZE = 3; // images per Gemini API call

// Compress + resize image in browser before sending (reduces token usage significantly)
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
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function parseTxResult(extracted: any): Partial<TxRow> {
  const { date, time } = parseDateTime(extracted?.date_time || '');
  return {
    transaction_id: extracted?.transaction_id || '',
    transaction_date: date,
    transaction_time: time,
    from_account: extracted?.from_account || '',
    to_account: extracted?.to_account || '',
    recipient_name: extracted?.recipient_name || '',
    mobile_number: extracted?.mobile_number || 'N/A',
    comment: extracted?.comment || 'N/A',
    amount: extracted?.amount ?? 0,
    currency: 'SDG',
  };
}

// Send a batch of images — server handles model rotation + per-minute retry internally
// Client only needs to handle "all models exhausted" (rare) with a long wait
async function extractBatch(
  images: Array<{ base64: string; mimeType: string }>,
  onStatus?: (msg: string) => void,
): Promise<Array<Partial<TxRow>>> {
  // Retry up to 2 times in case of transient network errors or all-quota-exhausted
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('/api/extract-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });

    const data = await res.json().catch(() => ({ error: res.statusText }));

    if (res.status === 429) {
      // All models exhausted on server side
      const waitMs = (data.retryAfterSec ?? 60) * 1000;
      const waitSec = Math.round(waitMs / 1000);
      onStatus?.(`All AI models at quota limit — waiting ${waitSec}s…`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

    const clean = (data.text || '').replace(/```json\n?|```\n?/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(clean); } catch {
      throw new Error('Could not parse AI response');
    }

    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.slice(0, images.length).map(parseTxResult);
  }
  throw new Error('All Gemini AI models are at their daily limit. Try again tomorrow or check your API quota.');
}

function exportToExcel(rows: TxRow[]) {
  const done = rows.filter(r => r.status === 'done');
  if (done.length === 0) return;

  const sorted = [...done].sort((a, b) => {
    if (a.transaction_date < b.transaction_date) return -1;
    if (a.transaction_date > b.transaction_date) return 1;
    return (a.transaction_time || '').localeCompare(b.transaction_time || '');
  });

  const groups: Record<string, TxRow[]> = {};
  sorted.forEach(r => {
    const d = r.transaction_date || 'Unknown Date';
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1D3461' } }, alignment: { horizontal: 'center' } };
  const subtotalStyle = { font: { bold: true, color: { rgb: '000000' }, sz: 11 }, fill: { fgColor: { rgb: 'E8F0FE' } } };
  const grandStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, fill: { fgColor: { rgb: '0F2041' } } };
  const dateHeaderStyle = { font: { bold: true, color: { rgb: '1D3461' }, sz: 11 }, fill: { fgColor: { rgb: 'D9E8FF' } } };

  const ws: XLSX.WorkSheet = {};
  const cols = ['#', 'Transaction ID', 'Date', 'Time', 'From Account', 'To Account', 'Recipient Name', 'Mobile', 'Comment', 'Amount (SDG)'];
  const colWidths = [5, 18, 14, 12, 22, 22, 30, 18, 20, 18];

  let r = 0;

  const setCell = (row: number, col: number, v: any, style?: any) => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    ws[addr] = { v, t: typeof v === 'number' ? 'n' : 's', s: style };
  };

  const setMerge = (s: any, e: any) => {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s, e });
  };

  setCell(r, 0, 'PACT Command Center — Bank Transfer Report', { font: { bold: true, sz: 14, color: { rgb: '0F2041' } } });
  setMerge({ r, c: 0 }, { r, c: 9 });
  r++;
  setCell(r, 0, `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}  |  Total transactions: ${done.length}`, { font: { italic: true, sz: 10, color: { rgb: '555555' } } });
  setMerge({ r, c: 0 }, { r, c: 9 });
  r++;
  r++;

  cols.forEach((h, c) => setCell(r, c, h, headerStyle));
  r++;

  let grandTotal = 0;
  let seq = 1;

  Object.entries(groups).forEach(([date, items]) => {
    let displayDate = date;
    try { displayDate = format(new Date(date), 'dd MMM yyyy'); } catch {}

    setCell(r, 0, `📅 ${displayDate}`, dateHeaderStyle);
    setMerge({ r, c: 0 }, { r, c: 9 });
    r++;

    let subtotal = 0;
    items.forEach(tx => {
      const amt = amountNum(tx.amount);
      subtotal += amt;
      setCell(r, 0, seq++);
      setCell(r, 1, tx.transaction_id);
      setCell(r, 2, displayDate);
      setCell(r, 3, tx.transaction_time);
      setCell(r, 4, tx.from_account);
      setCell(r, 5, tx.to_account);
      setCell(r, 6, tx.recipient_name);
      setCell(r, 7, tx.mobile_number);
      setCell(r, 8, tx.comment);
      setCell(r, 9, amt);
      r++;
    });

    setCell(r, 0, `Subtotal — ${displayDate}`, subtotalStyle);
    setMerge({ r, c: 0 }, { r, c: 8 });
    setCell(r, 9, subtotal, { ...subtotalStyle, numFmt: '#,##0.00' });
    grandTotal += subtotal;
    r++;
    r++;
  });

  setCell(r, 0, 'GRAND TOTAL', grandStyle);
  setMerge({ r, c: 0 }, { r, c: 8 });
  setCell(r, 9, grandTotal, { ...grandStyle, numFmt: '#,##0.00' });
  r++;

  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: r, c: 9 });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `PACT_Bank_Transfers_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
}

export default function TransactionScanner() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedBatch, setSavedBatch] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const updateRow = (id: string, patch: Partial<TxRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const processBatch = useCallback(async (batchRowIds: string[], batchFiles: File[]) => {
    // Mark all as processing
    batchRowIds.forEach(id => updateRow(id, { status: 'processing', error: undefined }));
    const onStatus = (msg: string) => batchRowIds.forEach(id => updateRow(id, { error: msg }));
    try {
      // Compress all images in parallel
      const images = await Promise.all(batchFiles.map(compressImage));
      const results = await extractBatch(images, onStatus);
      batchRowIds.forEach((id, i) => {
        const r = results[i];
        if (r) updateRow(id, { status: 'done', error: undefined, ...r });
        else updateRow(id, { status: 'error', error: 'No result returned for this image' });
      });
    } catch (err: any) {
      batchRowIds.forEach(id => updateRow(id, { status: 'error', error: err.message || 'Extraction failed' }));
    }
  }, []);

  const retryRow = useCallback(async (rowId: string) => {
    const file = fileMapRef.current.get(rowId);
    if (!file) return;
    await processBatch([rowId], [file]);
  }, [processBatch]);

  const processFiles = useCallback(async (files: File[]) => {
    const newRows: TxRow[] = files.map(f => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      status: 'pending',
      transaction_id: '', transaction_date: '', transaction_time: '',
      from_account: '', to_account: '', recipient_name: '',
      mobile_number: 'N/A', comment: 'N/A', amount: 0, currency: 'SDG',
    }));
    newRows.forEach((r, i) => fileMapRef.current.set(r.id, files[i]));
    setRows(prev => [...prev, ...newRows]);

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batchRows = newRows.slice(i, i + BATCH_SIZE);
      const batchFiles = files.slice(i, i + BATCH_SIZE);
      await processBatch(batchRows.map(r => r.id), batchFiles);
      if (i + BATCH_SIZE < newRows.length) await sleep(4000);
    }
  }, [processBatch]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
  }, [processFiles]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
    e.target.value = '';
  };

  const saveToDatabase = async () => {
    const done = rows.filter(r => r.status === 'done');
    if (done.length === 0) return;
    setSaving(true);
    const batchId = crypto.randomUUID();
    try {
      const inserts = done.map(r => ({
        transaction_id: r.transaction_id || null,
        transaction_date: r.transaction_date || null,
        transaction_time: r.transaction_time || null,
        from_account: r.from_account || null,
        to_account: r.to_account || null,
        recipient_name: r.recipient_name || null,
        mobile_number: r.mobile_number === 'N/A' ? null : r.mobile_number || null,
        comment: r.comment === 'N/A' ? null : r.comment || null,
        amount: amountNum(r.amount) || null,
        currency: r.currency || 'SDG',
        batch_id: batchId,
        uploaded_by: currentUser?.id || null,
      }));
      const { error } = await (supabase as any).from('bank_transaction_scans').insert(inserts);
      if (error) throw error;
      setSavedBatch(batchId);
      toast({ title: `Saved ${done.length} transactions`, description: `Batch ID: ${batchId.slice(0, 8)}...` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doneRows = rows.filter(r => r.status === 'done');
  const processing = rows.some(r => r.status === 'processing');
  const processedCount = rows.filter(r => r.status === 'done' || r.status === 'error').length;
  const totalCount = rows.length;

  const sortedDone = [...doneRows].sort((a, b) => {
    if (a.transaction_date < b.transaction_date) return -1;
    if (a.transaction_date > b.transaction_date) return 1;
    return (a.transaction_time || '').localeCompare(b.transaction_time || '');
  });

  const groups: Record<string, TxRow[]> = {};
  sortedDone.forEach(r => {
    const d = r.transaction_date || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  const grandTotal = doneRows.reduce((s, r) => s + amountNum(r.amount), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-[#1D3461]" />
            Bank Transfer Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload Bank of Khartoum transfer screenshots (Arabic or English) · ماسح تحويلات بنك الخرطوم
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {doneRows.length > 0 && (
            <>
              <Button variant="outline" onClick={() => exportToExcel(rows)} className="gap-2">
                <Download className="h-4 w-4" /> Export Excel
              </Button>
              <Button onClick={saveToDatabase} disabled={saving || !!savedBatch} className="gap-2 bg-[#1D3461] hover:bg-[#0F2041]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savedBatch ? 'Saved ✓' : `Save ${doneRows.length} to Database`}
              </Button>
            </>
          )}
          {rows.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => { setRows([]); setSavedBatch(null); }} title="Clear all">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <Card
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[#1D3461]/40 hover:border-[#1D3461] cursor-pointer transition-colors bg-[#1D3461]/5 hover:bg-[#1D3461]/10"
      >
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3 select-none">
          <div className="w-16 h-16 rounded-full bg-[#1D3461]/10 flex items-center justify-center">
            <FileImage className="h-8 w-8 text-[#1D3461]" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Drop screenshots here or click to upload</p>
            <p className="text-sm text-muted-foreground mt-1">
              ارفع صور لقطات الشاشة هنا — PNG, JPG, WebP · Multiple files supported
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" />
            AI will automatically extract transaction details in Arabic or English
          </div>
        </CardContent>
      </Card>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileInput} />

      {/* Processing Progress */}
      {totalCount > 0 && (
        <Card className="border-[#1D3461]/20">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="font-medium">
                {processing ? (
                  rows.some(r => r.status === 'processing' && !!r.error) ? (
                    <span className="flex items-center gap-2 text-amber-600">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Rate limited — auto-retrying with backoff…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-[#1D3461]">
                      <Loader2 className="h-4 w-4 animate-spin" /> Extracting transactions with AI…
                    </span>
                  )
                ) : (
                  <span className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Processing complete
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3">
                {!processing && rows.some(r => r.status === 'error') && (
                  <button
                    onClick={async () => {
                      const failed = rows.filter(r => r.status === 'error');
                      for (let i = 0; i < failed.length; i += BATCH_SIZE) {
                        const batch = failed.slice(i, i + BATCH_SIZE);
                        const batchFiles = batch.map(r => fileMapRef.current.get(r.id)!).filter(Boolean);
                        await processBatch(batch.map(r => r.id), batchFiles);
                        if (i + BATCH_SIZE < failed.length) await sleep(4000);
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry all failed
                  </button>
                )}
                <span className="text-muted-foreground">{processedCount} / {totalCount} files</span>
              </div>
            </div>
            <Progress value={totalCount > 0 ? (processedCount / totalCount) * 100 : 0} className="h-2" />
            <div className="flex flex-wrap gap-2">
              {rows.map(r => {
                const isRateWaiting = r.status === 'processing' && !!r.error;
                return (
                  <div key={r.id} title={r.error || r.fileName} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
                    r.status === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    r.status === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
                    isRateWaiting ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    r.status === 'processing' ? 'bg-blue-50 border-blue-200 text-blue-600' :
                    'bg-muted border-border text-muted-foreground'
                  }`}>
                    {r.status === 'done' && <CheckCircle2 className="h-3 w-3" />}
                    {r.status === 'error' && <AlertCircle className="h-3 w-3" />}
                    {isRateWaiting && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {r.status === 'processing' && !isRateWaiting && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span className="max-w-[140px] truncate">{isRateWaiting ? (r.error || r.fileName) : r.fileName}</span>
                    {r.status === 'error' && (
                      <button onClick={e => { e.stopPropagation(); retryRow(r.id); }} title="Retry this image">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      {doneRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-[#1D3461]/20">
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-[#1D3461]">{doneRows.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Transactions</p>
            </CardContent>
          </Card>
          <Card className="border-[#1D3461]/20">
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-[#1D3461]">{Object.keys(groups).length}</p>
              <p className="text-xs text-muted-foreground mt-1">Dates</p>
            </CardContent>
          </Card>
          <Card className="border-[#1D3461]/20 md:col-span-2">
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                SDG {grandTotal.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Grand Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table grouped by date */}
      {Object.entries(groups).map(([date, items]) => {
        let displayDate = date;
        try { displayDate = format(new Date(date), 'EEEE, dd MMM yyyy'); } catch {}
        const subtotal = items.reduce((s, r) => s + amountNum(r.amount), 0);

        return (
          <Card key={date} className="overflow-hidden border-[#1D3461]/20">
            <CardHeader className="py-3 px-4 bg-[#1D3461]/5 border-b flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-[#1D3461]" />
                <CardTitle className="text-sm font-bold text-[#1D3461]">{displayDate}</CardTitle>
                <Badge variant="secondary" className="text-xs">{items.length} tx</Badge>
              </div>
              <span className="text-sm font-bold text-emerald-700">
                SDG {subtotal.toLocaleString('en', { minimumFractionDigits: 2 })}
              </span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="min-w-max text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Transaction ID</th>
                    <th className="text-left px-3 py-2 font-medium">Time</th>
                    <th className="text-left px-3 py-2 font-medium">From Account</th>
                    <th className="text-left px-3 py-2 font-medium">To Account</th>
                    <th className="text-left px-3 py-2 font-medium">Recipient Name</th>
                    <th className="text-left px-3 py-2 font-medium">Mobile</th>
                    <th className="text-left px-3 py-2 font-medium">Comment</th>
                    <th className="text-right px-3 py-2 font-medium">Amount (SDG)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Input value={row.transaction_id} onChange={e => updateRow(row.id, { transaction_id: e.target.value })}
                          className="h-7 text-xs w-48 font-mono" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.transaction_time} onChange={e => updateRow(row.id, { transaction_time: e.target.value })}
                          className="h-7 text-xs w-24" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.from_account} onChange={e => updateRow(row.id, { from_account: e.target.value })}
                          className="h-7 text-xs w-52 font-mono" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.to_account} onChange={e => updateRow(row.id, { to_account: e.target.value })}
                          className="h-7 text-xs w-52 font-mono" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.recipient_name} onChange={e => updateRow(row.id, { recipient_name: e.target.value })}
                          className="h-7 text-xs w-56" dir="auto" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.mobile_number} onChange={e => updateRow(row.id, { mobile_number: e.target.value })}
                          className="h-7 text-xs w-36" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.comment} onChange={e => updateRow(row.id, { comment: e.target.value })}
                          className="h-7 text-xs w-44" dir="auto" />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          value={amountNum(row.amount)}
                          onChange={e => updateRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                          className="h-7 text-xs w-36 text-right font-mono"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                          className="text-muted-foreground hover:text-red-500 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 border-t-2 border-emerald-200 dark:border-emerald-800">
                    <td colSpan={8} className="px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      Subtotal — {displayDate}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      {subtotal.toLocaleString('en', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        );
      })}

      {/* Grand Total row */}
      {doneRows.length > 0 && Object.keys(groups).length > 1 && (
        <Card className="border-[#0F2041] bg-[#0F2041] text-white">
          <CardContent className="py-4 flex items-center justify-between px-6">
            <span className="font-bold text-lg">GRAND TOTAL — {doneRows.length} transactions across {Object.keys(groups).length} dates</span>
            <span className="font-bold text-2xl font-mono">
              SDG {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error rows */}
      {rows.filter(r => r.status === 'error').length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Failed extractions
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-2">
            {rows.filter(r => r.status === 'error').map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs px-2 py-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200">
                <span className="font-medium">{r.fileName}</span>
                <span className="text-red-500 max-w-xs truncate">{r.error}</span>
                <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-muted-foreground hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {savedBatch && (
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-700">Successfully saved to database</p>
              <p className="text-xs text-emerald-600 font-mono mt-0.5">Batch ID: {savedBatch}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
