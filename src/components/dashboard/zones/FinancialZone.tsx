import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, CreditCard, TrendingUp, Receipt, Wallet, ArrowUpDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/context/AppContext';

export const FinancialZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { roles } = useAppContext();

  const isFinanceOrAdmin = roles?.some(r => 
    r.toLowerCase() === 'admin' || r.toLowerCase() === 'financialadmin'
  );

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-green-500/10 border border-green-500/20 flex-shrink-0">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Financial Operations</h2>
              <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">Budget tracking, costs, and wallet management</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 h-8 px-3 text-xs self-start">
            <TrendingUp className="h-3 w-3" />
            Finance Zone
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-lg mx-auto h-auto p-1 bg-muted/30">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <TrendingUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <DollarSign className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Budget</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Receipt className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Costs</span>
          </TabsTrigger>
          <TabsTrigger value="wallets" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Wallet className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Wallets</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0 SDG</div>
                <p className="text-xs text-muted-foreground">Allocated this quarter</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Spent</CardTitle>
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0 SDG</div>
                <p className="text-xs text-muted-foreground">Total expenditure</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Costs</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Awaiting approval</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Team wallets</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Budget Utilization
              </CardTitle>
              <CardDescription>Monthly budget tracking and utilization overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No budget data available
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Budget Management
              </CardTitle>
              <CardDescription>View and manage project budgets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No budget entries to display
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Cost Submissions
              </CardTitle>
              <CardDescription>Review and approve cost submissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No pending cost submissions
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Wallet Overview
              </CardTitle>
              <CardDescription>All team member wallets and balances</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No wallets to display
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
