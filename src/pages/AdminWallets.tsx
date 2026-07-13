import { useEffect, useMemo, useRef, useState, type FC, Fragment } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { useNavigate } from 'react-router-dom';
import { DataFreshnessBadge } from '@/components/realtime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WalletCard } from '@/components/wallet/WalletCard';
import { supabase } from '@/integrations/supabase/client';
import { adminListWallets } from '@/context/wallet/supabase';
import { Search, RefreshCw, Wallet as WalletIcon, Zap, TrendingUp, Activity, DollarSign, Grid3x3, Table2, ChevronDown, ChevronRight, MapPin, Calendar, Settings, Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, PlayCircle, Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BalanceAdjustmentDialog } from '@/components/wallet/BalanceAdjustmentDialog';
import { exportTransactionsToCSV, exportTransactionsToPDF } from '@/lib/wallet/export';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const fmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

// Module-level cache — survives tab switches, avoids refetching on every mount
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let _walletCache: { rows: any[]; currency: string; ts: number } | null = null;

const AdminWallets: FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('SDG');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [transactionDetails, setTransactionDetails] = useState<Record<string, any[]>>({});
  const [adjustmentDialog, setAdjustmentDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    currentBalance: number;
  }>({ open: false, userId: '', userName: '', currentBalance: 0 });
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  // All users from context — bypasses RLS so we see all 221 users regardless
  const { users } = useUser();

  // ── SQL bypass pre-flight ───────────────────────────────────────────────────
  // Detects whether the admin RLS bypass SQL has been applied.
  // If not applied, the admin can only see their own wallet (1 row) and backfill writes fail.
  const [sqlReady, setSqlReady] = useState<boolean | null>(null); // null = checking

  // ── Backfill state ─────────────────────────────────────────────────────────
  const [backfillScan, setBackfillScan] = useState<{
    scanned: boolean;
    missing: { id: string; siteName: string; userName: string; userId: string; fee: number }[];
    totalCompleted: number;
    alreadyCredited: number;
    noFee: number;
    noUser: number;
  } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0, skipped: 0 });
  const [backfillLastError, setBackfillLastError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  const syncAndRecalculateAll = async () => {
    setSyncingAll(true);
    const walletsToSync = rows.filter(r => {
      const balance = r.balances?.[currency] || 0;
      const earned = Number(r.totalEarned || 0);
      return balance > 0 || earned > 0;
    });
    const total = walletsToSync.length;
    setSyncProgress({ current: 0, total });

    let successCount = 0;
    let errorCount = 0;
    let correctedTxCount = 0;

    for (let i = 0; i < walletsToSync.length; i++) {
      const w = walletsToSync[i];
      setSyncProgress({ current: i + 1, total });

      try {
        const userId = w.user_id;
        const walletId = w.id;

        const { data: allTransactions, error: txError } = await supabase
          .from('wallet_transactions')
          .select('id, amount, type, currency, site_visit_id, related_site_visit_id, description')
          .eq('user_id', userId);

        if (txError) throw txError;

        const earningTxs = (allTransactions || []).filter((tx: any) =>
          (tx.type === 'earning' || tx.type === 'site_visit_fee') &&
          (tx.site_visit_id || tx.related_site_visit_id)
        );

        if (earningTxs.length > 0) {
          const siteEntryIds = earningTxs
            .map((tx: any) => tx.site_visit_id || tx.related_site_visit_id)
            .filter(Boolean) as string[];

          const { data: entries } = await supabase
            .from('mmp_site_entries')
            .select('id, site_name, site_code, enumerator_fee, transport_fee, cost')
            .in('id', siteEntryIds);

          const entryDataMap = new Map(
            (entries || []).map((e: any) => {
              const enumFee = Number(e.enumerator_fee || 0);
              const transportFee = Number(e.transport_fee || 0);
              const storedCost = Number(e.cost || 0);
              const calculatedTotal = enumFee + transportFee;
              const totalFee = calculatedTotal > 0 ? calculatedTotal : (storedCost > 0 ? storedCost : 0);
              return [e.id, { totalFee, siteName: e.site_name || '' }];
            })
          );

          for (const tx of earningTxs) {
            const entryId = tx.site_visit_id || tx.related_site_visit_id;
            if (!entryId) continue;
            const entryData = entryDataMap.get(entryId);
            if (!entryData || entryData.totalFee <= 0) continue;

            let needsUpdate = false;
            const updatePayload: Record<string, any> = {};

            if (Math.abs(Number(tx.amount) - entryData.totalFee) >= 0.01) {
              updatePayload.amount = entryData.totalFee;
              needsUpdate = true;
            }

            if (entryData.siteName) {
              const correctDesc = `Site visit completed: ${entryData.siteName}`;
              if (tx.description !== correctDesc) {
                updatePayload.description = correctDesc;
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              await supabase
                .from('wallet_transactions')
                .update(updatePayload)
                .eq('id', tx.id);
              correctedTxCount++;
            }
          }
        }

        const { data: refreshedTxs } = await supabase
          .from('wallet_transactions')
          .select('amount, type, currency')
          .eq('user_id', userId);

        let newTotalEarned = 0;
        let newTotalWithdrawn = 0;
        const balancesByCurrency: Record<string, number> = {};

        for (const tx of (refreshedTxs || [])) {
          const amt = Number(tx.amount || 0);
          const txCurrency = tx.currency || currency;
          if (!balancesByCurrency[txCurrency]) balancesByCurrency[txCurrency] = 0;

          if (['earning', 'site_visit_fee', 'adjustment', 'bonus'].includes(tx.type)) {
            newTotalEarned += amt;
            balancesByCurrency[txCurrency] += amt;
          } else if (['withdrawal', 'penalty', 'debit'].includes(tx.type)) {
            newTotalWithdrawn += Math.abs(amt);
            balancesByCurrency[txCurrency] -= Math.abs(amt);
          }
        }

        await supabase
          .from('wallets')
          .update({
            total_earned: newTotalEarned,
            total_withdrawn: newTotalWithdrawn,
            balances: balancesByCurrency,
            updated_at: new Date().toISOString(),
          })
          .eq('id', walletId);

        successCount++;
      } catch (err) {
        errorCount++;
      }
    }

    toast({
      title: 'Bulk Sync Complete',
      description: `${successCount} wallets synced${correctedTxCount > 0 ? `, ${correctedTxCount} transactions corrected` : ''}${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
      variant: errorCount > 0 ? 'destructive' : 'default',
    });

    await load({ force: true });
    setSyncingAll(false);
    setSyncProgress({ current: 0, total: 0 });
  };

  // ── Scan for completed sites missing wallet credits ────────────────────────
  const scanMissingFees = async () => {
    setBackfillScan(null);
    try {
      // Step 1: get all credited site_visit_ids via SECURITY DEFINER RPC (bypasses RLS)
      const { data: rpcData } = await supabase.rpc('admin_get_wallet_data');
      const allTxns: any[] = rpcData?.transactions || [];
      const creditedIds = new Set(
        allTxns
          .filter((t: any) => t.site_visit_id && (t.type === 'earning' || t.type === 'site_visit_fee'))
          .map((t: any) => t.site_visit_id)
      );

      // Step 2: Fetch fee-eligible entries — all terminal statuses (case-sensitive as stored in DB)
      // Verified from live DB: accepted(836), submitted(649), Completed(380), Accepted(370),
      // verified(263), Approved and Costed(204), approved(131)
      const FEE_STATUSES = [
        'accepted', 'submitted', 'Completed', 'Accepted', 'verified',
        'Approved and Costed', 'approved', 'wfp_confirmed', 'completed',
      ];
      let allEntries: any[] = [];
      let offset = 0;
      const BATCH = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, accepted_by, visit_completed_by, completed_by_user_id, enumerator_fee, transport_fee, cost')
          .in('status', FEE_STATUSES)
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allEntries = allEntries.concat(data);
        if (data.length < BATCH) break;
        offset += BATCH;
      }

      const totalCompleted = allEntries.length;

      // Step 3: Collect all candidate user UUIDs from both fields, then batch-fetch profiles.
      // We MUST verify each UUID exists in profiles — wallets.user_id has a FK to profiles,
      // so inserting a wallet or transaction for a non-existent profile causes FK violation.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const candidateIds = new Set<string>();
      for (const e of allEntries) {
        if (e.completed_by_user_id && uuidRegex.test(String(e.completed_by_user_id).trim()))
          candidateIds.add(String(e.completed_by_user_id).trim());
        if (e.visit_completed_by && uuidRegex.test(String(e.visit_completed_by).trim()))
          candidateIds.add(String(e.visit_completed_by).trim());
        if (e.accepted_by && uuidRegex.test(String(e.accepted_by).trim()))
          candidateIds.add(String(e.accepted_by).trim());
      }
      const profileMap: Record<string, string> = {};
      const validProfileIds = new Set<string>();
      const candidateArr = [...candidateIds];
      // Fetch in batches of 500 to stay within URL length limits
      for (let pi = 0; pi < candidateArr.length; pi += 500) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', candidateArr.slice(pi, pi + 500));
        for (const p of profiles || []) {
          profileMap[p.id] = p.full_name || p.email || p.id;
          validProfileIds.add(p.id);
        }
      }

      // Step 4: Classify each entry
      let alreadyCredited = 0;
      let noFee = 0;
      let noUser = 0;
      const missing: { id: string; siteName: string; userName: string; fee: number }[] = [];

      for (const e of allEntries) {
        const fee = (Number(e.enumerator_fee || 0) + Number(e.transport_fee || 0)) || Number(e.cost || 0);

        if (creditedIds.has(e.id)) { alreadyCredited++; continue; }
        if (fee <= 0)              { noFee++;           continue; }

        // Resolve the payee: completed_by_user_id (uuid FK) takes priority,
        // then visit_completed_by, then accepted_by (text field, may contain UUID).
        const completedByUserId = e.completed_by_user_id && uuidRegex.test(String(e.completed_by_user_id).trim())
          ? String(e.completed_by_user_id).trim() : null;
        const visitCompletedBy = e.visit_completed_by && uuidRegex.test(String(e.visit_completed_by).trim())
          ? String(e.visit_completed_by).trim() : null;
        const acceptedBy = e.accepted_by && uuidRegex.test(String(e.accepted_by).trim())
          ? String(e.accepted_by).trim() : null;
        // Pick the first candidate that actually exists in profiles (FK-safe)
        const effectiveUserId =
          (completedByUserId && validProfileIds.has(completedByUserId) ? completedByUserId : null) ||
          (visitCompletedBy && validProfileIds.has(visitCompletedBy) ? visitCompletedBy : null) ||
          (acceptedBy && validProfileIds.has(acceptedBy) ? acceptedBy : null);

        // No valid payee with a matching profile → count as no-user, skip backfill
        if (!effectiveUserId) { noUser++; continue; }

        const userName = profileMap[effectiveUserId] || effectiveUserId;
        missing.push({ id: e.id, siteName: e.site_name || 'Unknown site', userName, userId: effectiveUserId, fee });
      }

      setBackfillScan({ scanned: true, missing, totalCompleted, alreadyCredited, noFee, noUser });
    } catch (err: any) {
      toast({ title: 'Scan Failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  // ── Run backfill via SECURITY DEFINER RPC (bypasses all RLS server-side) ─────
  const runBackfillAll = async () => {
    if (!backfillScan || backfillScan.missing.length === 0) return;
    setBackfilling(true);
    setBackfillLastError(null);
    const sites = backfillScan.missing;
    const total = sites.length;
    let succeeded = 0, failed = 0, skipped = 0;
    let firstError: string | null = null;
    setBackfillProgress({ current: 0, total, succeeded, failed, skipped });

    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      try {
        const { data: result, error: rpcErr } = await supabase
          .rpc('admin_backfill_site_visit_credit', { p_site_visit_id: site.id });

        if (rpcErr) {
          failed++;
          if (!firstError) firstError = rpcErr.message;
        } else if (result?.success) {
          if (result?.skipped) skipped++;
          else succeeded++;
        } else {
          const msg: string = result?.message || 'Unknown RPC error';
          if (msg.toLowerCase().includes('already')) skipped++;
          else { failed++; if (!firstError) firstError = msg; }
        }
      } catch (err: any) {
        failed++;
        if (!firstError) firstError = err?.message || 'Unknown exception';
      }

      setBackfillProgress({ current: i + 1, total, succeeded, failed, skipped });
      if (firstError) setBackfillLastError(firstError);
    }

    await scanMissingFees();
    await load({ force: true });

    toast({
      title: 'Backfill Complete',
      description: `${succeeded} wallets credited · ${skipped} already done · ${failed} failed`,
      variant: failed > 0 ? 'destructive' : 'default',
    });

    setBackfilling(false);
  };

  const load = async (opts?: { force?: boolean }) => {
    // Serve from cache immediately if fresh — avoids re-fetch on every tab switch
    if (!opts?.force && _walletCache && Date.now() - _walletCache.ts < CACHE_TTL_MS) {
      setRows(_walletCache.rows);
      setCurrency(_walletCache.currency);
      return;
    }

    // Use SECURITY DEFINER RPC to bypass RLS — direct table queries are RLS-limited
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('admin_get_wallet_data');

    const walletData: any[] = rpcErr
      ? (await adminListWallets({ pageSize: 500 }))   // fallback
      : (rpcResult?.wallets || []).map((w: any) => ({
          ...w,
          owner_name: w.full_name || w.username || w.email || w.user_id,
          profiles: { full_name: w.full_name, email: w.email, username: w.username },
        }));

    const txList: any[] = rpcErr
      ? []
      : (rpcResult?.transactions || []);

    // Build maps
    const walletByUserId = new Map((walletData || []).map((w: any) => [w.user_id, w]));

    const earnedByUser: Record<string, number> = {};
    const withdrawnByUser: Record<string, number> = {};
    const txCountByUser: Record<string, number> = {};
    const siteVisitsByUser: Record<string, number> = {};
    const walletIdByUser: Record<string, string> = {};

    txList.forEach((tx: any) => {
      const uid = tx.user_id;
      if (!uid) return;
      if (tx.wallet_id) walletIdByUser[uid] = tx.wallet_id;
      txCountByUser[uid] = (txCountByUser[uid] || 0) + 1;
      if (tx.site_visit_id) siteVisitsByUser[uid] = (siteVisitsByUser[uid] || 0) + 1;
      const amt = Number(tx.amount || 0);
      if (tx.type === 'earning' || tx.type === 'site_visit_fee' || tx.type === 'adjustment' || amt > 0) {
        earnedByUser[uid] = (earnedByUser[uid] || 0) + Math.abs(amt);
      }
      if (tx.type === 'withdrawal' || amt < 0) {
        withdrawnByUser[uid] = (withdrawnByUser[uid] || 0) + Math.abs(amt);
      }
    });

    // Build merged rows: all users from context + wallet data merged on top
    const activeUsers = (users || []).filter(
      (u: any) => u.isApproved || u.profileStatus === 'approved' || u.profileStatus === 'active'
    );
    const coveredIds = new Set(activeUsers.map((u: any) => u.id));

    const buildRow = (userId: string, name?: string, email?: string) => {
      const w: any = walletByUserId.get(userId);
      const balance = w?.balances
        ? Object.values(w.balances as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
        : 0;
      const storedEarned = Number(w?.total_earned || 0);
      const storedWithdrawn = Number(w?.total_withdrawn || 0);
      return {
        ...(w || {}),
        id: w?.id || walletIdByUser[userId] || null,
        user_id: userId,
        owner_name: w?.owner_name || name || email || userId,
        profiles: w?.profiles || { full_name: name, email },
        balances: w?.balances || { SDG: 0 },
        totalEarned: Math.max(storedEarned, earnedByUser[userId] || 0),
        totalWithdrawn: Math.max(storedWithdrawn, withdrawnByUser[userId] || 0),
        _txCount: txCountByUser[userId] || 0,
        _siteVisits: siteVisitsByUser[userId] || 0,
        _hasWallet: !!w,
        _balance: balance,
      };
    };

    const merged: any[] = activeUsers.map((u: any) => buildRow(u.id, u.name || u.full_name, u.email));

    // Also include any wallet whose owner isn't in the active-users list
    (walletData || []).forEach((w: any) => {
      if (!coveredIds.has(w.user_id)) {
        merged.push(buildRow(w.user_id));
      }
    });

    // Sort: wallets with balance/earnings first, then alphabetically
    merged.sort((a, b) => {
      const aScore = (a._balance || 0) + (a.totalEarned || 0);
      const bScore = (b._balance || 0) + (b.totalEarned || 0);
      if (bScore !== aScore) return bScore - aScore;
      return (a.owner_name || '').localeCompare(b.owner_name || '');
    });

    const c = walletData && walletData[0]?.balances ? Object.keys(walletData[0].balances)[0] : 'SDG';
    // Save to module-level cache so next mount is instant
    _walletCache = { rows: merged, currency: c, ts: Date.now() };
    setRows(merged);
    setCurrency(c);
  };

  const loadTransactionDetails = async (walletId: string) => {
    if (transactionDetails[walletId]) return; // Already loaded

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTransactionDetails(prev => ({ ...prev, [walletId]: data }));
    }
  };

  const toggleWalletExpansion = async (walletId: string) => {
    const newExpanded = new Set(expandedWallets);
    if (newExpanded.has(walletId)) {
      newExpanded.delete(walletId);
    } else {
      newExpanded.add(walletId);
      await loadTransactionDetails(walletId);
    }
    setExpandedWallets(newExpanded);
  };

  const handleAdjustBalance = (wallet: any) => {
    const balance = wallet.balances?.[currency] || 0;
    setAdjustmentDialog({
      open: true,
      userId: wallet.user_id,
      userName: wallet.owner_name || wallet.profiles?.full_name || 'Unknown',
      currentBalance: balance,
    });
  };

  const handleExportCSV = async (wallet: any) => {
    try {
      const wId = wallet.id;
      if (!wId) {
        toast({ title: 'No wallet yet', description: 'This user has no wallet transactions to export.', variant: 'destructive' });
        return;
      }
      const transactions = transactionDetails[wId] || [];
      if (transactions.length === 0) {
        await loadTransactionDetails(wId);
      }
      // Transform Supabase snake_case to camelCase WalletTransaction format
      const txs = (transactionDetails[wId] || []).map((tx: any) => ({
        id: tx.id,
        walletId: tx.wallet_id,
        userId: tx.user_id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        currency: tx.currency,
        siteVisitId: tx.site_visit_id,
        withdrawalRequestId: tx.withdrawal_request_id,
        description: tx.description,
        metadata: tx.metadata,
        balanceBefore: tx.balance_before ? parseFloat(tx.balance_before) : undefined,
        balanceAfter: tx.balance_after ? parseFloat(tx.balance_after) : undefined,
        createdBy: tx.created_by,
        createdAt: tx.created_at,
      }));
      const walletObj = {
        id: wallet.id,
        userId: wallet.user_id,
        balances: wallet.balances || {},
        totalEarned: Number(wallet.total_earned || 0),
        totalWithdrawn: Number(wallet.total_withdrawn || 0),
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
      };
      exportTransactionsToCSV(txs, walletObj, `wallet_${wallet.owner_name || 'user'}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      toast({
        title: 'Export Successful',
        description: 'Wallet statement exported to CSV',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export wallet statement',
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = async (wallet: any) => {
    try {
      const wId = wallet.id;
      if (!wId) {
        toast({ title: 'No wallet yet', description: 'This user has no wallet transactions to export.', variant: 'destructive' });
        return;
      }
      const transactions = transactionDetails[wId] || [];
      if (transactions.length === 0) {
        await loadTransactionDetails(wId);
      }
      // Transform Supabase snake_case to camelCase WalletTransaction format
      const txs = (transactionDetails[wId] || []).map((tx: any) => ({
        id: tx.id,
        walletId: tx.wallet_id,
        userId: tx.user_id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        currency: tx.currency,
        siteVisitId: tx.site_visit_id,
        withdrawalRequestId: tx.withdrawal_request_id,
        description: tx.description,
        metadata: tx.metadata,
        balanceBefore: tx.balance_before ? parseFloat(tx.balance_before) : undefined,
        balanceAfter: tx.balance_after ? parseFloat(tx.balance_after) : undefined,
        createdBy: tx.created_by,
        createdAt: tx.created_at,
      }));
      const walletObj = {
        id: wallet.id,
        userId: wallet.user_id,
        balances: wallet.balances || {},
        totalEarned: Number(wallet.total_earned || 0),
        totalWithdrawn: Number(wallet.total_withdrawn || 0),
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
      };
      exportTransactionsToPDF(txs, walletObj, currency, `wallet_${wallet.owner_name || 'user'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({
        title: 'Export Successful',
        description: 'Wallet statement exported to PDF',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export wallet statement',
        variant: 'destructive',
      });
    }
  };
  

  // Pre-flight: check whether admin RLS bypass SQL has been applied.
  // We ask for 2 wallet rows — if only 1 comes back the admin can only see their own wallet.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('wallets')
        .select('id')
        .limit(2);
      setSqlReady((data?.length ?? 0) > 1);
    })();
  }, []);

  // Re-run load whenever the users list is ready/updated.
  // After the first load, kick off an auto-scan so the missing-credit count
  // is ready without the admin having to click "Scan Now" manually.
  const autoScannedRef = useRef(false);
  useEffect(() => {
    if (users && users.length > 0) {
      load().then(() => {
        if (!autoScannedRef.current) {
          autoScannedRef.current = true;
          scanMissingFees();
        }
      });
    }
  }, [users]);

  useEffect(() => {
    const id = setInterval(() => { load({ force: true }); }, 60000);
    return () => clearInterval(id);
  }, [users]);

  useEffect(() => {
    const ch = supabase
      .channel('admin_wallets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load({ force: true }));
    ch.subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  const [showZeroBalance, setShowZeroBalance] = useState(true);

  const filtered = useMemo(() => {
    let result = showZeroBalance
      ? rows
      : rows.filter(r => {
          const balance = r.balances?.[currency] || 0;
          const earned = Number(r.totalEarned || 0);
          return balance > 0 || earned > 0;
        });

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        (r.owner_name || '').toString().toLowerCase().includes(s) ||
        (r.user_id || '').toString().toLowerCase().includes(s) ||
        (r.profiles?.email || '').toString().toLowerCase().includes(s)
      );
    }

    return result;
  }, [rows, search, currency, showZeroBalance]);

  const getBalance = (wallet: any, curr: string) => (wallet.balances?.[curr] || 0) * 100;

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <WalletIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Wallets Management</h1>
            <p className="text-sm text-muted-foreground">
              Financial Operations Command Center
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/finance-approval')}
            data-testid="button-goto-finance-approval"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Finance Approval
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wallet-reports')}
            data-testid="button-goto-wallet-reports"
          >
            <Settings className="h-4 w-4 mr-2" />
            Wallet Reports
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/financial-operations')}
            data-testid="button-goto-financial-ops"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Financial Ops
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/budget')}
            data-testid="button-goto-budget"
          >
            <Activity className="h-4 w-4 mr-2" />
            Budget
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={syncAndRecalculateAll}
            disabled={syncingAll || rows.length === 0}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            data-testid="button-sync-all-wallets"
          >
            {syncingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing {syncProgress.current}/{syncProgress.total}...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Sync & Recalculate All
              </>
            )}
          </Button>
          <DataFreshnessBadge />
        </div>
      </div>

      {/* ── SQL pre-flight: only affects DISPLAY (balance totals), not backfill ── */}
      {sqlReady === false && (
        <Card className="border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                    Balance display limited — RLS read policy not applied
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Without this one-time setup, this page can only read <strong>your own</strong> wallet row, so the
                    Total Sites Cost, Total Withdrawals, and per-user balances all show SDG 0.00. <br />
                    <strong>The backfill itself works fine</strong> — it runs via a server-side edge function that
                    already bypasses RLS. Run the SQL below only if you want to see correct balance totals here.
                  </p>
                  <ol className="text-xs text-muted-foreground mt-2 space-y-0.5 list-decimal list-inside">
                    <li>Open <strong>Supabase Dashboard → SQL Editor</strong></li>
                    <li>Paste and run the SQL below (takes ~5 seconds)</li>
                    <li>Reload this page — totals will show real balances</li>
                  </ol>
                </div>
              </div>
              <pre className="text-xs bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono select-all">{`-- Admin read-access for wallets (display only — backfill already works without this)
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets" ON wallets FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superAdmin','financialAdmin'))
);
DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions" ON wallet_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superAdmin','financialAdmin'))
);`}</pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Wallet Backfill Panel ── */}
      <Card className="border-amber-300 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/10">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                Missing Wallet Credits — Site Visits
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New site visits completed through the app are credited <strong>automatically</strong> — you don't need to do anything for those.
                This panel is for <strong>historical or admin-completed visits</strong> that existed before the auto-credit system. Run the backfill once to catch them up; after that, this count should stay at 0.
              </p>

              {/* Scan result */}
              {backfillScan && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="bg-background rounded-lg border px-3 py-2">
                    <div className="text-muted-foreground">Total Completed</div>
                    <div className="font-bold text-base">{backfillScan.totalCompleted}</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                    <div className="text-muted-foreground">Already Credited</div>
                    <div className="font-bold text-base text-green-700 dark:text-green-400">{backfillScan.alreadyCredited}</div>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 ${backfillScan.missing.length > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700' : 'bg-background'}`}>
                    <div className="text-muted-foreground">Missing Credits</div>
                    <div className={`font-bold text-base ${backfillScan.missing.length > 0 ? 'text-red-700 dark:text-red-400' : ''}`}>{backfillScan.missing.length}</div>
                  </div>
                  <div className="bg-background rounded-lg border px-3 py-2">
                    <div className="text-muted-foreground">No Fee</div>
                    <div className="font-bold text-base text-muted-foreground">{backfillScan.noFee}</div>
                  </div>
                  <div className="bg-background rounded-lg border px-3 py-2">
                    <div className="text-muted-foreground">No Payee</div>
                    <div className="font-bold text-base text-muted-foreground">{backfillScan.noUser}</div>
                  </div>
                </div>
              )}

              {/* Progress bar during backfill */}
              {backfilling && backfillProgress.total > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Crediting wallets… {backfillProgress.current}/{backfillProgress.total}</span>
                    <span>
                      <span className="text-green-600">{backfillProgress.succeeded} credited</span>
                      {backfillProgress.skipped > 0 && <span className="ml-2 text-muted-foreground">{backfillProgress.skipped} skipped</span>}
                      {backfillProgress.failed > 0 && <span className="ml-2 text-red-500">{backfillProgress.failed} failed</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.round((backfillProgress.current / backfillProgress.total) * 100)}%` }}
                    />
                  </div>
                  {backfillLastError && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1 mt-1 font-mono break-all">
                      First error: {backfillLastError}
                    </div>
                  )}
                </div>
              )}
              {/* Show last error after backfill finishes */}
              {!backfilling && backfillLastError && backfillProgress.failed > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1 font-mono break-all">
                  Error detail: {backfillLastError}
                </div>
              )}

              {/* Preview list of first 10 missing */}
              {backfillScan && backfillScan.missing.length > 0 && !backfilling && (
                <div className="mt-3 rounded-lg border bg-background overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                    Preview — first {Math.min(10, backfillScan.missing.length)} of {backfillScan.missing.length} sites missing credit
                  </div>
                  <div className="divide-y max-h-48 overflow-y-auto">
                    {backfillScan.missing.slice(0, 10).map(s => (
                      <div key={s.id} className="px-3 py-1.5 flex justify-between text-xs">
                        <span className="truncate mr-2 text-foreground/80">{s.siteName}</span>
                        <span className="flex-shrink-0 text-muted-foreground">{s.userName} · <span className="font-medium text-amber-700 dark:text-amber-400">{s.fee.toLocaleString()} SDG</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {backfillScan && backfillScan.missing.length === 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  All completed sites have wallet credits — nothing to backfill.
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={scanMissingFees}
                disabled={backfilling}
                data-testid="button-scan-missing-fees"
                className="border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              >
                {backfillScan === null ? (
                  <><Search className="h-3.5 w-3.5 mr-1.5" />Scan Now</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-scan</>
                )}
              </Button>
              {backfillScan && backfillScan.missing.length > 0 && (
                <Button
                  size="sm"
                  onClick={runBackfillAll}
                  disabled={backfilling}
                  data-testid="button-run-backfill"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {backfilling ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{backfillProgress.current}/{backfillProgress.total}</>
                  ) : (
                    <><PlayCircle className="h-3.5 w-3.5 mr-1.5" />Credit {backfillScan.missing.length} Sites</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GradientStatCard
          title="Total Sites Cost"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
          subtitle={`${filtered.length} active wallets`}
          icon={TrendingUp}
          color="blue"
          data-testid="card-stat-total-earnings"
        />

        <GradientStatCard
          title="Total Withdrawals"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
          subtitle="Paid to enumerators"
          icon={Activity}
          color="purple"
          data-testid="card-stat-total-withdrawals"
        />

        <GradientStatCard
          title="Current Balances"
          value={fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
          subtitle="Available for withdrawal"
          icon={WalletIcon}
          color="cyan"
          data-testid="card-stat-current-balances"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
          <Input 
            placeholder="Search by name, email, or user ID..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-wallets"
          />
        </div>
        <Button
          variant={showZeroBalance ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowZeroBalance(v => !v)}
          data-testid="button-toggle-zero-balance"
          className="flex-shrink-0"
        >
          {showZeroBalance ? `All Wallets (${rows.length})` : `Active Only (${filtered.length})`}
        </Button>
        <div className="flex items-center gap-2 border rounded-lg p-1 bg-muted/50">
          <Button 
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            data-testid="button-view-table"
            className="h-8"
          >
            <Table2 className="w-4 h-4 mr-2" />
            Table
          </Button>
          <Button 
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            data-testid="button-view-grid"
            className="h-8"
          >
            <Grid3x3 className="w-4 h-4 mr-2" />
            Grid
          </Button>
        </div>
        <Button 
          variant="outline" 
          onClick={load} 
          data-testid="button-refresh-wallets"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Wallets Display */}
      {filtered.length === 0 ? (
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
          <Card className="relative bg-gradient-to-br from-slate-900/90 to-blue-900/50 backdrop-blur-xl border border-blue-500/30">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl mb-6">
                <WalletIcon className="w-16 h-16 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-3">
                No Wallets Detected
              </h3>
              <p className="text-blue-300/70 text-center max-w-md text-lg">
                {search ? 'Adjust search parameters' : 'Wallet data will synchronize once enumerators complete site visits'}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : viewMode === 'table' ? (
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table2 className="w-5 h-5" />
              Detailed Wallet Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-blue-500/20 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-bold">User</TableHead>
                    <TableHead className="font-bold">Email</TableHead>
                    <TableHead className="font-bold text-right">Current Balance</TableHead>
                    <TableHead className="font-bold text-right">
                      <div className="flex flex-col">
                        <span>Earnings Breakdown</span>
                        <span className="text-xs font-normal text-muted-foreground">(Site Visits / Retainer)</span>
                      </div>
                    </TableHead>
                    <TableHead className="font-bold text-right">Total Withdrawn</TableHead>
                    <TableHead className="font-bold text-center">Status</TableHead>
                    <TableHead className="font-bold">Last Updated</TableHead>
                    <TableHead className="font-bold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(wallet => {
                    const rowKey = wallet.user_id || wallet.id;
                    const walletId = wallet.id; // may be null if no wallet row yet
                    const balance = (wallet.balances?.[currency] || 0);
                    const earned = Number(wallet.totalEarned || 0);
                    const withdrawn = Number(wallet.totalWithdrawn || 0);
                    const isActive = balance > 0 || earned > 0;
                    const isExpanded = walletId ? expandedWallets.has(walletId) : false;
                    const transactions = walletId ? (transactionDetails[walletId] || []) : [];
                    
                    const breakdown = wallet.breakdown || {};
                    const siteVisitFees = Number(breakdown.earning || 0) + Number(breakdown.site_visit_fee || 0);
                    const bonuses = Number(breakdown.bonus || 0);
                    const adjustments = Number(breakdown.adjustment || 0);
                    const penalties = Number(breakdown.penalty || 0);
                    const withdrawals = Number(breakdown.withdrawal || 0);
                    
                    return (
                      <Fragment key={rowKey}>
                        <TableRow 
                          className="hover-elevate"
                          data-testid={`wallet-row-${wallet.user_id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={!walletId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (walletId) toggleWalletExpansion(walletId);
                                }}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </Button>
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {(wallet.owner_name || wallet.profiles?.full_name || 'U')[0].toUpperCase()}
                              </div>
                              <span>{wallet.owner_name || wallet.profiles?.full_name || wallet.profiles?.username || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {wallet.profiles?.email || '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            <span className={balance > 0 ? 'text-green-600 dark:text-green-400' : ''}>
                              {fmt(balance * 100, currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col gap-1 items-end">
                              {siteVisitFees > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Site Visits:</span>
                                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                    {fmt(siteVisitFees * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {bonuses > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Bonuses:</span>
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    {fmt(bonuses * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {adjustments !== 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Adjustments:</span>
                                  <span className={`text-sm font-medium ${adjustments > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {fmt(adjustments * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {penalties < 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Penalties:</span>
                                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                    {fmt(penalties * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {withdrawals < 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Withdrawals:</span>
                                  <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                                    {fmt(withdrawals * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {/* Fallback: show total_earned when no transaction breakdown available */}
                              {earned > 0 && siteVisitFees === 0 && bonuses === 0 && adjustments === 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Total Earned:</span>
                                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                    {fmt(earned * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {earned === 0 && <span className="text-sm text-muted-foreground">No earnings yet</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-purple-600 dark:text-purple-400">
                              {fmt(withdrawn * 100, currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={isActive ? 'default' : 'secondary'}
                              className={isActive ? 'bg-green-500/90 hover:bg-green-600' : ''}
                            >
                              {isActive ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {wallet.updated_at ? format(new Date(wallet.updated_at), 'MMM dd, yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-actions-${wallet.user_id}`}
                                >
                                  <Settings className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleAdjustBalance(wallet)}
                                  data-testid={`button-adjust-balance-${wallet.user_id}`}
                                >
                                  <DollarSign className="w-4 h-4 mr-2" />
                                  Adjust Balance
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExportCSV(wallet)}
                                  data-testid={`button-export-csv-${wallet.user_id}`}
                                >
                                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                                  Export CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExportPDF(wallet)}
                                  data-testid={`button-export-pdf-${wallet.user_id}`}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Export PDF
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expandable Transaction Details */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4 space-y-3">
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  <Activity className="w-4 h-4" />
                                  Transaction History ({transactions.length} transactions)
                                </h4>
                                
                                {transactions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No transactions recorded</p>
                                ) : (
                                  <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {transactions.map((tx: any) => (
                                      <div 
                                        key={tx.id} 
                                        className="flex items-start justify-between p-3 bg-background rounded-lg border"
                                      >
                                        <div className="flex-1 space-y-1">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">
                                              {tx.type.replace(/_/g, ' ')}
                                            </Badge>
                                            {tx.mmp_site_entries && (
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <MapPin className="w-3 h-3" />
                                                <span>{tx.mmp_site_entries.site_name} - {tx.mmp_site_entries.locality}, {tx.mmp_site_entries.state}</span>
                                              </div>
                                            )}
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {tx.description || 'No description'}
                                          </p>
                                          {tx.mmp_site_entries?.visit_completed_at && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                              <Calendar className="w-3 h-3" />
                                              <span>{format(new Date(tx.mmp_site_entries.visit_completed_at), 'MMM dd, yyyy')}</span>
                                            </div>
                                          )}
                                          <p className="text-xs text-muted-foreground">
                                            {format(new Date(tx.created_at), 'MMM dd, yyyy HH:mm')}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className={`text-lg font-bold ${tx.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {tx.amount > 0 ? '+' : ''}{fmt(Number(tx.amount) * 100, tx.currency || currency)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Balance: {fmt((Number(tx.balance_after) || 0) * 100, tx.currency || currency)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Summary Footer */}
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-blue-500/20">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Total Wallets</p>
                  <p className="text-xl font-bold">{filtered.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Balance</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Earned</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Withdrawn</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(wallet => (
            <WalletCard
              key={wallet.user_id || wallet.id}
              wallet={{
                id: wallet.id || wallet.user_id,
                userId: wallet.user_id,
                userName: wallet.owner_name || wallet.profiles?.full_name || wallet.profiles?.username,
                userEmail: wallet.profiles?.email,
                balances: wallet.balances || {},
                totalEarned: wallet.totalEarned,
                totalWithdrawn: wallet.totalWithdrawn,
                updatedAt: wallet.updated_at,
                pendingPayouts: (Number(wallet.totalEarned)||0) - (Number(wallet.totalWithdrawn)||0) - (wallet.balances?.[currency] || 0),
              }}
              currency={currency}
              onClick={(userId) => navigate(`/admin/wallets/${userId}`)}
            />
          ))}
        </div>
      )}

      {/* Balance Adjustment Dialog */}
      <BalanceAdjustmentDialog
        open={adjustmentDialog.open}
        onOpenChange={(open) => setAdjustmentDialog({ ...adjustmentDialog, open })}
        userId={adjustmentDialog.userId}
        userName={adjustmentDialog.userName}
        currentBalance={adjustmentDialog.currentBalance}
        currency={currency}
        onSuccess={() => load({ force: true })}
      />
    </div>
  );
};

export default AdminWallets;
