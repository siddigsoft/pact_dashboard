
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, BarChart3, Info, DollarSign } from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths } from "date-fns";

interface MonthlySpending {
  name: string;
  spending: number;
}

interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
}

export const BudgetForecast = () => {
  const [walletStats, setWalletStats] = useState({ totalEarned: 0, totalWithdrawn: 0 });
  const [monthlyData, setMonthlyData] = useState<MonthlySpending[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('total_earned, total_withdrawn');

        let totalEarned = 0;
        let totalWithdrawn = 0;
        (wallets || []).forEach((w: any) => {
          totalEarned += parseFloat(w.total_earned || '0');
          totalWithdrawn += parseFloat(w.total_withdrawn || '0');
        });
        setWalletStats({ totalEarned, totalWithdrawn });

        const { data: opCosts } = await supabase
          .from('operational_cost_submissions')
          .select('amount_cents, currency, expense_category, created_at, status, tier1_status, tier2_status')
          .order('created_at', { ascending: true });

        const allSubmissions = opCosts || [];
        const submissions = allSubmissions.filter((s: any) => 
          s.status !== 'rejected' && s.tier1_status !== 'rejected' && s.tier2_status !== 'rejected'
        );

        const { data: wtxData } = await supabase
          .from('wallet_transactions')
          .select('amount, type, created_at')
          .order('created_at', { ascending: true });

        const transactions = wtxData || [];

        const allDataExists = submissions.length > 0 || transactions.length > 0 || totalEarned > 0;
        setHasData(allDataExists);

        const monthly: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
          const d = subMonths(new Date(), i);
          const key = format(d, 'MMM yyyy');
          monthly[key] = 0;
        }

        submissions.forEach((s: any) => {
          if (s.created_at) {
            const month = format(new Date(s.created_at), 'MMM yyyy');
            if (monthly[month] !== undefined) {
              monthly[month] += (s.amount_cents || 0) / 100;
            }
          }
        });

        transactions.forEach((t: any) => {
          if (t.created_at && t.type === 'debit') {
            const month = format(new Date(t.created_at), 'MMM yyyy');
            if (monthly[month] !== undefined) {
              monthly[month] += parseFloat(t.amount || '0');
            }
          }
        });

        setMonthlyData(
          Object.entries(monthly).map(([name, spending]) => ({ name: name.split(' ')[0], spending }))
        );

        const catMap: Record<string, { total: number; count: number }> = {};
        submissions.forEach((s: any) => {
          const cat = s.expense_category || 'other';
          if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
          catMap[cat].total += (s.amount_cents || 0) / 100;
          catMap[cat].count += 1;
        });

        setCategoryBreakdown(
          Object.entries(catMap)
            .map(([category, data]) => ({ category, ...data }))
            .sort((a, b) => b.total - a.total)
        );
      } catch (err) {
        console.error('Error fetching budget data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const availableFunds = walletStats.totalEarned - walletStats.totalWithdrawn;
  const totalSpending = monthlyData.reduce((sum, m) => sum + m.spending, 0);

  return (
    <Card data-testid="card-budget-forecast">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <CardTitle className="text-xl flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Financial Overview
          </CardTitle>
          <Badge variant="outline">Live Data</Badge>
        </div>
        <CardDescription>Real-time financial summary from wallet and cost submission data</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-loading-budget">Loading financial data...</div>
        ) : !hasData ? (
          <div className="text-center py-8" data-testid="text-no-budget-data">
            <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No financial data available yet</p>
            <p className="text-xs text-muted-foreground mt-1">Financial overview will populate as wallet transactions and cost submissions are created</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Wallet Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">Total Earned</span>
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    </div>
                    <p className="text-lg font-bold" data-testid="text-total-earned">SDG {walletStats.totalEarned.toLocaleString()}</p>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">Total Withdrawn</span>
                      <TrendingDown className="h-4 w-4 text-amber-500" />
                    </div>
                    <p className="text-lg font-bold" data-testid="text-total-withdrawn">SDG {walletStats.totalWithdrawn.toLocaleString()}</p>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">Available Balance</span>
                      <BarChart3 className="h-4 w-4 text-blue-500" />
                    </div>
                    <p className="text-lg font-bold" data-testid="text-available-balance">SDG {availableFunds.toLocaleString()}</p>
                  </div>
                </Card>
              </div>
            </div>

            {totalSpending > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">6-Month Spending Trend</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`SDG ${Number(value).toLocaleString()}`, '']} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="spending" 
                        stroke="#10B981" 
                        name="Spending" 
                        strokeWidth={2} 
                        dot={{ r: 4 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {categoryBreakdown.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Cost Submissions by Category</h3>
                <div className="rounded-md border">
                  <div className="grid grid-cols-3 gap-2 p-2 border-b bg-muted/50 text-xs font-medium">
                    <div>Category</div>
                    <div>Total Amount</div>
                    <div>Submissions</div>
                  </div>
                  <div className="divide-y">
                    {categoryBreakdown.map((cat) => (
                      <div key={cat.category} className="grid grid-cols-3 gap-2 p-2 text-sm" data-testid={`row-category-${cat.category}`}>
                        <div className="font-medium capitalize">{cat.category.replace(/_/g, ' ')}</div>
                        <div>SDG {cat.total.toLocaleString()}</div>
                        <div>{cat.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
