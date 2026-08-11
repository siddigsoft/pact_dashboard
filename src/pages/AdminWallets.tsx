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
import { useColumnVisibility } from '@/hooks/useColumnVisibility';

const fmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

// Module-level cache — survives tab switches, avoids refetching on every mount
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let _walletCache: { rows: any[]; currency: string; ts: number } | null = null;

const AdminWallets: FC = () => {
  const isColVisible = useColumnVisibility('admin-wallets');
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
      {/* ── Header card ── */}
      <div className="rounded-2xl overflow-hidden border border-teal-800/60 shadow-xl shadow-black/30">
        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-900/50">
                <WalletIcon className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide">Wallets Management</h1>
                <p className="text-sm text-teal-400 mt-0.5">Financial Operations Command Center · {rows.length} wallets</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate('/finance-approval')}
                data-testid="button-goto-finance-approval"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors"
              >
                <DollarSign className="h-3.5 w-3.5" /> Finance Approval
              </button>
              <button
                onClick={() => navigate('/wallet-reports')}
                data-testid="button-goto-wallet-reports"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" /> Wallet Reports
              </button>
              <button
                onClick={() => navigate('/financial-operations')}
                data-testid="button-goto-financial-ops"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5" /> Financial Ops
              </button>
              <button
                onClick={syncAndRecalculateAll}
                disabled={syncingAll || rows.length === 0}
                data-testid="button-sync-all-wallets"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white transition-colors"
              >
                {syncingAll ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {syncProgress.current}/{syncProgress.total}</> : <><Zap className="h-3.5 w-3.5" /> Sync All</>}
              </button>
              <DataFreshnessBadge />
            </div>
          </div>
        </div>
      </div>


      {/* ── Wallet Backfill Panel — hidden once scan confirms nothing missing ── */}
      {(backfillScan === null || backfillScan.missing.length > 0 || backfilling) && (
      <div className="rounded-2xl bg-amber-900/20 border border-amber-700/50 overflow-hidden">
        <div className="px-5 py-3 bg-amber-900/30 border-b border-amber-700/40 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-300">Missing Wallet Credits — Site Visits</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 mb-3">
                New site visits are credited <strong className="text-white">automatically</strong>. This panel handles <strong className="text-white">historical visits</strong> that existed before the auto-credit system.
              </p>

              {/* Scan result */}
              {backfillScan && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-3">
                  <div className="bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
                    <div className="text-slate-400">Total Completed</div>
                    <div className="font-bold text-base text-white">{backfillScan.totalCompleted}</div>
                  </div>
                  <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-3 py-2">
                    <div className="text-slate-400">Already Credited</div>
                    <div className="font-bold text-base text-emerald-400">{backfillScan.alreadyCredited}</div>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 ${backfillScan.missing.length > 0 ? 'bg-red-900/30 border-red-700/50' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="text-slate-400">Missing Credits</div>
                    <div className={`font-bold text-base ${backfillScan.missing.length > 0 ? 'text-red-400' : 'text-white'}`}>{backfillScan.missing.length}</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
                    <div className="text-slate-400">No Fee</div>
                    <div className="font-bold text-base text-slate-400">{backfillScan.noFee}</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
                    <div className="text-slate-400">No Payee</div>
                    <div className="font-bold text-base text-slate-400">{backfillScan.noUser}</div>
                  </div>
                </div>
              )}

              {/* Progress bar during backfill */}
              {backfilling && backfillProgress.total > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Crediting wallets… {backfillProgress.current}/{backfillProgress.total}</span>
                    <span>
                      <span className="text-emerald-400">{backfillProgress.succeeded} credited</span>
                      {backfillProgress.skipped > 0 && <span className="ml-2">{backfillProgress.skipped} skipped</span>}
                      {backfillProgress.failed > 0 && <span className="ml-2 text-red-400">{backfillProgress.failed} failed</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-2 bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.round((backfillProgress.current / backfillProgress.total) * 100)}%` }} />
                  </div>
                  {backfillLastError && <div className="text-xs text-red-400 bg-red-900/20 border border-red-700/50 rounded px-2 py-1 mt-1 font-mono break-all">First error: {backfillLastError}</div>}
                </div>
              )}
              {!backfilling && backfillLastError && backfillProgress.failed > 0 && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-700/50 rounded px-2 py-1 font-mono break-all">Error: {backfillLastError}</div>
              )}

              {/* Preview list */}
              {backfillScan && backfillScan.missing.length > 0 && !backfilling && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900/60 text-xs font-medium text-slate-400 border-b border-slate-700">
                    Preview — first {Math.min(10, backfillScan.missing.length)} of {backfillScan.missing.length} sites missing credit
                  </div>
                  <div className="divide-y divide-slate-700/40 max-h-48 overflow-y-auto">
                    {backfillScan.missing.slice(0, 10).map(s => (
                      <div key={s.id} className="px-3 py-1.5 flex justify-between text-xs">
                        <span className="truncate mr-2 text-slate-300">{s.siteName}</span>
                        <span className="flex-shrink-0 text-slate-400">{s.userName} · <span className="font-medium text-amber-400">{s.fee.toLocaleString()} SDG</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={scanMissingFees}
                disabled={backfilling}
                data-testid="button-scan-missing-fees"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-900/40 hover:bg-amber-900/60 disabled:opacity-50 text-amber-300 border border-amber-700/50 transition-colors"
              >
                {backfillScan === null ? <><Search className="h-3.5 w-3.5" />Scan Now</> : <><RefreshCw className="h-3.5 w-3.5" />Re-scan</>}
              </button>
              {backfillScan && backfillScan.missing.length > 0 && (
                <button
                  onClick={runBackfillAll}
                  disabled={backfilling}
                  data-testid="button-run-backfill"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
                >
                  {backfilling ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{backfillProgress.current}/{backfillProgress.total}</> : <><PlayCircle className="h-3.5 w-3.5" />Credit {backfillScan.missing.length} Sites</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards ── */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-teal-700 border border-teal-600 p-5 shadow-lg shadow-teal-900/30" data-testid="card-stat-total-earnings">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200 mb-1">Total Earned</p>
          <p className="text-2xl font-extrabold text-white">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}</p>
          <p className="text-xs text-teal-300 mt-1">{filtered.length} active wallets</p>
        </div>
        <div className="rounded-2xl bg-orange-700 border border-orange-600 p-5 shadow-lg shadow-orange-900/30" data-testid="card-stat-total-withdrawals">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-200 mb-1">Total Withdrawn</p>
          <p className="text-2xl font-extrabold text-white">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}</p>
          <p className="text-xs text-orange-300 mt-1">Paid to enumerators</p>
        </div>
        <div className="rounded-2xl bg-slate-700 border border-slate-600 p-5 shadow-lg shadow-slate-900/30" data-testid="card-stat-current-balances">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 mb-1">Current Balances</p>
          <p className="text-2xl font-extrabold text-white">{fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}</p>
          <p className="text-xs text-slate-400 mt-1">Available for withdrawal</p>
        </div>
      </div>

      {/* ── Search / filter bar ── */}
      <div className="rounded-2xl bg-slate-800 border border-slate-700 px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
          <Input 
            placeholder="Search by name, email, or user ID..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)}
            className="pl-9 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-teal-500"
            data-testid="input-search-wallets"
          />
        </div>
        <button
          onClick={() => setShowZeroBalance(v => !v)}
          data-testid="button-toggle-zero-balance"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showZeroBalance ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
        >
          {showZeroBalance ? `All Wallets (${rows.length})` : `Active Only (${filtered.length})`}
        </button>
        <div className="flex items-center gap-1 bg-slate-700 border border-slate-600 rounded-lg p-1">
          <button onClick={() => setViewMode('table')} data-testid="button-view-table" className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
            <Table2 className="w-3.5 h-3.5" /> Table
          </button>
          <button onClick={() => setViewMode('grid')} data-testid="button-view-grid" className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
            <Grid3x3 className="w-3.5 h-3.5" /> Grid
          </button>
        </div>
        <button onClick={() => load({ force: true })} data-testid="button-refresh-wallets" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Wallets Display */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-teal-600/20 rounded-2xl mb-6">
            <WalletIcon className="w-16 h-16 text-teal-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No Wallets Detected</h3>
          <p className="text-slate-400 text-center max-w-md">
            {search ? 'Adjust search parameters' : 'Wallet data will synchronize once enumerators complete site visits'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-700 flex items-center gap-2">
            <Table2 className="w-4 h-4 text-teal-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Detailed Wallet Balances</h3>
            <span className="ml-auto text-xs text-slate-400">{filtered.length} wallets</span>
          </div>
          <div className="overflow-x-auto">
            <div className="border-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-900/60 hover:bg-slate-900/60 border-slate-700">
                    <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">User</TableHead>
                    <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">Email</TableHead>
                    {isColVisible('balance') && <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider text-right">Balance</TableHead>}
                    <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider text-right">Earnings</TableHead>
                    <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider text-right">Withdrawn</TableHead>
                    {isColVisible('status') && <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider text-center">Status</TableHead>}
                    {isColVisible('last_transaction') && <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">Updated</TableHead>}
                    <TableHead className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider text-center">Actions</TableHead>
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
                          className="border-slate-700/40 hover:bg-slate-700/20 transition-colors"
                          data-testid={`wallet-row-${wallet.user_id}`}
                        >
                          <TableCell className="font-medium text-slate-200">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-white"
                                disabled={!walletId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (walletId) toggleWalletExpansion(walletId);
                                }}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </Button>
                              <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
                                {(wallet.owner_name || wallet.profiles?.full_name || 'U')[0].toUpperCase()}
                              </div>
                              <span>{wallet.owner_name || wallet.profiles?.full_name || wallet.profiles?.username || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {wallet.profiles?.email || '-'}
                          </TableCell>
                          {isColVisible('balance') && (
                            <TableCell className="text-right font-bold">
                              <span className={balance > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                                {fmt(balance * 100, currency)}
                              </span>
                            </TableCell>
                          )}
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
                          {isColVisible('status') && (
                            <TableCell className="text-center">
                              <Badge 
                                variant={isActive ? 'default' : 'secondary'}
                                className={isActive ? 'bg-green-500/90 hover:bg-green-600' : ''}
                              >
                                {isActive ? 'ACTIVE' : 'INACTIVE'}
                              </Badge>
                            </TableCell>
                          )}
                          {isColVisible('last_transaction') && (
                            <TableCell className="text-muted-foreground text-sm">
                              {wallet.updated_at ? format(new Date(wallet.updated_at), 'MMM dd, yyyy') : '-'}
                            </TableCell>
                          )}
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
          </div>
          {/* Summary Footer */}
          <div className="px-5 py-4 bg-slate-900/40 border-t border-slate-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Wallets</p>
                <p className="text-xl font-extrabold text-white">{filtered.length}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Balance</p>
                <p className="text-xl font-extrabold text-emerald-400">
                  {fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Earned</p>
                <p className="text-xl font-extrabold text-teal-400">
                  {fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Withdrawn</p>
                <p className="text-xl font-extrabold text-orange-400">
                  {fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
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
