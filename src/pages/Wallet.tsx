import { useState, useMemo } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Wallet as WalletIcon, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Check, 
  X, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Activity
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
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
    getBalance,
    refreshWallet,
    refreshTransactions,
    refreshWithdrawalRequests
  } = useWallet();

  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [withdrawalMethod, setWithdrawalMethod] = useState('');
  
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');

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

  const handleRefresh = async () => {
    await Promise.all([
      refreshWallet(),
      refreshTransactions(),
      refreshWithdrawalRequests()
    ]);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'site_visit_fee':
        return <ArrowUpRight className="w-4 h-4 text-green-600" />;
      case 'withdrawal':
        return <ArrowDownRight className="w-4 h-4 text-red-600" />;
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

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (transactionTypeFilter !== 'all') {
      filtered = filtered.filter(t => t.type === transactionTypeFilter);
    }

    if (dateRangeFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (dateRangeFilter) {
        case 'this_month':
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case 'last_month':
          startDate = startOfMonth(subMonths(now, 1));
          endDate = endOfMonth(subMonths(now, 1));
          break;
        case 'last_3_months':
          startDate = subMonths(now, 3);
          break;
        default:
          return filtered;
      }

      filtered = filtered.filter(t => 
        isWithinInterval(new Date(t.createdAt), { start: startDate, end: endDate })
      );
    }

    return filtered;
  }, [transactions, transactionTypeFilter, dateRangeFilter]);

  const earningsByMonth = useMemo(() => {
    const monthlyData: Record<string, number> = {};
    
    transactions
      .filter(t => t.type === 'site_visit_fee')
      .forEach(t => {
        const month = format(new Date(t.createdAt), 'MMM yyyy');
        monthlyData[month] = (monthlyData[month] || 0) + t.amount;
      });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-6);
  }, [transactions]);

  const siteVisitEarnings = useMemo(() => {
    return transactions
      .filter(t => t.type === 'site_visit_fee' && t.siteVisitId)
      .slice(0, 10);
  }, [transactions]);

  const pendingWithdrawals = withdrawalRequests.filter(r => r.status === 'pending');
  const completedWithdrawals = withdrawalRequests.filter(r => r.status === 'approved');
  const rejectedWithdrawals = withdrawalRequests.filter(r => r.status === 'rejected');

  const withdrawalSuccessRate = withdrawalRequests.length > 0
    ? (completedWithdrawals.length / withdrawalRequests.length) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header Command Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
                <WalletIcon className="w-6 h-6 text-white" />
              </div>
              My Wallet
            </h1>
            <p className="text-muted-foreground mt-1">Track earnings, manage withdrawals, and monitor your financial activity</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              data-testid="button-refresh-wallet"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
              <DialogTrigger asChild>
                <Button size="default" data-testid="button-request-withdrawal">
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
                      placeholder="Transportation costs, accommodation, etc."
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
        </div>

        {/* Status Alerts */}
        {pendingWithdrawals.length > 0 && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  You have {pendingWithdrawals.length} pending withdrawal request{pendingWithdrawals.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total amount: {formatCurrency(pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Current Balance
            </CardTitle>
            <WalletIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-br from-green-600 to-emerald-600 bg-clip-text text-transparent">
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
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              {stats?.completedSiteVisits || 0} site visits completed
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
            <div className="text-2xl font-bold tabular-nums text-orange-600">
              {formatCurrency(stats?.pendingWithdrawals || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingWithdrawals.length} request{pendingWithdrawals.length !== 1 ? 's' : ''} awaiting approval
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
              {completedWithdrawals.length} approved withdrawal{completedWithdrawals.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">Withdrawal Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold tabular-nums">{withdrawalSuccessRate.toFixed(0)}%</span>
              {withdrawalSuccessRate >= 80 ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-orange-600" />
              )}
            </div>
            <Progress value={withdrawalSuccessRate} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {completedWithdrawals.length} approved, {rejectedWithdrawals.length} rejected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">Average Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {transactions.length > 0
                ? formatCurrency(transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length)
                : formatCurrency(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {stats?.totalTransactions || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">Activity Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-lg font-semibold">Active</p>
              <p className="text-xs text-muted-foreground">
                Last transaction: {transactions.length > 0 ? format(new Date(transactions[0].createdAt), 'MMM dd, yyyy') : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
            Withdrawals
          </TabsTrigger>
          <TabsTrigger value="earnings" data-testid="tab-earnings">
            Earnings
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Recent Transactions
                </CardTitle>
                <CardDescription>Your latest 5 transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.slice(0, 5).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-3 rounded-md border">
                        <div className="flex items-center gap-3">
                          {getTransactionIcon(transaction.type)}
                          <div>
                            <p className="text-sm font-medium capitalize">
                              {transaction.type.replace('_', ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {transaction.amount >= 0 ? '+' : ''}
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Earnings Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Earnings by Month
                </CardTitle>
                <CardDescription>Last 6 months earnings trend</CardDescription>
              </CardHeader>
              <CardContent>
                {earningsByMonth.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No earnings data yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {earningsByMonth.map(([month, amount]) => {
                      const maxAmount = Math.max(...earningsByMonth.map(([, amt]) => amt));
                      const percentage = (amount / maxAmount) * 100;
                      return (
                        <div key={month} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{month}</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(amount)}</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Site Visit Earnings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Recent Site Visit Earnings
              </CardTitle>
              <CardDescription>Fees earned from your latest site visits</CardDescription>
            </CardHeader>
            <CardContent>
              {siteVisitEarnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No site visit earnings yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site Visit ID</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteVisitEarnings.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-mono text-sm">
                            {transaction.siteVisitId?.slice(0, 8)}...
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {transaction.description || 'Site visit fee'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(transaction.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-green-600">
                            +{formatCurrency(transaction.amount, transaction.currency)}
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

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>All your wallet transactions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-transaction-type">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="site_visit_fee">Site Visit Fees</SelectItem>
                      <SelectItem value="withdrawal">Withdrawals</SelectItem>
                      <SelectItem value="bonus">Bonuses</SelectItem>
                      <SelectItem value="penalty">Penalties</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-date-range">
                      <Calendar className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No transactions found</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((transaction) => (
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
                          <TableCell className={`text-right font-semibold tabular-nums ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.amount >= 0 ? '+' : ''}
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
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

        {/* Withdrawals Tab */}
        <TabsContent value="withdrawals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal Requests</CardTitle>
              <CardDescription>Manage and track your withdrawal requests</CardDescription>
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
                        <TableHead>Method</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Supervisor Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawalRequests.map((request) => (
                        <TableRow key={request.id} data-testid={`row-withdrawal-${request.id}`}>
                          <TableCell>{getWithdrawalStatusBadge(request.status)}</TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {formatCurrency(request.amount, request.currency)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.requestReason || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {request.paymentMethod || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(request.createdAt), 'MMM dd, yyyy HH:mm')}
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
                                <X className="w-3 h-3 mr-1" />
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

        {/* Earnings Tab */}
        <TabsContent value="earnings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Visit Earnings Breakdown</CardTitle>
              <CardDescription>Detailed earnings from all completed site visits</CardDescription>
            </CardHeader>
            <CardContent>
              {siteVisitEarnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No site visit earnings yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site Visit ID</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date Earned</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteVisitEarnings.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-mono text-sm">
                            {transaction.siteVisitId?.slice(0, 12)}...
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {transaction.description || 'Site visit fee'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-green-600">
                            +{formatCurrency(transaction.amount, transaction.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
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

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Summary</CardTitle>
                <CardDescription>Your wallet activity overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <Receipt className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium">Total Transactions</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{stats?.totalTransactions || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium">Site Visits Completed</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{stats?.completedSiteVisits || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-medium">Withdrawal Requests</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{withdrawalRequests.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium">Approved Withdrawals</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{completedWithdrawals.length}</span>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Earnings Growth</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {stats?.totalEarned && stats.totalEarned > 0 ? '100%' : '0%'}
                    </span>
                  </div>
                  <Progress value={stats?.totalEarned && stats.totalEarned > 0 ? 100 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Withdrawal Rate</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {stats?.totalEarned && stats.totalEarned > 0
                        ? ((stats.totalWithdrawn / stats.totalEarned) * 100).toFixed(0)
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={stats?.totalEarned && stats.totalEarned > 0
                      ? (stats.totalWithdrawn / stats.totalEarned) * 100
                      : 0} 
                    className="h-2" 
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Approval Success</span>
                    <span className="text-sm font-semibold tabular-nums">{withdrawalSuccessRate.toFixed(0)}%</span>
                  </div>
                  <Progress value={withdrawalSuccessRate} className="h-2" />
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Account Status: <span className="font-semibold text-green-600">Active & Healthy</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WalletPage;
