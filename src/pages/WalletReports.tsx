import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  PieChart,
  ExternalLink,
  Clock,
  FileText,
  History,
  MapPin
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, formatDistanceToNow } from 'date-fns';

export default function WalletReports() {
  const { withdrawalRequests } = useWallet();
  const { users } = useUser();
  const [timeframe, setTimeframe] = useState<'month' | 'all'>('month');

  const currentMonth = useMemo(() => {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }, []);

  const filteredRequests = useMemo(() => {
    if (timeframe === 'all') return withdrawalRequests;
    return withdrawalRequests.filter((req) => {
      const reqDate = new Date(req.createdAt);
      return isWithinInterval(reqDate, currentMonth);
    });
  }, [withdrawalRequests, timeframe, currentMonth]);

  const stats = useMemo(() => {
    const totalRequested = filteredRequests.reduce((sum, req) => sum + req.amount, 0);
    const approvedRequests = filteredRequests.filter((r) => r.status === 'approved');
    const rejectedRequests = filteredRequests.filter((r) => r.status === 'rejected');
    const pendingRequests = filteredRequests.filter((r) => r.status === 'pending');
    const totalApproved = approvedRequests.reduce((sum, req) => sum + req.amount, 0);
    const totalRejected = rejectedRequests.reduce((sum, req) => sum + req.amount, 0);
    const totalPending = pendingRequests.reduce((sum, req) => sum + req.amount, 0);

    return {
      totalRequested,
      totalApproved,
      totalRejected,
      totalPending,
      requestCount: filteredRequests.length,
      approvedCount: approvedRequests.length,
      rejectedCount: rejectedRequests.length,
      pendingCount: pendingRequests.length,
      approvalRate: filteredRequests.length > 0 
        ? (approvedRequests.length / filteredRequests.length) * 100 
        : 0,
    };
  }, [filteredRequests]);

  const enumeratorStats = useMemo(() => {
    const enumerators = users.filter((u) => 
      u.role === 'dataCollector' || u.role === 'datacollector'
    );

    return enumerators.map((user) => {
      const userRequests = filteredRequests.filter((r) => r.userId === user.id);
      const approvedRequests = userRequests.filter((r) => r.status === 'approved');
      const totalRequested = userRequests.reduce((sum, req) => sum + req.amount, 0);
      const totalApproved = approvedRequests.reduce((sum, req) => sum + req.amount, 0);

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        requestCount: userRequests.length,
        approvedCount: approvedRequests.length,
        totalRequested,
        totalApproved,
      };
    }).filter((stat) => stat.requestCount > 0)
      .sort((a, b) => b.totalApproved - a.totalApproved);
  }, [users, filteredRequests]);

  const formatCurrency = (amount: number, currency: string = 'SDG') => {
    return new Intl.NumberFormat('en-SD', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
    <Card className={`bg-gradient-to-br ${color}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            {trend && (
              <p className="text-xs text-muted-foreground mt-1">{trend}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg bg-background/50`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-wallet-reports-title">Wallet Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Financial insights and withdrawal trends</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requested"
          value={formatCurrency(stats.totalRequested)}
          icon={DollarSign}
          trend={`${stats.requestCount} requests`}
          color="from-blue-500/10 to-blue-500/5"
        />
        <StatCard
          title="Total Approved"
          value={formatCurrency(stats.totalApproved)}
          icon={ArrowUpCircle}
          trend={`${stats.approvedCount} approved`}
          color="from-green-500/10 to-green-500/5"
        />
        <StatCard
          title="Total Pending"
          value={formatCurrency(stats.totalPending)}
          icon={Activity}
          trend={`${stats.pendingCount} pending`}
          color="from-yellow-500/10 to-yellow-500/5"
        />
        <StatCard
          title="Approval Rate"
          value={`${stats.approvalRate.toFixed(1)}%`}
          icon={TrendingUp}
          trend={`${stats.rejectedCount} rejected`}
          color="from-purple-500/10 to-purple-500/5"
        />
      </div>

      <Tabs defaultValue="datacollectors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datacollectors">
            <Users className="w-4 h-4 mr-2" />
            Data Collector Performance
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Activity className="w-4 h-4 mr-2" />
            Transaction Breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datacollectors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Data Collector Withdrawal Summary
              </CardTitle>
              <CardDescription>
                Individual data collector withdrawal statistics and performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Collector</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Total Requested</TableHead>
                    <TableHead className="text-right">Total Approved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enumeratorStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No data collector data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    enumeratorStats.map((stat) => (
                      <TableRow key={stat.userId} className="hover-elevate" data-testid={`row-collector-${stat.userId}`}>
                        <TableCell>
                          <Link 
                            to={`/users/${stat.userId}`} 
                            className="group"
                            data-testid={`link-user-${stat.userId}`}
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium group-hover:text-primary transition-colors flex items-center gap-1">
                                  {stat.name}
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </p>
                                <p className="text-xs text-muted-foreground">{stat.email}</p>
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{stat.requestCount}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={stat.approvedCount > 0 ? 'default' : 'secondary'}>
                            {stat.approvedCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(stat.totalRequested)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-bold text-green-600">
                          {formatCurrency(stat.totalApproved)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
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
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold tabular-nums text-green-600">
                      {stats.approvedCount}
                    </span>
                    <span className="text-sm text-muted-foreground">requests</span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-bold tabular-nums">{formatCurrency(stats.totalApproved)}</p>
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
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold tabular-nums text-yellow-600">
                      {stats.pendingCount}
                    </span>
                    <span className="text-sm text-muted-foreground">requests</span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-bold tabular-nums">{formatCurrency(stats.totalPending)}</p>
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
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold tabular-nums text-red-600">
                      {stats.rejectedCount}
                    </span>
                    <span className="text-sm text-muted-foreground">requests</span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-bold tabular-nums">{formatCurrency(stats.totalRejected)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
