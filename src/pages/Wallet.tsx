import { useState, useMemo } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import TransactionSearch, { type SearchFilters } from '@/components/wallet/TransactionSearch';
import PaymentMethodsCard from '@/components/wallet/PaymentMethodsCard';
import { exportTransactionsToCSV, exportTransactionsToPDF, exportWithdrawalsToCSV, exportWithdrawalsToPDF } from '@/lib/wallet/export';
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
  Activity,
  Zap
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
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});

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

  const handleClearAllFilters = () => {
    setSearchFilters({});
    setTransactionTypeFilter('all');
    setDateRangeFilter('all');
    setWithdrawalStatusFilter('all');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'earning':
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

    // Apply advanced search filters
    if (searchFilters.searchTerm) {
      const term = searchFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        t.siteVisitId?.toLowerCase().includes(term)
      );
    }
    
    if (searchFilters.type) {
      filtered = filtered.filter(t => t.type === searchFilters.type);
    }
    
    if (searchFilters.minAmount !== undefined) {
      filtered = filtered.filter(t => Math.abs(t.amount) >= searchFilters.minAmount!);
    }
    
    if (searchFilters.maxAmount !== undefined) {
      filtered = filtered.filter(t => Math.abs(t.amount) <= searchFilters.maxAmount!);
    }
    
    if (searchFilters.startDate) {
      const startDate = new Date(searchFilters.startDate);
      filtered = filtered.filter(t => new Date(t.createdAt) >= startDate);
    }
    
    if (searchFilters.endDate) {
      const endDate = new Date(searchFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.createdAt) <= endDate);
    }

    // Legacy quick filters
    if (transactionTypeFilter !== 'all' && !searchFilters.type) {
      // Handle both 'earning' and 'site_visit_fee' types when filtering for site visit fees
      if (transactionTypeFilter === 'earning') {
        filtered = filtered.filter(t => t.type === 'earning' || t.type === 'site_visit_fee');
      } else {
        filtered = filtered.filter(t => t.type === transactionTypeFilter);
      }
    }

    if (dateRangeFilter !== 'all' && !searchFilters.startDate && !searchFilters.endDate) {
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
  }, [transactions, transactionTypeFilter, dateRangeFilter, searchFilters]);

  const earningsByMonth = useMemo(() => {
    const monthlyData: Record<string, number> = {};
    
    transactions
      .filter(t => t.type === 'earning' || t.type === 'site_visit_fee')
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
      .filter(t => (t.type === 'earning' || t.type === 'site_visit_fee') && t.siteVisitId)
      .slice(0, 10);
  }, [transactions]);

  const pendingWithdrawals = withdrawalRequests.filter(r => r.status === 'pending');
  const completedWithdrawals = withdrawalRequests.filter(r => r.status === 'approved');
  const rejectedWithdrawals = withdrawalRequests.filter(r => r.status === 'rejected');

  const withdrawalSuccessRate = withdrawalRequests.length > 0
    ? (completedWithdrawals.length / withdrawalRequests.length) * 100
    : 0;

  const displayWithdrawals = useMemo(() => {
    switch (withdrawalStatusFilter) {
      case 'pending':
        return pendingWithdrawals;
      case 'approved':
        return completedWithdrawals;
      case 'rejected':
        return rejectedWithdrawals;
      default:
        return withdrawalRequests;
    }
  }, [withdrawalStatusFilter, withdrawalRequests, pendingWithdrawals, completedWithdrawals, rejectedWithdrawals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-blue-300/70">Synchronizing wallet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Cyber Background with Animated Grid */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative space-y-6 p-3 sm:p-4 md:p-6 lg:p-8">
        {/* Cyber Header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-gradient-to-r from-slate-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/50">
                  <WalletIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
                    My Wallet
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 animate-pulse">
                      <Zap className="w-3 h-3 mr-1" />
                      ACTIVE
                    </Badge>
                  </h1>
                  <p className="text-blue-300/80 mt-1 text-lg">
                    Cyber-Financial Command Center
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 hover:border-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                  data-testid="button-refresh-wallet"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  REFRESH
                </button>
                <button
                  type="button"
                  onClick={() => exportTransactionsToCSV(filteredTransactions, wallet)}
                  className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 text-green-300 hover:border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportTransactionsToPDF(filteredTransactions, wallet, DEFAULT_CURRENCY)}
                  className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-red-900/50 to-pink-900/50 border border-red-500/30 text-red-300 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                  data-testid="button-export-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-orange-900/50 to-amber-900/50 border border-orange-500/30 text-orange-300 hover:border-orange-400 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-orange-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-2" />
                  CLEAR FILTERS
                </button>
            <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all inline-flex items-center focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                  data-testid="button-request-withdrawal"
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  REQUEST WITHDRAWAL
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
                      className="h-11"
                      data-testid="input-withdrawal-amount"
                    />
                    <p className={`text-sm ${parseFloat(withdrawalAmount || '0') > currentBalance ? 'text-red-500' : 'text-muted-foreground'}`}>
                      Available balance: {formatCurrency(currentBalance)}
                      {parseFloat(withdrawalAmount || '0') > currentBalance && (
                        <span className="ml-2 font-medium">(Insufficient funds)</span>
                      )}
                    </p>
                    {currentBalance === 0 && (
                      <p className="text-sm text-amber-500 mt-1">
                        You need earnings in your wallet before you can request a withdrawal.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      value={withdrawalReason}
                      onChange={(e) => setWithdrawalReason(e.target.value)}
                      placeholder="Transportation costs, accommodation, etc."
                      className="min-h-[80px]"
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
                      className="h-11"
                      data-testid="input-withdrawal-method"
                    />
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-purple-500/20">
                  <button
                    type="button"
                    onClick={() => setWithdrawalDialogOpen(false)}
                    className="px-4 py-2 rounded-md bg-slate-800/50 hover:bg-slate-800/70 text-purple-200 border border-purple-500/20 transition focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-cancel-withdrawal"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdrawalRequest}
                    disabled={!withdrawalAmount || parseFloat(withdrawalAmount) <= 0 || parseFloat(withdrawalAmount) > currentBalance}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-submit-withdrawal"
                  >
                    Submit Request
                  </button>
                </div>
              </DialogContent>
            </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* Status Alerts */}
        {pendingWithdrawals.length > 0 && (
          <Card className="bg-gradient-to-r from-orange-900/50 to-red-900/50 border-orange-500/40 backdrop-blur-xl shadow-[0_0_20px_rgba(251,146,60,0.2)]">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="w-5 h-5 text-orange-400 animate-pulse" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-200">
                  You have {pendingWithdrawals.length} pending withdrawal request{pendingWithdrawals.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-orange-300/70 mt-0.5">
                  Total amount: {formatCurrency(pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-blue-300">
              Current Balance
            </CardTitle>
            <WalletIcon className="w-5 h-5 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              {formatCurrency(currentBalance)}
            </div>
            <p className="text-xs text-blue-300/70 mt-1">
              Available for withdrawal
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-purple-300">
              Total Earned
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              {formatCurrency(stats?.totalEarned || 0)}
            </div>
            <p className="text-xs text-purple-300/70 mt-1 flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              {stats?.completedSiteVisits || 0} site visits completed
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-orange-900/80 border-orange-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(251,146,60,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-orange-300">
              Pending Withdrawals
            </CardTitle>
            <Clock className="w-5 h-5 text-orange-400 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
              {formatCurrency(stats?.pendingWithdrawals || 0)}
            </div>
            <p className="text-xs text-orange-300/70 mt-1">
              {pendingWithdrawals.length} request{pendingWithdrawals.length !== 1 ? 's' : ''} awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Total Withdrawn
            </CardTitle>
            <TrendingDown className="w-5 h-5 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {formatCurrency(stats?.totalWithdrawn || 0)}
            </div>
            <p className="text-xs text-cyan-300/70 mt-1">
              {completedWithdrawals.length} approved withdrawal{completedWithdrawals.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-slate-900/80 to-green-900/80 border-green-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,197,94,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-green-300">Withdrawal Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold tabular-nums bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{withdrawalSuccessRate.toFixed(0)}%</span>
              {withdrawalSuccessRate >= 80 ? (
                <CheckCircle2 className="w-6 h-6 text-green-400 animate-pulse" />
              ) : (
                <AlertCircle className="w-6 h-6 text-orange-400 animate-pulse" />
              )}
            </div>
            <Progress value={withdrawalSuccessRate} className="h-2" />
            <p className="text-xs text-green-300/70">
              {completedWithdrawals.length} approved, {rejectedWithdrawals.length} rejected
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-indigo-900/80 border-indigo-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-indigo-300">Average Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {transactions.length > 0
                ? formatCurrency(transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length)
                : formatCurrency(0)}
            </div>
            <p className="text-xs text-indigo-300/70 mt-1">
              Across {stats?.totalTransactions || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-emerald-900/80 border-emerald-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(16,185,129,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-emerald-300">Activity Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
            <div>
              <p className="text-lg font-semibold text-emerald-300">ACTIVE</p>
              <p className="text-xs text-emerald-300/70">
                Last transaction: {transactions.length > 0 ? format(new Date(transactions[0].createdAt), 'MMM dd, yyyy') : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Transaction Search */}
      <TransactionSearch
        onSearch={(filters) => setSearchFilters(filters)}
        onClear={() => setSearchFilters({})}
        filters={searchFilters}
      />

      {/* Main Content Section */}
      <Card className="bg-gradient-to-br from-slate-900/90 to-blue-900/90 border border-blue-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <CardContent className="p-3 sm:p-4 md:p-6 lg:p-8">
          {/* Main Content Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <div className="overflow-x-auto mb-6">
              <TabsList className="inline-flex w-max bg-gradient-to-r from-slate-900/80 to-blue-900/80 border border-blue-500/30 backdrop-blur-xl p-1 min-h-[44px]">
                <TabsTrigger 
                  value="overview" 
                  data-testid="tab-overview"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  OVERVIEW
                </TabsTrigger>
                <TabsTrigger 
                  value="transactions" 
                  data-testid="tab-transactions"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  TRANSACTIONS
                </TabsTrigger>
                <TabsTrigger 
                  value="withdrawals" 
                  data-testid="tab-withdrawals"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  WITHDRAWALS
                </TabsTrigger>
                <TabsTrigger 
                  value="earnings" 
                  data-testid="tab-earnings"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  EARNINGS
                </TabsTrigger>
                <TabsTrigger 
                  value="activity" 
                  data-testid="tab-activity"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  ACTIVITY
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Transaction Search moved inside the section */}
            <div className="mb-6">
              <TransactionSearch
                onSearch={(filters) => setSearchFilters(filters)}
                onClear={() => setSearchFilters({})}
                filters={searchFilters}
              />
            </div>

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

            {/* Payment Methods Card */}
            <PaymentMethodsCard />
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
                    <SelectTrigger className="w-[160px] min-h-[44px]" data-testid="select-transaction-type">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="earning">Site Visit Fees</SelectItem>
                      <SelectItem value="withdrawal">Withdrawals</SelectItem>
                      <SelectItem value="bonus">Bonuses</SelectItem>
                      <SelectItem value="penalty">Penalties</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                    <SelectTrigger className="w-[160px] min-h-[44px]" data-testid="select-date-range">
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
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Withdrawal Requests</CardTitle>
                  <CardDescription>Manage and track your withdrawal requests</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportWithdrawalsToCSV(displayWithdrawals, withdrawalStatusFilter)}
                    className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 text-green-300 hover:border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-export-withdrawals-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportWithdrawalsToPDF(displayWithdrawals, withdrawalStatusFilter)}
                    className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-red-900/50 to-pink-900/50 border border-red-500/30 text-red-300 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-export-withdrawals-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={withdrawalStatusFilter} onValueChange={(value: any) => setWithdrawalStatusFilter(value)} className="mb-4">
                <TabsList className="grid w-full max-w-md grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="all" data-testid="tab-withdrawals-all" className="min-h-[44px] text-xs sm:text-sm">
                    All ({withdrawalRequests.length})
                  </TabsTrigger>
                  <TabsTrigger value="pending" data-testid="tab-withdrawals-pending" className="min-h-[44px] text-xs sm:text-sm">
                    Pending ({pendingWithdrawals.length})
                  </TabsTrigger>
                  <TabsTrigger value="approved" data-testid="tab-withdrawals-approved" className="min-h-[44px] text-xs sm:text-sm">
                    Approved ({completedWithdrawals.length})
                  </TabsTrigger>
                  <TabsTrigger value="rejected" data-testid="tab-withdrawals-rejected" className="min-h-[44px] text-xs sm:text-sm">
                    Rejected ({rejectedWithdrawals.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              {displayWithdrawals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No {withdrawalStatusFilter !== 'all' ? withdrawalStatusFilter : ''} withdrawal requests found</p>
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
                      {displayWithdrawals.map((request) => (
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
                              <button
                                type="button"
                                onClick={() => cancelWithdrawalRequest(request.id)}
                                className="px-3 py-1.5 text-sm rounded-md bg-red-900/20 hover:bg-red-900/30 text-red-300 border border-red-500/30 transition inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                                data-testid={`button-cancel-${request.id}`}
                              >
                                <X className="w-3 h-3 mr-1" />
                                Cancel
                              </button>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
