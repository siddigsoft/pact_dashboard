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
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10 border border-green-500/20">
              <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Financial Operations</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget tracking, costs, and wallet management</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 h-7 text-xs">
            <TrendingUp className="h-3 w-3" />
            Finance Zone
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-lg h-auto p-1 bg-muted/30">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-xs">Budget</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Receipt className="h-3.5 w-3.5" />
            <span className="text-xs">Costs</span>
          </TabsTrigger>
          <TabsTrigger value="wallets" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-xs">Wallets</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
