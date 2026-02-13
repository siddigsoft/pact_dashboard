
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { DataFreshnessBadge } from "@/components/realtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialDashboard } from "@/components/FinancialDashboard";
import { SiteVisitFinancialTracker } from "@/components/SiteVisitFinancialTracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  BadgePercent, ClipboardList, DollarSign, ReceiptText, ShieldCheck, 
  CreditCard, ArrowUpDown, FileBarChart, AlertTriangle, FileText,
  DatabaseBackup, ChevronDown, ArrowLeft, TrendingUp, RefreshCw,
  Wallet, Clock, CheckCircle2, Info
} from "lucide-react";
import { FraudDetection } from "@/components/FraudDetection";
import { ApprovalTierAnalytics } from "@/components/ApprovalTierAnalytics";
import { BudgetForecast } from "@/components/BudgetForecast";
import { FraudPreventionDashboard } from "@/components/FraudPreventionDashboard";
import { RetainerProcessingCard } from "@/components/admin/RetainerProcessingCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/context/wallet/WalletContext";
import { useBudget } from "@/context/budget/BudgetContext";
import { useUser } from "@/context/user/UserContext";
import { supabase } from "@/integrations/supabase/client";
import type { AdminWithdrawalRequest } from "@/types/wallet";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatCurrencyCents = (cents: number) => {
  return formatCurrency(cents / 100);
};

const Finance: React.FC = () => {
  const appContext = useAppContext();
  const [activeTab, setActiveTab] = useState("financial-tracking");
  const transactions: any[] = (appContext as any).transactions ?? [];
  const { toast } = useToast();
  const navigate = useNavigate();

  const { adminListWithdrawalRequests, adminProcessWithdrawal, adminRejectWithdrawal } = useWallet();
  const { projectBudgets, stats: budgetStats, budgetAlerts, loading: budgetLoading } = useBudget();
  const { users } = useUser();

  const [pendingWithdrawals, setPendingWithdrawals] = useState<AdminWithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(true);

  const [expenseCategories, setExpenseCategories] = useState<{ category: string; total_cents: number; count: number }[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);

  const [walletSummary, setWalletSummary] = useState<{ totalWallets: number; totalBalance: number; totalWithdrawn: number; pendingCount: number; pendingAmount: number }>({ totalWallets: 0, totalBalance: 0, totalWithdrawn: 0, pendingCount: 0, pendingAmount: 0 });

  const fetchWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true);
    try {
      const requests = await adminListWithdrawalRequests();
      setPendingWithdrawals(requests.filter(r => r.status === 'supervisor_approved'));
      setWalletSummary(prev => ({
        ...prev,
        pendingCount: requests.filter(r => r.status === 'supervisor_approved').length,
        pendingAmount: requests.filter(r => r.status === 'supervisor_approved').reduce((s, r) => s + r.amount, 0),
      }));
    } catch (err) {
      console.error('Failed to fetch withdrawals:', err);
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [adminListWithdrawalRequests]);

  const fetchExpenseCategories = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const { data, error } = await supabase
        .from('operational_cost_submissions')
        .select('expense_category, amount_cents, tier1_status, tier2_status');
      if (error) throw error;

      const grouped: Record<string, { total_cents: number; count: number }> = {};
      (data || []).forEach((row: any) => {
        const cat = row.expense_category || 'Other';
        const isApproved = row.tier2_status === 'approved' || (row.tier1_status === 'approved' && !row.tier2_status);
        if (!isApproved) return;
        if (!grouped[cat]) grouped[cat] = { total_cents: 0, count: 0 };
        grouped[cat].total_cents += Math.abs(row.amount_cents || 0);
        grouped[cat].count++;
      });

      setExpenseCategories(
        Object.entries(grouped).map(([category, vals]) => ({ category, ...vals }))
          .sort((a, b) => b.total_cents - a.total_cents)
      );
    } catch (err) {
      console.error('Failed to fetch expense categories:', err);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  const fetchWalletSummary = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('balances, total_earned, total_withdrawn');
      if (error) throw error;

      let totalBalance = 0;
      let totalWithdrawn = 0;
      (data || []).forEach((w: any) => {
        const bal = typeof w.balances === 'object' ? (w.balances?.SDG || 0) : 0;
        totalBalance += Number(bal) || 0;
        totalWithdrawn += parseFloat(w.total_withdrawn || 0);
      });

      setWalletSummary(prev => ({
        ...prev,
        totalWallets: (data || []).length,
        totalBalance,
        totalWithdrawn,
      }));
    } catch (err) {
      console.error('Failed to fetch wallet summary:', err);
    }
  }, []);

  useEffect(() => {
    fetchWithdrawals();
    fetchExpenseCategories();
    fetchWalletSummary();
  }, [fetchWithdrawals, fetchExpenseCategories, fetchWalletSummary]);

  const siteVisitTransactions = transactions.filter(
    transaction => transaction.siteVisitId
  );

  const getUserName = (userId: string, request?: AdminWithdrawalRequest) => {
    if (request?.requesterName) return request.requesterName;
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  };

  const handleApprovePayment = async (requestId: string) => {
    try {
      await adminProcessWithdrawal(requestId, 'Approved from finance page');
      toast({
        title: "Payment approved",
        description: "The payment has been processed and funds released.",
      });
      fetchWithdrawals();
    } catch {
      toast({
        title: "Error",
        description: "Failed to process payment.",
        variant: "destructive",
      });
    }
  };

  const handleRejectPayment = async (requestId: string) => {
    try {
      await adminRejectWithdrawal(requestId, 'Rejected from finance page');
      toast({
        title: "Payment rejected",
        description: "The withdrawal request has been rejected.",
      });
      fetchWithdrawals();
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject payment.",
        variant: "destructive",
      });
    }
  };
  
  const handleExportReport = (format: string) => {
    toast({
      title: `Exporting as ${format.toUpperCase()}`,
      description: `Your financial report is being prepared for download in ${format.toUpperCase()} format.`,
    });
  };

  const activeAlerts = budgetAlerts.filter(a => a.status === 'active');

  const totalBudgetCents = projectBudgets.reduce((s, b) => s + b.totalBudgetCents, 0);
  const totalSpentCents = projectBudgets.reduce((s, b) => s + b.spentBudgetCents, 0);
  const totalRemainingCents = projectBudgets.reduce((s, b) => s + b.remainingBudgetCents, 0);
  const utilizationRate = totalBudgetCents > 0 ? ((totalSpentCents / totalBudgetCents) * 100) : 0;

  const totalExpenseCents = expenseCategories.reduce((s, c) => s + c.total_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard')}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/budget')}
            data-testid="button-goto-budget"
          >
            <BadgePercent className="h-4 w-4 mr-2" />
            Budget
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/cost-submission')}
            data-testid="button-goto-cost-submissions"
          >
            <ReceiptText className="h-4 w-4 mr-2" />
            Cost Submissions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wallet')}
            data-testid="button-goto-wallet"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Wallet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/wallets')}
            data-testid="button-goto-admin-wallets"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Admin Wallets
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/down-payment-approval')}
            data-testid="button-goto-down-payment"
          >
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Down-Payments
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/financial-operations')}
            data-testid="button-financial-operations"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Financial Operations
          </Button>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg shadow-sm border animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-blue-700">
              Financial Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Track site visit finances, manage budgets, and view financial reports
            </p>
          </div>
          <DataFreshnessBadge />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2 p-1 h-auto">
          <TabsTrigger value="financial-tracking" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Site Visit Finances</span>
              <span className="sm:hidden">Finances</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              <span className="hidden sm:inline">Financial Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="budget" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />
              <span className="hidden sm:inline">Budget Management</span>
              <span className="sm:hidden">Budget</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Payment Processing</span>
              <span className="sm:hidden">Payments</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Reports & Audit</span>
              <span className="sm:hidden">Reports</span>
            </span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="financial-tracking" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Site Visit Financial Tracking</h2>
            <SiteVisitFinancialTracker transactions={siteVisitTransactions} />
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Financial Dashboard</h2>
            
            <ApprovalTierAnalytics />
            
            <BudgetForecast />
            
            <FinancialDashboard transactions={transactions} />
          </div>
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Budget Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Budget Overview
                  </CardTitle>
                  <CardDescription>Summary across all project budgets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {budgetLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-6 w-1/2" />
                    </div>
                  ) : projectBudgets.length === 0 ? (
                    <div className="text-center py-6">
                      <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No project budgets have been created yet.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/budget')}>
                        Go to Budget Page
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Total Budget</p>
                          <p className="text-muted-foreground text-sm">Across {projectBudgets.length} project{projectBudgets.length !== 1 ? 's' : ''}</p>
                        </div>
                        <p className="text-xl font-bold" data-testid="text-total-budget">{formatCurrencyCents(totalBudgetCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Spent</p>
                        <p className="text-sm font-medium">{formatCurrencyCents(totalSpentCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Remaining</p>
                        <p className="text-sm font-medium text-green-600">{formatCurrencyCents(totalRemainingCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Utilization</p>
                        <p className="text-sm font-medium">{utilizationRate.toFixed(1)}%</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => navigate('/budget')}>
                          <BadgePercent className="h-4 w-4 mr-2" />
                          Manage Budgets
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/budget')}>
                          <FileBarChart className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Budget Alerts
                  </CardTitle>
                  <CardDescription>Active budget notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {budgetLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-3/4" />
                    </div>
                  ) : activeAlerts.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <ShieldCheck className="h-8 w-8 text-green-500 mb-2" />
                      <p className="text-sm font-medium text-green-600">All budgets are healthy</p>
                      <p className="text-xs text-muted-foreground mt-1">No active alerts at this time.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeAlerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className={`flex items-center gap-2 ${alert.severity === 'critical' ? 'text-red-500' : alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}>
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          <p className="text-sm font-medium">{alert.title || alert.message}</p>
                        </div>
                      ))}
                      {activeAlerts.length > 5 && (
                        <p className="text-xs text-muted-foreground">+{activeAlerts.length - 5} more alerts</p>
                      )}
                    </div>
                  )}
                  <Button variant="secondary" className="w-full" onClick={() => navigate('/budget')}>
                    View All Budget Alerts
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Expense Allocation by Category
                </CardTitle>
                <CardDescription>Approved cost submissions grouped by expense category</CardDescription>
              </CardHeader>
              <CardContent>
                {expensesLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <Card key={i} className="p-3">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-6 w-20 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </Card>
                    ))}
                  </div>
                ) : expenseCategories.length === 0 ? (
                  <div className="text-center py-6">
                    <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No approved cost submissions found.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/cost-submission')}>
                      Go to Cost Submissions
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {expenseCategories.slice(0, 8).map((cat) => (
                      <Card key={cat.category} className="p-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground capitalize">{cat.category.replace(/_/g, ' ')}</p>
                          <p className="text-lg font-bold" data-testid={`text-expense-${cat.category}`}>{formatCurrencyCents(cat.total_cents)}</p>
                          <p className="text-xs text-muted-foreground">
                            {totalExpenseCents > 0 ? ((cat.total_cents / totalExpenseCents) * 100).toFixed(0) : 0}% of total ({cat.count} submission{cat.count !== 1 ? 's' : ''})
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Payment Processing
            </h2>

            <RetainerProcessingCard />
          
            <FraudPreventionDashboard />
            
            <Card className="border-t-4 border-t-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Pending Withdrawal Approvals
                </CardTitle>
                <CardDescription>Supervisor-approved withdrawal requests ready for finance processing</CardDescription>
              </CardHeader>
              <CardContent>
                {withdrawalsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="p-3 border rounded">
                        <div className="flex justify-between">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-5 w-20" />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Skeleton className="h-8 w-20" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : pendingWithdrawals.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
                    <p className="font-medium">No pending withdrawals</p>
                    <p className="text-sm text-muted-foreground mt-1">All withdrawal requests have been processed.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/finance-approval')}>
                      View Finance Approval Page
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingWithdrawals.slice(0, 10).map((request) => {
                      const userName = getUserName(request.userId, request);
                      return (
                        <div key={request.id} className="p-3 border rounded hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors" data-testid={`card-withdrawal-${request.id}`}>
                          <div className="flex justify-between flex-wrap gap-2">
                            <div>
                              <p className="font-medium">{userName}</p>
                              <p className="text-xs text-muted-foreground">
                                {request.paymentMethod && <span className="capitalize">{request.paymentMethod}</span>}
                                {request.requestReason && <span> - {request.requestReason}</span>}
                              </p>
                              {request.createdAt && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {new Date(request.createdAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-bold">{formatCurrency(request.amount)}</span>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={() => handleApprovePayment(request.id)} data-testid={`button-approve-${request.id}`}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectPayment(request.id)} data-testid={`button-reject-${request.id}`}>Reject</Button>
                            <Button size="sm" variant="ghost" onClick={() => navigate('/finance-approval')}>Details</Button>
                          </div>
                        </div>
                      );
                    })}
                    {pendingWithdrawals.length > 10 && (
                      <div className="text-center pt-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/finance-approval')}>
                          View all {pendingWithdrawals.length} pending withdrawals
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-indigo-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Wallet className="h-5 w-5 text-primary" />
                  Wallet Summary
                </CardTitle>
                <CardDescription>Overview of all wallet balances and withdrawal activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <Wallet className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Wallets</p>
                        <p className="text-lg font-bold" data-testid="text-total-wallets">{walletSummary.totalWallets}</p>
                        <p className="text-sm text-muted-foreground">Active user wallets</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Balance</p>
                        <p className="text-lg font-bold" data-testid="text-total-balance">{formatCurrency(walletSummary.totalBalance)}</p>
                        <p className="text-sm text-muted-foreground">Combined SDG balance</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                        <ArrowUpDown className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Withdrawn</p>
                        <p className="text-lg font-bold" data-testid="text-total-withdrawn">{formatCurrency(walletSummary.totalWithdrawn)}</p>
                        <p className="text-sm text-muted-foreground">All-time withdrawals</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
                        <Clock className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">Pending Payments</p>
                        <p className="text-lg font-bold" data-testid="text-pending-payments">{walletSummary.pendingCount}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(walletSummary.pendingAmount)} awaiting</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <div className="grid gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Financial Reports & Audits
              </h2>
              
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="flex items-center gap-1">
                      Generate Report
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExportReport("pdf")}>PDF Report</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportReport("excel")}>Excel Spreadsheet</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportReport("csv")}>CSV Export</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Wallet Reports
                  </CardTitle>
                  <CardDescription>Transaction history and withdrawal reports</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Export wallet transactions, earnings breakdowns, and withdrawal history from the Wallet page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/wallet')} data-testid="button-goto-wallet-reports">Go to Wallet</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Budget Reports
                  </CardTitle>
                  <CardDescription>Budget allocations, spending, and forecasts</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Generate PDF, Excel, or CSV reports of budget allocations versus actual spending from the Budget page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/budget')} data-testid="button-goto-budget-reports">Go to Budget</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Cost Submission Reports
                  </CardTitle>
                  <CardDescription>Operational cost submission history</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">View and export cost submission records, approval status, and payment details from the Cost Submission page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/cost-submission')} data-testid="button-goto-cost-reports">Go to Cost Submissions</Button>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DatabaseBackup className="h-5 w-5 text-primary" />
                      Report Generation
                    </CardTitle>
                    <CardDescription>Reports can be generated and exported from their respective pages</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Reports are generated from specific pages</p>
                      <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li><strong>Wallet page</strong> - Export transaction history, monthly statements, and withdrawal reports</li>
                        <li><strong>Budget page</strong> - Generate budget vs. actual spending reports in PDF, Excel, or CSV</li>
                        <li><strong>Cost Submission page</strong> - Export cost submission records and approval summaries</li>
                        <li><strong>Finance Approval page</strong> - View payment processing history and audit trails</li>
                        <li><strong>Down-Payment page</strong> - Export advance request records</li>
                      </ul>
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
                        Navigate to the relevant page using the buttons above to generate and download reports.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart className="h-5 w-5 text-primary" />
                  Quick Navigation
                </CardTitle>
                <CardDescription>Jump to specific financial pages for detailed reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/wallet')} data-testid="button-nav-wallet">
                    <Wallet className="h-5 w-5" />
                    <span>Wallet & Transactions</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/budget')} data-testid="button-nav-budget">
                    <BadgePercent className="h-5 w-5" />
                    <span>Budget Management</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/cost-submission')} data-testid="button-nav-costs">
                    <ReceiptText className="h-5 w-5" />
                    <span>Cost Submissions</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/down-payment-approval')} data-testid="button-nav-advances">
                    <ArrowUpDown className="h-5 w-5" />
                    <span>Down-Payments</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Finance;
