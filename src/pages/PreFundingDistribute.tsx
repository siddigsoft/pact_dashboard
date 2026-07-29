import { useState, useEffect, useCallback } from 'react';
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
import {
  Banknote, RefreshCw, Users, Search, Plus, Trash2,
  AlertTriangle, Check, X, ChevronDown, ChevronRight, Wallet,
  TrendingDown, Info, Paperclip, ExternalLink, Upload, Receipt,
  FileImage, FileText, CheckCircle2, ArrowLeft, ShieldCheck,
  AlertCircle, Clock, History, Lock,
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

export default function PreFundingDistribute() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const isFinanceAdmin = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

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
  const [topUpDialog, setTopUpDialog] = useState<{ open: boolean; alloc: Allocation | null; fundId: string; fund: HeldFund | null }>({ open: false, alloc: null, fundId: '', fund: null });
  const [topUpAmt, setTopUpAmt]           = useState('');
  const [topUpReceiptFiles, setTopUpReceiptFiles] = useState<File[]>([]);
  const [topUpSaving, setTopUpSaving]     = useState(false);
  const [topUpConfirmStep, setTopUpConfirmStep] = useState(false);

  // Receipt viewer popup
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

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
        .from('pre_fund_transactions')
        .select('id,source_table,source_id,amount,transaction_date,description,reference,currency,user_id,created_by')
        .eq('pre_fund_request_id', fundId)
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

      // Enrich OCS-linked transactions. Track which source_ids were matched so
      // unresolved ones are added as fallback manual entries (not silently dropped).
      const matchedOcsIds = new Set<string>();
      if (ocsIds.length > 0) {
        const { data: ocsData } = await (supabase as any)
          .from('operational_cost_submissions')
          .select('id,submitted_by,expense_category,description,amount_cents,amount_paid_cents,status,paid_at,submitted_at')
          .in('id', ocsIds);
        (ocsData ?? []).forEach((o: any) => {
          matchedOcsIds.add(o.id);
          const txn = ocsTxns.find((t: any) => t.source_id === o.id);
          // Use the transaction amount as the authoritative amount (it is recorded in
          // SDG/local currency). Fall back to amount_paid_cents/amount_cents only when
          // the transaction row itself has no amount.
          const txnAmt = Number(txn?.amount ?? 0);
          payments.push({
            ...o,
            _type: 'ocs',
            _txn_amount: txnAmt || (o.amount_paid_cents ?? o.amount_cents ?? 0) / 100,
            _txn_date: txn?.transaction_date,
          });
        });
        // Unresolved OCS transactions → fallback manual entries so they aren't dropped
        ocsTxns
          .filter((t: any) => !matchedOcsIds.has(t.source_id))
          .forEach((t: any) => {
            payments.push({
              ...t, _type: 'manual', _txn_amount: Number(t.amount) || 0,
              _txn_date: t.transaction_date, amount: Number(t.amount) || 0,
              description: t.description || 'Cost submission (details unavailable)',
              status: 'paid',
            });
          });
      }

      // Enrich DP-linked transactions with same fallback pattern
      const matchedDpIds = new Set<string>();
      if (dpIds.length > 0) {
        const { data: dpData } = await (supabase as any)
          .from('down_payment_requests')
          .select('id,requested_by,purpose,amount,currency,status,approved_at,created_at')
          .in('id', dpIds);
        (dpData ?? []).forEach((dp: any) => {
          matchedDpIds.add(dp.id);
          const txn = dpTxns.find((t: any) => t.source_id === dp.id);
          // Prefer the recorded transaction amount over the DP requested amount
          const txnAmt = Number(txn?.amount ?? 0);
          payments.push({
            ...dp,
            _type: 'dp',
            _txn_amount: txnAmt || Number(dp.amount) || 0,
            _txn_date: txn?.transaction_date,
            amount: txnAmt || Number(dp.amount) || 0,
          });
        });
        // Unresolved DP transactions → fallback manual entries
        dpTxns
          .filter((t: any) => !matchedDpIds.has(t.source_id))
          .forEach((t: any) => {
            payments.push({
              ...t, _type: 'manual', _txn_amount: Number(t.amount) || 0,
              _txn_date: t.transaction_date, amount: Number(t.amount) || 0,
              description: t.description || 'Down payment (details unavailable)',
              status: 'paid',
            });
          });
      }

      // Manual / other transactions — always included
      otherTxns.forEach((t: any) => {
        payments.push({
          ...t,
          _type: 'manual',
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
  }
  interface AllocMeta { text: string; top_up_count: number; top_up_log: TopUpLogEntry[] }

  /** Parse the notes field — may be plain text or JSON-encoded audit metadata. */
  const parseAllocMeta = (notes: string | null): AllocMeta => {
    if (!notes) return { text: '', top_up_count: 0, top_up_log: [] };
    try {
      const p = JSON.parse(notes);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return { text: p.text ?? '', top_up_count: Number(p.top_up_count ?? 0), top_up_log: p.top_up_log ?? [] };
      }
    } catch {}
    return { text: notes, top_up_count: 0, top_up_log: [] };
  };

  /** Append a top-up entry to notes JSON and return the updated notes string. */
  const buildAllocMeta = (existing: string | null, entry: TopUpLogEntry): string => {
    const m = parseAllocMeta(existing);
    return JSON.stringify({ text: m.text, top_up_count: m.top_up_count + 1, top_up_log: [...m.top_up_log, entry] });
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

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      // Load funds held by this user (or all funds for finance admin in overview mode)
      let q = (supabase as any)
        .from('pre_fund_requests')
        .select('id,name,source,amount,currency,available_balance,paid_amount,status')
        .order('created_at', { ascending: false });
      if (!isFinanceAdmin) q = q.eq('holder_user_id', currentUser.id);
      else q = q.not('holder_user_id', 'is', null);
      const { data: fundsData, error: fErr } = await q;
      if (fErr && !fErr.message.includes('does not exist')) throw fErr;
      setFunds((fundsData as HeldFund[]) ?? []);

      // Load staff profiles for the user picker
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .order('full_name');
      setStaff((profiles as any) ?? []);

      // Load this user's OWN allocations (so staff can see what they received + request more)
      const { data: myAllocs } = await (supabase as any)
        .from('pre_fund_allocations')
        .select('id,pre_fund_request_id,allocated_amount,spent_amount,currency,notes,receipt_url')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (myAllocs && myAllocs.length > 0) {
        // Enrich with fund name/source/status/holder
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
          .from('pre_fund_transactions')
          .select('id,user_id,created_by,source_table,source_id,amount,transaction_type')
          .eq('pre_fund_request_id', fundId),
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
          // Use whichever is higher — txn-computed or stored column
          spent_amount: Math.max(txnSpent, storedSpent),
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
      const uploaded = await uploadMultipleReceipts(topUpReceiptFiles, fundId, alloc.user_id);
      if (!uploaded) { setTopUpSaving(false); return; }
      const newTotal = alloc.allocated_amount + increment;
      const newNotes = buildAllocMeta(alloc.notes, {
        date: new Date().toISOString(),
        amount: increment,
        previous_total: alloc.allocated_amount,
        new_total: newTotal,
        by_user_id: currentUser?.id ?? '',
        by_name: currentUser?.full_name ?? currentUser?.email ?? 'Unknown',
        receipt_url: uploaded,
      });
      const { error } = await (supabase as any)
        .from('pre_fund_allocations')
        .update({ allocated_amount: newTotal, receipt_url: uploaded, notes: newNotes })
        .eq('id', alloc.id);
      if (error) throw error;
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
      setTopUpConfirmStep(false);
      await loadAllocations(fundId);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setTopUpSaving(false);
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

                {/* KPI mini-row */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {[
                    { label: 'Fund Total',   value: formatNumber(fund.amount, 0),           icon: Wallet,       cls: 'text-sky-600' },
                    { label: 'Allocated',    value: formatNumber(totalAllocated, 0),         icon: Users,        cls: 'text-violet-600' },
                    { label: 'Spent',        value: formatNumber(totalSpent, 0),             icon: TrendingDown, cls: totalSpent > totalAllocated ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'Unallocated',  value: formatNumber(Math.max(0, remaining), 0), icon: Check,        cls: remaining < 0 ? 'text-rose-600' : 'text-teal-600' },
                  ].map(k => (
                    <div key={k.label} className="flex flex-col">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                      <span className={cn('text-sm font-bold tabular-nums', k.cls)}>{fund.currency} {k.value}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Allocated {usagePct}%</span>
                    <span>{formatNumber(remaining, 0)} {fund.currency} still available to allocate</span>
                  </div>
                  <Progress
                    value={usagePct}
                    className={cn('h-1.5', usagePct >= 100 ? '[&>div]:bg-rose-500' : usagePct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-sky-500')}
                  />
                </div>

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
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {formatNumber(a.spent_amount, 0)} spent · {rem >= 0 ? formatNumber(rem, 0) : `−${formatNumber(-rem, 0)}`} left
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

                          {/* ── Payment details panel ── */}
                          {isExpanded && (
                            <div id={`alloc-detail-${a.id}`} className="border-t border-border/40 bg-background/60 px-3 py-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />
                                Fund Payment History / سجل المدفوعات
                              </p>
                              {isPaymentsLoading && (
                                <div className="space-y-1.5">
                                  {[1,2,3].map(i => <div key={i} className="h-7 rounded bg-muted animate-pulse" />)}
                                </div>
                              )}
                              {!isPaymentsLoading && payments.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-3">
                                  No payment transactions recorded for this fund yet.
                                </p>
                              )}
                              {/* ── Top-Up Audit Log ── */}
                              {(() => {
                                const m = parseAllocMeta(a.notes);
                                if (m.top_up_log.length === 0) return null;
                                return (
                                  <div className="mt-3 pt-3 border-t border-border/30">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
                                      <History className="h-3 w-3" />Top-Up Audit Log ({m.top_up_log.length} change{m.top_up_log.length > 1 ? 's' : ''})
                                    </p>
                                    <div className="space-y-1.5">
                                      {m.top_up_log.map((entry, i) => (
                                        <div key={i} className="flex items-start gap-2 rounded-md border border-violet-200/60 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/20 px-2.5 py-1.5 text-[11px]">
                                          <Clock className="h-3 w-3 mt-0.5 text-violet-500 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 flex-wrap">
                                              <span className="font-semibold text-violet-700 dark:text-violet-300">
                                                +{fund.currency} {formatNumber(entry.amount, 0)}
                                              </span>
                                              <span className="text-muted-foreground">
                                                {format(new Date(entry.date), 'dd MMM yyyy HH:mm')}
                                              </span>
                                            </div>
                                            <div className="text-muted-foreground mt-0.5">
                                              by <span className="font-medium">{entry.by_name}</span>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                              {formatNumber(entry.previous_total, 0)} → {formatNumber(entry.new_total, 0)} {fund.currency}
                                            </div>
                                            {entry.receipt_url && (
                                              <button
                                                onClick={() => setViewReceiptUrl(parseReceiptUrls(entry.receipt_url)[0] ?? null)}
                                                className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-700 underline mt-0.5"
                                              >
                                                <Receipt className="h-2.5 w-2.5" />View receipt
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                              {!isPaymentsLoading && payments.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Date</th>
                                        <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Type / Category</th>
                                        <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Description</th>
                                        <th className="text-right py-1.5 text-muted-foreground font-medium">Amount</th>
                                        <th className="text-left py-1.5 pl-3 text-muted-foreground font-medium">Status</th>
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
                                        const category = p._type === 'ocs'
                                          ? (catLabel[p.expense_category] ?? p.expense_category ?? '—')
                                          : p._type === 'manual'
                                            ? (p.reference ? `Manual · ${p.reference}` : 'Manual Entry')
                                            : 'Down Payment';
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
                    type="file" accept="image/*,.pdf" multiple className="hidden"
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
      <Dialog open={topUpDialog.open} onOpenChange={o => { if (!o) { setTopUpDialog({ open: false, alloc: null, fundId: '', fund: null }); setTopUpConfirmStep(false); } }}>
        <DialogContent className="max-w-sm">
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
                  <div className="space-y-3 py-1">
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
                <div className="space-y-4 py-1">

                  {/* ── Fund pool balance ── */}
                  {fundDialogData && (
                    <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2 text-[11px]">
                      <p className="font-semibold text-sky-700 dark:text-sky-300 mb-1.5 flex items-center gap-1">
                        <Wallet className="h-3 w-3" />Fund Pool — {fundDialogData.name}
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Total</p>
                          <p className="font-mono font-bold text-sky-700 dark:text-sky-300 mt-0.5">{formatNumber(fundDialogData.amount, 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Allocated</p>
                          <p className="font-mono font-semibold text-violet-600 mt-0.5">{formatNumber(totalAllocatedForFund, 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px]">Available</p>
                          <p className={cn('font-mono font-bold mt-0.5', (fundAvailable ?? 0) <= 0 ? 'text-rose-600' : 'text-emerald-600')}>
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
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Allocated</p>
                      <p className="font-mono font-semibold text-[13px] mt-0.5">{formatNumber(alloc.allocated_amount, 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Spent</p>
                      <p className="font-mono font-semibold text-[13px] mt-0.5 text-rose-600">{formatNumber(alloc.spent_amount, 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</p>
                      <p className={cn('font-mono font-bold text-[13px] mt-0.5', balance >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {formatNumber(balance, 0)}
                      </p>
                    </div>
                  </div>

                  {/* Top-up amount — disabled when holder is locked */}
                  {!holderLocked && (
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
                  )}

                  {/* Receipt upload — only when not locked */}
                  {!holderLocked && (
                    <div>
                      <Label className="text-xs mb-2 flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />Receipt of Fund Sent <span className="text-destructive">*</span>
                      </Label>
                      {topUpReceiptFiles.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {topUpReceiptFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30">
                              {f.type.startsWith('image/') ? <FileImage className="h-3.5 w-3.5 text-sky-600 shrink-0" /> : <FileText className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                              <span className="truncate flex-1 text-[12px]">{f.name}</span>
                              <button onClick={() => setTopUpReceiptFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-topup-receipt-upload">
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">
                          {topUpReceiptFiles.length > 0 ? 'Add more receipts…' : 'Attach receipt — image or PDF'}
                        </span>
                        <input
                          type="file" accept="image/*,.pdf" multiple className="hidden"
                          onChange={e => setTopUpReceiptFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
                          data-testid="input-topup-receipt-file"
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Info className="h-3 w-3" />A receipt is required for every top-up transaction.
                      </p>
                    </div>
                  )}

                  {/* ── Audit Log (shown to admins and when log exists) ── */}
                  {(isFinanceAdmin || allocMeta.top_up_log.length > 0) && allocMeta.top_up_log.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
                        <History className="h-3 w-3" />Top-Up Audit Log
                      </p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {allocMeta.top_up_log.map((entry, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5 text-[11px]">
                            <Clock className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 flex-wrap">
                                <span className="font-medium text-sky-700 dark:text-sky-300">+{alloc.currency} {formatNumber(entry.amount, 0)}</span>
                                <span className="text-muted-foreground">{format(new Date(entry.date), 'dd MMM yyyy HH:mm')}</span>
                              </div>
                              <div className="text-muted-foreground truncate">by {entry.by_name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatNumber(entry.previous_total, 0)} → {formatNumber(entry.new_total, 0)} {alloc.currency}
                              </div>
                            </div>
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
            {viewReceiptUrl && (
              <a
                href={viewReceiptUrl} target="_blank" rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 border border-sky-200 rounded px-2 py-1"
              >
                <ExternalLink className="h-3 w-3" />Open in new tab
              </a>
            )}
          </DialogHeader>
          <div className="w-full" style={{ height: '70vh' }}>
            {viewReceiptUrl && (() => {
              const lower = viewReceiptUrl.toLowerCase().split('?')[0];
              const isImage = ['.png','.jpg','.jpeg','.gif','.webp','.bmp'].some(e => lower.endsWith(e));
              if (isImage) {
                return (
                  <div className="flex items-center justify-center h-full bg-muted/30 p-4">
                    <img
                      src={viewReceiptUrl}
                      alt="Receipt"
                      className="max-h-full max-w-full object-contain rounded shadow-md"
                      onError={e => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.receipt-error')) {
                          const err = document.createElement('div');
                          err.className = 'receipt-error flex flex-col items-center gap-2 text-muted-foreground text-sm';
                          err.innerHTML = '<span class="text-3xl">🖼️</span><p>Image could not be loaded.</p><p class="text-xs">The file may have been stored in an older location. Please re-upload the receipt.</p>';
                          parent.appendChild(err);
                        }
                      }}
                    />
                  </div>
                );
              }
              return (
                <div className="relative w-full h-full">
                  <iframe
                    src={viewReceiptUrl}
                    className="w-full h-full border-0"
                    title="Receipt"
                    onLoad={e => {
                      try {
                        const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
                        const text = doc?.body?.innerText ?? '';
                        if (text.includes('Bucket not found') || text.includes('"error"')) {
                          const body = doc?.body;
                          if (body) {
                            body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#64748b;font-family:sans-serif;padding:24px;text-align:center">
                              <div style="font-size:2.5rem">📄</div>
                              <p style="font-weight:600;font-size:14px">Receipt not available</p>
                              <p style="font-size:12px;max-width:280px">This receipt was stored in an older location. Please re-upload it using the Add Funds button.</p>
                            </div>`;
                          }
                        }
                      } catch {/* cross-origin — ignore */}
                    }}
                  />
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

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
