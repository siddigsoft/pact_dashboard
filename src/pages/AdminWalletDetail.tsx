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
import { ArrowLeft, MapPin, TrendingUp, DollarSign, Briefcase, Calendar, CheckCircle, Clock, XCircle, Pencil, Check, X, Loader2, History, Truck, FileText, Printer } from 'lucide-react';

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
  const [downPayments, setDownPayments] = useState<any[]>([]);

  const loadWalletData = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      setLoadingProfile(true);
      setLoadingSiteVisits(true);

      // Use SECURITY DEFINER RPC for wallet + transactions (direct queries are RLS-blocked)
      const [profileResult, rpcResult, sitesResult, dpResult] = await Promise.all([
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
          .limit(100),
        // Fetch transport advance (down payment) records to calculate deductions
        supabase
          .from('down_payment_requests')
          .select('id, site_name, mmp_site_entry_id, total_paid_amount, remaining_amount, requested_amount, status, requested_at')
          .eq('requested_by', userId)
          .not('status', 'in', '("pending_supervisor","pending_admin","rejected","cancelled","deleted")')
          .order('requested_at', { ascending: false })
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

      // Store down payment records (transport advances already paid in cash)
      if (!dpResult.error && dpResult.data) {
        setDownPayments(dpResult.data);
      } else if (dpResult.error) {
        console.warn('Could not load down payment records:', dpResult.error?.message);
        setDownPayments([]);
      }
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

  // Total transport advances already paid in cash via the Down Payments page.
  // Only the actually-paid portion (total_paid_amount) is deducted — not the
  // remaining/unpaid portion, and not rejected/cancelled records.
  const totalAdvancesPaid = useMemo(() => {
    return downPayments.reduce((sum, dp) => {
      const paid = parseFloat(dp.total_paid_amount || 0);
      return sum + (paid > 0 ? paid : 0);
    }, 0);
  }, [downPayments]);

  // Bank-statement ledger: merge wallet transactions + down payment cash entries,
  // sorted oldest-first, then compute running balance after each entry.
  const statementLedger = useMemo(() => {
    type LedgerRow = {
      id: string;
      date: string;
      description: string;
      category: string;
      credit: number;
      debit: number;
      balance: number;
      source: 'transaction' | 'advance';
    };

    const creditTypes = ['earning', 'site_visit_fee', 'bonus', 'adjustment', 'adjustment_credit'];
    const debitTypes  = ['withdrawal', 'penalty', 'debit', 'adjustment_debit'];

    const rows: Omit<LedgerRow, 'balance'>[] = [];

    // Wallet transactions
    for (const t of transactions) {
      const amt = Math.abs(Number(t.amount || 0));
      const isCredit = creditTypes.includes(t.type);
      const isDebit  = debitTypes.includes(t.type);
      if (!isCredit && !isDebit) continue;
      rows.push({
        id: t.id,
        date: t.createdAt,
        description: t.description || t.type.replace(/_/g, ' '),
        category: t.type.replace(/_/g, ' '),
        credit: isCredit ? amt : 0,
        debit:  isDebit  ? amt : 0,
        source: 'transaction',
      });
    }

    // Down payment cash-paid entries (treated as debits — transport advance)
    for (const dp of downPayments) {
      const paid = parseFloat(dp.total_paid_amount || 0);
      if (paid <= 0) continue;
      rows.push({
        id: `dp-${dp.id}`,
        date: dp.requested_at,
        description: `Transport advance${dp.site_name ? ` — ${dp.site_name}` : ''} (${(dp.status || '').replace(/_/g, ' ')})`,
        category: 'Transport Advance',
        credit: 0,
        debit: paid,
        source: 'advance',
      });
    }

    // Sort chronologically (oldest first for statement readability)
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance
    let running = 0;
    const ledger: LedgerRow[] = rows.map(r => {
      running = running + r.credit - r.debit;
      return { ...r, balance: running };
    });

    return ledger;
  }, [transactions, downPayments]);

  // Per-site transport breakdown: enum fee, transport fee, advance paid, remaining owed
  const transportBreakdown = useMemo(() => {
    return siteVisits.map(site => {
      const enumFee   = Number(site.enumerator_fee || 0);
      const transFee  = Number(site.transport_fee || 0);
      // Find if a down payment was made for this site entry
      const advance   = downPayments.find(dp => dp.mmp_site_entry_id === site.id);
      const advPaid   = advance ? parseFloat(advance.total_paid_amount || 0) : 0;
      const advStatus = advance?.status || null;
      const remaining = transFee - advPaid;
      return { ...site, enumFee, transFee, advPaid, advStatus, remaining };
    });
  }, [siteVisits, downPayments]);

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

  // Actual spendable balance = earned - withdrawn - cash advances already paid
  const currentBalance = totals.earned - totals.withdrawn - totalAdvancesPaid;
  const initials = (userProfile?.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  /* ── shared panel style ── */
  const panel = 'rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden';
  const panelHeader = 'px-5 py-4 bg-slate-900/60 border-b border-slate-700 flex items-center gap-2';
  const thClass = 'text-slate-500 text-[11px] font-semibold uppercase tracking-wider py-3';

  return (
    <div className="space-y-5 p-3 md:p-6" data-testid="page-admin-wallet-detail">

      {/* ── Back ── */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors font-medium"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Wallets
      </button>

      {/* ══════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden border border-teal-800/60 shadow-xl shadow-black/30">
        {/* top accent strip */}
        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* avatar + info */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-teal-900/50 select-none">
                {initials}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white leading-tight tracking-wide">
                  {userProfile?.full_name || 'Unknown User'}
                </h1>
                <p className="text-sm text-teal-400 mt-0.5">{userProfile?.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {userProfile?.role && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      {userProfile.role}
                    </span>
                  )}
                  {userProfile?.hub_id && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600">
                      Hub: {userProfile.hub_id}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Adjust Balance dialog */}
            <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-adjust-balance"
                  className="bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl px-6 h-11 shadow-lg shadow-teal-900/40 shrink-0"
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
                      <Button variant={adjDirection === 'credit' ? 'default' : 'outline'} onClick={() => setAdjDirection('credit')} data-testid="button-direction-credit" className="flex-1">Credit (Add)</Button>
                      <Button variant={adjDirection === 'debit' ? 'default' : 'outline'} onClick={() => setAdjDirection('debit')} data-testid="button-direction-debit" className="flex-1">Debit (Subtract)</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Amount ({currency})</label>
                    <Input type="number" min="0" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="Enter amount" data-testid="input-adjustment-amount" className="bg-slate-800 border-slate-600 text-slate-100" />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Reason (optional)</label>
                    <Input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="Reason for adjustment" data-testid="input-adjustment-reason" className="bg-slate-800 border-slate-600 text-slate-100" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAdjustBalance} disabled={!adjAmount} data-testid="button-submit-adjustment" className="bg-teal-600 hover:bg-teal-500">Submit Adjustment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          4 METRIC CARDS
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Balance — shows net after advances deducted */}
        <div className="rounded-2xl bg-teal-700 border border-teal-600 p-5 shadow-lg shadow-teal-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200/80 mb-3">Net Balance ({currency})</p>
          <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-balance">
            {currencyFmt(currentBalance, currency)}
          </p>
          {totalAdvancesPaid > 0 && (
            <p className="text-[10px] text-teal-300/70 mt-2 leading-tight">
              Advances deducted: {currencyFmt(totalAdvancesPaid, currency)}
            </p>
          )}
        </div>
        {/* Total Earned */}
        <div className="rounded-2xl bg-emerald-700 border border-emerald-600 p-5 shadow-lg shadow-emerald-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200/80 mb-3">Total Earned</p>
          <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-total-earned">
            {currencyFmt(totals.earned, currency)}
          </p>
        </div>
        {/* Transport Advances Paid — only if any exist */}
        {totalAdvancesPaid > 0 ? (
          <div className="rounded-2xl bg-orange-700 border border-orange-600 p-5 shadow-lg shadow-orange-900/30">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-200/80 mb-3">Transport Advances</p>
            <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-advances-paid">
              − {currencyFmt(totalAdvancesPaid, currency)}
            </p>
            <p className="text-[10px] text-orange-300/70 mt-2">{downPayments.length} advance{downPayments.length !== 1 ? 's' : ''} paid in cash</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-violet-700 border border-violet-600 p-5 shadow-lg shadow-violet-900/30">
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-200/80 mb-3">Total Withdrawn</p>
            <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-total-withdrawn">
              {currencyFmt(totals.withdrawn, currency)}
            </p>
          </div>
        )}
        {/* Transaction Count */}
        <div className="rounded-2xl bg-slate-700 border border-slate-600 p-5 shadow-lg shadow-slate-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300/80 mb-3">Transactions</p>
          <p className="text-xl md:text-2xl font-extrabold text-amber-400 leading-none" data-testid="text-transaction-count">
            {transactions.length}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          TABS
      ══════════════════════════════════════════════ */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl p-1 h-auto gap-1 no-scrollbar">
          {[
            { value: 'overview',      label: 'Overview' },
            { value: 'sites',         label: 'Sites' },
            { value: 'transport',     label: 'Transport' },
            { value: 'earnings',      label: 'Earnings' },
            { value: 'transactions',  label: 'Transactions' },
            { value: 'statement',     label: 'Statement' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`tab-${value}`}
              className="flex-shrink-0 rounded-lg py-2 px-3 text-xs md:text-sm font-medium text-slate-400 data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow transition-all"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={panel}>
              <div className={panelHeader}>
                <Briefcase className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Work Statistics</h3>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Total Sites',      value: workStats.totalSites,      color: 'text-white' },
                  { label: 'Completed',        value: workStats.completedSites,  color: 'text-emerald-400' },
                  { label: 'Pending',          value: workStats.pendingSites,    color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-1">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-2xl font-bold ${color}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                  <span className="text-sm text-slate-400">Completion Rate</span>
                  <span className="text-2xl font-bold text-teal-400">{workStats.completionRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className={panel}>
              <div className={panelHeader}>
                <TrendingUp className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Financial Summary</h3>
              </div>
              <div className="p-5 space-y-1">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">Total Earned</span>
                  <span className="text-base font-bold text-emerald-400">{currencyFmt(totals.earned, currency)}</span>
                </div>
                {totals.withdrawn > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400">Formal Withdrawals</span>
                    <span className="text-base font-bold text-violet-400">− {currencyFmt(totals.withdrawn, currency)}</span>
                  </div>
                )}
                {totalAdvancesPaid > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400 flex items-center gap-1">
                      Transport Advances
                      <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-medium">cash paid</span>
                    </span>
                    <span className="text-base font-bold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                  <span className="text-sm font-semibold text-slate-200">Net Balance</span>
                  <span className="text-xl font-extrabold text-teal-300">{currencyFmt(currentBalance, currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── SITES ── */}
        <TabsContent value="sites" className="space-y-4">
          {/* Status counter chips */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Credited',        count: siteVisits.filter(s => s.isCompleted && s.payment).length,  icon: CheckCircle, bg: 'bg-emerald-600', iconBg: 'bg-emerald-500/30' },
              { label: 'Pending Payment', count: siteVisits.filter(s => s.isCompleted && !s.payment).length, icon: Clock,        bg: 'bg-amber-600',   iconBg: 'bg-amber-500/30' },
              { label: 'In Progress',     count: siteVisits.filter(s => !s.isCompleted).length,              icon: MapPin,       bg: 'bg-slate-600',   iconBg: 'bg-slate-500/30' },
            ].map(({ label, count, icon: Icon, bg, iconBg }) => (
              <div key={label} className={`rounded-xl ${bg} p-4 flex items-center justify-between shadow`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
                  <p className="text-3xl font-extrabold text-white mt-1 leading-none">{count}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Sites table */}
          <div className={panel}>
            <div className={panelHeader}>
              <MapPin className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Sites Visited</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{siteVisits.length}</span>
              <span className="text-xs text-slate-600 hidden sm:inline">Only completed sites receive payment</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Site Name</TableHead>
                    <TableHead className={thClass}>Status</TableHead>
                    <TableHead className={thClass}>Assigned</TableHead>
                    <TableHead className={thClass}>Completed</TableHead>
                    <TableHead className={`${thClass} text-right`}>Enum Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Transport</TableHead>
                    <TableHead className={`${thClass} text-right`}>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteVisits.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-500 h-24">No sites visited yet</TableCell></TableRow>
                  ) : siteVisits.map((site) => {
                    const enumFee   = Number(site.enumerator_fee || 0);
                    const transFee  = Number(site.transport_fee  || 0);
                    const totalFee  = enumFee + transFee > 0 ? enumFee + transFee : Number(site.cost || 0);
                    const sl        = site.status?.toLowerCase();
                    const isDone    = sl === 'completed' || sl === 'verified';
                    return (
                      <TableRow key={site.id} className="border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                        <TableCell className="text-slate-100 font-medium">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                            isDone        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : sl === 'assigned' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-600/60 text-slate-300 border border-slate-600'
                          }`}>
                            {site.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.accepted_at ? new Date(site.accepted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {enumFee > 0 ? <span className="text-teal-300">{currencyFmt(enumFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {transFee > 0 ? <span className="text-teal-300">{currencyFmt(transFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.payment ? (
                            <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />{currencyFmt(site.payment.amount, currency)}
                            </span>
                          ) : site.isCompleted ? (
                            <span className="text-amber-400 font-medium flex items-center justify-end gap-1">
                              <Clock className="w-3.5 h-3.5" />{totalFee > 0 ? currencyFmt(totalFee, currency) : 'Pending'}
                            </span>
                          ) : (
                            <span className="text-slate-600 flex items-center justify-end gap-1 text-xs">
                              <XCircle className="w-3.5 h-3.5" />Not eligible
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {siteVisits.length > 0 && (
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={4} className="text-slate-400 text-right text-sm font-semibold py-3">Totals</TableCell>
                      <TableCell className="text-right text-teal-300 font-bold">{currencyFmt(siteVisits.reduce((s, v) => s + Number(v.enumerator_fee || 0), 0), currency)}</TableCell>
                      <TableCell className="text-right text-teal-300 font-bold">{currencyFmt(siteVisits.reduce((s, v) => s + Number(v.transport_fee || 0), 0), currency)}</TableCell>
                      <TableCell className="text-right text-emerald-400 font-bold">{currencyFmt(siteVisits.reduce((s, v) => { const ef = Number(v.enumerator_fee || 0); const tf = Number(v.transport_fee || 0); return s + (ef + tf > 0 ? ef + tf : Number(v.cost || 0)); }, 0), currency)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── TRANSPORT ── */}
        <TabsContent value="transport" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const totalTransFee  = transportBreakdown.reduce((s, r) => s + r.transFee, 0);
              const totalAdvPaid   = transportBreakdown.reduce((s, r) => s + r.advPaid,  0);
              const totalRemaining = transportBreakdown.filter(r => r.remaining > 0).reduce((s, r) => s + r.remaining, 0);
              const sitesWithAdv   = transportBreakdown.filter(r => r.advPaid > 0).length;
              return [
                { label: 'Total Transport Fees',    value: currencyFmt(totalTransFee,  currency), color: 'bg-teal-700 border-teal-600',     note: `${transportBreakdown.length} site${transportBreakdown.length !== 1 ? 's' : ''}` },
                { label: 'Advances Paid in Cash',   value: currencyFmt(totalAdvPaid,   currency), color: 'bg-orange-700 border-orange-600',  note: `${sitesWithAdv} advance${sitesWithAdv !== 1 ? 's' : ''}` },
                { label: 'Balance Still Owed',      value: currencyFmt(totalRemaining, currency), color: 'bg-amber-700 border-amber-600',    note: 'unpaid portion' },
                { label: 'Net After Advances',      value: currencyFmt(totalTransFee - totalAdvPaid, currency), color: 'bg-slate-700 border-slate-600', note: 'fee − advances' },
              ].map(({ label, value, color, note }) => (
                <div key={label} className={`rounded-2xl border p-5 shadow-lg ${color}`}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">{label}</p>
                  <p className="text-lg md:text-xl font-extrabold text-white leading-none break-all">{value}</p>
                  <p className="text-[10px] text-white/50 mt-2">{note}</p>
                </div>
              ));
            })()}
          </div>

          {/* Per-site transport breakdown table */}
          <div className={panel}>
            <div className={panelHeader}>
              <Truck className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Transport Payments by Site</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{transportBreakdown.length} sites</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Site</TableHead>
                    <TableHead className={thClass}>Status</TableHead>
                    <TableHead className={thClass}>Completed</TableHead>
                    <TableHead className={`${thClass} text-right`}>Enum Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Transport Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Advance Paid</TableHead>
                    <TableHead className={`${thClass} text-right`}>Still Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transportBreakdown.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-500 h-24">No site visits found</TableCell></TableRow>
                  ) : transportBreakdown.map(site => {
                    const advStatusColors: Record<string, string> = {
                      fully_paid:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                      partially_paid:'bg-amber-500/20 text-amber-300 border-amber-500/30',
                      approved:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
                    };
                    return (
                      <TableRow key={site.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                        <TableCell className="text-slate-100 font-medium text-sm">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                            site.isCompleted ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-600/40 text-slate-300 border-slate-600'
                          }`}>{site.status}</span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-teal-300 font-medium">
                          {site.enumFee > 0 ? currencyFmt(site.enumFee, currency) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm text-teal-300 font-medium">
                          {site.transFee > 0 ? currencyFmt(site.transFee, currency) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.advPaid > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-bold text-orange-400">− {currencyFmt(site.advPaid, currency)}</span>
                              {site.advStatus && (
                                <span className={`inline-flex px-1.5 py-0 rounded text-[10px] font-semibold border ${advStatusColors[site.advStatus] || 'bg-slate-600/40 text-slate-300 border-slate-600'}`}>
                                  {site.advStatus.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                          ) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.remaining > 0.01 ? (
                            <span className="font-semibold text-amber-400">{currencyFmt(site.remaining, currency)}</span>
                          ) : site.transFee > 0 ? (
                            <span className="text-emerald-400 font-semibold">Settled</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {transportBreakdown.length > 0 && (
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold py-3">Totals</TableCell>
                      <TableCell className="text-right font-bold text-teal-300">{currencyFmt(transportBreakdown.reduce((s, r) => s + r.enumFee, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-teal-300">{currencyFmt(transportBreakdown.reduce((s, r) => s + r.transFee, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-orange-400">− {currencyFmt(transportBreakdown.reduce((s, r) => s + r.advPaid, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-amber-400">{currencyFmt(transportBreakdown.filter(r => r.remaining > 0).reduce((s, r) => s + r.remaining, 0), currency)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── EARNINGS ── */}
        <TabsContent value="earnings" className="space-y-4">
          {/* Source cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Site Visit Payments', value: earningsBreakdown.siteVisitEarnings, icon: MapPin,     bg: 'bg-teal-700 border-teal-600',     iconBg: 'bg-teal-600/60' },
              { label: 'Bonuses',             value: earningsBreakdown.bonuses,            icon: TrendingUp, bg: 'bg-amber-700 border-amber-600',   iconBg: 'bg-amber-600/60' },
              { label: 'Manual Adjustments',  value: earningsBreakdown.adjustments,        icon: Calendar,   bg: 'bg-slate-700 border-slate-600',   iconBg: 'bg-slate-600/60' },
              { label: 'Withdrawals',         value: earningsBreakdown.withdrawals,         icon: DollarSign, bg: 'bg-violet-700 border-violet-600', iconBg: 'bg-violet-600/60' },
            ].map(({ label, value, icon: Icon, bg, iconBg }) => (
              <div key={label} className={`rounded-2xl border p-5 shadow flex items-start justify-between gap-2 ${bg}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">{label}</p>
                  <p className="text-xl font-extrabold text-white truncate">{currencyFmt(value, currency)}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Totals panel */}
          <div className={panel}>
            <div className={panelHeader}>
              <DollarSign className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Summary</h3>
            </div>
            <div className="p-5 space-y-1">
              <div className="flex justify-between items-center py-3 border-b border-slate-700">
                <span className="text-sm text-slate-400">Total Earned</span>
                <span className="text-lg font-bold text-emerald-400">{currencyFmt(earningsBreakdown.siteVisitEarnings + earningsBreakdown.bonuses + earningsBreakdown.adjustments, currency)}</span>
              </div>
              {earningsBreakdown.withdrawals > 0 && (
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-sm text-slate-400">Formal Withdrawals</span>
                  <span className="text-lg font-bold text-violet-400">− {currencyFmt(earningsBreakdown.withdrawals, currency)}</span>
                </div>
              )}
              {totalAdvancesPaid > 0 && (
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    Transport Advances Paid in Cash
                    <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-medium">{downPayments.length} record{downPayments.length !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="text-lg font-bold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-4">
                <span className="text-base font-semibold text-slate-200">Net Balance</span>
                <span className="text-2xl font-extrabold text-teal-300">
                  {currencyFmt(currentBalance, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Down Payment Records detail — only shown if any exist */}
          {downPayments.length > 0 && (
            <div className={panel}>
              <div className={panelHeader}>
                <DollarSign className="w-4 h-4 text-orange-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Transport Advances Detail</h3>
                <span className="ml-auto text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-medium">{downPayments.length} advance{downPayments.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                      <TableHead className={thClass}>Site</TableHead>
                      <TableHead className={thClass}>Status</TableHead>
                      <TableHead className={`${thClass} text-right`}>Requested</TableHead>
                      <TableHead className={`${thClass} text-right`}>Paid in Cash</TableHead>
                      <TableHead className={`${thClass} text-right`}>Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downPayments.map(dp => {
                      const paid = parseFloat(dp.total_paid_amount || 0);
                      const remaining = parseFloat(dp.remaining_amount || 0);
                      const requested = parseFloat(dp.requested_amount || 0);
                      const statusColors: Record<string, string> = {
                        fully_paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                        partially_paid: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                        approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                      };
                      const statusClass = statusColors[dp.status] || 'bg-slate-600/40 text-slate-300 border-slate-600';
                      return (
                        <TableRow key={dp.id} className="border-slate-700/40 hover:bg-slate-700/20">
                          <TableCell className="text-slate-200 font-medium text-sm">{dp.site_name || '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${statusClass}`}>
                              {dp.status?.replace('_', ' ')}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-slate-400 text-sm">{currencyFmt(requested, currency)}</TableCell>
                          <TableCell className="text-right font-bold text-orange-400 text-sm">
                            {paid > 0 ? `− ${currencyFmt(paid, currency)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {remaining > 0
                              ? <span className="text-amber-400 font-medium">{currencyFmt(remaining, currency)}</span>
                              : <span className="text-slate-600">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={3} className="text-slate-400 text-right font-semibold text-sm py-3">Total Deducted from Balance</TableCell>
                      <TableCell className="text-right font-extrabold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</TableCell>
                      <TableCell className="text-right font-bold text-amber-400">
                        {currencyFmt(downPayments.reduce((s, dp) => s + parseFloat(dp.remaining_amount || 0), 0), currency)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TRANSACTIONS ── */}
        <TabsContent value="transactions">
          <div className={panel}>
            <div className={`${panelHeader} justify-between`}>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Transaction History</h3>
                <span className="text-xs bg-slate-700 text-slate-400 px-2.5 py-0.5 rounded-full font-medium">{transactions.length}</span>
              </div>
              <Button variant="outline" size="sm" onClick={recalculateWalletTotals} disabled={recalculating || transactions.length === 0} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs h-8" data-testid="button-recalculate-wallet">
                {recalculating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1.5" />}
                Sync & Recalculate
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Type</TableHead>
                    <TableHead className={thClass}>Description</TableHead>
                    <TableHead className={`${thClass} text-right`}>Amount</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-slate-500 h-24">No transactions yet</TableCell></TableRow>
                  ) : transactions.map((txn) => (
                    <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`} className="border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                      <TableCell className="text-slate-400 text-sm whitespace-nowrap">{new Date(txn.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-200 capitalize">
                          {txn.type.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm max-w-[220px] truncate">{txn.description || '—'}</TableCell>
                      <TableCell className="text-right">
                        {editingTxId === txn.id ? (
                          <Input type="number" value={editTxAmount} onChange={e => setEditTxAmount(e.target.value)} className="w-32 ml-auto text-right bg-slate-700 border-slate-500 text-slate-100" data-testid={`input-tx-amount-${txn.id}`} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEditTx(txn.id); if (e.key === 'Escape') cancelEditTx(); }} />
                        ) : (
                          <span className={`font-bold text-sm ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {txn.amount >= 0 ? '+' : ''}{currencyFmt(txn.amount, txn.currency)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {editingTxId === txn.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" onClick={() => saveEditTx(txn.id)} disabled={savingTx} className="h-7 w-7 text-emerald-400" data-testid={`button-save-tx-${txn.id}`}>{savingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditTx} className="h-7 w-7 text-red-400" data-testid={`button-cancel-tx-${txn.id}`}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => startEditTx(txn)} className="h-7 w-7 text-slate-500 hover:text-slate-200" data-testid={`button-edit-tx-${txn.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length > 0 && (() => {
                    const earnTypes    = ['earning', 'site_visit_fee', 'bonus', 'adjustment'];
                    const advanceTypes = ['down_payment', 'advance_deduction'];
                    const totalEarned  = transactions.filter(t => earnTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    const totalAdv     = transactions.filter(t => advanceTypes.includes(t.type)).reduce((s, t) => s + Math.abs(t.amount), 0);
                    const totalDed     = transactions.filter(t => t.amount < 0 && !advanceTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    return (
                      <>
                        <TableRow className="border-t-2 border-slate-600 bg-emerald-900/20">
                          <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold py-3">Total Earned</TableCell>
                          <TableCell className="text-right text-emerald-400 font-bold">+{currencyFmt(totalEarned, currency)}</TableCell>
                          <TableCell />
                        </TableRow>
                        {totalAdv > 0 && (
                          <TableRow className="bg-amber-900/20">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold">Advances Paid</TableCell>
                            <TableCell className="text-right text-amber-400 font-bold">− {currencyFmt(totalAdv, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        {totalDed < 0 && (
                          <TableRow className="bg-red-900/20">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold">Total Deducted</TableCell>
                            <TableCell className="text-right text-red-400 font-bold">{currencyFmt(totalDed, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        <TableRow className="bg-teal-900/20">
                          <TableCell colSpan={3} className="text-slate-200 text-right font-bold py-3">Net Balance</TableCell>
                          <TableCell className="text-right text-teal-300 font-extrabold text-base">{currencyFmt(totalEarned - totalAdv + totalDed, currency)}</TableCell>
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

        {/* ── STATEMENT ── */}
        <TabsContent value="statement" className="space-y-4">
          {/* Statement header card */}
          <div className="rounded-2xl overflow-hidden border border-teal-800/60 shadow-xl shadow-black/30">
            <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <h2 className="text-lg font-bold text-white">Wallet Statement</h2>
                </div>
                <p className="text-sm text-slate-400">{userProfile?.full_name || 'Unknown User'} · {userProfile?.email}</p>
                <p className="text-xs text-slate-500 mt-1">Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Currency: {currency}</p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Closing Balance</p>
                  <p className={`text-2xl font-extrabold ${currentBalance >= 0 ? 'text-teal-300' : 'text-red-400'}`}>
                    {currencyFmt(currentBalance, currency)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs h-8 gap-1.5"
                  data-testid="button-print-statement"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Statement
                </Button>
              </div>
            </div>
          </div>

          {/* Opening balance row + ledger */}
          <div className={panel}>
            <div className={panelHeader}>
              <History className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Full Ledger</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{statementLedger.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>#</TableHead>
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Description</TableHead>
                    <TableHead className={thClass}>Category</TableHead>
                    <TableHead className={`${thClass} text-right`}>Credit (+)</TableHead>
                    <TableHead className={`${thClass} text-right`}>Debit (−)</TableHead>
                    <TableHead className={`${thClass} text-right`}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="border-slate-700/40 bg-slate-900/30">
                    <TableCell className="text-slate-600 text-xs">—</TableCell>
                    <TableCell className="text-slate-500 text-xs">Opening Balance</TableCell>
                    <TableCell colSpan={3} className="text-slate-500 text-xs italic">Start of account</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-slate-400">{currencyFmt(0, currency)}</TableCell>
                  </TableRow>

                  {statementLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 h-24">No entries yet</TableCell>
                    </TableRow>
                  ) : statementLedger.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className={`border-slate-700/40 hover:bg-slate-700/20 transition-colors ${row.source === 'advance' ? 'bg-orange-900/10' : ''}`}
                      data-testid={`row-statement-${row.id}`}
                    >
                      <TableCell className="text-slate-600 text-xs tabular-nums">{idx + 1}</TableCell>
                      <TableCell className="text-slate-400 text-xs whitespace-nowrap tabular-nums">
                        {new Date(row.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-slate-200 text-sm max-w-[200px] md:max-w-xs">
                        <div className="truncate" title={row.description}>{row.description}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold capitalize whitespace-nowrap ${
                          row.source === 'advance'
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                            : row.credit > 0
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        }`}>
                          {row.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.credit > 0
                          ? <span className="font-bold text-emerald-400">+ {currencyFmt(row.credit, currency)}</span>
                          : <span className="text-slate-700">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.debit > 0
                          ? <span className={`font-bold ${row.source === 'advance' ? 'text-orange-400' : 'text-red-400'}`}>− {currencyFmt(row.debit, currency)}</span>
                          : <span className="text-slate-700">—</span>}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-bold text-sm ${row.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {currencyFmt(row.balance, currency)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Closing totals */}
                  {statementLedger.length > 0 && (() => {
                    const totalCredit = statementLedger.reduce((s, r) => s + r.credit, 0);
                    const totalDebit  = statementLedger.reduce((s, r) => s + r.debit,  0);
                    return (
                      <>
                        <TableRow className="border-t-2 border-slate-600 bg-slate-900/60">
                          <TableCell colSpan={4} className="text-slate-300 text-right font-bold text-sm py-4">Statement Totals</TableCell>
                          <TableCell className="text-right font-extrabold text-emerald-400 tabular-nums">+ {currencyFmt(totalCredit, currency)}</TableCell>
                          <TableCell className="text-right font-extrabold text-red-400 tabular-nums">− {currencyFmt(totalDebit, currency)}</TableCell>
                          <TableCell className={`text-right font-extrabold tabular-nums text-base ${currentBalance >= 0 ? 'text-teal-300' : 'text-red-400'}`}>
                            {currencyFmt(currentBalance, currency)}
                          </TableCell>
                        </TableRow>
                        {totalAdvancesPaid > 0 && (
                          <TableRow className="bg-orange-900/10 border-orange-800/30">
                            <TableCell colSpan={4} className="text-orange-300/70 text-right text-xs py-2">
                              Incl. transport advances deducted from balance
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right text-xs font-semibold text-orange-400 tabular-nums">
                              − {currencyFmt(totalAdvancesPaid, currency)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
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
