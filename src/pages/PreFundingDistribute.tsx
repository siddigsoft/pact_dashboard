import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Banknote, RefreshCw, Users, Search, Plus, Trash2,
  AlertTriangle, Check, X, ChevronDown, ChevronRight, Wallet,
  TrendingDown, Info, Paperclip, ExternalLink, Upload, Receipt,
  FileImage, FileText, CheckCircle2, ArrowLeft, ShieldCheck,
  AlertCircle, Clock, History, Lock, Layers,
} from 'lucide-react';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface HeldFund {
  id: string;
  name: string;
  source: string | null;
  amount: number;
  currency: string;
  available_balance: number;
  paid_amount: number;
  status: string;
  holder_user_id: string | null;
}

interface Allocation {
  id: string;
  pre_fund_request_id: string;
  user_id: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const STATUS_BADGE: Record<string, string> = {
  active:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  low_balance: 'bg-orange-100 text-orange-700 border-orange-200',
  paused:      'bg-violet-100 text-violet-700 border-violet-200',
  closed:      'bg-slate-100 text-slate-500 border-slate-200',
  draft:       'bg-slate-100 text-slate-600 border-slate-200',
};

async function fetchAllIn<T = any>(
  queryFn: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  ids: string[],
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const { data, error } = await queryFn(uniqueIds.slice(i, i + 50));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export default function PreFundingDistribute() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const isFinanceAdmin = hasAnyRole(['super_admin', 'admin', 'financialAdmin', 'CountryDirector']);
  const isAllocationTopUpAdmin = hasAnyRole([
    'super_admin', 'superAdmin', 'admin', 'administrator',
    'financialAdmin', 'financial_admin', 'finance', 'finance admin',
  ]);

  const [funds, setFunds]               = useState<HeldFund[]>([]);
  const [loading, setLoading]           = useState(true);
  const [staffProfiles, setStaff]       = useState<StaffProfile[]>([]);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [fundAllocs, setFundAllocs]     = useState<Map<string, Allocation[]>>(new Map());
  const [allocLoading, setAllocLoading] = useState<Set<string>>(new Set());

  // Add allocation dialog
  const [addDialog, setAddDialog] = useState<{ open: boolean; fund: HeldFund | null }>({ open: false, fund: null });
  const [addForm, setAddForm]     = useState({ userId: '', amount: '', notes: '' });
  const [userSearch, setUserSearch] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Add dialog receipt (multi-file)
  const [addReceiptFiles, setAddReceiptFiles] = useState<File[]>([]);

  // Top-up dialog (replaces inline edit — also collects a receipt)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, { funds: boolean; expenditure: boolean }>>({});
  const toggleSection = (allocId: string, section: 'funds' | 'expenditure') =>
    setCollapsedSections(prev => ({
      ...prev,
      [allocId]: { funds: false, expenditure: false, ...prev[allocId], [section]: !prev[allocId]?.[section] },
    }));
  const [topUpDialog, setTopUpDialog] = useState<{ open: boolean; alloc: Allocation | null; fundId: string; fund: HeldFund | null }>({ open: false, alloc: null, fundId: '', fund: null });
  const [topUpAmt, setTopUpAmt]           = useState('');
  const [topUpReason, setTopUpReason]     = useState('');
  const [topUpReceiptFiles, setTopUpReceiptFiles] = useState<File[]>([]);
  const [topUpSaving, setTopUpSaving]     = useState(false);
  const [topUpConfirmStep, setTopUpConfirmStep] = useState(false);
  const [deleteTopUpTarget, setDeleteTopUpTarget] = useState<{
    alloc: Allocation;
    entryIndex: number;
    amount: number;
    date: string;
  } | null>(null);
  const [deleteTopUpReason, setDeleteTopUpReason] = useState('');
  const [deleteTopUpSaving, setDeleteTopUpSaving] = useState(false);

  // Receipt viewer popup — fetch-first to avoid cross-origin iframe bucket errors
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [receiptBlobUrl, setReceiptBlobUrl] = useState<string | null>(null);
  const [receiptFetchLoading, setReceiptFetchLoading] = useState(false);
  const [receiptFetchError, setReceiptFetchError] = useState<string | null>(null);
  // Context for the row currently shown in the viewer (enables Replace from error state)
  const [viewReceiptMeta, setViewReceiptMeta] = useState<{
    alloc: Allocation;
    rowType: 'initial' | number;
  } | null>(null);

  // Replace-receipt feature
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<{
    alloc: Allocation;
    rowType: 'initial' | number;
  } | null>(null);
  const [replaceSaving, setReplaceSaving] = useState(false);

  useEffect(() => {
    if (!viewReceiptUrl) {
      if (receiptBlobUrl) URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl(null);
      setReceiptFetchError(null);
      return;
    }
    let cancelled = false;
    setReceiptFetchLoading(true);
    setReceiptFetchError(null);
    setReceiptBlobUrl(null);
    fetch(viewReceiptUrl)
      .then(async res => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setReceiptFetchError(text.includes('Bucket not found') ? 'bucket' : 'not_found');
        } else {
          const blob = await res.blob();
          if (!cancelled) setReceiptBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => { if (!cancelled) setReceiptFetchError('failed'); })
      .finally(() => { if (!cancelled) setReceiptFetchLoading(false); });
    return () => { cancelled = true; };
  }, [viewReceiptUrl]);

  // Remove confirmation
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // My own allocations (staff member view — non-holder)
  const [myAllocations, setMyAllocations] = useState<Array<{
    id: string; pre_fund_request_id: string; allocated_amount: number;
    spent_amount: number; currency: string; notes: string | null;
    receipt_url: string | null; fund_name?: string; fund_source?: string;
    fund_status?: string; holder_user_id?: string;
  }>>([]);

  // Request Top-Up dialog (staff → holder request)
  const [reqDialog, setReqDialog] = useState<{ open: boolean; alloc: typeof myAllocations[0] | null }>({ open: false, alloc: null });
  const [reqAmt, setReqAmt]       = useState('');
  const [reqNotes, setReqNotes]   = useState('');
  const [reqSaving, setReqSaving] = useState(false);

  // Payment details expansion per allocation
  const [expandedAllocId, setExpandedAllocId] = useState<string | null>(null);
  const [allocPayments, setAllocPayments] = useState<Map<string, any[]>>(new Map());
  const [allocPaymentsLoading, setAllocPaymentsLoading] = useState<Set<string>>(new Set());

  const loadAllocPayments = useCallback(async (allocId: string, userId: string, fundId: string) => {
    if (allocPayments.has(allocId)) return; // already loaded
    setAllocPaymentsLoading(prev => { const s = new Set(prev); s.add(allocId); return s; });
    try {
      // Fetch ALL payment transactions for this fund (not filtered by user — full fund history)
      const { data: txnData } = await (supabase as any)
        .from('pre_fund_event_ledger_v')
        .select('id,source_table,source_id,amount,transaction_date,description,reference,currency,user_id,created_by')
        .eq('pre_fund_request_id', fundId)
        .eq('source_is_verified', true)
        .in('transaction_type', ['payment', 'disbursement'])
        .order('transaction_date', { ascending: false });

      const allTxns: any[] = txnData ?? [];

      // Partition by source type
      const ocsTxns   = allTxns.filter((t: any) => t.source_table === 'operational_cost_submissions' && t.source_id);
      const dpTxns    = allTxns.filter((t: any) => t.source_table === 'down_payment_requests' && t.source_id);
      const otherTxns = allTxns.filter((t: any) =>
        t.source_table !== 'operational_cost_submissions' &&
        t.source_table !== 'down_payment_requests'
      );

      const ocsIds = [...new Set(ocsTxns.map((t: any) => t.source_id as string))];
      const dpIds  = [...new Set(dpTxns.map((t: any)  => t.source_id as string))];

      let payments: any[] = [];

      // Fetch OCS and DP enrichment data in parallel. Newer transactions carry
      // source_table/source_id; older rows are linked from the source record via
      // pre_fund_transaction_id, so query both paths before labeling anything
      // as a manual entry.
      const [ocsData, dpData, ocsLegacyData, dpLegacyData] = await Promise.all([
        ocsIds.length > 0
          ? fetchAllIn(chunk => (supabase as any)
            .from('operational_cost_submissions')
            .select('id,pre_fund_transaction_id,submitted_by,expense_category,description,amount_cents,amount_paid_cents,status,paid_at,submitted_at')
            .in('id', chunk), ocsIds)
          : Promise.resolve([]),
        dpIds.length > 0
          ? fetchAllIn(chunk => (supabase as any)
            .from('down_payment_requests')
            .select('id,pre_fund_transaction_id,requested_by,purpose,payment_type,amount,currency,status,approved_at,created_at')
            .in('id', chunk), dpIds)
          : Promise.resolve([]),
        allTxns.length > 0
          ? fetchAllIn(chunk => (supabase as any)
            .from('operational_cost_submissions')
            .select('id,pre_fund_transaction_id,submitted_by,expense_category,description,amount_cents,amount_paid_cents,status,paid_at,submitted_at')
            .in('pre_fund_transaction_id', chunk), allTxns.map((t: any) => t.id))
          : Promise.resolve([]),
        allTxns.length > 0
          ? fetchAllIn(chunk => (supabase as any)
            .from('down_payment_requests')
            .select('id,pre_fund_transaction_id,requested_by,purpose,payment_type,amount,currency,status,approved_at,created_at')
            .in('pre_fund_transaction_id', chunk), allTxns.map((t: any) => t.id))
          : Promise.resolve([]),
      ]);

      const ocsBySourceId = new Map(ocsData.map((row: any) => [row.id, row]));
      const ocsByTxnId = new Map(ocsLegacyData.map((row: any) => [row.pre_fund_transaction_id, row]));
      const dpBySourceId = new Map(dpData.map((row: any) => [row.id, row]));
      const dpByTxnId = new Map(dpLegacyData.map((row: any) => [row.pre_fund_transaction_id, row]));
      // Enrich OCS-linked transactions. Track which source_ids were matched so
      // unresolved ones are added as fallback manual entries (not silently dropped).
      const resolvedTxnIds = new Set<string>();
      ocsTxns.forEach((txn: any) => {
        const o = ocsBySourceId.get(txn.source_id) ?? ocsByTxnId.get(txn.id);
        if (!o) {
          payments.push({
            ...txn, _type: 'manual', _txn_amount: Number(txn.amount) || 0,
            _txn_date: txn.transaction_date, amount: Number(txn.amount) || 0,
            description: txn.description || 'Cost submission (details unavailable)',
            status: 'paid',
          });
          return;
        }
        resolvedTxnIds.add(txn.id);
        // Use the transaction amount as the authoritative amount (it is recorded in
        // SDG/local currency). Fall back to amount_paid_cents/amount_cents only when
        // the transaction row itself has no amount.
        const txnAmt = Number(txn?.amount ?? 0);
        payments.push({
          ...o,
          _type: 'ocs',
          _category: o.expense_category,
          _txn_amount: txnAmt || (o.amount_paid_cents ?? o.amount_cents ?? 0) / 100,
          _txn_date: txn.transaction_date,
        });
      });

      // Enrich DP-linked transactions with same fallback pattern
      dpTxns.forEach((txn: any) => {
        const dp = dpBySourceId.get(txn.source_id) ?? dpByTxnId.get(txn.id);
        if (!dp) {
          payments.push({
            ...txn, _type: 'manual', _txn_amount: Number(txn.amount) || 0,
            _txn_date: txn.transaction_date, amount: Number(txn.amount) || 0,
            description: txn.description || 'Down payment (details unavailable)',
            status: 'paid',
          });
          return;
        }
        resolvedTxnIds.add(txn.id);
        // Prefer the recorded transaction amount over the DP requested amount
        const txnAmt = Number(txn.amount ?? 0);
        payments.push({
          ...dp,
          _type: 'dp',
          _category: dp.payment_type || dp.purpose,
          _txn_amount: txnAmt || Number(dp.amount) || 0,
          _txn_date: txn.transaction_date,
          amount: txnAmt || Number(dp.amount) || 0,
        });
      });

      // Transactions without source_table/source_id may still have a source-side
      // backlink. Resolve that before using the genuine manual-entry fallback.
      otherTxns.forEach((t: any) => {
        const legacyOcs = ocsByTxnId.get(t.id);
        const legacyDp = dpByTxnId.get(t.id);
        if (legacyOcs) {
          payments.push({
            ...legacyOcs,
            _type: 'ocs',
            _category: legacyOcs.expense_category,
            _txn_amount: Number(t.amount) || (legacyOcs.amount_paid_cents ?? legacyOcs.amount_cents ?? 0) / 100,
            _txn_date: t.transaction_date,
          });
          return;
        }
        if (legacyDp) {
          payments.push({
            ...legacyDp,
            _type: 'dp',
            _category: legacyDp.payment_type || legacyDp.purpose,
            _txn_amount: Number(t.amount) || Number(legacyDp.amount) || 0,
            _txn_date: t.transaction_date,
            amount: Number(t.amount) || Number(legacyDp.amount) || 0,
          });
          return;
        }
        payments.push({
          ...t,
          _type: 'manual',
          _category: t.reference || t.transaction_type,
          _txn_amount: Number(t.amount) || 0,
          _txn_date: t.transaction_date,
          amount: Number(t.amount) || 0,
          description: t.description || '—',
          status: 'paid',
        });
      });

      // Sort by transaction date desc
      payments.sort((a, b) =>
        new Date(b._txn_date || b.paid_at || b.submitted_at || 0).getTime() -
        new Date(a._txn_date || a.paid_at || a.submitted_at || 0).getTime()
      );

      setAllocPayments(prev => { const m = new Map(prev); m.set(allocId, payments); return m; });
    } catch (e: any) {
      setAllocPayments(prev => { const m = new Map(prev); m.set(allocId, []); return m; });
    } finally {
      setAllocPaymentsLoading(prev => { const s = new Set(prev); s.delete(allocId); return s; });
    }
  }, [allocPayments]);

  /** Parse receipt_url which may be a JSON array string or a plain URL. */
  const parseReceiptUrls = (url: string | null): string[] => {
    if (!url) return [];
    try {
      const parsed = JSON.parse(url);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}
    return [url];
  };

  interface TopUpLogEntry {
    date: string;
    amount: number;
    previous_total: number;
    new_total: number;
    by_user_id: string;
    by_name: string;
    receipt_url: string | null;
    reason?: string;
  }
  interface TopUpReversalLogEntry extends TopUpLogEntry {
    reversed_at: string;
    reversed_by_user_id?: string | null;
    reversal_reason: string;
  }
  interface AllocMeta {
    text: string;
    top_up_count: number;
    top_up_log: TopUpLogEntry[];
    /** The original receipt URL saved when the first top-up overwrites receipt_url */
    initial_receipt_url?: string | null;
    initial_created_at?: string | null;
    top_up_reversal_log: TopUpReversalLogEntry[];
  }

  /** Parse the notes field — may be plain text or JSON-encoded audit metadata. */
  const parseAllocMeta = (notes: string | null): AllocMeta => {
    if (!notes) return { text: '', top_up_count: 0, top_up_log: [], top_up_reversal_log: [] };
    try {
      const p = JSON.parse(notes);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return {
          text: p.text ?? '',
          top_up_count: Number(p.top_up_count ?? 0),
          top_up_log: p.top_up_log ?? [],
          initial_receipt_url: p.initial_receipt_url ?? null,
          initial_created_at: p.initial_created_at ?? null,
          top_up_reversal_log: Array.isArray(p.top_up_reversal_log) ? p.top_up_reversal_log : [],
        };
      }
    } catch {}
    return { text: notes, top_up_count: 0, top_up_log: [], top_up_reversal_log: [] };
  };

  /** Append a top-up entry. On first top-up, also preserves the original receipt URL. */
  const buildAllocMeta = (
    existing: string | null,
    entry: TopUpLogEntry,
    originalReceiptUrl?: string | null,
    originalCreatedAt?: string | null,
  ): string => {
    const m = parseAllocMeta(existing);
    const payload: any = {
      text: m.text,
      top_up_count: m.top_up_count + 1,
      top_up_log: [...m.top_up_log, entry],
      top_up_reversal_log: m.top_up_reversal_log,
    };
    // Preserve original receipt on first top-up
    if (m.top_up_count === 0) {
      payload.initial_receipt_url = originalReceiptUrl ?? null;
      payload.initial_created_at = originalCreatedAt ?? null;
    } else {
      payload.initial_receipt_url = m.initial_receipt_url ?? null;
      payload.initial_created_at = m.initial_created_at ?? null;
    }
    return JSON.stringify(payload);
  };

  /** Upload a single receipt file to Supabase storage and return the public URL. */
  const uploadReceipt = async (file: File, fundId: string, userId: string): Promise<string | null> => {
    const ext  = file.name.split('.').pop() ?? 'bin';
    const path = `pre-fund-alloc-receipts/${fundId}/${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('mmp-files').upload(path, file, { upsert: true });
    if (error) { toast({ title: 'Receipt upload failed', description: error.message, variant: 'destructive' }); return null; }
    return supabase.storage.from('mmp-files').getPublicUrl(path).data.publicUrl;
  };

  /** Upload multiple receipt files; returns JSON array string if >1, or plain URL if 1. */
  const uploadMultipleReceipts = async (files: File[], fundId: string, userId: string): Promise<string | null> => {
    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadReceipt(file, fundId, userId);
      if (!url) return null;
      urls.push(url);
    }
    if (urls.length === 0) return null;
    return urls.length === 1 ? urls[0] : JSON.stringify(urls);
  };

  /** Open the OS file picker and set the target row for receipt replacement. */
  const triggerReplaceReceipt = (alloc: Allocation, rowType: 'initial' | number) => {
    setReplaceTarget({ alloc, rowType });
    if (replaceFileRef.current) {
      replaceFileRef.current.value = '';
      replaceFileRef.current.click();
    }
  };

  /** Handle the file selected from the hidden input and save it back to the allocation. */
  const handleReplaceReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replaceTarget) return;
    const { alloc, rowType } = replaceTarget;
    setReplaceTarget(null);
    setReplaceSaving(true);
    try {
      const newUrl = await uploadReceipt(file, alloc.pre_fund_request_id, alloc.user_id);
      if (!newUrl) return;
      const meta = parseAllocMeta(alloc.notes);
      let updateData: Record<string, any>;
      if (rowType === 'initial') {
        updateData = {};
        if (meta.top_up_count === 0) {
          // No top-ups: receipt_url IS the initial receipt
          updateData.receipt_url = newUrl;
        } else {
          // Has top-ups: initial is stored in notes.initial_receipt_url
          const parsed = JSON.parse(alloc.notes ?? '{}');
          updateData.notes = JSON.stringify({ ...parsed, initial_receipt_url: newUrl });
        }
      } else {
        const idx = rowType as number;
        const parsed = JSON.parse(alloc.notes ?? '{}');
        const updatedLog = [...meta.top_up_log];
        updatedLog[idx] = { ...updatedLog[idx], receipt_url: newUrl };
        const updatedNotes = JSON.stringify({ ...parsed, top_up_log: updatedLog });
        const isLatest = idx === meta.top_up_log.length - 1;
        updateData = { notes: updatedNotes };
        if (isLatest) updateData.receipt_url = newUrl;
      }

      // Receipt replacement rewrites allocation metadata. Compare all relevant
      // source values so a stale browser cannot reintroduce a concurrently
      // reversed top-up or overwrite its restored receipt.
      let updateQuery = (supabase as any)
        .from('pre_fund_allocations')
        .update(updateData)
        .eq('id', alloc.id)
        .eq('allocated_amount', alloc.allocated_amount);
      updateQuery = alloc.notes === null
        ? updateQuery.is('notes', null)
        : updateQuery.eq('notes', alloc.notes);
      updateQuery = alloc.receipt_url === null
        ? updateQuery.is('receipt_url', null)
        : updateQuery.eq('receipt_url', alloc.receipt_url);
      const { data: updatedAllocation, error } = await updateQuery
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updatedAllocation) {
        throw new Error('The allocation changed while the receipt was uploading. Refresh the page and upload it again.');
      }
      toast({ title: '✅ Receipt uploaded', description: `${file.name} saved successfully.` });
      await loadAllocations(alloc.pre_fund_request_id);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setReplaceSaving(false);
    }
  };

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      // Build funds query first (needs runtime filter applied before awaiting)
      let fundsQ = (supabase as any)
        .from('pre_fund_requests')
        .select('id,name,source,amount,currency,available_balance,paid_amount,status,holder_user_id')
        .order('created_at', { ascending: false });
      if (!isFinanceAdmin) fundsQ = fundsQ.eq('holder_user_id', currentUser.id);
      else fundsQ = fundsQ.not('holder_user_id', 'is', null);

      // Run all three independent queries in parallel — was sequential (3 round-trips → 1)
      const [
        { data: fundsData, error: fErr },
        { data: profiles },
        { data: myAllocs },
      ] = await Promise.all([
        fundsQ,
        supabase.from('profiles').select('id,full_name,email,role').order('full_name'),
        (supabase as any)
          .from('pre_fund_allocations')
          .select('id,pre_fund_request_id,allocated_amount,spent_amount,currency,notes,receipt_url')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false }),
      ]);

      if (fErr && !fErr.message.includes('does not exist')) throw fErr;
      const loadedFunds = ((fundsData as HeldFund[]) ?? []);
      const fundIdsForBalances = loadedFunds.map(fund => fund.id);
      let balanceRows: any[] = [];
      if (fundIdsForBalances.length > 0) {
        const { data, error } = await (supabase as any)
          .from('pre_fund_balance_snapshot_v')
          .select('fund_id,verified_paid_amount,verified_available_balance')
          .in('fund_id', fundIdsForBalances);
        if (!error) balanceRows = data ?? [];
      }
      const balanceByFund = new Map(balanceRows.map(row => [row.fund_id, row]));
      setFunds(loadedFunds.map(fund => {
        const verified = balanceByFund.get(fund.id);
        return verified ? {
          ...fund,
          paid_amount: Number(verified.verified_paid_amount ?? 0),
          available_balance: Number(verified.verified_available_balance ?? 0),
        } : fund;
      }));
      setStaff((profiles as any) ?? []);

      if (myAllocs && myAllocs.length > 0) {
        // Fund details depends on myAllocs result — one extra query only when user has allocations
        const fundIds: string[] = [...new Set(myAllocs.map((a: any) => a.pre_fund_request_id as string))];
        const { data: fundDetails } = await (supabase as any)
          .from('pre_fund_requests')
          .select('id,name,source,status,holder_user_id')
          .in('id', fundIds);
        const fundMap: Record<string, any> = {};
        (fundDetails ?? []).forEach((f: any) => { fundMap[f.id] = f; });
        setMyAllocations(myAllocs.map((a: any) => ({
          ...a,
          fund_name:      fundMap[a.pre_fund_request_id]?.name,
          fund_source:    fundMap[a.pre_fund_request_id]?.source,
          fund_status:    fundMap[a.pre_fund_request_id]?.status,
          holder_user_id: fundMap[a.pre_fund_request_id]?.holder_user_id,
        })));
      } else {
        setMyAllocations([]);
      }
    } catch (e: any) {
      toast({ title: 'Error loading funds', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, isFinanceAdmin]);

  useEffect(() => { load(); }, [load]);

  // Eagerly load payment details for every fund where the current user has a
  // personal allocation so the Paid-Out Breakdown is available without requiring
  // the user to manually expand anything.
  useEffect(() => {
    if (!currentUser?.id || myAllocations.length === 0) return;
    myAllocations.forEach(alloc => {
      loadAllocPayments(alloc.id, currentUser.id, alloc.pre_fund_request_id);
    });
  }, [myAllocations, currentUser?.id, loadAllocPayments]);

  const loadAllocations = useCallback(async (fundId: string) => {
    setAllocLoading(prev => new Set(prev).add(fundId));
    try {
      const [allocRes, txnRes] = await Promise.all([
        (supabase as any)
          .from('pre_fund_allocations')
          .select('id,pre_fund_request_id,user_id,allocated_amount,spent_amount,currency,notes,receipt_url,created_at')
          .eq('pre_fund_request_id', fundId)
          .order('created_at', { ascending: false }),
        // Fetch payment transactions to compute live spent amounts per user
        (supabase as any)
          .from('pre_fund_event_ledger_v')
          .select('id,user_id,created_by,source_table,source_id,amount,transaction_type')
          .eq('pre_fund_request_id', fundId)
          .eq('source_is_verified', true),
      ]);
      if (allocRes.error) throw allocRes.error;

      const allocs: any[] = allocRes.data ?? [];
      const txns:   any[] = txnRes.data   ?? [];

      // Build the set of allocated user IDs so we can fall back to created_by
      // when user_id on the transaction is an unallocated recipient
      const allocatedUserIds = new Set(allocs.map((a: any) => a.user_id).filter(Boolean));

      // Compute per-user spend from transactions (mirrors PreFundingAllocations logic)
      const spendMap = new Map<string, number>();
      for (const t of txns) {
        const amt   = Number(t.amount) || 0;
        const delta = ['reversal', 'return'].includes(t.transaction_type) ? -amt : amt;
        if (!['payment', 'disbursement'].includes(t.transaction_type) && delta >= 0) continue;

        // Prefer allocated user_id; fall back to created_by if user_id isn't allocated
        let owner: string | null = null;
        if (t.user_id && allocatedUserIds.has(t.user_id)) owner = t.user_id;
        else if (t.created_by && allocatedUserIds.has(t.created_by)) owner = t.created_by;
        else owner = t.user_id ?? t.created_by ?? null;
        if (!owner) continue;

        spendMap.set(owner, Math.max(0, (spendMap.get(owner) ?? 0) + delta));
      }

      // Enrich profiles
      const profileIds: string[] = [...new Set(allocs.map((a: any) => a.user_id).filter(Boolean))];
      let profileMap: Record<string, StaffProfile> = {};
      if (profileIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id,full_name,email,role')
          .in('id', profileIds);
        (profs ?? []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      const enriched: Allocation[] = allocs.map((a: any) => {
        const txnSpent    = spendMap.get(a.user_id) ?? 0;
        const storedSpent = Number(a.spent_amount ?? 0);
        return {
          ...a,
          // Stored spend is maintained in the same transaction as the payment
          // event. Legacy attribution can fill an empty cache but cannot inflate it.
          spent_amount: txnSpent || storedSpent,
          user_name:  profileMap[a.user_id]?.full_name ?? 'Unknown',
          user_email: profileMap[a.user_id]?.email ?? '',
          user_role:  profileMap[a.user_id]?.role ?? '',
        };
      });

      setFundAllocs(prev => new Map(prev).set(fundId, enriched));
    } catch (e: any) {
      toast({ title: 'Error loading allocations', description: e.message, variant: 'destructive' });
    } finally {
      setAllocLoading(prev => { const n = new Set(prev); n.delete(fundId); return n; });
    }
  }, []);

  const toggleExpand = (fundId: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(fundId)) { n.delete(fundId); }
      else { n.add(fundId); loadAllocations(fundId); }
      return n;
    });
  };

  const openAdd = (fund: HeldFund) => {
    setAddForm({ userId: '', amount: '', notes: '' });
    setUserSearch('');
    setAddDialog({ open: true, fund });
    // Ensure allocations are loaded so the duplicate check in handleAddAllocation works
    if (!fundAllocs.has(fund.id)) loadAllocations(fund.id);
  };

  const handleAddAllocation = async () => {
    const fund = addDialog.fund;
    if (!fund || !addForm.userId || !addForm.amount) {
      toast({ title: 'Please select a staff member and enter an amount', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(addForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: 'Amount must be greater than zero', variant: 'destructive' });
      return;
    }
    const existing = fundAllocs.get(fund.id) ?? [];
    const totalAllocated = existing.reduce((s, a) => s + Number(a.allocated_amount), 0);
    if (totalAllocated + amt > fund.amount) {
      toast({
        title: 'Over-allocation',
        description: `Total allocations would exceed fund amount of ${formatNumber(fund.amount, 0)} ${fund.currency}.`,
        variant: 'destructive',
      });
      return;
    }
    // Check for existing allocation for this user+fund (in-memory first, then DB)
    const inMemoryDupe = existing.find(a => a.user_id === addForm.userId);
    if (inMemoryDupe) {
      toast({ title: 'User already allocated', description: 'Edit the existing allocation instead of adding a new one.', variant: 'destructive' });
      return;
    }
    // DB-level check as safety net (catches case where allocations weren't loaded yet)
    const { data: dbDupe } = await (supabase as any)
      .from('pre_fund_allocations')
      .select('id')
      .eq('pre_fund_request_id', fund.id)
      .eq('user_id', addForm.userId)
      .maybeSingle();
    if (dbDupe) {
      toast({ title: 'User already allocated', description: 'This staff member already has an allocation for this fund. Edit the existing one instead.', variant: 'destructive' });
      await loadAllocations(fund.id); // refresh so UI shows it
      return;
    }
    if (!addReceiptFiles.length) {
      toast({ title: 'Receipt required', description: 'Please attach at least one receipt or supporting document before saving.', variant: 'destructive' });
      return;
    }
    setAddSaving(true);
    try {
      const receiptUrl = await uploadMultipleReceipts(addReceiptFiles, fund.id, addForm.userId);
      if (!receiptUrl) { setAddSaving(false); return; }
      const { error } = await (supabase as any).from('pre_fund_allocations').insert({
        pre_fund_request_id: fund.id,
        user_id: addForm.userId,
        allocated_amount: amt,
        spent_amount: 0,
        currency: fund.currency,
        notes: addForm.notes || null,
        receipt_url: receiptUrl,
      });
      if (error) throw error;
      // Notify the user
      await (supabase as any).from('notification_events').insert({
        event_type: 'pre_fund_allocation_assigned',
        reference_id: fund.id,
        reference_type: 'pre_fund_request',
        title: 'Fund Allocation Assigned',
        message: `You have been allocated ${formatNumber(amt, 0)} ${fund.currency} from fund "${fund.name}".`,
        target_user_ids: [addForm.userId],
        created_by: currentUser?.id ?? null,
        metadata: { fund_id: fund.id, fund_name: fund.name, amount: amt, currency: fund.currency },
      }).catch(() => null);
      dispatchNotification({
        event: 'pre_fund_allocation_assigned', recipientIds: [addForm.userId],
        titleEn: 'Fund Allocation Assigned to You', titleAr: 'تم تعيين تخصيص الصندوق لك',
        messageEn: `You have been allocated ${formatNumber(amt, 0)} ${fund.currency} from fund "${fund.name}".`,
        messageAr: `تم تخصيص مبلغ ${formatNumber(amt, 0)} ${fund.currency} لك من صندوق "${fund.name}".`,
        entityType: 'pre_fund_request', entityId: fund.id,
        triggeredBy: currentUser?.id, priority: 'normal',
        metadata: { fund_name: fund.name, amount: amt, currency: fund.currency },
      });
      toast({ title: 'Allocation added', description: `${formatNumber(amt, 0)} ${fund.currency} assigned.` });
      setAddDialog({ open: false, fund: null });
      setAddReceiptFiles([]);
      await loadAllocations(fund.id);
    } catch (e: any) {
      toast({ title: 'Failed to add allocation', description: e.message, variant: 'destructive' });
    } finally {
      setAddSaving(false);
    }
  };

  const openTopUp = (alloc: Allocation, fundId: string) => {
    const fund = funds.find(f => f.id === fundId) ?? null;
    setTopUpAmt('');
    setTopUpReceiptFiles([]);
    setTopUpConfirmStep(false);
    setTopUpDialog({ open: true, alloc, fundId, fund });
  };

  const handleTopUpReview = () => {
    const { alloc } = topUpDialog;
    if (!alloc) return;
    const increment = parseFloat(topUpAmt);
    if (isNaN(increment) || increment <= 0) {
      toast({ title: 'Enter a valid top-up amount', description: 'Amount must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (!topUpReceiptFiles.length) {
      toast({ title: 'Receipt required', description: 'Please attach at least one receipt before continuing.', variant: 'destructive' });
      return;
    }
    setTopUpConfirmStep(true);
  };

  const saveTopUp = async () => {
    const { alloc, fundId, fund } = topUpDialog;
    if (!alloc) return;
    const increment = parseFloat(topUpAmt);
    if (isNaN(increment) || increment <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (!topUpReceiptFiles.length) {
      toast({ title: 'Receipt required', description: 'Please attach a receipt or supporting document before saving.', variant: 'destructive' });
      return;
    }
    // Enforce one-time limit for non-admins
    const meta = parseAllocMeta(alloc.notes);
    if (!isFinanceAdmin && meta.top_up_count >= 1) {
      toast({ title: 'Update limit reached', description: 'You can only top up once. Contact Finance Admin for further changes.', variant: 'destructive' });
      return;
    }
    setTopUpSaving(true);
    try {
      // Confirm both records are still present before uploading a receipt.
      // The allocation list can outlive a stale dialog, and the database
      // ceiling trigger should not be the first place this is discovered.
      const [{ data: currentFund, error: fundLookupError }, { data: currentAllocation, error: allocationLookupError }] = await Promise.all([
        (supabase as any)
          .from('pre_fund_requests')
          .select('id')
          .eq('id', fundId)
          .maybeSingle(),
        (supabase as any)
          .from('pre_fund_allocations')
          .select('id')
          .eq('id', alloc.id)
          .eq('pre_fund_request_id', fundId)
          .maybeSingle(),
      ]);
      if (fundLookupError) throw new Error(`The fund could not be verified: ${fundLookupError.message}`);
      if (allocationLookupError) throw new Error(`The allocation could not be verified: ${allocationLookupError.message}`);
      if (!currentFund) throw new Error('This fund no longer exists. Refresh the page and select the current fund.');
      if (!currentAllocation) throw new Error('This allocation no longer exists. Refresh the page and reopen the allocation.');

      const uploaded = await uploadMultipleReceipts(topUpReceiptFiles, fundId, alloc.user_id);
      if (!uploaded) { setTopUpSaving(false); return; }
      const newTotal = alloc.allocated_amount + increment;
      const newNotes = buildAllocMeta(
        alloc.notes,
        {
          date: new Date().toISOString(),
          amount: increment,
          previous_total: alloc.allocated_amount,
          new_total: newTotal,
          by_user_id: currentUser?.id ?? '',
          by_name: currentUser?.full_name ?? currentUser?.email ?? 'Unknown',
          receipt_url: uploaded,
          reason: topUpReason.trim() || undefined,
        },
        alloc.receipt_url,     // preserve original receipt on first top-up
        alloc.created_at,      // preserve original allocation date
      );
      let updateAllocationQuery = (supabase as any)
        .from('pre_fund_allocations')
        .update({ allocated_amount: newTotal, receipt_url: uploaded, notes: newNotes })
        .eq('id', alloc.id)
        .eq('allocated_amount', alloc.allocated_amount);
      updateAllocationQuery = alloc.notes === null
        ? updateAllocationQuery.is('notes', null)
        : updateAllocationQuery.eq('notes', alloc.notes);
      const { data: updatedAllocation, error } = await updateAllocationQuery
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updatedAllocation) throw new Error('The allocation changed while this top-up was being recorded. Refresh the page and try again.');
      dispatchNotification({
        event: 'pre_fund_allocation_updated', recipientIds: [alloc.user_id],
        titleEn: 'Fund Allocation Topped Up', titleAr: 'تم تعبئة تخصيص الصندوق',
        messageEn: `Your allocation from fund "${fund?.name ?? fundId}" has been topped up by ${formatNumber(increment, 0)} ${alloc.currency}. New total: ${formatNumber(newTotal, 0)} ${alloc.currency}.`,
        messageAr: `تمت تعبئة تخصيصك من صندوق "${fund?.name ?? fundId}" بمقدار ${formatNumber(increment, 0)} ${alloc.currency}. المجموع الجديد: ${formatNumber(newTotal, 0)}.`,
        entityType: 'pre_fund_request', entityId: fundId,
        triggeredBy: currentUser?.id, priority: 'normal',
        metadata: { fund_id: fundId, fund_name: fund?.name, top_up_amount: increment, new_total: newTotal, currency: alloc.currency },
      }).catch(() => null);
      toast({ title: 'Funds added', description: `${formatNumber(increment, 0)} ${alloc.currency} added. New total: ${formatNumber(newTotal, 0)}.` });
      setTopUpDialog({ open: false, alloc: null, fundId: '', fund: null });
      setTopUpReceiptFiles([]);
      setTopUpReason('');
      setTopUpConfirmStep(false);
      await loadAllocations(fundId);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setTopUpSaving(false);
    }
  };

  const handleDeleteLatestTopUp = async () => {
    if (!deleteTopUpTarget) return;
    if (!deleteTopUpReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Explain why the latest Add Funds transaction must be removed.',
        variant: 'destructive',
      });
      return;
    }

    setDeleteTopUpSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc(
        'reverse_latest_pre_fund_allocation_topup_rpc',
        {
          p_allocation_id: deleteTopUpTarget.alloc.id,
          p_expected_latest_date: deleteTopUpTarget.date,
          p_reason: deleteTopUpReason.trim(),
        },
      );
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'The latest Add Funds transaction could not be removed.');

      const allocation = deleteTopUpTarget.alloc;
      toast({
        title: 'Latest transaction removed',
        description: `${formatNumber(Number(data.reversed_amount ?? deleteTopUpTarget.amount), 0)} ${allocation.currency} was reversed. The previous Add Funds transaction is now the latest.`,
      });
      setDeleteTopUpTarget(null);
      setDeleteTopUpReason('');
      await loadAllocations(allocation.pre_fund_request_id);
    } catch (e: any) {
      toast({
        title: 'Could not remove transaction',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setDeleteTopUpSaving(false);
    }
  };

  const handleRequestTopUp = async () => {
    const alloc = reqDialog.alloc;
    if (!alloc) return;
    const amt = parseFloat(reqAmt);
    if (!amt || amt <= 0) {
      toast({ title: 'Enter amount', description: 'Please enter the additional amount you need.', variant: 'destructive' });
      return;
    }
    setReqSaving(true);
    try {
      const msg = `Staff member ${currentUser?.full_name ?? currentUser?.email} is requesting an additional ${formatNumber(amt, 0)} ${alloc.currency} on fund "${alloc.fund_name ?? alloc.pre_fund_request_id}". Reason: ${reqNotes || 'No reason provided.'}`;
      if (alloc.holder_user_id) {
        await dispatchNotification({
          event: 'pre_fund_topup_request', recipientIds: [alloc.holder_user_id],
          titleEn: 'Top-Up Request Received', titleAr: 'طلب تعبئة رصيد',
          messageEn: msg,
          messageAr: `طلب ${currentUser?.full_name ?? currentUser?.email} مبلغاً إضافياً ${formatNumber(amt, 0)} ${alloc.currency} من صندوق "${alloc.fund_name ?? ''}".`,
          entityType: 'pre_fund_request', entityId: alloc.pre_fund_request_id,
          triggeredBy: currentUser?.id, priority: 'high',
          metadata: { alloc_id: alloc.id, requested_amount: amt, currency: alloc.currency, notes: reqNotes },
        }).catch(() => null);
      }
      toast({ title: 'Request sent', description: `Your request for ${formatNumber(amt, 0)} ${alloc.currency} has been sent to the fund holder.` });
      setReqDialog({ open: false, alloc: null });
      setReqAmt('');
      setReqNotes('');
    } catch (e: any) {
      toast({ title: 'Failed to send request', description: e.message, variant: 'destructive' });
    } finally {
      setReqSaving(false);
    }
  };

  const handleRemoveAlloc = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      const { error } = await (supabase as any).from('pre_fund_allocations').delete().eq('id', removeId);
      if (error) throw error;
      toast({ title: 'Allocation removed' });
      setRemoveId(null);
      // Refresh all expanded funds
      for (const fundId of expanded) loadAllocations(fundId);
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  const selectedUser = staffProfiles.find(p => p.id === addForm.userId);

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-sky-600" />
            {isFinanceAdmin ? 'All Fund Holders' : 'My Fund — Distribute to Staff'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isFinanceAdmin
              ? 'All pre-funds that have a designated holder — view and manage allocations'
              : 'You have been assigned as a fund holder. Select staff to allocate portions of your fund.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-distribute">
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Empty state */}
      {funds.length === 0 && (
        <div className="text-center py-20 text-muted-foreground border rounded-xl">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {isFinanceAdmin ? 'No funds have a designated holder yet' : 'No fund assigned to you yet'}
          </p>
          <p className="text-sm mt-1">
            {isFinanceAdmin
              ? 'Open Fund Registry → Edit a fund → assign a Fund Holder'
              : 'Ask Finance Admin to assign you as a Fund Holder for a pre-fund.'}
          </p>
        </div>
      )}

      {/* ── My Allocations (staff view — shown to anyone who has received allocations) ── */}
      {myAllocations.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />My Received Allocations / تخصيصاتي
          </p>
          {myAllocations.map(alloc => {
            const pct = alloc.allocated_amount > 0
              ? Math.min(100, Math.round((alloc.spent_amount / alloc.allocated_amount) * 100))
              : 0;
            const rem = alloc.allocated_amount - alloc.spent_amount;
            const isClosed = alloc.fund_status === 'closed';
            return (
              <div key={alloc.id} className="flex items-center gap-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] truncate">{alloc.fund_name ?? '—'}</div>
                  {alloc.fund_source && <div className="text-[11px] text-muted-foreground truncate">{alloc.fund_source}</div>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <div>
                      <div className="text-[9px] font-medium uppercase text-muted-foreground">Allocated</div>
                      <div className="font-mono text-[12px] font-bold text-violet-700 dark:text-violet-300">
                        {alloc.currency} {formatNumber(alloc.allocated_amount, 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-medium uppercase text-muted-foreground">Spent</div>
                      <div className="font-mono text-[12px] font-semibold">{alloc.currency} {formatNumber(alloc.spent_amount, 0)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-medium uppercase text-muted-foreground">Remaining</div>
                      <div className={cn('font-mono text-[12px] font-semibold', rem < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                        {rem >= 0 ? formatNumber(rem, 0) : `−${formatNumber(-rem, 0)}`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={pct} className={cn('h-1.5 flex-1', pct >= 100 ? '[&>div]:bg-rose-500' : pct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-violet-500')} />
                    <span className="text-[10px] text-muted-foreground shrink-0">{pct}%</span>
                  </div>
                </div>
                <div className="shrink-0">
                  {alloc.receipt_url && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {parseReceiptUrls(alloc.receipt_url).map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setViewReceiptUrl(url)}
                          className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 underline"
                          title={`View receipt ${parseReceiptUrls(alloc.receipt_url).length > 1 ? i + 1 : ''}`}
                        >
                          <Receipt className="h-3 w-3" />
                          {parseReceiptUrls(alloc.receipt_url).length > 1 ? `Receipt ${i + 1}` : 'Receipt'}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-violet-400 text-violet-700 hover:bg-violet-100 dark:border-violet-600 dark:text-violet-300"
                    disabled={isClosed}
                    data-testid={`button-request-topup-${alloc.id}`}
                    onClick={() => { setReqDialog({ open: true, alloc }); setReqAmt(''); setReqNotes(''); }}
                  >
                    <Plus className="h-3.5 w-3.5" />Request More Funds
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fund cards */}
      <div className="space-y-3">
        {funds.map(fund => {
          const isOpen = expanded.has(fund.id);
          const allocs = fundAllocs.get(fund.id) ?? [];
          const totalAllocated = allocs.reduce((s, a) => s + Number(a.allocated_amount), 0);
          const totalSpent     = allocs.reduce((s, a) => s + Number(a.spent_amount), 0);
          const remaining      = fund.amount - totalAllocated;
          const usagePct       = fund.amount > 0 ? Math.min(100, Math.round((totalAllocated / fund.amount) * 100)) : 0;
          const isAllocLoading = allocLoading.has(fund.id);

          // ── Current-user allocation scoping ────────────────────────────────
          // When the viewer has a personal allocation on this fund, show THEIR
          // figures instead of the all-staff fund totals. This applies even for
          // admins — the Distribute tab represents each person's allocated piece
          // of the fund, not a fund-management view (that belongs in Reconciliation).
          const myAlloc        = myAllocations.find(a => a.pre_fund_request_id === fund.id);
          const myAllocPays    = myAlloc ? (allocPayments.get(myAlloc.id) ?? []) : [];
          const myPaysLoading  = myAlloc ? allocPaymentsLoading.has(myAlloc.id) : false;

          const displayAlloc   = myAlloc ? myAlloc.allocated_amount : fund.amount;
          const displaySpent   = myAlloc ? myAlloc.spent_amount     : totalSpent;
          const displayRem     = myAlloc
            ? myAlloc.allocated_amount - myAlloc.spent_amount
            : remaining;
          const displayPct     = displayAlloc > 0
            ? Math.min(100, Math.round((displaySpent / displayAlloc) * 100))
            : 0;
          // ───────────────────────────────────────────────────────────────────

          return (
            <Card key={fund.id} className="overflow-hidden">
              {/* Fund summary row */}
              <CardContent className="pt-4 pb-4 px-5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    onClick={() => toggleExpand(fund.id)}
                    data-testid={`button-toggle-fund-${fund.id}`}
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{fund.name}</div>
                      {fund.source && <div className="text-xs text-muted-foreground truncate">{fund.source}</div>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', STATUS_BADGE[fund.status] ?? 'bg-slate-100 text-slate-600')}>
                      {fund.status.replace(/_/g, ' ')}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => openAdd(fund)}
                      disabled={fund.status === 'closed' || fund.status === 'paused'}
                      data-testid={`button-add-alloc-${fund.id}`}
                    >
                      <Plus className="h-3.5 w-3.5" />Add Staff
                    </Button>
                  </div>
                </div>

                {/* KPI mini-row — scoped to current user's allocation when available */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {(myAlloc ? [
                    { label: 'My Allocation', value: formatNumber(myAlloc.allocated_amount, 0), icon: Wallet,       cls: 'text-sky-600' },
                    { label: 'Paid Out',       value: formatNumber(displaySpent, 0),              icon: TrendingDown, cls: displaySpent > myAlloc.allocated_amount ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'Remaining',      value: formatNumber(Math.max(0, displayRem), 0),   icon: Check,        cls: displayRem < 0 ? 'text-rose-600' : 'text-teal-600' },
                    { label: 'Fund Total',     value: formatNumber(fund.amount, 0),               icon: Layers,       cls: 'text-muted-foreground' },
                  ] : [
                    { label: 'Fund Total',     value: formatNumber(fund.amount, 0),                        icon: Wallet,       cls: 'text-sky-600' },
                    { label: 'Allocated',      value: formatNumber(totalAllocated, 0),                     icon: Users,        cls: 'text-violet-600' },
                    { label: 'Fund Paid Out',  value: formatNumber(fund.paid_amount, 0),                   icon: TrendingDown, cls: 'text-emerald-600' },
                    { label: 'Fund Available', value: formatNumber(Math.max(0, fund.available_balance), 0), icon: Check,        cls: fund.available_balance < 0 ? 'text-rose-600' : 'text-teal-600' },
                  ]).map(k => (
                    <div key={k.label} className="flex flex-col">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                      <span className={cn('text-sm font-bold tabular-nums', k.cls)}>{fund.currency} {k.value}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar — scoped to current user when they have an allocation */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    {myAlloc ? (
                      <>
                        <span>Spent {displayPct}% of my allocation</span>
                        <span>{formatNumber(Math.max(0, displayRem), 0)} {fund.currency} remaining</span>
                      </>
                    ) : (
                      <>
                        <span>Allocated {usagePct}%</span>
                        <span>{formatNumber(remaining, 0)} {fund.currency} still available to allocate</span>
                      </>
                    )}
                  </div>
                  <Progress
                    value={myAlloc ? displayPct : usagePct}
                    className={cn('h-1.5',
                      (myAlloc ? displayPct : usagePct) >= 100 ? '[&>div]:bg-rose-500' :
                      (myAlloc ? displayPct : usagePct) >= 80  ? '[&>div]:bg-amber-500' :
                      myAlloc ? '[&>div]:bg-violet-500' : '[&>div]:bg-sky-500'
                    )}
                  />
                </div>

                {/* Paid-Out Breakdown — shown when the current user has a personal allocation.
                    Mirrors the Reconciliation tab's breakdown but scoped to this user's
                    transactions (Down Payments vs Cost Submissions). */}
                {myAlloc && (() => {
                  if (myPaysLoading) {
                    return (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Paid-Out Breakdown</p>
                        <div className="flex gap-4">
                          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                        </div>
                      </div>
                    );
                  }
                  if (myAllocPays.length === 0) return null;

                  // Filter payments to those attributable to the current user and sum by type
                  const uid = currentUser?.id;
                  const mine = myAllocPays.filter((p: any) =>
                    p.requested_by === uid ||   // DP (down payment)
                    p.submitted_by === uid ||    // OCS (cost submission)
                    p.user_id === uid ||          // transaction user_id
                    p.created_by === uid          // transaction created_by fallback
                  );

                  // If no user-attributed entries, fall back to all (fund is holder-only, single user)
                  const payPool = mine.length > 0 ? mine : myAllocPays;
                  const dpTotal  = payPool.filter((p: any) => p._type === 'dp').reduce((s: number, p: any) => s + (p._txn_amount ?? 0), 0);
                  const ocsTotal = payPool.filter((p: any) => p._type === 'ocs').reduce((s: number, p: any) => s + (p._txn_amount ?? 0), 0);
                  const otherTotal = payPool.filter((p: any) => p._type === 'manual').reduce((s: number, p: any) => s + (p._txn_amount ?? 0), 0);
                  const grandTotal = dpTotal + ocsTotal + otherTotal;
                  if (grandTotal === 0) return null;

                  const breakdown = [
                    { label: 'Down Payments',     value: dpTotal,    cls: 'text-sky-600' },
                    { label: 'Cost Submissions',  value: ocsTotal,   cls: 'text-violet-600' },
                    ...(otherTotal > 0 ? [{ label: 'Other', value: otherTotal, cls: 'text-muted-foreground' }] : []),
                  ].filter(b => b.value > 0);

                  return (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Paid-Out Breakdown
                      </p>
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        {breakdown.map(b => (
                          <div key={b.label} className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">{b.label}</span>
                            <span className={cn('font-mono text-[12px] font-semibold', b.cls)}>
                              {fund.currency} {formatNumber(b.value, 0)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {grandTotal > 0 ? Math.round(b.value / grandTotal * 100) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Expanded allocations list */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />Staff Allocations
                    </p>
                    {isAllocLoading && (
                      <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    )}
                    {!isAllocLoading && allocs.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
                        <Users className="h-6 w-6 mx-auto mb-2 opacity-30" />
                        No staff allocated yet — click <strong>Add Staff</strong> to get started.
                      </div>
                    )}
                    {!isAllocLoading && allocs.map(a => {
                      const pct = a.allocated_amount > 0 ? Math.min(100, Math.round((a.spent_amount / a.allocated_amount) * 100)) : 0;
                      const rem = a.allocated_amount - a.spent_amount;
                      const isExpanded = expandedAllocId === a.id;
                      const payments = allocPayments.get(a.id) ?? [];
                      const isPaymentsLoading = allocPaymentsLoading.has(a.id);
                      const catLabel: Record<string, string> = {
                        permits:'Permits', incentives:'Incentives', communications:'Comms',
                        training:'Training', transport:'Transport', general_transport:'Transport',
                        equipment:'Equipment', printing:'Printing', meetings:'Meetings',
                        office_admin:'Office Admin', other:'Other',
                      };
                      return (
                        <div key={a.id} className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
                          {/* ── Main allocation row ── */}
                          <div
                            className="group/arow flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
                            data-testid={`row-staff-alloc-${a.id}`}
                            onClick={() => {
                              const next = isExpanded ? null : a.id;
                              setExpandedAllocId(next);
                              if (next) {
                                loadAllocPayments(a.id, a.user_id, fund.id);
                                setTimeout(() => {
                                  document.getElementById(`alloc-detail-${a.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                }, 120);
                              }
                            }}
                          >
                            {/* Expand chevron */}
                            <span className="shrink-0 text-muted-foreground">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[13px] truncate flex items-center gap-1.5">
                                {a.user_name}
                                {/* Top-up count badge */}
                                {(() => { const m = parseAllocMeta(a.notes); return m.top_up_count > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 shrink-0">
                                    <History className="h-2.5 w-2.5" />{m.top_up_count}× topped up
                                  </span>
                                ) : null; })()}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{a.user_email} · {a.user_role?.replace(/_/g, ' ')}</span>
                                {/* Receipt links */}
                                {a.receipt_url && parseReceiptUrls(a.receipt_url).map((url, i) => (
                                  <button
                                    key={i}
                                    onClick={e => { e.stopPropagation(); setViewReceiptUrl(url); }}
                                    className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-700 underline shrink-0"
                                    title="View receipt"
                                    data-testid={`link-receipt-${a.id}-${i}`}
                                  >
                                    <Receipt className="h-3 w-3" />
                                    {parseReceiptUrls(a.receipt_url).length > 1 ? `R${i + 1}` : 'Receipt'}
                                  </button>
                                ))}
                                {/* No-receipt warning */}
                                {!a.receipt_url && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0" title="No receipt attached to this allocation">
                                    <AlertCircle className="h-3 w-3" />No receipt
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Amount + Add Funds button */}
                            <div className="text-right" onClick={e => e.stopPropagation()}>
                              <div className="font-mono text-[12px] font-semibold">{fund.currency} {formatNumber(a.allocated_amount, 0)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatNumber(a.spent_amount, 0)} paid out
                              </div>
                              <div className={cn('text-[10px] font-semibold mb-1', rem < 0 ? 'text-rose-600' : 'text-teal-600')}>
                                Balance with {a.user_name?.split(' ')[0] || 'holder'}: {fund.currency} {rem >= 0 ? formatNumber(rem, 0) : `−${formatNumber(-rem, 0)}`}
                              </div>
                              {(() => {
                                const rowMeta = parseAllocMeta(a.notes);
                                const rowLocked = !isFinanceAdmin && rowMeta.top_up_count >= 1;
                                return (
                                  <button
                                    onClick={() => openTopUp(a, fund.id)}
                                    className={cn(
                                      'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border transition-colors',
                                      rowLocked
                                        ? 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400 cursor-not-allowed opacity-70'
                                        : 'border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-400 dark:hover:bg-sky-950'
                                    )}
                                    title={rowLocked ? 'Update limit reached — contact Finance Admin' : 'Add more funds to this allocation'}
                                    data-testid={`button-topup-alloc-${a.id}`}
                                  >
                                    {rowLocked ? <Lock className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
                                    {rowLocked ? 'Locked' : 'Add Funds'}
                                  </button>
                                );
                              })()}
                            </div>
                            {/* Mini progress */}
                            <div className="w-16 shrink-0 hidden sm:block">
                              <Progress
                                value={pct}
                                className={cn('h-1', pct >= 100 ? '[&>div]:bg-rose-500' : pct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-sky-500')}
                              />
                              <span className="text-[9px] text-muted-foreground">{pct}%</span>
                            </div>
                            {/* Remove — admins always, holders only if no top-ups yet */}
                            {(isFinanceAdmin || parseAllocMeta(a.notes).top_up_count === 0) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setRemoveId(a.id); }}
                                className="opacity-0 group-hover/arow:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                                title="Remove allocation"
                                data-testid={`button-remove-alloc-${a.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* ── Expanded detail panel ── */}
                          {isExpanded && (
                            <div id={`alloc-detail-${a.id}`} className="border-t border-border/40 bg-background/60 px-3 py-3 space-y-4">

                              {/* ═══════════════════════════════════════════════
                                  SECTION 1 — FUNDS SENT (distributions received)
                                  Each time money was transferred TO this person
                              ════════════════════════════════════════════════ */}
                              {(() => {
                                const m = parseAllocMeta(a.notes);

                                // Build the full disbursement timeline
                                type Disbursement = {
                                  seq: number;
                                  date: string | null;
                                  amount: number;
                                  running_total: number;
                                  by_name: string;
                                  receipt_url: string | null;
                                  is_initial: boolean;
                                  reason?: string;
                                };

                                const rows: Disbursement[] = [];

                                // Row 0 — Initial allocation
                                const initialAmount = m.top_up_count > 0
                                  ? m.top_up_log[0]?.previous_total ?? a.allocated_amount
                                  : a.allocated_amount;
                                const initialReceipt = m.top_up_count > 0
                                  ? (m.initial_receipt_url ?? null)
                                  : a.receipt_url;
                                const initialDate = m.top_up_count > 0
                                  ? (m.initial_created_at ?? a.created_at)
                                  : a.created_at;
                                rows.push({
                                  seq: 1,
                                  date: initialDate,
                                  amount: initialAmount,
                                  running_total: initialAmount,
                                  by_name: '—',  // initial creator not stored in notes
                                  receipt_url: initialReceipt,
                                  is_initial: true,
                                });

                                // Rows 1+ — Top-ups from audit log
                                m.top_up_log.forEach((entry, i) => {
                                  rows.push({
                                    seq: i + 2,
                                    date: entry.date,
                                    amount: entry.amount,
                                    running_total: entry.new_total,
                                    by_name: entry.by_name,
                                    receipt_url: entry.receipt_url,
                                    is_initial: false,
                                    reason: entry.reason,
                                  });
                                });

                                const totalDisbursed = rows.reduce((s, r) => s + r.amount, 0);
                                const missingReceiptCount = rows.filter(r => !r.receipt_url).length;

                                const fundsSectionCollapsed = collapsedSections[a.id]?.funds ?? false;
                                return (
                                  <div>
                                    <button
                                      onClick={() => toggleSection(a.id, 'funds')}
                                      className="w-full text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 hover:text-foreground transition-colors group"
                                    >
                                      {fundsSectionCollapsed
                                        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                      }
                                      <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                                      <span>Funds Sent to {a.user_name?.split(' ')[0]}</span>
                                      <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold border border-emerald-200 dark:border-emerald-700">
                                        {rows.length} disbursement{rows.length > 1 ? 's' : ''}
                                      </span>
                                      {missingReceiptCount > 0 && (
                                        <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[9px] font-bold border border-amber-300 dark:border-amber-700">
                                          <AlertCircle className="h-2.5 w-2.5" />
                                          {missingReceiptCount} receipt{missingReceiptCount > 1 ? 's' : ''} missing
                                        </span>
                                      )}
                                    </button>

                                    {!fundsSectionCollapsed && (
                                    <>
                                    {/* Missing-receipt warning banner */}
                                    {missingReceiptCount > 0 && (
                                      <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                                        <span>
                                          <strong>{missingReceiptCount} disbursement{missingReceiptCount > 1 ? 's are' : ' is'} missing a receipt.</strong>
                                          {' '}Receipts are required for financial accountability. Please re-upload via <em>Add Funds</em>.
                                        </span>
                                      </div>
                                    )}

                                    <div className="overflow-x-auto rounded-lg border border-emerald-200/60 dark:border-emerald-800/40">
                                      <table className="w-full text-xs">
                                        <thead className="bg-emerald-50/80 dark:bg-emerald-950/40">
                                          <tr>
                                            <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">#</th>
                                            <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">Date</th>
                                            <th className="text-right py-2 px-2.5 text-muted-foreground font-semibold">Amount Sent</th>
                                            <th className="text-right py-2 px-2.5 text-muted-foreground font-semibold">Running Total</th>
                                            <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold hidden sm:table-cell">Sent By</th>
                                            <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold hidden md:table-cell">Reason</th>
                                            <th className="text-center py-2 px-2.5 text-muted-foreground font-semibold">Receipt</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {rows.map((row) => {
                                            const missingReceipt = !row.receipt_url;
                                            const entryIndex = row.seq - 2;
                                            const canDeleteLatestTopUp =
                                              !row.is_initial &&
                                              entryIndex === m.top_up_log.length - 1 &&
                                              (
                                                isAllocationTopUpAdmin ||
                                                fund.holder_user_id === currentUser?.id
                                              );
                                            return (
                                            <tr
                                              key={row.seq}
                                              className={cn(
                                                'border-t',
                                                missingReceipt
                                                  ? 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30'
                                                  : row.is_initial
                                                    ? 'border-border/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                                                    : 'border-border/30 hover:bg-muted/30'
                                              )}
                                            >
                                              <td className="py-2 px-2.5">
                                                <span className={cn(
                                                  'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                                                  missingReceipt
                                                    ? 'bg-amber-500 text-white'
                                                    : row.is_initial
                                                      ? 'bg-emerald-500 text-white'
                                                      : 'bg-sky-500 text-white'
                                                )}>
                                                  {row.seq}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 text-muted-foreground whitespace-nowrap">
                                                {row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}
                                                {row.is_initial && (
                                                  <span className="ml-1.5 text-[9px] font-semibold text-emerald-600 uppercase">Initial</span>
                                                )}
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                                {row.is_initial ? '' : '+'}{fund.currency} {formatNumber(row.amount, 0)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                                {fund.currency} {formatNumber(row.running_total, 0)}
                                              </td>
                                              <td className="py-2 px-2.5 text-muted-foreground hidden sm:table-cell truncate max-w-[120px]">
                                                {row.by_name}
                                              </td>
                                              <td className="py-2 px-2.5 text-muted-foreground hidden md:table-cell truncate max-w-[160px] italic text-[10px]">
                                                {row.reason || '—'}
                                              </td>
                                              <td className="py-2 px-2.5 text-center">
                                                {row.receipt_url ? (
                                                  <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                      onClick={() => {
                                                        const rowType = row.is_initial ? 'initial' : (row.seq - 2) as number;
                                                        setViewReceiptMeta({ alloc: a, rowType });
                                                        setViewReceiptUrl(parseReceiptUrls(row.receipt_url!)[0] ?? null);
                                                      }}
                                                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:underline"
                                                      data-testid={`link-dist-receipt-${a.id}-${row.seq}`}
                                                    >
                                                      <Receipt className="h-3 w-3" />View
                                                    </button>
                                                    {isFinanceAdmin && (
                                                      <button
                                                        onClick={() => triggerReplaceReceipt(a, row.is_initial ? 'initial' : (row.seq - 2) as number)}
                                                        className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-sky-600 border border-border/60 rounded px-1 py-0.5"
                                                        title="Replace this receipt"
                                                      >
                                                        <Upload className="h-2.5 w-2.5" />
                                                      </button>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-col items-center gap-1">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                                      <AlertCircle className="h-3 w-3" />No Receipt
                                                    </span>
                                                    <button
                                                      onClick={() => triggerReplaceReceipt(a, row.is_initial ? 'initial' : (row.seq - 2) as number)}
                                                      disabled={replaceSaving}
                                                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 underline"
                                                      data-testid={`button-upload-receipt-${a.id}-${row.seq}`}
                                                    >
                                                      <Upload className="h-2.5 w-2.5" />Upload
                                                    </button>
                                                  </div>
                                                )}
                                                {canDeleteLatestTopUp && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setDeleteTopUpTarget({
                                                        alloc: a,
                                                        entryIndex,
                                                        amount: row.amount,
                                                        date: row.date ?? '',
                                                      });
                                                      setDeleteTopUpReason('');
                                                    }}
                                                    className="mt-1 inline-flex items-center gap-0.5 rounded border border-destructive/30 px-1.5 py-0.5 text-[9px] font-medium text-destructive hover:bg-destructive/10"
                                                    title="Remove the latest Add Funds transaction"
                                                    data-testid={`button-delete-latest-topup-${a.id}`}
                                                  >
                                                    <Trash2 className="h-2.5 w-2.5" />
                                                    Delete latest
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                            );
                                          })}
                                        </tbody>
                                        <tfoot className="border-t-2 border-emerald-300/60 dark:border-emerald-700/60 bg-emerald-50/60 dark:bg-emerald-950/30">
                                          <tr>
                                            <td colSpan={2} className="py-2 px-2.5 text-[11px] font-semibold text-muted-foreground">
                                              Total Disbursed
                                            </td>
                                            <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                              {fund.currency} {formatNumber(totalDisbursed, 0)}
                                            </td>
                                            <td colSpan={3} />
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                    </>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* ═══════════════════════════════════════════════
                                  SECTION 2 — EXPENDITURE HISTORY
                                  Transactions spent FROM this person's fund
                              ════════════════════════════════════════════════ */}
                              {(() => {
                                const expenditureSectionCollapsed = collapsedSections[a.id]?.expenditure ?? false;
                                return (
                              <div>
                                <button
                                  onClick={() => toggleSection(a.id, 'expenditure')}
                                  className="w-full text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 hover:text-foreground transition-colors group"
                                >
                                  {expenditureSectionCollapsed
                                    ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                  }
                                  <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                                  Expenditure History / سجل المصروفات
                                  {!isPaymentsLoading && payments.length > 0 && (
                                    <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[9px] font-bold border border-rose-200 dark:border-rose-700">
                                      {payments.length} transaction{payments.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </button>
                                {!expenditureSectionCollapsed && (
                                <>
                                {isPaymentsLoading && (
                                  <div className="space-y-1.5">
                                    {[1,2,3].map(i => <div key={i} className="h-7 rounded bg-muted animate-pulse" />)}
                                  </div>
                                )}
                                {!isPaymentsLoading && payments.length === 0 && (
                                  <div className="text-center py-5 text-muted-foreground text-xs border border-dashed rounded-lg">
                                    No expenditure transactions recorded yet.
                                  </div>
                                )}
                                {!isPaymentsLoading && payments.length > 0 && (
                                <div className="overflow-x-auto rounded-lg border border-rose-200/60 dark:border-rose-800/40">
                                  <table className="w-full text-xs">
                                    <thead className="bg-rose-50/80 dark:bg-rose-950/40">
                                      <tr>
                                        <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">Date</th>
                                        <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">Type / Category</th>
                                        <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">Description</th>
                                        <th className="text-right py-2 px-2.5 text-muted-foreground font-semibold">Amount</th>
                                        <th className="text-left py-2 px-2.5 text-muted-foreground font-semibold">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {payments.map((p, i) => {
                                        const date = p._txn_date || p.paid_at || p.submitted_at || p.approved_at || p.created_at;
                                        // _txn_amount is the canonical transaction amount (set for all types).
                                        // For OCS, fall back to amount_paid_cents/amount_cents when _txn_amount is 0.
                                        const amt = Number(p._txn_amount) ||
                                          (p._type === 'ocs'
                                            ? (p.amount_paid_cents ?? p.amount_cents ?? 0) / 100
                                            : Number(p.amount) || 0);
                                        const rawCategory = p._category || p.expense_category;
                                        const category = p._type === 'ocs'
                                          ? (catLabel[rawCategory] ?? rawCategory?.replace(/_/g, ' ') ?? '—')
                                          : p._type === 'dp'
                                            ? (rawCategory?.replace(/_/g, ' ') || 'Down Payment')
                                          : p._type === 'manual'
                                            ? (rawCategory?.replace(/_/g, ' ') || 'Manual Entry')
                                            : '—';
                                        const desc = p._type === 'ocs'
                                          ? (p.description?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || '—')
                                          : p._type === 'manual'
                                            ? (p.description || '—')
                                            : (p.purpose || '—');
                                        const status = p.status || 'paid';
                                        const statusCls = status === 'paid' || status === 'reconciled' || status === 'approved'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : status === 'rejected'
                                            ? 'text-red-600'
                                            : 'text-amber-700';
                                        return (
                                          <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                                            <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                                              {date ? format(new Date(date), 'dd MMM yy') : '—'}
                                            </td>
                                            <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{category}</td>
                                            <td className="py-1.5 pr-3 text-muted-foreground max-w-[180px] truncate">{desc}</td>
                                            <td className="py-1.5 text-right font-mono font-semibold whitespace-nowrap">
                                              {fund.currency} {formatNumber(amt, 0)}
                                            </td>
                                            <td className={`py-1.5 pl-3 capitalize whitespace-nowrap ${statusCls}`}>
                                              {status.replace(/_/g, ' ')}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t font-semibold">
                                        <td colSpan={3} className="py-1.5 text-muted-foreground text-xs">Total Payments</td>
                                        <td className="py-1.5 text-right font-mono text-xs">
                                          {fund.currency} {formatNumber(payments.reduce((s, p) => {
                                            const amt = Number(p._txn_amount) ||
                                              (p._type === 'ocs'
                                                ? (p.amount_paid_cents ?? p.amount_cents ?? 0) / 100
                                                : Number(p.amount) || 0);
                                            return s + amt;
                                          }, 0), 0)}
                                        </td>
                                        <td />
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                                </>
                                )}
                            </div>
                                );
                              })()}
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Allocation Dialog */}
      <Dialog open={addDialog.open} onOpenChange={o => !o && setAddDialog({ open: false, fund: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-sky-600" />
              Add Staff Allocation — {addDialog.fund?.name}
            </DialogTitle>
          </DialogHeader>
          {addDialog.fund && (
            <div className="space-y-4 py-2">
              {/* Fund summary */}
              <Alert className="border-sky-200 bg-sky-50 dark:bg-sky-950/20 py-2">
                <Info className="h-4 w-4 text-sky-600" />
                <AlertDescription className="text-xs text-sky-800 dark:text-sky-300">
                  Available to allocate:{' '}
                  <span className="font-mono font-semibold">
                    {formatNumber(
                      addDialog.fund.amount - (fundAllocs.get(addDialog.fund.id) ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0),
                      0
                    )} {addDialog.fund.currency}
                  </span>
                </AlertDescription>
              </Alert>

              {/* Staff picker */}
              <div>
                <Label className="text-xs mb-1 block">Staff Member *</Label>
                {selectedUser ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">{selectedUser.full_name}</div>
                      <div className="text-[11px] text-muted-foreground">{selectedUser.email} · {selectedUser.role?.replace(/_/g, ' ')}</div>
                    </div>
                    <button onClick={() => setAddForm(p => ({ ...p, userId: '' }))} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-user">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative mb-1">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search staff by name or email…"
                        className="pl-8 h-8 text-sm"
                        data-testid="input-user-search"
                      />
                    </div>
                    {userSearch.trim() && (
                      <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
                        {staffProfiles
                          .filter(p =>
                            (p.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                             p.email?.toLowerCase().includes(userSearch.toLowerCase())) &&
                            !(fundAllocs.get(addDialog.fund!.id) ?? []).some(a => a.user_id === p.id)
                          )
                          .slice(0, 8)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                              onClick={() => { setAddForm(prev => ({ ...prev, userId: p.id })); setUserSearch(''); }}
                              data-testid={`button-select-user-${p.id}`}
                            >
                              <div>
                                <div className="text-sm font-medium">{p.full_name || '(no name)'}</div>
                                <div className="text-[11px] text-muted-foreground">{p.email} · {p.role}</div>
                              </div>
                              <Plus className="h-4 w-4 text-sky-600 shrink-0" />
                            </button>
                          ))}
                        {staffProfiles.filter(p =>
                          p.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                          p.email?.toLowerCase().includes(userSearch.toLowerCase())
                        ).length === 0 && (
                          <p className="text-sm text-center text-muted-foreground py-3">No matching staff</p>
                        )}
                      </div>
                    )}
                    {!userSearch && <p className="text-[11px] text-muted-foreground mt-0.5">Type to search staff</p>}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs mb-1 block">Amount ({addDialog.fund.currency}) *</Label>
                <Input
                  type="number"
                  value={addForm.amount}
                  onChange={e => setAddForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="h-8 text-sm"
                  data-testid="input-alloc-amount"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs mb-1 block">Notes (optional)</Label>
                <Input
                  value={addForm.notes}
                  onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Purpose of this allocation…"
                  className="h-8 text-sm"
                  data-testid="input-alloc-notes"
                />
              </div>

              {/* Receipt upload — multi-file */}
              <div>
                <Label className="text-xs mb-2 block flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />Receipts / Supporting Documents <span className="text-destructive">*</span>
                </Label>
                {/* Staged files list */}
                {addReceiptFiles.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {addReceiptFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30">
                        {f.type.startsWith('image/') ? <FileImage className="h-3.5 w-3.5 text-sky-600 shrink-0" /> : <FileText className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                        <span className="truncate flex-1 text-[12px]">{f.name}</span>
                        <button onClick={() => setAddReceiptFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-add-receipt-upload">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">
                    {addReceiptFiles.length > 0 ? 'Add more receipts…' : 'Attach receipt(s) — images or PDFs'}
                  </span>
                  <input
                    type="file" accept="image/*,.pdf,.xlsx,.xls" multiple className="hidden"
                    onChange={e => setAddReceiptFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
                    data-testid="input-add-receipt-file"
                  />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog({ open: false, fund: null }); setAddReceiptFiles([]); }}>Cancel</Button>
            <Button onClick={handleAddAllocation} disabled={addSaving} data-testid="button-confirm-add-alloc">
              {addSaving ? 'Saving…' : 'Add Allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-Up / Add Funds Dialog */}
      <Dialog open={topUpDialog.open} onOpenChange={o => { if (!o) { setTopUpDialog({ open: false, alloc: null, fundId: '', fund: null }); setTopUpConfirmStep(false); setTopUpReason(''); setTopUpReceiptFiles([]); } }}>
        <DialogContent className="max-w-lg w-full flex flex-col max-h-[90vh]">
          {topUpDialog.alloc && (() => {
            const alloc = topUpDialog.alloc;
            const balance = alloc.allocated_amount - alloc.spent_amount;
            const increment = parseFloat(topUpAmt) || 0;
            const newTotal = alloc.allocated_amount + increment;

            if (topUpConfirmStep) {
              /* ── Confirmation step ── */
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Confirm Fund Transfer
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-1 overflow-y-auto flex-1 min-h-0">
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                      <div className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                        {alloc.user_name}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                        <span className="text-muted-foreground">Current balance</span>
                        <span className="font-mono font-medium text-right">{alloc.currency} {formatNumber(balance, 0)}</span>
                        <span className="text-muted-foreground">Top-up amount</span>
                        <span className="font-mono font-semibold text-sky-700 dark:text-sky-400 text-right">+ {alloc.currency} {formatNumber(increment, 0)}</span>
                        <span className="text-muted-foreground border-t pt-1">New total allocated</span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 border-t pt-1 text-right">{alloc.currency} {formatNumber(newTotal, 0)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {topUpReceiptFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 text-[11px] border rounded px-2 py-0.5 bg-muted/40">
                          {f.type.startsWith('image/') ? <FileImage className="h-3 w-3 text-sky-600" /> : <FileText className="h-3 w-3 text-rose-500" />}
                          <span className="truncate max-w-[140px]">{f.name}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                      This action will transfer funds to {alloc.user_name} and upload the receipt. It cannot be undone automatically.
                    </p>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setTopUpConfirmStep(false)} className="gap-1" data-testid="button-topup-back">
                      <ArrowLeft className="h-3.5 w-3.5" />Back
                    </Button>
                    <Button
                      onClick={saveTopUp}
                      disabled={topUpSaving}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      data-testid="button-confirm-topup"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {topUpSaving ? 'Sending…' : 'Confirm & Add Funds'}
                    </Button>
                  </DialogFooter>
                </>
              );
            }

            /* ── Entry step ── */
            const allocMeta = parseAllocMeta(alloc.notes);
            const holderLocked = !isFinanceAdmin && allocMeta.top_up_count >= 1;
            const fundDialogData = topUpDialog.fund;
            const totalAllocatedForFund = Array.from(fundAllocs.values()).flat()
              .filter(fa => fundDialogData && fa.pre_fund_request_id === fundDialogData.id)
              .reduce((s, fa) => s + Number(fa.allocated_amount), 0);
            const fundAvailable = fundDialogData ? Math.max(0, fundDialogData.amount - totalAllocatedForFund) : null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-sky-600" />
                    Add Funds — {alloc.user_name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-1 overflow-y-auto flex-1 min-h-0">

                  {/* ── Fund pool balance ── */}
                  {fundDialogData && (
                    <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2 text-[11px]">
                      <p className="font-semibold text-sky-700 dark:text-sky-300 mb-1.5 flex items-center gap-1">
                        <Wallet className="h-3 w-3" />Fund Pool — {fundDialogData.name}
                      </p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="min-w-0">
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Total</p>
                          <p className="font-mono font-bold text-sky-700 dark:text-sky-300 mt-0.5 text-[12px] break-all">{formatNumber(fundDialogData.amount, 0)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Allocated</p>
                          <p className="font-mono font-semibold text-violet-600 mt-0.5 text-[12px] break-all">{formatNumber(totalAllocatedForFund, 0)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Available</p>
                          <p className={cn('font-mono font-bold mt-0.5 text-[12px] break-all', (fundAvailable ?? 0) <= 0 ? 'text-rose-600' : 'text-emerald-600')}>
                            {formatNumber(fundAvailable ?? 0, 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Holder locked banner ── */}
                  {holderLocked && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-300">
                      <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Update limit reached</p>
                        <p className="text-[11px] mt-0.5">You have already topped up this allocation once. Contact Finance Admin or Super Admin for further changes.</p>
                      </div>
                    </div>
                  )}

                  {/* ── Admin multi-update notice ── */}
                  {isFinanceAdmin && allocMeta.top_up_count > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30 px-3 py-2 text-[11px] text-violet-700 dark:text-violet-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Admin override — this allocation has been topped up <strong>{allocMeta.top_up_count}</strong> time{allocMeta.top_up_count > 1 ? 's' : ''}. Each change is recorded in the audit log below.</span>
                    </div>
                  )}

                  {/* Current allocation balance summary */}
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 grid grid-cols-3 gap-4 text-center">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Allocated</p>
                      <p className="font-mono font-semibold text-[13px] mt-1 break-all">{formatNumber(alloc.allocated_amount, 0)}</p>
                    </div>
                    <div className="min-w-0 border-x border-border/40">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Spent</p>
                      <p className="font-mono font-semibold text-[13px] mt-1 text-rose-600 break-all">{formatNumber(alloc.spent_amount, 0)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</p>
                      <p className={cn('font-mono font-bold text-[13px] mt-1 break-all', balance >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {formatNumber(balance, 0)}
                      </p>
                    </div>
                  </div>

                  {/* Top-up amount — disabled when holder is locked */}
                  {!holderLocked && (
                    <>
                    <div>
                      <Label className="text-xs mb-1 block">Top-Up Amount ({alloc.currency}) <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={topUpAmt}
                        onChange={e => setTopUpAmt(e.target.value)}
                        className="h-9 text-sm font-mono"
                        autoFocus
                        data-testid="input-topup-amount"
                      />
                      {increment > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                          New total: {alloc.currency} {formatNumber(alloc.allocated_amount, 0)} + {formatNumber(increment, 0)} = <span className="font-semibold text-emerald-600">{formatNumber(newTotal, 0)}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Reason / Top-Up Name</Label>
                      <Input
                        placeholder="e.g. Q3 operational cash, July salary supplement…"
                        value={topUpReason}
                        onChange={e => setTopUpReason(e.target.value)}
                        className="h-9 text-sm"
                        data-testid="input-topup-reason"
                      />
                    </div>
                    </>
                  )}

                  {/* Receipt upload — only when not locked */}
                  {!holderLocked && (
                    <div>
                      <Label className="text-xs mb-2 flex items-center gap-1.5">
                        <Paperclip className="h-3 w-3" />
                        Receipt of Fund Sent
                        <span className="text-destructive font-bold">*</span>
                        <span className="ml-auto text-[9px] font-normal text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                          JPG · PNG · WEBP · GIF · PDF · XLS · XLSX · max 10 MB
                        </span>
                      </Label>
                      {topUpReceiptFiles.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {topUpReceiptFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-1.5 bg-emerald-50/40 dark:bg-emerald-950/20">
                              {f.type.startsWith('image/') ? <FileImage className="h-3.5 w-3.5 text-sky-600 shrink-0" /> : <FileText className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                              <span className="truncate flex-1 text-[12px]">{f.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                              <button onClick={() => setTopUpReceiptFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label
                        className={cn(
                          'flex items-center gap-2 border-2 border-dashed rounded-md px-3 py-3 cursor-pointer transition-colors',
                          topUpReceiptFiles.length === 0
                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            : 'border-border hover:bg-muted/30'
                        )}
                        data-testid="label-topup-receipt-upload"
                      >
                        <Upload className={cn('h-4 w-4 shrink-0', topUpReceiptFiles.length === 0 ? 'text-amber-500' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[12px] font-medium', topUpReceiptFiles.length === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                            {topUpReceiptFiles.length > 0 ? 'Add more receipts…' : 'Click to attach receipt'}
                          </p>
                          {topUpReceiptFiles.length === 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">Image, PDF or Excel — required before submitting</p>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls"
                          multiple
                          className="hidden"
                          onChange={e => setTopUpReceiptFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
                          data-testid="input-topup-receipt-file"
                        />
                      </label>
                      {/* Prominent requirement warning */}
                      <div className="mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                          A receipt is required for every top-up. Submissions without a receipt will be rejected.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Audit Log (shown to admins and when log exists) ── */}
                  {(isFinanceAdmin || allocMeta.top_up_log.length > 0) && allocMeta.top_up_log.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
                        <History className="h-3 w-3" />Top-Up History
                        <span className="ml-auto text-[9px] font-normal">
                          {allocMeta.top_up_log.filter(e => !e.receipt_url).length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-2.5 w-2.5" />
                              {allocMeta.top_up_log.filter(e => !e.receipt_url).length} missing receipt
                            </span>
                          )}
                        </span>
                      </p>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {allocMeta.top_up_log.map((entry, i) => {
                          const hasReceipt = !!entry.receipt_url;
                          return (
                            <div
                              key={i}
                              className={cn(
                                'rounded-md border px-2.5 py-1.5 text-[11px]',
                                hasReceipt
                                  ? 'border-border/40 bg-muted/20'
                                  : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-bold shrink-0 mt-0.5">
                                  {i + 2}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="font-semibold text-sky-700 dark:text-sky-300">
                                      +{alloc.currency} {formatNumber(entry.amount, 0)}
                                    </span>
                                    <span className="text-muted-foreground text-[10px]">
                                      {format(new Date(entry.date), 'dd MMM yyyy HH:mm')}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground truncate">by {entry.by_name}</div>
                                  {entry.reason && (
                                    <div className="text-[10px] text-sky-700 dark:text-sky-300 font-medium truncate mt-0.5">"{entry.reason}"</div>
                                  )}
                                  <div className="text-[10px] text-muted-foreground">
                                    {formatNumber(entry.previous_total, 0)} → {formatNumber(entry.new_total, 0)} {alloc.currency}
                                  </div>
                                  {/* Receipt status */}
                                  <div className="mt-1">
                                    {hasReceipt ? (
                                      <button
                                        onClick={() => {
                                          setViewReceiptMeta({ alloc, rowType: i });
                                          setViewReceiptUrl(parseReceiptUrls(entry.receipt_url!)[0] ?? null);
                                        }}
                                        className="inline-flex items-center gap-0.5 text-[10px] text-sky-600 hover:text-sky-800 hover:underline"
                                      >
                                        <Receipt className="h-3 w-3" />View Receipt
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                          <AlertCircle className="h-2.5 w-2.5" />No Receipt
                                        </span>
                                        <button
                                          onClick={() => {
                                            setTopUpDialog({ open: false, alloc: null, fundId: '', fund: null });
                                            triggerReplaceReceipt(alloc, i);
                                          }}
                                          className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 dark:text-amber-300 hover:underline"
                                        >
                                          <Upload className="h-2.5 w-2.5" />Upload
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {allocMeta.top_up_reversal_log.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <History className="h-3 w-3" />
                        Reversed Add Funds Transactions
                      </p>
                      <div className="max-h-32 space-y-1.5 overflow-y-auto">
                        {[...allocMeta.top_up_reversal_log].reverse().map((entry, i) => (
                          <div
                            key={`${entry.reversed_at}-${i}`}
                            className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-[10px]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-destructive">
                                −{alloc.currency} {formatNumber(entry.amount, 0)}
                              </span>
                              <span className="text-muted-foreground">
                                {format(new Date(entry.reversed_at), 'dd MMM yyyy HH:mm')}
                              </span>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">
                              Reason: {entry.reversal_reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTopUpDialog({ open: false, alloc: null, fundId: '', fund: null })}>Cancel</Button>
                  {!holderLocked && (
                    <Button onClick={handleTopUpReview} className="gap-1" data-testid="button-review-topup">
                      Review & Confirm →
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete latest Add Funds transaction confirmation */}
      <Dialog
        open={!!deleteTopUpTarget}
        onOpenChange={open => {
          if (!open && !deleteTopUpSaving) {
            setDeleteTopUpTarget(null);
            setDeleteTopUpReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Remove Latest Add Funds Transaction
            </DialogTitle>
          </DialogHeader>
          {deleteTopUpTarget && (
            <div className="space-y-4 py-1">
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                  Only the current latest transaction can be removed. After it is reversed,
                  the previous Add Funds transaction becomes the latest and may be removed next.
                </AlertDescription>
              </Alert>
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <p className="font-medium">{deleteTopUpTarget.alloc.user_name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="text-right font-medium">#{deleteTopUpTarget.entryIndex + 2}</span>
                  <span className="text-muted-foreground">Date</span>
                  <span className="text-right">
                    {format(new Date(deleteTopUpTarget.date), 'dd MMM yyyy HH:mm')}
                  </span>
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-right font-mono font-semibold text-destructive">
                    −{deleteTopUpTarget.alloc.currency} {formatNumber(deleteTopUpTarget.amount, 0)}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delete-topup-reason">Reason *</Label>
                <Textarea
                  id="delete-topup-reason"
                  rows={3}
                  placeholder="Explain why this latest transaction must be removed…"
                  value={deleteTopUpReason}
                  onChange={event => setDeleteTopUpReason(event.target.value)}
                  disabled={deleteTopUpSaving}
                  data-testid="input-delete-latest-topup-reason"
                />
                <p className="text-[11px] text-muted-foreground">
                  The reversal and its reason remain in the allocation audit history.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTopUpTarget(null);
                setDeleteTopUpReason('');
              }}
              disabled={deleteTopUpSaving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLatestTopUp}
              disabled={deleteTopUpSaving || !deleteTopUpReason.trim()}
              data-testid="button-confirm-delete-latest-topup"
            >
              {deleteTopUpSaving ? (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Remove Latest
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Top-Up Dialog (staff → fund holder) */}
      <Dialog open={reqDialog.open} onOpenChange={o => !o && setReqDialog({ open: false, alloc: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-violet-600" />
              Request Additional Funds
            </DialogTitle>
          </DialogHeader>
          {reqDialog.alloc && (
            <div className="space-y-4 py-1">
              <div className="rounded-md bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-3 py-2 text-sm">
                <div className="font-medium text-violet-800 dark:text-violet-300">{reqDialog.alloc.fund_name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Currently allocated: <span className="font-semibold">{reqDialog.alloc.currency} {formatNumber(reqDialog.alloc.allocated_amount, 0)}</span>
                  &nbsp;·&nbsp;Spent: <span className="font-semibold">{formatNumber(reqDialog.alloc.spent_amount, 0)}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Additional Amount Needed ({reqDialog.alloc.currency}) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={reqAmt}
                  onChange={e => setReqAmt(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  data-testid="input-req-amount"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Reason / Justification (optional)</Label>
                <textarea
                  value={reqNotes}
                  onChange={e => setReqNotes(e.target.value)}
                  rows={2}
                  placeholder="Explain why you need more funds…"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-req-notes"
                />
              </div>
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                This will send a notification to the fund holder requesting the top-up. They will review and add the funds directly.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDialog({ open: false, alloc: null })}>Cancel</Button>
            <Button
              onClick={handleRequestTopUp}
              disabled={reqSaving}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-confirm-req-topup"
            >
              {reqSaving ? 'Sending…' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer Dialog */}
      <Dialog open={!!viewReceiptUrl} onOpenChange={o => { if (!o) setViewReceiptUrl(null); }}>
        <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
          <DialogHeader className="px-5 py-3 border-b flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-sky-500" />
              Receipt
            </DialogTitle>
            {viewReceiptUrl && !receiptFetchError && (
              <a
                href={viewReceiptUrl} target="_blank" rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 border border-sky-200 rounded px-2 py-1"
              >
                <ExternalLink className="h-3 w-3" />Open in new tab
              </a>
            )}
          </DialogHeader>
          <div className="w-full flex items-center justify-center" style={{ height: '70vh' }}>
            {/* Loading state */}
            {receiptFetchLoading && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="h-8 w-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                <p className="text-sm">Loading receipt…</p>
              </div>
            )}

            {/* Error state */}
            {!receiptFetchLoading && receiptFetchError && (
              <div className="flex flex-col items-center gap-3 text-center px-8 text-muted-foreground">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-4">
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                </div>
                <p className="font-semibold text-sm text-foreground">
                  {receiptFetchError === 'bucket' ? 'Receipt file not accessible' : 'Receipt unavailable'}
                </p>
                <p className="text-xs max-w-xs leading-relaxed">
                  {receiptFetchError === 'bucket'
                    ? 'This receipt was stored in a bucket that no longer exists or is inaccessible. You can upload a replacement receipt directly below.'
                    : 'The receipt file could not be loaded. It may have been deleted or the link has expired. Upload a replacement below.'}
                </p>
                {/* Accepted file types */}
                <p className="text-[10px] text-muted-foreground/70 bg-muted/60 rounded px-3 py-1.5">
                  Accepted: <strong>JPG, PNG, WEBP, GIF, PDF, XLS, XLSX</strong> (max 10 MB)
                </p>
                {/* Primary action: upload replacement */}
                {viewReceiptMeta && (
                  <button
                    onClick={() => {
                      setViewReceiptUrl(null);
                      triggerReplaceReceipt(viewReceiptMeta.alloc, viewReceiptMeta.rowType);
                    }}
                    disabled={replaceSaving}
                    className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-5 py-2 shadow-sm transition-colors"
                    data-testid="button-replace-receipt-from-viewer"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Replacement Receipt
                  </button>
                )}
                {viewReceiptUrl && (
                  <a
                    href={viewReceiptUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />Try opening directly
                  </a>
                )}
              </div>
            )}

            {/* Success — show blob URL (same origin, no cross-origin restrictions) */}
            {!receiptFetchLoading && !receiptFetchError && receiptBlobUrl && (() => {
              const lower = viewReceiptUrl?.toLowerCase().split('?')[0] ?? '';
              const isImage = ['.png','.jpg','.jpeg','.gif','.webp','.bmp'].some(e => lower.endsWith(e));
              if (isImage) {
                return (
                  <div className="flex items-center justify-center h-full w-full bg-muted/30 p-4">
                    <img
                      src={receiptBlobUrl}
                      alt="Receipt"
                      className="max-h-full max-w-full object-contain rounded shadow-md"
                    />
                  </div>
                );
              }
              return (
                <iframe
                  src={receiptBlobUrl}
                  className="w-full h-full border-0"
                  title="Receipt"
                />
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for Replace Receipt feature */}
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls"
        className="hidden"
        onChange={handleReplaceReceiptFile}
        data-testid="input-replace-receipt-file"
      />

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeId} onOpenChange={o => !o && setRemoveId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />Remove Allocation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will remove the staff member's allocation. Any payments already linked to this allocation will remain but become unattributed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveAlloc} disabled={removing} data-testid="button-confirm-remove-alloc">
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
