import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { adminListWallets } from '@/context/wallet/supabase';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  ExternalLink,
  History,
  MapPin,
  FileText,
  RefreshCw,
  Search,
  Download,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

export default function WalletReports() {
  const { withdrawalRequests } = useWallet();
  const { users } = useUser();
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<'month' | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [walletRows, setWalletRows] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [txLoading, setTxLoading] = useState(false);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  const fetchTransactions = useCallback(async (page: number, size: number) => {
    setTxLoading(true);
    try {
      const { count } = await supabase
        .from('wallet_transactions')
        .select('id', { count: 'exact', head: true });
      setTotalCount(count || 0);

      const from = (page - 1) * size;
      const to = from + size - 1;
      const { data: txData } = await supabase
        .from('wallet_transactions')
        .select('*, mmp_site_entries!wallet_transactions_site_visit_id_fkey(site_name, site_code, state, locality)')
        .order('created_at', { ascending: false })
        .range(from, to);
      setAllTransactions(txData || []);
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await adminListWallets({ pageSize: 500 });
      setWalletRows(data || []);
      await fetchTransactions(currentPage, pageSize);
    } catch (err) {
      console.error('Error loading wallet reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchTransactions(currentPage, pageSize);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [timeframe]);

  const formatCurrency = (amount: number, currency: string = 'SDG') => {
    return new Intl.NumberFormat('en-SD', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const filteredTransactions = useMemo(() => {
    if (timeframe === 'all') return allTransactions;
    return allTransactions.filter((tx) => {
      const txDate = new Date(tx.created_at);
      return isWithinInterval(txDate, currentMonth);
    });
  }, [allTransactions, timeframe, currentMonth]);

  const filteredWithdrawals = useMemo(() => {
    if (timeframe === 'all') return withdrawalRequests;
    return withdrawalRequests.filter((req) => {
      const reqDate = new Date(req.createdAt);
      return isWithinInterval(reqDate, currentMonth);
    });
  }, [withdrawalRequests, timeframe, currentMonth]);

  const walletSummary = useMemo(() => {
    const totalBalance = walletRows.reduce((sum, w) => {
      const bal = w.balances ? Object.values(w.balances as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0) : 0;
      return sum + bal;
    }, 0);
    const totalEarned = walletRows.reduce((sum, w) => sum + (w.totalEarned || 0), 0);
    const totalWithdrawn = walletRows.reduce((sum, w) => sum + (w.totalWithdrawn || 0), 0);
    const activeWallets = walletRows.filter(w => {
      const bal = w.balances ? Object.values(w.balances as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0) : 0;
      return bal > 0;
    }).length;

    const earningTx = filteredTransactions.filter(t => t.type === 'earning' || t.type === 'site_visit_fee' || t.type === 'adjustment' || Number(t.amount) > 0);
    const withdrawalTx = filteredTransactions.filter(t => t.type === 'withdrawal' || Number(t.amount) < 0);
    const totalTxEarnings = earningTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const totalTxWithdrawals = withdrawalTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    return {
      totalBalance,
      totalEarned,
      totalWithdrawn,
      activeWallets,
      totalWallets: walletRows.length,
      totalTxEarnings,
      totalTxWithdrawals,
      totalTransactions: filteredTransactions.length,
    };
  }, [walletRows, filteredTransactions]);

  const withdrawalStats = useMemo(() => {
    const totalRequested = filteredWithdrawals.reduce((sum, req) => sum + req.amount, 0);
    const approvedRequests = filteredWithdrawals.filter((r) => r.status === 'approved');
    const rejectedRequests = filteredWithdrawals.filter((r) => r.status === 'rejected');
    const pendingRequests = filteredWithdrawals.filter((r) => r.status === 'pending');
    return {
      totalRequested,
      totalApproved: approvedRequests.reduce((sum, req) => sum + req.amount, 0),
      totalPending: pendingRequests.reduce((sum, req) => sum + req.amount, 0),
      requestCount: filteredWithdrawals.length,
      approvedCount: approvedRequests.length,
      rejectedCount: rejectedRequests.length,
      pendingCount: pendingRequests.length,
      approvalRate: filteredWithdrawals.length > 0
        ? (approvedRequests.length / filteredWithdrawals.length) * 100
        : 0,
    };
  }, [filteredWithdrawals]);

  const userWalletStats = useMemo(() => {
    const filtered = searchQuery
      ? walletRows.filter(w =>
          (w.owner_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (w.profiles?.email || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      : walletRows;

    return filtered
      .map((w) => {
        const balance = w.balances ? Object.values(w.balances as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0) : 0;
        const userTx = filteredTransactions.filter(t => t.user_id === w.user_id);
        const earned = userTx.filter(t => t.type === 'earning' || t.type === 'site_visit_fee' || t.type === 'adjustment' || Number(t.amount) > 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
        const withdrawn = userTx.filter(t => t.type === 'withdrawal' || Number(t.amount) < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
        const siteVisits = userTx.filter(t => t.site_visit_id).length;

        return {
          userId: w.user_id,
          walletId: w.id,
          name: w.owner_name || 'Unknown',
          email: w.profiles?.email || '',
          balance,
          totalEarned: w.totalEarned || earned,
          totalWithdrawn: w.totalWithdrawn || withdrawn,
          transactionCount: userTx.length,
          siteVisits,
        };
      })
      .sort((a, b) => b.totalEarned - a.totalEarned);
  }, [walletRows, filteredTransactions, searchQuery]);

  const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
    <Card className={`bg-gradient-to-br ${color}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            {trend && (
              <p className="text-xs text-muted-foreground mt-1">{trend}</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-background/50 shrink-0">
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading wallet reports...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-wallet-reports-title">Wallet Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Financial insights and wallet performance across all users</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadData} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild data-testid="link-admin-wallets">
              <Link to="/admin/wallets">
                <Wallet className="h-4 w-4 mr-2" />
                Admin Wallets
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-finance-approval">
              <Link to="/finance-approval">
                <DollarSign className="h-4 w-4 mr-2" />
                Finance Approval
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-financial-ops">
              <Link to="/financial-operations">
                <TrendingUp className="h-4 w-4 mr-2" />
                Financial Ops
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-budget">
              <Link to="/budget">
                <Activity className="h-4 w-4 mr-2" />
                Budget
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-site-visits">
              <Link to="/site-visits">
                <MapPin className="h-4 w-4 mr-2" />
                Site Visits
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-audit-logs">
              <Link to="/audit-logs">
                <History className="h-4 w-4 mr-2" />
                Audit Logs
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-documents">
              <Link to="/documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </Link>
            </Button>
          </div>
          <Tabs value={timeframe} onValueChange={(v: any) => setTimeframe(v)}>
            <TabsList>
              <TabsTrigger value="month" data-testid="tab-this-month">This Month</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all-time">All Time</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <PageInfoBanner
        title="Wallet Reports - Financial Analytics"
        description="This page shows REPORTS and ANALYTICS for all wallets across the organization. It tracks wallet balances, earnings from site visits, withdrawals, and per-user performance. Use this page for auditing, compliance checks, and understanding financial patterns across teams."
        descriptionAr="تعرض هذه الصفحة التقارير والتحليلات لجميع المحافظ عبر المنظمة. تتتبع أرصدة المحافظ والأرباح من زيارات المواقع والسحوبات والأداء لكل مستخدم. استخدم هذه الصفحة للتدقيق والتحقق من الامتثال وفهم الأنماط المالية عبر الفرق."
        workflowSteps={[
          { step: 1, role: 'Field Staff', action: 'Complete site visits', description: 'Data collectors complete site visits and fees are credited to their wallets.' },
          { step: 2, role: 'System', action: 'Credits wallets', description: 'The system automatically calculates fees (enumerator + transport) and credits wallets upon site visit completion.' },
          { step: 3, role: 'Field Staff', action: 'Request withdrawals', description: 'Team members request withdrawals from their wallets when needed.' },
          { step: 4, role: 'Finance Admin', action: 'Reviews reports here', description: 'All wallet activity is summarized on this page for tracking, auditing, and export.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'موظف ميداني', action: 'إكمال زيارات المواقع', description: 'يكمل جامعو البيانات زيارات المواقع ويتم إضافة الرسوم إلى محافظهم.' },
          { step: 2, role: 'النظام', action: 'يضيف للمحافظ', description: 'يحسب النظام تلقائياً الرسوم (رسوم العداد + النقل) ويضيفها للمحافظ عند إكمال زيارة الموقع.' },
          { step: 3, role: 'موظف ميداني', action: 'يطلب السحب', description: 'يطلب أعضاء الفريق السحب من محافظهم عند الحاجة.' },
          { step: 4, role: 'مدير المالية', action: 'يراجع التقارير هنا', description: 'تُلخَّص جميع أنشطة المحافظ في هذه الصفحة للتتبع والتدقيق والتصدير.' },
        ]}
      />

      {/* Wallet Overview KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Wallets"
          value={walletSummary.totalWallets}
          icon={Wallet}
          trend={`${walletSummary.activeWallets} with balance`}
          color="from-blue-500/10 to-blue-500/5"
        />
        <StatCard
          title="Total Earned"
          value={formatCurrency(walletSummary.totalEarned)}
          icon={ArrowUpCircle}
          trend={`${walletSummary.totalTransactions} transactions`}
          color="from-green-500/10 to-green-500/5"
        />
        <StatCard
          title="Total Withdrawn"
          value={formatCurrency(walletSummary.totalWithdrawn)}
          icon={ArrowDownCircle}
          trend={`${withdrawalStats.approvedCount} approved withdrawals`}
          color="from-red-500/10 to-red-500/5"
        />
        <StatCard
          title="Net Balance (All)"
          value={formatCurrency(walletSummary.totalEarned - walletSummary.totalWithdrawn)}
          icon={DollarSign}
          trend={`Across ${walletSummary.activeWallets} active wallets`}
          color="from-purple-500/10 to-purple-500/5"
        />
      </div>

      <Tabs defaultValue="userwallets" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="userwallets" data-testid="tab-user-wallets">
            <Users className="w-4 h-4 mr-2" />
            Per-User Wallets
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-recent-transactions">
            <Activity className="w-4 h-4 mr-2" />
            Recent Transactions
          </TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawal-requests">
            <ArrowDownCircle className="w-4 h-4 mr-2" />
            Withdrawal Requests
          </TabsTrigger>
        </TabsList>

        {/* Per-User Wallets Tab */}
        <TabsContent value="userwallets">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    All User Wallets ({userWalletStats.length})
                  </CardTitle>
                  <CardDescription>
                    Balance, earnings, and activity for each user
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-wallets"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Total Earned</TableHead>
                      <TableHead className="text-right">Total Withdrawn</TableHead>
                      <TableHead className="text-right">Site Visits</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userWalletStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No wallet data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {userWalletStats.map((stat) => (
                          <TableRow key={stat.userId} data-testid={`row-wallet-${stat.userId}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{stat.name}</p>
                                <p className="text-xs text-muted-foreground">{stat.email}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-bold">
                              <span className={stat.balance > 0 ? 'text-green-600 dark:text-green-400' : ''}>
                                {formatCurrency(stat.balance)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                              {formatCurrency(stat.totalEarned)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {stat.totalWithdrawn > 0 ? (
                                <span className="text-red-600 dark:text-red-400">{formatCurrency(stat.totalWithdrawn)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <Badge variant="secondary">{stat.siteVisits}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{stat.transactionCount}</TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/admin/wallets/${stat.userId}`)}
                                data-testid={`button-view-wallet-${stat.userId}`}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-semibold border-t-2">
                          <TableCell className="font-bold">TOTALS ({userWalletStats.length} users)</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-lg">
                            {formatCurrency(userWalletStats.reduce((s, u) => s + u.balance, 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(userWalletStats.reduce((s, u) => s + u.totalEarned, 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(userWalletStats.reduce((s, u) => s + u.totalWithdrawn, 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">
                            {userWalletStats.reduce((s, u) => s + u.siteVisits, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">
                            {userWalletStats.reduce((s, u) => s + u.transactionCount, 0)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Transactions ({totalCount})
              </CardTitle>
              <CardDescription>
                All wallet transactions across all users — page {currentPage} of {totalPages}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading transactions...</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 && !txLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {filteredTransactions.map((tx) => {
                          const userName = walletRows.find(w => w.user_id === tx.user_id)?.owner_name || 'Unknown';
                          const siteName = tx.mmp_site_entries?.site_name || '';
                          return (
                            <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                              </TableCell>
                              <TableCell>
                                <span className="font-medium text-sm">{userName}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={Number(tx.amount) >= 0 ? 'default' : 'destructive'} className="capitalize">
                                  {(tx.type || '').replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">
                                {tx.description || '-'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {siteName || '-'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">
                                <span className={Number(tx.amount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {Number(tx.amount) >= 0 ? '+' : ''}{formatCurrency(Number(tx.amount))}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredTransactions.length > 0 && (
                          <>
                            <TableRow className="bg-green-500/10 font-semibold border-t-2">
                              <TableCell colSpan={5} className="text-right text-green-700 dark:text-green-300">Page Earned:</TableCell>
                              <TableCell className="text-right tabular-nums font-bold text-green-600 dark:text-green-400">
                                +{formatCurrency(filteredTransactions.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0))}
                              </TableCell>
                            </TableRow>
                            {filteredTransactions.some(t => Number(t.amount) < 0) && (
                              <TableRow className="bg-red-500/10 font-semibold">
                                <TableCell colSpan={5} className="text-right text-red-700 dark:text-red-300">Page Deducted:</TableCell>
                                <TableCell className="text-right tabular-nums font-bold text-red-600 dark:text-red-400">
                                  {formatCurrency(filteredTransactions.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0))}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow className="bg-blue-500/10 font-semibold">
                              <TableCell colSpan={5} className="text-right text-blue-700 dark:text-blue-300">Page Net:</TableCell>
                              <TableCell className="text-right tabular-nums font-bold text-blue-600 dark:text-blue-400 text-lg">
                                {formatCurrency(filteredTransactions.reduce((s, t) => s + Number(t.amount), 0))}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t" data-testid="pagination-controls">
                <div className="flex items-center gap-2" data-testid="pagination-page-size">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(val) => {
                      setPageSize(Number(val));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25" data-testid="option-page-size-25">25</SelectItem>
                      <SelectItem value="50" data-testid="option-page-size-50">50</SelectItem>
                      <SelectItem value="100" data-testid="option-page-size-100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground" data-testid="text-page-indicator">
                    Page {currentPage} of {totalPages} ({totalCount} total)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || txLoading}
                    data-testid="button-previous-page"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || txLoading}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawal Requests Tab */}
        <TabsContent value="withdrawals">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowUpCircle className="w-5 h-5 text-green-600" />
                    Approved
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-3xl font-bold tabular-nums text-green-600">
                        {withdrawalStats.approvedCount}
                      </span>
                      <span className="text-sm text-muted-foreground">requests</span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-xl font-bold tabular-nums">{formatCurrency(withdrawalStats.totalApproved)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-yellow-600" />
                    Pending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-3xl font-bold tabular-nums text-yellow-600">
                        {withdrawalStats.pendingCount}
                      </span>
                      <span className="text-sm text-muted-foreground">requests</span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-xl font-bold tabular-nums">{formatCurrency(withdrawalStats.totalPending)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowDownCircle className="w-5 h-5 text-red-600" />
                    Rejected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-3xl font-bold tabular-nums text-red-600">
                        {withdrawalStats.rejectedCount}
                      </span>
                      <span className="text-sm text-muted-foreground">requests</span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-xl font-bold tabular-nums">{formatCurrency(withdrawalStats.totalRequested)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Withdrawal request table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Withdrawal Request History ({filteredWithdrawals.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWithdrawals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No withdrawal requests yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {filteredWithdrawals.map((req) => {
                            const user = users.find(u => u.id === req.userId);
                            return (
                              <TableRow key={req.id} data-testid={`row-withdrawal-${req.id}`}>
                                <TableCell className="text-sm whitespace-nowrap">
                                  {format(new Date(req.createdAt), 'MMM d, yyyy h:mm a')}
                                </TableCell>
                                <TableCell className="font-medium">{user?.name || req.userId}</TableCell>
                                <TableCell>
                                  <Badge variant={
                                    req.status === 'approved' ? 'default' :
                                    req.status === 'rejected' ? 'destructive' :
                                    'secondary'
                                  } className="capitalize">
                                    {req.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm max-w-[200px] truncate">{req.requestReason || '-'}</TableCell>
                                <TableCell className="text-right tabular-nums font-semibold">
                                  {formatCurrency(req.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-semibold border-t-2">
                            <TableCell colSpan={4} className="text-right font-bold">Total Requested:</TableCell>
                            <TableCell className="text-right tabular-nums font-bold text-lg">
                              {formatCurrency(withdrawalStats.totalRequested)}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
