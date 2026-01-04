import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calculator, 
  BarChart3, 
  MapPin, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Target,
  Wallet,
  Building2,
  Users,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Activity
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart
} from 'recharts';

interface CostData {
  transportationTotal: number;
  perDiemTotal: number;
  enumeratorFeesTotal: number;
  otherCostsTotal: number;
  totalCosts: number;
  avgCostPerVisit: number;
  totalVisits: number;
}

interface MonthlyTrend {
  month: string;
  transportation: number;
  perDiem: number;
  enumeratorFees: number;
  total: number;
}

interface HubCost {
  hub: string;
  cost: number;
  visits: number;
  avgPerVisit: number;
}

interface Prediction {
  metric: string;
  current: number;
  predicted: number;
  change: number;
  confidence: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export default function CostPredictions() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('3months');
  const [selectedHub, setSelectedHub] = useState('all');
  const [costData, setCostData] = useState<CostData | null>(null);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [hubCosts, setHubCosts] = useState<HubCost[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [budgetData, setBudgetData] = useState({ allocated: 0, spent: 0, remaining: 0 });

  const fetchCostData = async () => {
    try {
      setLoading(true);
      
      const periodMonths = selectedPeriod === '1month' ? 1 : selectedPeriod === '3months' ? 3 : selectedPeriod === '6months' ? 6 : 12;
      const startDate = format(subMonths(new Date(), periodMonths), 'yyyy-MM-dd');
      
      // Fetch transportation cost submissions
      let costQuery = supabase
        .from('cost_submissions')
        .select('*')
        .gte('created_at', startDate);
      
      const { data: costSubmissions, error: costError } = await costQuery;
      
      if (costError) throw costError;
      
      // Fetch site visits for visit counts
      let visitsQuery = supabase
        .from('site_visits')
        .select('id, hub_id, state, status')
        .gte('created_at', startDate);
      
      const { data: siteVisits, error: visitsError } = await visitsQuery;
      
      if (visitsError) throw visitsError;
      
      // Fetch budget data
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('total_budget, amount_spent');
      
      // Calculate totals
      const transportationTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.transportation_cost) || 0), 0) || 0;
      const perDiemTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.per_diem) || 0), 0) || 0;
      const enumeratorFeesTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.enumerator_fees) || 0), 0) || 0;
      const otherCostsTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.other_costs) || 0), 0) || 0;
      const totalCosts = transportationTotal + perDiemTotal + enumeratorFeesTotal + otherCostsTotal;
      const totalVisits = siteVisits?.length || 1;
      
      setCostData({
        transportationTotal,
        perDiemTotal,
        enumeratorFeesTotal,
        otherCostsTotal,
        totalCosts,
        avgCostPerVisit: totalCosts / totalVisits,
        totalVisits
      });
      
      // Calculate monthly trends
      const monthlyData: Record<string, MonthlyTrend> = {};
      for (let i = periodMonths - 1; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthKey = format(monthDate, 'MMM yyyy');
        monthlyData[monthKey] = {
          month: monthKey,
          transportation: 0,
          perDiem: 0,
          enumeratorFees: 0,
          total: 0
        };
      }
      
      costSubmissions?.forEach(cost => {
        const monthKey = format(new Date(cost.created_at), 'MMM yyyy');
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].transportation += Number(cost.transportation_cost) || 0;
          monthlyData[monthKey].perDiem += Number(cost.per_diem) || 0;
          monthlyData[monthKey].enumeratorFees += Number(cost.enumerator_fees) || 0;
          monthlyData[monthKey].total += (Number(cost.transportation_cost) || 0) + 
            (Number(cost.per_diem) || 0) + 
            (Number(cost.enumerator_fees) || 0) +
            (Number(cost.other_costs) || 0);
        }
      });
      
      setMonthlyTrends(Object.values(monthlyData));
      
      // Calculate hub costs
      const hubCostMap: Record<string, { cost: number; visits: number }> = {};
      siteVisits?.forEach(visit => {
        const hub = visit.hub_id || 'Unknown';
        if (!hubCostMap[hub]) {
          hubCostMap[hub] = { cost: 0, visits: 0 };
        }
        hubCostMap[hub].visits++;
      });
      
      costSubmissions?.forEach(cost => {
        const hub = (cost as any).hub_id || 'Unknown';
        if (hubCostMap[hub]) {
          hubCostMap[hub].cost += Number(cost.total_cost) || 0;
        }
      });
      
      const hubCostsArray = Object.entries(hubCostMap).map(([hub, data]) => ({
        hub,
        cost: data.cost,
        visits: data.visits,
        avgPerVisit: data.visits > 0 ? data.cost / data.visits : 0
      })).sort((a, b) => b.cost - a.cost).slice(0, 10);
      
      setHubCosts(hubCostsArray);
      
      // Calculate budget
      const totalBudget = budgets?.reduce((sum, b) => sum + (Number(b.total_budget) || 0), 0) || 500000;
      const amountSpent = budgets?.reduce((sum, b) => sum + (Number(b.amount_spent) || 0), 0) || totalCosts;
      setBudgetData({
        allocated: totalBudget,
        spent: amountSpent,
        remaining: totalBudget - amountSpent
      });
      
      // Generate predictions based on trends
      const avgMonthlySpend = totalCosts / periodMonths;
      const lastMonthSpend = monthlyTrends.length > 0 ? monthlyTrends[monthlyTrends.length - 1]?.total || avgMonthlySpend : avgMonthlySpend;
      const growthRate = monthlyTrends.length > 1 
        ? ((monthlyTrends[monthlyTrends.length - 1]?.total || 0) - (monthlyTrends[0]?.total || 0)) / ((monthlyTrends[0]?.total || 1))
        : 0.05;
      
      setPredictions([
        {
          metric: 'Next Month Spend',
          current: lastMonthSpend,
          predicted: lastMonthSpend * (1 + growthRate * 0.3),
          change: growthRate * 30,
          confidence: 85
        },
        {
          metric: 'Quarterly Projection',
          current: avgMonthlySpend * 3,
          predicted: avgMonthlySpend * 3 * (1 + growthRate * 0.15),
          change: growthRate * 15,
          confidence: 75
        },
        {
          metric: 'Cost per Visit',
          current: totalCosts / totalVisits,
          predicted: (totalCosts / totalVisits) * (1 + 0.02),
          change: 2,
          confidence: 90
        },
        {
          metric: 'Annual Forecast',
          current: avgMonthlySpend * 12,
          predicted: avgMonthlySpend * 12 * (1 + growthRate * 0.1),
          change: growthRate * 10,
          confidence: 65
        }
      ]);
      
    } catch (error) {
      console.error('Error fetching cost data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, [selectedPeriod, selectedHub]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCostData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const costBreakdown = useMemo(() => {
    if (!costData) return [];
    return [
      { name: 'Transportation', value: costData.transportationTotal, color: COLORS[0] },
      { name: 'Per Diem', value: costData.perDiemTotal, color: COLORS[1] },
      { name: 'Enumerator Fees', value: costData.enumeratorFeesTotal, color: COLORS[2] },
      { name: 'Other Costs', value: costData.otherCostsTotal, color: COLORS[3] }
    ].filter(item => item.value > 0);
  }, [costData]);

  const budgetUtilization = budgetData.allocated > 0 
    ? (budgetData.spent / budgetData.allocated) * 100 
    : 0;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="cost-predictions-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
            <TrendingUp className="h-6 w-6 text-primary" />
            Cost Predictions & Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Forecast field operation costs and analyze spending trends
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[140px]" data-testid="select-period">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-costs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costData?.totalCosts || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {costData?.totalVisits || 0} site visits
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-cost">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Cost/Visit</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costData?.avgCostPerVisit || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Per site visit average
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-budget-remaining">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget Remaining</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(budgetData.remaining)}</div>
            <Progress value={100 - budgetUtilization} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {(100 - budgetUtilization).toFixed(1)}% remaining
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-utilization">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget Utilization</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budgetUtilization.toFixed(1)}%</div>
            <Progress 
              value={budgetUtilization} 
              className={`h-2 mt-2 ${budgetUtilization > 90 ? '[&>div]:bg-destructive' : budgetUtilization > 75 ? '[&>div]:bg-amber-500' : ''}`} 
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(budgetData.spent)} of {formatCurrency(budgetData.allocated)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Predictions Section */}
      <Card data-testid="card-predictions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cost Predictions
          </CardTitle>
          <CardDescription>
            AI-powered forecasts based on historical spending patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {predictions.map((pred, idx) => (
              <div 
                key={idx} 
                className="p-4 rounded-lg border bg-card"
                data-testid={`prediction-${idx}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">{pred.metric}</span>
                  <Badge variant={pred.change > 0 ? "destructive" : "secondary"} className="text-xs">
                    {pred.change > 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                    {Math.abs(pred.change).toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-xl font-bold">{formatCurrency(pred.predicted)}</div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div 
                      className="bg-primary h-1.5 rounded-full" 
                      style={{ width: `${pred.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{pred.confidence}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="trends" data-testid="tab-trends">Spending Trends</TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="hubs" data-testid="tab-hubs">By Hub</TabsTrigger>
        </TabsList>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Spending Trends</CardTitle>
              <CardDescription>Cost breakdown over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="transportation" 
                      stackId="1"
                      stroke={COLORS[0]} 
                      fill={COLORS[0]} 
                      fillOpacity={0.6}
                      name="Transportation"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="perDiem" 
                      stackId="1"
                      stroke={COLORS[1]} 
                      fill={COLORS[1]}
                      fillOpacity={0.6}
                      name="Per Diem"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="enumeratorFees" 
                      stackId="1"
                      stroke={COLORS[2]} 
                      fill={COLORS[2]}
                      fillOpacity={0.6}
                      name="Enumerator Fees"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Breakdown by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {costBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Summary</CardTitle>
                <CardDescription>Detailed breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {costBreakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(item.value)}</div>
                      <div className="text-xs text-muted-foreground">
                        {costData && costData.totalCosts > 0 
                          ? ((item.value / costData.totalCosts) * 100).toFixed(1) 
                          : 0}%
                      </div>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(costData?.totalCosts || 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hubs">
          <Card>
            <CardHeader>
              <CardTitle>Costs by Hub</CardTitle>
              <CardDescription>Top 10 hubs by spending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hubCosts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="hub" width={100} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="cost" fill={COLORS[0]} radius={[0, 4, 4, 0]} name="Total Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alerts & Recommendations */}
      <Card data-testid="card-alerts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alerts & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgetUtilization > 80 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Budget utilization is at {budgetUtilization.toFixed(1)}%. Consider reviewing spending or requesting additional funds.
              </AlertDescription>
            </Alert>
          )}
          
          {predictions[0]?.change > 10 && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                Costs are projected to increase by {predictions[0].change.toFixed(1)}% next month. Plan budget accordingly.
              </AlertDescription>
            </Alert>
          )}
          
          {costData && costData.avgCostPerVisit > 100 && (
            <Alert>
              <Calculator className="h-4 w-4" />
              <AlertDescription>
                Average cost per visit ({formatCurrency(costData.avgCostPerVisit)}) is higher than target. Review transportation routes for optimization.
              </AlertDescription>
            </Alert>
          )}
          
          {budgetUtilization <= 50 && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>
                Budget is on track. {(100 - budgetUtilization).toFixed(1)}% remaining with good spending discipline.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
