
import React from "react";
import { Transaction } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart, FileBarChart, PieChart, DollarSign, TrendingUp, TrendingDown, AlertTriangle, MapPin } from "lucide-react";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from "recharts";

interface FinancialDashboardProps {
  transactions: Transaction[];
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ transactions }) => {
  // Calculate financial metrics
  const totalIncome = transactions
    .filter(t => t.type === "credit")
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalExpenses = transactions
    .filter(t => t.type === "debit")
    .reduce((sum, t) => sum + t.amount, 0);
  
  const netBalance = totalIncome - totalExpenses;
  
  // Budget is assumed to be 10000 for demonstration
  const totalBudget = 10000;
  const budgetRemaining = totalBudget - totalExpenses;
  const budgetUsedPercentage = Math.round((totalExpenses / totalBudget) * 100);

  // Get currency from the first transaction or default to SDG
  const currency = "SDG"; // Fixed to SDG only

  // Generate expense data by category for the pie chart
  const expenseCategories = [
    { name: "Permit Fees", value: 0 },
    { name: "Transportation", value: 0 },
    { name: "Logistics", value: 0 },
    { name: "Other", value: 0 },
  ];

  // Calculate expenses by category
  transactions
    .filter(t => t.type === "debit" && t.operationalCosts)
    .forEach(t => {
      expenseCategories[0].value += t.operationalCosts?.permitFees || 0;
      expenseCategories[1].value += t.operationalCosts?.transportationFees || 0;
      expenseCategories[2].value += t.operationalCosts?.logisticsFees || 0;
      expenseCategories[3].value += t.operationalCosts?.otherFees || 0;
    });

  // Generate monthly data for the bar chart
  const monthlyData = [
    { name: "Jan", income: 0, expenses: 0 },
    { name: "Feb", income: 0, expenses: 0 },
    { name: "Mar", income: 0, expenses: 0 },
    { name: "Apr", income: 0, expenses: 0 },
    { name: "May", income: 0, expenses: 0 },
    { name: "Jun", income: 0, expenses: 0 },
  ];

  // Populate monthly data (simplified for demo)
  monthlyData[0].income = Math.round(totalIncome * 0.2);
  monthlyData[0].expenses = Math.round(totalExpenses * 0.15);
  monthlyData[1].income = Math.round(totalIncome * 0.15);
  monthlyData[1].expenses = Math.round(totalExpenses * 0.2);
  monthlyData[2].income = Math.round(totalIncome * 0.25);
  monthlyData[2].expenses = Math.round(totalExpenses * 0.25);
  monthlyData[3].income = Math.round(totalIncome * 0.1);
  monthlyData[3].expenses = Math.round(totalExpenses * 0.1);
  monthlyData[4].income = Math.round(totalIncome * 0.15);
  monthlyData[4].expenses = Math.round(totalExpenses * 0.15);
  monthlyData[5].income = Math.round(totalIncome * 0.15);
  monthlyData[5].expenses = Math.round(totalExpenses * 0.15);

  // Colors for the pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  // Calculate transportation fee total
  const totalTransportationFee = transactions
    .filter(t => t.type === "debit" && t.operationalCosts?.transportationFees)
    .reduce((sum, t) => sum + (t.operationalCosts?.transportationFees || 0), 0);

  // Group transactions by site for per-site analysis
  const siteTransactions = transactions
    .filter(t => t.siteVisitId)
    .reduce((sites, transaction) => {
      const siteId = transaction.siteVisitId || 'unknown';
      if (!sites[siteId]) {
        sites[siteId] = {
          id: siteId,
          totalAmount: 0,
          transportationFees: 0,
          transactions: []
        };
      }
      
      sites[siteId].totalAmount += transaction.amount;
      sites[siteId].transportationFees += transaction.operationalCosts?.transportationFees || 0;
      sites[siteId].transactions.push(transaction);
      
      return sites;
    }, {} as Record<string, {id: string, totalAmount: number, transportationFees: number, transactions: Transaction[]}>);

  const siteFinancialData = Object.values(siteTransactions);

  // Check if there's no transaction data
  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financial Dashboard</CardTitle>
          <CardDescription>
            No financial data available yet
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <BarChart className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
          <p className="mt-4 text-sm text-muted-foreground">
            Start making transactions to see your financial dashboard
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Budget Overview
          </CardTitle>
          <CardDescription>Current budget status and allocation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget Progress */}
          <div>
            <div className="flex justify-between mb-1 items-center">
              <span className="text-sm font-medium">Budget Usage</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${budgetUsedPercentage > 80 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {budgetUsedPercentage}%
                </span>
                {budgetUsedPercentage > 80 && 
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                }
              </div>
            </div>
            <Progress value={budgetUsedPercentage} className="h-2" />
          </div>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Income</p>
                    <p className="text-xl font-bold text-green-600">{currency} {totalIncome.toLocaleString()}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-xl font-bold text-red-600">{currency} {totalExpenses.toLocaleString()}</p>
                  </div>
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Transportation Fees</p>
                    <p className="text-xl font-bold text-amber-600">{currency} {totalTransportationFee.toLocaleString()}</p>
                  </div>
                  <MapPin className="h-6 w-6 text-amber-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Balance</p>
                    <p className={`text-xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currency} {netBalance.toLocaleString()}
                    </p>
                  </div>
                  <DollarSign className={`h-6 w-6 ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Per-Site Financial Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Per-Site Financial Breakdown
          </CardTitle>
          <CardDescription>Financial allocation per site with transportation fees</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Site ID</th>
                  <th className="text-left py-3 px-4">Total Budget</th>
                  <th className="text-left py-3 px-4">Transportation Fee</th>
                  <th className="text-left py-3 px-4">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {siteFinancialData.length > 0 ? (
                  siteFinancialData.map((site, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-muted/50" : ""}>
                      <td className="py-2 px-4">{site.id}</td>
                      <td className="py-2 px-4">{currency} {site.totalAmount.toLocaleString()}</td>
                      <td className="py-2 px-4">{currency} {site.transportationFees.toLocaleString()}</td>
                      <td className="py-2 px-4">
                        {totalExpenses > 0 ? 
                          `${Math.round((site.totalAmount / totalExpenses) * 100)}%` : 
                          "0%"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      No per-site financial data available
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t font-medium">
                <tr>
                  <td className="py-3 px-4">Total</td>
                  <td className="py-3 px-4">{currency} {totalExpenses.toLocaleString()}</td>
                  <td className="py-3 px-4">{currency} {totalTransportationFee.toLocaleString()}</td>
                  <td className="py-3 px-4">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expense Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Expense Distribution
            </CardTitle>
            <CardDescription>Breakdown of operational costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={expenseCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expenseCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(value) => [`${currency} ${value}`, 'Amount']} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Financial Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-primary" />
              Monthly Financial Trends
            </CardTitle>
            <CardDescription>Income vs Expenses over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${currency} ${value}`, '']} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10B981" />
                  <Bar dataKey="expenses" name="Expenses" fill="#EF4444" />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Alerts */}
      {budgetUsedPercentage > 80 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Budget Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>Your budget usage is at {budgetUsedPercentage}%. Consider adjusting spending or requesting a budget increase.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
