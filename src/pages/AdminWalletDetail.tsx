import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Wallet, WalletTransaction } from '@/types/wallet';
import { MapPin, TrendingUp, DollarSign, Briefcase, Calendar } from 'lucide-react';

const currencyFmt = (amount: number, currency: string) => 
  new Intl.NumberFormat(undefined, { 
    style: 'currency', 
    currency: currency || 'SDG', 
    currencyDisplay: 'narrowSymbol' 
  }).format(amount);

const AdminWalletDetail = () => {
  const params = useParams();
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

  const loadWalletData = async () => {
    if (!userId) return;
    
    try {
      // Load user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, hub_id')
        .eq('id', userId)
        .single();
      
      if (profileData) {
        setUserProfile(profileData);
      }

      // Load wallet
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (walletError) {
        console.error('Failed to load wallet:', walletError);
        toast({
          title: 'Error',
          description: 'Failed to load wallet data',
          variant: 'destructive',
        });
        return;
      }

      const transformedWallet: Wallet = {
        id: walletData.id,
        userId: walletData.user_id,
        balances: walletData.balances || { SDG: 0 },
        totalEarned: parseFloat(walletData.total_earned || 0),
        totalWithdrawn: parseFloat(walletData.total_withdrawn || 0),
        createdAt: walletData.created_at,
        updatedAt: walletData.updated_at,
      };

      setWallet(transformedWallet);
      setCurrency('SDG');

      // Load transactions
      const { data: txnData, error: txnError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false});

      if (txnError) {
        console.error('Failed to load transactions:', txnError);
      } else if (txnData) {
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

      // Load site visits with payment information
      const { data: sitesData, error: sitesError } = await supabase
        .from('site_visits')
        .select(`
          id,
          site_name,
          status,
          assigned_at,
          completed_at,
          site_visit_costs (
            total_cost,
            transportation_cost,
            accommodation_cost,
            meal_allowance,
            other_costs
          )
        `)
        .eq('assigned_to', userId)
        .order('assigned_at', { ascending: false });

      if (!sitesError && sitesData) {
        // Match sites with their payments from wallet transactions
        const sitesWithPayments = sitesData.map(site => {
          const payment = txnData?.find(
            t => t.site_visit_id === site.id && t.type === 'site_visit_fee'
          );
          return {
            ...site,
            payment: payment ? {
              amount: parseFloat(payment.amount),
              date: payment.created_at
            } : null
          };
        });
        setSiteVisits(sitesWithPayments);
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
    } finally {
      setLoading(false);
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
    const completedSites = siteVisits.filter(s => s.status === 'completed').length;
    const pendingSites = siteVisits.filter(s => s.status === 'assigned').length;
    const totalSites = siteVisits.length;
    const completionRate = totalSites > 0 ? (completedSites / totalSites) * 100 : 0;

    return { completedSites, pendingSites, totalSites, completionRate };
  }, [siteVisits]);

  // Compute earnings breakdown by source
  const earningsBreakdown = useMemo(() => {
    const siteVisitEarnings = transactions
      .filter(t => t.type === 'site_visit_fee')
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
    const earned = transactions
      .filter(t => ['site_visit_fee', 'bonus', 'adjustment'].includes(t.type))
      .reduce((sum, t) => sum + (t.type === 'adjustment' && t.amount < 0 ? 0 : t.amount), 0);
    
    const withdrawn = transactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return { earned, withdrawn };
  }, [transactions]);

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
    return <div className="flex items-center justify-center h-64 text-blue-300/70">Synchronizing wallet data...</div>;
  }

  if (!wallet) {
    return <div className="flex items-center justify-center h-64 text-red-400">Wallet not found</div>;
  }

  const currentBalance = wallet.balances[currency] || 0;

  return (
    <div className="relative min-h-screen pb-safe">
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>
      </div>
      
      <div className="relative space-y-4 md:space-y-6 p-3 md:p-6" data-testid="page-admin-wallet-detail">
        {/* User Header */}
        {userProfile && (
          <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl">
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="w-full sm:w-auto">
                  <CardTitle className="text-xl md:text-2xl font-bold text-blue-300 break-words">
                    {userProfile.full_name || 'Unknown User'}
                  </CardTitle>
                  <p className="text-xs md:text-sm text-blue-400/70 mt-1 break-all">{userProfile.email}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                      {userProfile.role || 'N/A'}
                    </Badge>
                    {userProfile.hub_id && (
                      <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">
                        Hub: {userProfile.hub_id}
                      </Badge>
                    )}
                  </div>
                </div>
                <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="button-adjust-balance" 
                      className="bg-gradient-to-r from-blue-600 to-purple-600 w-full sm:w-auto min-h-11"
                    >
                      Adjust Balance
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-blue-500/30">
                    <DialogHeader><DialogTitle className="text-blue-300">Manual Balance Adjustment</DialogTitle></DialogHeader>
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-blue-300">Direction</label>
                        <div className="flex gap-2">
                          <Button 
                            variant={adjDirection === 'credit' ? 'default' : 'outline'} 
                            onClick={() => setAdjDirection('credit')}
                            data-testid="button-direction-credit"
                            className="min-h-11"
                          >
                            Credit (Add)
                          </Button>
                          <Button 
                            variant={adjDirection === 'debit' ? 'default' : 'outline'} 
                            onClick={() => setAdjDirection('debit')}
                            data-testid="button-direction-debit"
                            className="min-h-11"
                          >
                            Debit (Subtract)
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-blue-300">Amount ({currency})</label>
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={adjAmount} 
                          onChange={e => setAdjAmount(e.target.value)}
                          placeholder="Enter amount"
                          data-testid="input-adjustment-amount"
                          className="bg-slate-800 border-blue-500/30 text-blue-100"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-blue-300">Reason (optional)</label>
                        <Input 
                          value={adjReason} 
                          onChange={e => setAdjReason(e.target.value)}
                          placeholder="Reason for adjustment"
                          data-testid="input-adjustment-reason"
                          className="bg-slate-800 border-blue-500/30 text-blue-100"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={handleAdjustBalance} 
                        disabled={!adjAmount}
                        data-testid="button-submit-adjustment"
                        className="bg-gradient-to-r from-green-600 to-emerald-600 min-h-11"
                      >
                        Submit Adjustment
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-blue-300 text-xs md:text-sm uppercase tracking-wider">Balance ({currency})</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent" data-testid="text-balance">
              {currencyFmt(currentBalance, currency)}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-purple-300 text-xs md:text-sm uppercase tracking-wider">Total Earned</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent p-4 md:p-6" data-testid="text-total-earned">
              {currencyFmt(wallet.totalEarned, currency)}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-cyan-300 text-xs md:text-sm uppercase tracking-wider">Total Withdrawn</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent p-4 md:p-6" data-testid="text-total-withdrawn">
              {currencyFmt(wallet.totalWithdrawn, currency)}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-900/80 to-indigo-900/80 border-indigo-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-indigo-300 text-xs md:text-sm uppercase tracking-wider">Transaction Count</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent p-4 md:p-6" data-testid="text-transaction-count">
              {transactions.length}
            </CardContent>
          </Card>
        </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-gradient-to-r from-slate-900/80 to-blue-900/80 border border-blue-500/30 backdrop-blur-xl p-1">
          <TabsTrigger 
            value="overview" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-xs md:text-sm min-h-11"
            data-testid="tab-overview"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="sites" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-xs md:text-sm min-h-11"
            data-testid="tab-sites"
          >
            Sites
          </TabsTrigger>
          <TabsTrigger 
            value="earnings" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-xs md:text-sm min-h-11"
            data-testid="tab-earnings"
          >
            Earnings
          </TabsTrigger>
          <TabsTrigger 
            value="transactions" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-xs md:text-sm min-h-11"
            data-testid="tab-transactions"
          >
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <Card className="bg-gradient-to-br from-slate-900/80 to-green-900/80 border-green-500/30 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-green-300 flex items-center gap-2 text-base md:text-lg">
                  <Briefcase className="w-4 h-4 md:w-5 md:h-5" />
                  Work Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-green-300/70">Total Sites:</span>
                  <span className="text-2xl font-bold text-green-400">{workStats.totalSites}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-300/70">Completed:</span>
                  <span className="text-xl font-bold text-emerald-400">{workStats.completedSites}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-300/70">Pending:</span>
                  <span className="text-xl font-bold text-yellow-400">{workStats.pendingSites}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-green-500/30">
                  <span className="text-green-300/70">Completion Rate:</span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    {workStats.completionRate.toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-purple-300 flex items-center gap-2 text-base md:text-lg">
                  <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
                  Financial Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Current Balance:</span>
                  <span className="text-xl font-bold text-green-400">{currencyFmt(currentBalance, currency)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Total Earned:</span>
                  <span className="text-xl font-bold text-blue-400">{currencyFmt(wallet?.totalEarned || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Total Withdrawn:</span>
                  <span className="text-xl font-bold text-pink-400">{currencyFmt(wallet?.totalWithdrawn || 0, currency)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-purple-500/30">
                  <span className="text-purple-300/70">Net Income:</span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    {currencyFmt((wallet?.totalEarned || 0) - (wallet?.totalWithdrawn || 0), currency)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sites Visited Tab */}
        <TabsContent value="sites">
          <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-blue-300 flex items-center gap-2 text-base md:text-lg">
                <MapPin className="w-4 h-4 md:w-5 md:h-5" />
                Sites Visited ({siteVisits.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 md:p-6">
              <div className="rounded-md border border-blue-500/30 overflow-x-auto smooth-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="border-blue-500/30 hover:bg-blue-500/5">
                      <TableHead className="text-blue-300">Site Name</TableHead>
                      <TableHead className="text-blue-300">Status</TableHead>
                      <TableHead className="text-blue-300">Assigned Date</TableHead>
                      <TableHead className="text-blue-300">Completed Date</TableHead>
                      <TableHead className="text-blue-300 text-right">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteVisits.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-blue-300/50 h-24">
                          No sites visited yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      siteVisits.map((site) => (
                        <TableRow key={site.id} className="border-blue-500/20 hover:bg-blue-500/5">
                          <TableCell className="text-blue-100">{site.site_name}</TableCell>
                          <TableCell>
                            <Badge className={
                              site.status === 'completed' 
                                ? 'bg-green-500/20 text-green-300 border-green-500/30'
                                : site.status === 'assigned'
                                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            }>
                              {site.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-blue-200">
                            {site.assigned_at ? new Date(site.assigned_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-blue-200">
                            {site.completed_at ? new Date(site.completed_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {site.payment ? (
                              <div>
                                <div className="text-green-400 font-semibold">
                                  {currencyFmt(site.payment.amount, currency)}
                                </div>
                                <div className="text-xs text-blue-300/50">
                                  {new Date(site.payment.date).toLocaleDateString()}
                                </div>
                              </div>
                            ) : (
                              <span className="text-yellow-400">Pending</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Earnings Breakdown Tab */}
        <TabsContent value="earnings">
          <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-purple-300 flex items-center gap-2 text-base md:text-lg">
                <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                Earnings Breakdown by Source
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-300/70">Site Visit Payments</p>
                      <p className="text-3xl font-bold text-green-400 mt-1">
                        {currencyFmt(earningsBreakdown.siteVisitEarnings, currency)}
                      </p>
                    </div>
                    <MapPin className="w-12 h-12 text-green-400/30" />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-300/70">Bonuses</p>
                      <p className="text-3xl font-bold text-yellow-400 mt-1">
                        {currencyFmt(earningsBreakdown.bonuses, currency)}
                      </p>
                    </div>
                    <TrendingUp className="w-12 h-12 text-yellow-400/30" />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-300/70">Manual Adjustments</p>
                      <p className={`text-3xl font-bold mt-1 ${
                        earningsBreakdown.adjustments >= 0 ? 'text-blue-400' : 'text-red-400'
                      }`}>
                        {currencyFmt(earningsBreakdown.adjustments, currency)}
                      </p>
                    </div>
                    <Calendar className="w-12 h-12 text-blue-400/30" />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-pink-500/10 border border-pink-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-pink-300/70">Withdrawals</p>
                      <p className="text-3xl font-bold text-pink-400 mt-1">
                        {currencyFmt(earningsBreakdown.withdrawals, currency)}
                      </p>
                    </div>
                    <DollarSign className="w-12 h-12 text-pink-400/30" />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-lg text-blue-200">Total Income:</span>
                  <span className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {currencyFmt(
                      earningsBreakdown.siteVisitEarnings + 
                      earningsBreakdown.bonuses + 
                      earningsBreakdown.adjustments,
                      currency
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-cyan-300 text-base md:text-lg">Transaction History ({transactions.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 md:p-6">
              <div className="rounded-md border border-cyan-500/30 overflow-x-auto smooth-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-500/30 hover:bg-cyan-500/5">
                      <TableHead className="text-cyan-300">Date</TableHead>
                      <TableHead className="text-cyan-300">Type</TableHead>
                      <TableHead className="text-cyan-300">Description</TableHead>
                      <TableHead className="text-cyan-300 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-cyan-300/50 h-24">
                          No transactions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((txn) => (
                        <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`} className="border-cyan-500/20 hover:bg-cyan-500/5">
                          <TableCell className="text-cyan-100">{new Date(txn.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 capitalize">
                              {txn.type.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-cyan-200">{txn.description || '-'}</TableCell>
                          <TableCell className="text-right">
                            <span className={txn.amount >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                              {txn.amount >= 0 ? '+' : ''}{currencyFmt(txn.amount, txn.currency)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default AdminWalletDetail;
