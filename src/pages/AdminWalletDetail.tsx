import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Wallet, WalletTransaction } from '@/types/wallet';
import { ArrowLeft, MapPin, TrendingUp, DollarSign, Briefcase, Calendar, CheckCircle, Clock, XCircle, Pencil, Check, X, Loader2, History } from 'lucide-react';

const currencyFmt = (amount: number, currency: string) => 
  new Intl.NumberFormat(undefined, { 
    style: 'currency', 
    currency: currency || 'SDG', 
    currencyDisplay: 'narrowSymbol' 
  }).format(amount);

const AdminWalletDetail = () => {
  const params = useParams();
  const navigate = useNavigate();
  const userId = params.userId as string;
  const { toast } = useToast();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [siteVisits, setSiteVisits] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currency, setCurrency] = useState('SDG');
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjDirection, setAdjDirection] = useState<'credit'|'debit'>('credit');
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSiteVisits, setLoadingSiteVisits] = useState(true);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [savingTx, setSavingTx] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const loadWalletData = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      setLoadingProfile(true);
      setLoadingSiteVisits(true);

      // Use SECURITY DEFINER RPC for wallet + transactions (direct queries are RLS-blocked)
      const [profileResult, rpcResult, sitesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, hub_id')
          .eq('id', userId)
          .single(),
        supabase.rpc('admin_get_user_wallet_data', { p_user_id: userId }),
        supabase
          .from('mmp_site_entries')
          .select(`
            id,
            site_name,
            site_code,
            status,
            state,
            locality,
            accepted_at,
            visit_completed_at,
            enumerator_fee,
            transport_fee,
            cost
          `)
          .eq('accepted_by', userId)
          .order('accepted_at', { ascending: false })
          .limit(100)
      ]);

      if (profileResult.error) {
        console.error('Failed to load profile:', profileResult.error);
      } else if (profileResult.data) {
        setUserProfile(profileResult.data);
      }
      setLoadingProfile(false);

      let txnData: any[] = [];

      const walletRaw = rpcResult.data?.wallet;
      if (rpcResult.error || !walletRaw) {
        console.error('Failed to load wallet:', rpcResult.error);
        setWallet(null);
      } else {
        const transformedWallet: Wallet = {
          id: walletRaw.id,
          userId: walletRaw.user_id,
          balances: walletRaw.balances || { SDG: 0 },
          totalEarned: parseFloat(walletRaw.total_earned || 0),
          totalWithdrawn: parseFloat(walletRaw.total_withdrawn || 0),
          createdAt: walletRaw.created_at,
          updatedAt: walletRaw.updated_at,
        };
        setWallet(transformedWallet);
        const walletCurrencies = Object.keys(transformedWallet.balances);
        if (walletCurrencies.length > 0 && !walletCurrencies.includes(currency)) {
          setCurrency(walletCurrencies[0] || 'SDG');
        }
      }

      const rawTxns: any[] = rpcResult.data?.transactions || [];
      if (rawTxns.length > 0) {
        txnData = rawTxns;
        const transformedTxns: WalletTransaction[] = txnData.map(t => ({
          id: t.id,
          walletId: t.wallet_id,
          userId: t.user_id,
          type: t.type,
          amount: parseFloat(t.amount),
          currency: t.currency,
          siteVisitId: t.site_visit_id,
          withdrawalRequestId: t.withdrawal_request_id,
          description: t.description,
          metadata: t.metadata,
          balanceBefore: t.balance_before ? parseFloat(t.balance_before) : undefined,
          balanceAfter: t.balance_after ? parseFloat(t.balance_after) : undefined,
          createdBy: t.created_by,
          createdAt: t.created_at,
        }));
        setTransactions(transformedTxns);
      }

      if (sitesResult.error) {
        console.error('Failed to load site visits:', sitesResult.error);
      } else if (sitesResult.data) {
        const sitesWithPayments = sitesResult.data.map(site => {
          // Check for both old 'site_visit_fee' and new 'earning' transaction types
          const payment = txnData.find(
            t => t.site_visit_id === site.id && (t.type === 'earning' || t.type === 'site_visit_fee')
          );
          const isCompleted = site.status?.toLowerCase() === 'completed' || site.status?.toLowerCase() === 'verified';
          return {
            ...site,
            isCompleted,
            payment: payment ? {
              amount: parseFloat(payment.amount),
              date: payment.created_at
            } : null
          };
        });
        setSiteVisits(sitesWithPayments);
      }
      setLoadingSiteVisits(false);
    } catch (error) {
      console.error('Error loading wallet data:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while loading wallet data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingProfile(false);
      setLoadingSiteVisits(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(loadWalletData, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`admin_wallet_detail_${userId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'wallets', 
        filter: `user_id=eq.${userId}` 
      }, loadWalletData)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'wallet_transactions', 
        filter: `user_id=eq.${userId}` 
      }, loadWalletData);
    channel.subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error('Error removing channel:', error);
      }
    };
  }, [userId]);

  // Compute work statistics
  const workStats = useMemo(() => {
    const completedSites = siteVisits.filter(s => s.status?.toLowerCase() === 'completed' || s.status?.toLowerCase() === 'verified').length;
    const pendingSites = siteVisits.filter(s => s.status?.toLowerCase() === 'assigned' || s.status?.toLowerCase() === 'in progress').length;
    const totalSites = siteVisits.length;
    const completionRate = totalSites > 0 ? (completedSites / totalSites) * 100 : 0;

    return { completedSites, pendingSites, totalSites, completionRate };
  }, [siteVisits]);

  // Compute earnings breakdown by source
  const earningsBreakdown = useMemo(() => {
    // Check for both old 'site_visit_fee' and new 'earning' transaction types
    const siteVisitEarnings = transactions
      .filter(t => t.type === 'earning' || t.type === 'site_visit_fee')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const bonuses = transactions
      .filter(t => t.type === 'bonus')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const adjustments = transactions
      .filter(t => t.type === 'adjustment')
      .reduce((sum, t) => sum + t.amount, 0);

    const withdrawals = transactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return { siteVisitEarnings, bonuses, adjustments, withdrawals };
  }, [transactions]);

  const totals = useMemo(() => {
    let earned = 0;
    let withdrawn = 0;
    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      if (['earning', 'site_visit_fee', 'bonus', 'adjustment'].includes(t.type)) {
        earned += amt;
      } else if (['withdrawal', 'penalty', 'debit'].includes(t.type)) {
        withdrawn += Math.abs(amt);
      }
    }
    return { earned, withdrawn };
  }, [transactions]);

  const startEditTx = (txn: WalletTransaction) => {
    setEditingTxId(txn.id);
    setEditTxAmount(String(txn.amount));
  };

  const cancelEditTx = () => {
    setEditingTxId(null);
    setEditTxAmount('');
  };

  const saveEditTx = async (txnId: string) => {
    const newAmount = parseFloat(editTxAmount);
    if (isNaN(newAmount) || newAmount === 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid non-zero amount', variant: 'destructive' });
      return;
    }

    setSavingTx(true);
    try {
      const updateData: Record<string, any> = { amount: newAmount };
      
      const { error } = await supabase
        .from('wallet_transactions')
        .update(updateData)
        .eq('id', txnId);

      if (error) throw error;

      toast({ title: 'Transaction Updated', description: `Amount updated to ${newAmount.toLocaleString()} ${currency}` });
      setEditingTxId(null);
      setEditTxAmount('');
      await loadWalletData();
    } catch (error: any) {
      toast({ title: 'Update Failed', description: error?.message || 'Could not update transaction', variant: 'destructive' });
    } finally {
      setSavingTx(false);
    }
  };

  const recalculateWalletTotals = async () => {
    if (!wallet) return;
    setRecalculating(true);
    try {
      const { data: allTransactions, error: txError } = await supabase
        .from('wallet_transactions')
        .select('id, amount, type, currency, site_visit_id, related_site_visit_id, description')
        .eq('user_id', userId);

      if (txError) throw txError;

      const earningTxs = (allTransactions || []).filter(tx =>
        (tx.type === 'earning' || tx.type === 'site_visit_fee') &&
        (tx.site_visit_id || tx.related_site_visit_id)
      );

      let txUpdated = 0;

      if (earningTxs.length > 0) {
        const siteEntryIds = earningTxs
          .map(tx => tx.site_visit_id || tx.related_site_visit_id)
          .filter(Boolean) as string[];

        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, enumerator_fee, transport_fee, cost')
          .in('id', siteEntryIds);

        const entryDataMap = new Map(
          (entries || []).map(e => {
            const enumFee = Number(e.enumerator_fee || 0);
            const transportFee = Number(e.transport_fee || 0);
            const storedCost = Number(e.cost || 0);
            const calculatedTotal = enumFee + transportFee;
            const totalFee = calculatedTotal > 0 ? calculatedTotal : (storedCost > 0 ? storedCost : 0);
            console.log(`[Recalculate] Site "${e.site_name}" (${e.id}): enumerator_fee=${e.enumerator_fee}, transport_fee=${e.transport_fee}, cost=${e.cost} → totalFee=${totalFee} (using ${calculatedTotal > 0 ? 'enum+transport' : 'cost field'})`);
            return [e.id, { 
              totalFee, 
              enumFee, 
              transportFee, 
              storedCost,
              siteName: e.site_name || '', 
              siteCode: e.site_code || '' 
            }];
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
            txUpdated++;
            console.log(`[Recalculate] Updated tx ${tx.id}: amount ${tx.amount} → ${updatePayload.amount ?? tx.amount}, site: ${entryData.siteName}`);
          }
        }
      }

      const { data: refreshedTxs, error: refreshError } = await supabase
        .from('wallet_transactions')
        .select('amount, type, currency')
        .eq('user_id', userId);

      if (refreshError) throw refreshError;

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

      const newBalances: Record<string, number> = {};
      for (const [cur, bal] of Object.entries(balancesByCurrency)) {
        newBalances[cur] = bal;
      }

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          total_earned: newTotalEarned,
          total_withdrawn: newTotalWithdrawn,
          balances: newBalances,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);

      if (updateError) throw updateError;

      const primaryCurrency = Object.keys(balancesByCurrency)[0] || currency;
      const primaryBalance = balancesByCurrency[primaryCurrency] || 0;
      
      let toastDesc = '';
      if (txUpdated > 0) {
        toastDesc = `${txUpdated} transactions corrected. `;
      } else if (earningTxs.length > 0) {
        toastDesc = 'No corrections needed (amounts match site entries). ';
      }
      toastDesc += `Earned: ${newTotalEarned.toLocaleString()} ${primaryCurrency}, Balance: ${primaryBalance.toLocaleString()} ${primaryCurrency}`;
      
      toast({ 
        title: 'Wallet Recalculated', 
        description: toastDesc
      });
      await loadWalletData();
    } catch (error: any) {
      toast({ title: 'Recalculation Failed', description: error?.message || 'Could not recalculate wallet', variant: 'destructive' });
    } finally {
      setRecalculating(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!wallet || !adjAmount) return;

    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive amount',
        variant: 'destructive',
      });
      return;
    }

    try {
      const adjustmentAmount = adjDirection === 'credit' ? amount : -amount;
      const currentBalance = wallet.balances[currency] || 0;
      const newBalance = currentBalance + adjustmentAmount;

      if (newBalance < 0) {
        toast({
          title: 'Invalid Operation',
          description: 'Debit amount would result in negative balance',
          variant: 'destructive',
        });
        return;
      }

      const { error: txnError } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          user_id: userId,
          type: 'adjustment',
          amount: adjustmentAmount,
          currency: currency,
          description: adjReason || `Manual ${adjDirection} adjustment`,
          balance_before: currentBalance,
          balance_after: newBalance,
        });

      if (txnError) throw txnError;

      const updatedBalances = { ...wallet.balances, [currency]: newBalance };
      const { error: walletError } = await supabase
        .from('wallets')
        .update({ 
          balances: updatedBalances,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);

      if (walletError) throw walletError;

      toast({
        title: 'Success',
        description: `Balance ${adjDirection}ed successfully`,
      });

      setAdjOpen(false);
      setAdjAmount('');
      setAdjReason('');
      await loadWalletData();
    } catch (error: any) {
      console.error('Failed to adjust balance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to adjust balance',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <span className="ml-3 text-slate-400">Loading wallet data…</span>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-slate-400 text-lg">No wallet found for this user</div>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const currentBalance = totals.earned - totals.withdrawn;

  return (
    <div className="space-y-4 p-3 md:p-6" data-testid="page-admin-wallet-detail">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* ── Header card ── */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-900/70 via-slate-800/80 to-slate-900 border border-teal-700/40 p-5 md:p-7">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide uppercase">
              {userProfile?.full_name || 'Unknown User'}
            </h1>
            <p className="text-sm text-teal-400">{userProfile?.email}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {userProfile?.role && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {userProfile.role}
                </span>
              )}
              {userProfile?.hub_id && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-600/50 text-slate-300 border border-slate-500/30">
                  Hub: {userProfile.hub_id}
                </span>
              )}
            </div>
          </div>

          {/* Adjust Balance dialog */}
          <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="button-adjust-balance"
                className="bg-teal-600 hover:bg-teal-500 text-white rounded-xl px-5 shrink-0 min-h-10"
              >
                Adjust Balance
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Manual Balance Adjustment</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">Direction</label>
                  <div className="flex gap-2">
                    <Button
                      variant={adjDirection === 'credit' ? 'default' : 'outline'}
                      onClick={() => setAdjDirection('credit')}
                      data-testid="button-direction-credit"
                      className="flex-1"
                    >
                      Credit (Add)
                    </Button>
                    <Button
                      variant={adjDirection === 'debit' ? 'default' : 'outline'}
                      onClick={() => setAdjDirection('debit')}
                      data-testid="button-direction-debit"
                      className="flex-1"
                    >
                      Debit (Subtract)
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">Amount ({currency})</label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                    placeholder="Enter amount"
                    data-testid="input-adjustment-amount"
                    className="bg-slate-800 border-slate-600 text-slate-100"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">Reason (optional)</label>
                  <Input
                    value={adjReason} onChange={e => setAdjReason(e.target.value)}
                    placeholder="Reason for adjustment"
                    data-testid="input-adjustment-reason"
                    className="bg-slate-800 border-slate-600 text-slate-100"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleAdjustBalance} disabled={!adjAmount}
                  data-testid="button-submit-adjustment"
                  className="bg-teal-600 hover:bg-teal-500"
                >
                  Submit Adjustment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── 4 metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Balance */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-800/60 to-teal-900/80 border border-teal-600/30 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400/80 mb-3">Balance ({currency})</p>
          <p className="text-2xl md:text-3xl font-bold text-teal-300 leading-none truncate" data-testid="text-balance">
            {currencyFmt(currentBalance, currency)}
          </p>
        </div>
        {/* Total Earned */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-800/60 to-slate-800/80 border border-teal-600/30 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400/80 mb-3">Total Earned</p>
          <p className="text-2xl md:text-3xl font-bold text-teal-300 leading-none truncate" data-testid="text-total-earned">
            {currencyFmt(totals.earned, currency)}
          </p>
        </div>
        {/* Total Withdrawn */}
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/60 to-slate-800/80 border border-purple-600/30 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-400/80 mb-3">Total Withdrawn</p>
          <p className="text-2xl md:text-3xl font-bold text-purple-300 leading-none truncate" data-testid="text-total-withdrawn">
            {currencyFmt(totals.withdrawn, currency)}
          </p>
        </div>
        {/* Transaction Count */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900 border border-slate-600/40 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400/80 mb-3">Transaction Count</p>
          <p className="text-2xl md:text-3xl font-bold text-amber-400 leading-none" data-testid="text-transaction-count">
            {transactions.length}
          </p>
        </div>
      </div>

      {/* ── Tabbed Content ── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800/60 border border-slate-700/50 rounded-xl p-1 h-auto">
          {(['overview','sites','earnings','transactions'] as const).map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              data-testid={`tab-${tab}`}
              className="rounded-lg py-2 text-xs md:text-sm capitalize text-slate-400 data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Work Statistics */}
            <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-200">Work Statistics</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Total Sites', value: workStats.totalSites, color: 'text-slate-200' },
                  { label: 'Completed', value: workStats.completedSites, color: 'text-emerald-400' },
                  { label: 'Pending', value: workStats.pendingSites, color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-xl font-bold ${color}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700/50">
                  <span className="text-sm text-slate-400">Completion Rate</span>
                  <span className="text-xl font-bold text-teal-400">{workStats.completionRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-200">Financial Summary</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Current Balance', value: currencyFmt(currentBalance, currency), color: 'text-teal-400' },
                  { label: 'Total Earned', value: currencyFmt(totals.earned, currency), color: 'text-emerald-400' },
                  { label: 'Total Withdrawn', value: currencyFmt(totals.withdrawn, currency), color: 'text-purple-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-lg font-bold ${color}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700/50">
                  <span className="text-sm text-slate-400">Net Income</span>
                  <span className="text-xl font-bold text-teal-300">{currencyFmt(totals.earned - totals.withdrawn, currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Sites Tab */}
        <TabsContent value="sites" className="space-y-4">
          {/* Mini status counters */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Credited', count: siteVisits.filter(s => s.isCompleted && s.payment).length, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Pending Payment', count: siteVisits.filter(s => s.isCompleted && !s.payment).length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'In Progress', count: siteVisits.filter(s => !s.isCompleted).length, icon: MapPin, color: 'text-slate-300', bg: 'bg-slate-700/40 border-slate-600/30' },
            ].map(({ label, count, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 flex items-center justify-between ${bg}`}>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-0.5 ${color}`}>{count}</p>
                </div>
                <Icon className={`w-7 h-7 opacity-40 ${color}`} />
              </div>
            ))}
          </div>

          {/* Sites table */}
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-200">Sites Visited ({siteVisits.length})</h3>
              <span className="text-xs text-slate-500 ml-1">— only completed sites receive payment</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Site Name</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Assigned</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Completed</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide text-right">Enum Fee</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide text-right">Transport</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide text-right">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteVisits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 h-24">No sites visited yet</TableCell>
                    </TableRow>
                  ) : siteVisits.map((site) => {
                    const enumFee = Number(site.enumerator_fee || 0);
                    const transFee = Number(site.transport_fee || 0);
                    const totalFee = enumFee + transFee > 0 ? enumFee + transFee : Number(site.cost || 0);
                    const statusLower = site.status?.toLowerCase();
                    const isDone = statusLower === 'completed' || statusLower === 'verified';
                    return (
                      <TableRow key={site.id} className="border-slate-700/30 hover:bg-slate-700/20">
                        <TableCell className="text-slate-200 font-medium">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isDone ? 'bg-emerald-500/15 text-emerald-400'
                            : statusLower === 'assigned' ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-slate-600/40 text-slate-300'
                          }`}>
                            {site.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {site.accepted_at ? new Date(site.accepted_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {enumFee > 0 ? <span className="text-teal-400 font-medium">{currencyFmt(enumFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {transFee > 0 ? <span className="text-teal-400 font-medium">{currencyFmt(transFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.payment ? (
                            <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3 h-3" />{currencyFmt(site.payment.amount, currency)}
                            </span>
                          ) : site.isCompleted ? (
                            <span className="text-amber-400 flex items-center justify-end gap-1">
                              <Clock className="w-3 h-3" />{totalFee > 0 ? currencyFmt(totalFee, currency) : 'Pending'}
                            </span>
                          ) : (
                            <span className="text-slate-600 flex items-center justify-end gap-1">
                              <XCircle className="w-3 h-3" />Not eligible
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {siteVisits.length > 0 && (
                    <TableRow className="border-t border-slate-700/50 bg-slate-800/40 font-semibold">
                      <TableCell colSpan={4} className="text-slate-400 text-right text-sm">Totals</TableCell>
                      <TableCell className="text-right text-teal-400 text-sm">
                        {currencyFmt(siteVisits.reduce((s, v) => s + Number(v.enumerator_fee || 0), 0), currency)}
                      </TableCell>
                      <TableCell className="text-right text-teal-400 text-sm">
                        {currencyFmt(siteVisits.reduce((s, v) => s + Number(v.transport_fee || 0), 0), currency)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-400 text-sm">
                        {currencyFmt(siteVisits.reduce((s, v) => {
                          const ef = Number(v.enumerator_fee || 0);
                          const tf = Number(v.transport_fee || 0);
                          return s + (ef + tf > 0 ? ef + tf : Number(v.cost || 0));
                        }, 0), currency)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Earnings Tab */}
        <TabsContent value="earnings" className="space-y-4">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-200">Earnings Breakdown by Source</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {[
                { label: 'Site Visit Payments', value: earningsBreakdown.siteVisitEarnings, icon: MapPin, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
                { label: 'Bonuses', value: earningsBreakdown.bonuses, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                { label: 'Manual Adjustments', value: earningsBreakdown.adjustments, icon: Calendar, color: earningsBreakdown.adjustments >= 0 ? 'text-slate-300' : 'text-red-400', bg: 'bg-slate-700/40 border-slate-600/30' },
                { label: 'Withdrawals', value: earningsBreakdown.withdrawals, icon: DollarSign, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`rounded-xl border p-4 flex items-center justify-between ${bg}`}>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{currencyFmt(value, currency)}</p>
                  </div>
                  <Icon className={`w-10 h-10 opacity-25 ${color}`} />
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="space-y-2 pt-4 border-t border-slate-700/50">
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-400">Total Earned</span>
                <span className="text-xl font-bold text-emerald-400">
                  {currencyFmt(earningsBreakdown.siteVisitEarnings + earningsBreakdown.bonuses + earningsBreakdown.adjustments, currency)}
                </span>
              </div>
              {earningsBreakdown.withdrawals > 0 && (
                <div className="flex justify-between items-center py-2 border-t border-slate-700/30">
                  <span className="text-slate-400">Total Withdrawn</span>
                  <span className="text-xl font-bold text-purple-400">−{currencyFmt(earningsBreakdown.withdrawals, currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-3 border-t border-slate-700/50">
                <span className="text-slate-200 font-semibold">Net Balance</span>
                <span className="text-2xl font-bold text-teal-300">
                  {currencyFmt(
                    earningsBreakdown.siteVisitEarnings + earningsBreakdown.bonuses +
                    earningsBreakdown.adjustments - earningsBreakdown.withdrawals,
                    currency
                  )}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-200">Transaction History</h3>
                <span className="text-xs bg-slate-700/60 text-slate-400 px-2 py-0.5 rounded-full">{transactions.length}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={recalculateWalletTotals}
                disabled={recalculating || transactions.length === 0}
                className="border-slate-600 text-slate-300 hover:bg-slate-700/50 text-xs"
                data-testid="button-recalculate-wallet"
              >
                {recalculating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1.5" />}
                Sync & Recalculate
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Type</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wide text-right">Amount</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 h-24">No transactions yet</TableCell>
                    </TableRow>
                  ) : transactions.map((txn) => (
                    <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="text-slate-400 text-sm whitespace-nowrap">{new Date(txn.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-300 capitalize">
                          {txn.type.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm max-w-[200px] truncate">{txn.description || '—'}</TableCell>
                      <TableCell className="text-right">
                        {editingTxId === txn.id ? (
                          <Input
                            type="number" value={editTxAmount}
                            onChange={e => setEditTxAmount(e.target.value)}
                            className="w-32 ml-auto text-right bg-slate-700 border-slate-500 text-slate-100"
                            data-testid={`input-tx-amount-${txn.id}`} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveEditTx(txn.id); if (e.key === 'Escape') cancelEditTx(); }}
                          />
                        ) : (
                          <span className={`font-semibold text-sm ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {txn.amount >= 0 ? '+' : ''}{currencyFmt(txn.amount, txn.currency)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {editingTxId === txn.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" onClick={() => saveEditTx(txn.id)} disabled={savingTx} className="h-7 w-7 text-emerald-400" data-testid={`button-save-tx-${txn.id}`}>
                              {savingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditTx} className="h-7 w-7 text-red-400" data-testid={`button-cancel-tx-${txn.id}`}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => startEditTx(txn)} className="h-7 w-7 text-slate-400 hover:text-slate-200" data-testid={`button-edit-tx-${txn.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary footer rows */}
                  {transactions.length > 0 && (() => {
                    const earnTypes = ['earning', 'site_visit_fee', 'bonus', 'adjustment'];
                    const advanceTypes = ['down_payment', 'advance_deduction'];
                    const totalEarned = transactions.filter(t => earnTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    const totalAdvances = transactions.filter(t => advanceTypes.includes(t.type)).reduce((s, t) => s + Math.abs(t.amount), 0);
                    const totalDeducted = transactions.filter(t => t.amount < 0 && !advanceTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    return (
                      <>
                        <TableRow className="border-t border-slate-700/50 bg-emerald-500/5">
                          <TableCell colSpan={3} className="text-slate-400 text-right text-sm">Total Earned</TableCell>
                          <TableCell className="text-right text-emerald-400 font-bold">+{currencyFmt(totalEarned, currency)}</TableCell>
                          <TableCell />
                        </TableRow>
                        {totalAdvances > 0 && (
                          <TableRow className="bg-amber-500/5">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm">Advances Paid</TableCell>
                            <TableCell className="text-right text-amber-400 font-bold">−{currencyFmt(totalAdvances, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        {totalDeducted < 0 && (
                          <TableRow className="bg-red-500/5">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm">Total Deducted</TableCell>
                            <TableCell className="text-right text-red-400 font-bold">{currencyFmt(totalDeducted, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        <TableRow className="border-t border-slate-700/50 bg-teal-500/5">
                          <TableCell colSpan={3} className="text-slate-300 text-right font-semibold text-sm">Net Balance</TableCell>
                          <TableCell className="text-right text-teal-300 font-bold text-base">
                            {currencyFmt(totalEarned - totalAdvances + totalDeducted, currency)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminWalletDetail;
