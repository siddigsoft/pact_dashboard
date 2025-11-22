import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Wallet, WalletTransaction } from '@/types/wallet';

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
  const [currency, setCurrency] = useState('SDG');
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjDirection, setAdjDirection] = useState<'credit'|'debit'>('credit');
  const [loading, setLoading] = useState(true);

  const loadWalletData = async () => {
    if (!userId) return;
    
    try {
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

      const { data: txnData, error: txnError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

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
    return <div className="flex items-center justify-center h-64">Loading wallet data...</div>;
  }

  if (!wallet) {
    return <div className="flex items-center justify-center h-64">Wallet not found</div>;
  }

  const currentBalance = wallet.balances[currency] || 0;

  return (
    <div className="space-y-6" data-testid="page-admin-wallet-detail">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Balance ({currency})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" data-testid="text-balance">
            {currencyFmt(currentBalance, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Earned</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" data-testid="text-total-earned">
            {currencyFmt(wallet.totalEarned, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Withdrawn</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" data-testid="text-total-withdrawn">
            {currencyFmt(wallet.totalWithdrawn, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Transaction Count</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" data-testid="text-transaction-count">
            {transactions.length}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-adjust-balance">Adjust Balance</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Manual Balance Adjustment</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Direction</label>
                <div className="flex gap-2">
                  <Button 
                    variant={adjDirection === 'credit' ? 'default' : 'outline'} 
                    onClick={() => setAdjDirection('credit')}
                    data-testid="button-direction-credit"
                  >
                    Credit (Add)
                  </Button>
                  <Button 
                    variant={adjDirection === 'debit' ? 'default' : 'outline'} 
                    onClick={() => setAdjDirection('debit')}
                    data-testid="button-direction-debit"
                  >
                    Debit (Subtract)
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Amount ({currency})</label>
                <Input 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={adjAmount} 
                  onChange={e => setAdjAmount(e.target.value)}
                  placeholder="Enter amount"
                  data-testid="input-adjustment-amount"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Reason (optional)</label>
                <Input 
                  value={adjReason} 
                  onChange={e => setAdjReason(e.target.value)}
                  placeholder="Reason for adjustment"
                  data-testid="input-adjustment-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleAdjustBalance} 
                disabled={!adjAmount}
                data-testid="button-submit-adjustment"
              >
                Submit Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((txn) => (
                    <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`}>
                      <TableCell>{new Date(txn.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{txn.type.replace('_', ' ')}</TableCell>
                      <TableCell>{txn.description || '-'}</TableCell>
                      <TableCell className="text-right">
                        <span className={txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
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
    </div>
  );
};

export default AdminWalletDetail;
