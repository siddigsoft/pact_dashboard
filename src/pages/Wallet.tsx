import { useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Wallet as WalletIcon, TrendingUp, TrendingDown, Clock, Check, X, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { DEFAULT_CURRENCY } from '@/types/wallet';

const formatCurrency = (amount: number, currency: string = DEFAULT_CURRENCY) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const WalletPage = () => {
  const { currentUser } = useAppContext();
  const { 
    wallet, 
    transactions, 
    withdrawalRequests, 
    stats, 
    loading, 
    createWithdrawalRequest,
    cancelWithdrawalRequest,
    getBalance 
  } = useWallet();

  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [withdrawalMethod, setWithdrawalMethod] = useState('');

  const currentBalance = getBalance(DEFAULT_CURRENCY);

  const handleWithdrawalRequest = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (amount <= 0 || amount > currentBalance) {
      return;
    }

    await createWithdrawalRequest(amount, withdrawalReason, withdrawalMethod);
    setWithdrawalDialogOpen(false);
    setWithdrawalAmount('');
    setWithdrawalReason('');
    setWithdrawalMethod('');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'site_visit_fee':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'withdrawal':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'bonus':
        return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'penalty':
        return <TrendingDown className="w-4 h-4 text-orange-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

  const getWithdrawalStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
      case 'approved':
        return <Badge variant="default" className="gap-1 bg-green-600"><Check className="w-3 h-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><X className="w-3 h-3" />Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="gap-1">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <WalletIcon className="w-8 h-8" />
            My Wallet
          </h1>
          <p className="text-muted-foreground mt-1">Track your earnings and manage withdrawals</p>
        </div>
        <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" data-testid="button-request-withdrawal">
              <TrendingDown className="w-4 h-4 mr-2" />
              Request Withdrawal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Withdrawal</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount ({DEFAULT_CURRENCY})</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  max={currentBalance}
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  placeholder="Enter amount"
                  data-testid="input-withdrawal-amount"
                />
                <p className="text-sm text-muted-foreground">
                  Available balance: {formatCurrency(currentBalance)}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  placeholder="Transportation costs, etc."
                  data-testid="input-withdrawal-reason"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="method">Payment Method (Optional)</Label>
                <Input
                  id="method"
                  value={withdrawalMethod}
                  onChange={(e) => setWithdrawalMethod(e.target.value)}
                  placeholder="Bank transfer, Mobile money, etc."
                  data-testid="input-withdrawal-method"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setWithdrawalDialogOpen(false)}
                data-testid="button-cancel-withdrawal"
              >
                Cancel
              </Button>
              <Button
                onClick={handleWithdrawalRequest}
                disabled={!withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
                data-testid="button-submit-withdrawal"
              >
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Current Balance
            </CardTitle>
            <WalletIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(currentBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available for withdrawal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Total Earned
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(stats?.totalEarned || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.completedSiteVisits || 0} site visits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Pending Withdrawals
            </CardTitle>
            <Clock className="w-4 h-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(stats?.pendingWithdrawals || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Total Withdrawn
            </CardTitle>
            <TrendingDown className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(stats?.totalWithdrawn || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All-time withdrawals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
            Withdrawals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTransactionIcon(transaction.type)}
                              <span className="text-sm capitalize">
                                {transaction.type.replace('_', ' ')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {transaction.description || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className={`text-right font-medium tabular-nums ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.amount >= 0 ? '+' : ''}
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {transaction.balanceAfter !== undefined
                              ? formatCurrency(transaction.balanceAfter, transaction.currency)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {withdrawalRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No withdrawal requests yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Supervisor Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawalRequests.map((request) => (
                        <TableRow key={request.id} data-testid={`row-withdrawal-${request.id}`}>
                          <TableCell>{getWithdrawalStatusBadge(request.status)}</TableCell>
                          <TableCell className="font-medium tabular-nums">
                            {formatCurrency(request.amount, request.currency)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.requestReason || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(request.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.supervisorNotes || '-'}
                          </TableCell>
                          <TableCell>
                            {request.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelWithdrawalRequest(request.id)}
                                data-testid={`button-cancel-${request.id}`}
                              >
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WalletPage;
