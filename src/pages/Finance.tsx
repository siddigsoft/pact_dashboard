
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialDashboard } from "@/components/FinancialDashboard";
import { SiteVisitFinancialTracker } from "@/components/SiteVisitFinancialTracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  BadgePercent, ClipboardList, DollarSign, ReceiptText, ShieldCheck, 
  CreditCard, ArrowUpDown, FileBarChart, AlertTriangle, FileText,
  DatabaseBackup, ChevronDown, ArrowLeft, TrendingUp
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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

const Finance: React.FC = () => {
  const appContext = useAppContext();
  const [activeTab, setActiveTab] = useState("financial-tracking");
  // transactions may not be exposed on CompositeContextType in some builds — use any-cast and default to empty array
  const transactions: any[] = (appContext as any).transactions ?? [];
  const { toast } = useToast();
  const navigate = useNavigate();

  const siteVisitTransactions = transactions.filter(
    transaction => transaction.siteVisitId
  );

  const handleApprovePayment = () => {
    toast({
      title: "Payment approved",
      description: "The selected payment has been approved and will be processed shortly.",
    });
  };

  const handleResolveDispute = () => {
    toast({
      title: "Dispute resolved",
      description: "The payment dispute has been resolved and marked as completed.",
    });
  };

  const handleSetBudget = () => {
    toast({
      title: "Budget updated",
      description: "The monthly budget has been updated successfully.",
    });
  };
  
  const handleExportReport = (format: string) => {
    toast({
      title: `Exporting as ${format.toUpperCase()}`,
      description: `Your financial report is being prepared for download in ${format.toUpperCase()} format.`,
    });
  };

  const mockRecentTransactions = [
    { id: "1", amount: 450, timestamp: new Date().toISOString(), status: "normal" as const },
    { id: "2", amount: 1200, timestamp: new Date().toISOString(), status: "suspicious" as const },
    { id: "3", amount: 2500, timestamp: new Date().toISOString(), status: "blocked" as const },
  ];

  const historyData = [
    { 
      id: "h1", 
      name: "Q1 Financial Summary", 
      date: "2025-03-31", 
      type: "Quarterly", 
      format: "PDF", 
      user: "John Doe",
      size: "1.2MB"
    },
    { 
      id: "h2", 
      name: "February Budget Analysis", 
      date: "2025-02-28", 
      type: "Monthly", 
      format: "Excel", 
      user: "Sarah Williams",
      size: "3.5MB"
    },
    { 
      id: "h3", 
      name: "2024 Annual Financial Report", 
      date: "2024-12-31", 
      type: "Annual", 
      format: "PDF", 
      user: "Mike Johnson",
      size: "4.7MB"
    },
    { 
      id: "h4", 
      name: "January Payment Records", 
      date: "2025-01-31", 
      type: "Monthly", 
      format: "CSV", 
      user: "John Doe",
      size: "2.1MB"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard')}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={() => navigate('/financial-operations')}
          data-testid="button-financial-operations"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Financial Operations
        </Button>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg shadow-sm border animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-blue-700">
          Financial Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Track site visit finances, manage budgets, and view financial reports
        </p>
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
            
            <ApprovalTierAnalytics 
              pendingCount={7}
              approvedCount={24}
              escalatedCount={5}
              rejectedCount={2}
              totalTransactions={38}
            />
            
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
                    Monthly Budget Configuration
                  </CardTitle>
                  <CardDescription>Define and adjust monthly budgets for operations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Current Monthly Budget</p>
                        <p className="text-muted-foreground text-sm">Period: Apr 1 - Apr 30, 2025</p>
                      </div>
                      <p className="text-xl font-bold">SDG 10,000</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={handleSetBudget}>
                        <BadgePercent className="h-4 w-4 mr-2" />
                        Adjust Budget
                      </Button>
                      <Button variant="outline">
                        <FileBarChart className="h-4 w-4 mr-2" />
                        View Forecast
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Budget Alerts
                  </CardTitle>
                  <CardDescription>Get notified about budget constraints</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm font-medium">Transportation budget at 75% usage</p>
                    </div>
                    <div className="flex items-center gap-2 text-green-500">
                      <ShieldCheck className="h-4 w-4" />
                      <p className="text-sm font-medium">Permit fees budget healthy (30% used)</p>
                    </div>
                    <div className="flex items-center gap-2 text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm font-medium">Logistics budget critical (85% used)</p>
                    </div>
                  </div>
                  <Button variant="secondary" className="w-full">
                    Configure Alert Thresholds
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Expense Allocation
                </CardTitle>
                <CardDescription>Track and manage expenses across categories</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Permit Fees</p>
                      <p className="text-lg font-bold">SDG 2,500</p>
                      <p className="text-xs text-muted-foreground">25% of total budget</p>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Transportation</p>
                      <p className="text-lg font-bold">SDG 3,000</p>
                      <p className="text-xs text-muted-foreground">30% of total budget</p>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Logistics</p>
                      <p className="text-lg font-bold">SDG 3,500</p>
                      <p className="text-xs text-muted-foreground">35% of total budget</p>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Other Expenses</p>
                      <p className="text-lg font-bold">SDG 1,000</p>
                      <p className="text-xs text-muted-foreground">10% of total budget</p>
                    </div>
                  </Card>
                </div>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-t-4 border-t-green-500 overflow-hidden transition-all hover:shadow-md">
                <CardHeader className="bg-slate-50 pb-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Payment Approvals
                  </CardTitle>
                  <CardDescription>Manage pending payment requests</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="p-3 border rounded hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Ahmed Mohamed</p>
                          <p className="text-xs text-muted-foreground">Site ID: SV-23908</p>
                        </div>
                        <span className="text-sm font-bold">SDG 450</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="hover:scale-105 transition-transform" onClick={handleApprovePayment}>Approve</Button>
                        <Button size="sm" variant="outline">Reject</Button>
                      </div>
                    </div>
                    <div className="p-3 border rounded hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Sarah Abdalla</p>
                          <p className="text-xs text-muted-foreground">Site ID: SV-23915</p>
                        </div>
                        <span className="text-sm font-bold">SDG 650</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="hover:scale-105 transition-transform" onClick={handleApprovePayment}>Approve</Button>
                        <Button size="sm" variant="outline">Reject</Button>
                      </div>
                    </div>
                    <div className="p-3 border rounded hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Ibrahim Ali</p>
                          <p className="text-xs text-muted-foreground">Site ID: SV-23920</p>
                        </div>
                        <span className="text-sm font-bold">SDG 350</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="hover:scale-105 transition-transform" onClick={handleApprovePayment}>Approve</Button>
                        <Button size="sm" variant="outline">Reject</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-t-4 border-t-amber-500 overflow-hidden transition-all hover:shadow-md">
                <CardHeader className="bg-slate-50 pb-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Disputed Payments
                  </CardTitle>
                  <CardDescription>Resolve disputed transaction issues</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="p-3 border-2 border-amber-200 rounded bg-amber-50 hover:bg-amber-100 transition-colors">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Omar Hassan</p>
                          <p className="text-xs text-muted-foreground">Dispute: Payment amount incorrect</p>
                        </div>
                        <span className="text-sm font-bold">SDG 550</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="secondary" className="hover:scale-105 transition-transform" onClick={handleResolveDispute}>Resolve</Button>
                        <Button size="sm" variant="outline">Details</Button>
                      </div>
                    </div>
                    <div className="p-3 border-2 border-amber-200 rounded bg-amber-50 hover:bg-amber-100 transition-colors">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Fatima Osman</p>
                          <p className="text-xs text-muted-foreground">Dispute: Payment not received</p>
                        </div>
                        <span className="text-sm font-bold">SDG 400</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="secondary" className="hover:scale-105 transition-transform" onClick={handleResolveDispute}>Resolve</Button>
                        <Button size="sm" variant="outline">Details</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-t-4 border-t-indigo-500 overflow-hidden transition-all hover:shadow-md">
              <CardHeader className="bg-slate-50 pb-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Withdrawal Security Settings
                </CardTitle>
                <CardDescription>Configure security rules and withdrawal limits</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg hover:bg-blue-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-blue-100">
                        <ArrowUpDown className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Tiered Limits</p>
                        <p className="text-sm text-muted-foreground">Data Collectors: SDG 500</p>
                        <p className="text-sm text-muted-foreground">Supervisors: SDG 1,500</p>
                        <p className="text-sm text-muted-foreground">Admins: Unlimited with MFA</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-amber-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-amber-100">
                        <ClipboardList className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium">Cooldown Periods</p>
                        <p className="text-sm text-muted-foreground">Standard: 24 hours</p>
                        <p className="text-sm text-muted-foreground">Large withdrawals: 48 hours</p>
                        <p className="text-sm text-muted-foreground">Multiple withdrawals: 72 hours</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-green-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-green-100">
                        <ShieldCheck className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">Security Features</p>
                        <p className="text-sm text-muted-foreground">Multi-factor authentication</p>
                        <p className="text-sm text-muted-foreground">Approval workflows</p>
                        <p className="text-sm text-muted-foreground">Real-time fraud detection</p>
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
                    Task Payments Report
                  </CardTitle>
                  <CardDescription>Earnings per Site Visit and user</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Track all earnings organized by site visits and assigned personnel.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full">Generate Report</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Budget Summary
                  </CardTitle>
                  <CardDescription>Monitors fund usage and allocations</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Comprehensive overview of budget allocations, spending, and remaining balances.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full">Generate Report</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Audit Logs
                  </CardTitle>
                  <CardDescription>Details all financial transactions</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Complete audit trail of all financial activities for compliance and verification.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full">View Audit Logs</Button>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DatabaseBackup className="h-5 w-5 text-primary" />
                      Historical Reports
                    </CardTitle>
                    <CardDescription>Access and download previously generated reports</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Report Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Generated By</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyData.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">{report.name}</TableCell>
                          <TableCell>{report.type}</TableCell>
                          <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                          <TableCell>{report.format}</TableCell>
                          <TableCell>{report.user}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              Download
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableCaption>A list of your recent generated reports.</TableCaption>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <h3 className="text-lg font-semibold mt-2">Historical Data Trends</h3>
            <div className="grid gap-6">
              <div className="w-full">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 text-center">
                  <p className="text-blue-700">Historical trends chart will be displayed here</p>
                  <p className="text-sm text-blue-600 mt-2">
                    This placeholder represents where the MMPHistoricalTrends component will be integrated.
                  </p>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileBarChart className="h-5 w-5 text-primary" />
                    Schedule Reports
                  </CardTitle>
                  <CardDescription>Set up automated report generation and delivery</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Weekly Summary</p>
                            <p className="text-xs text-muted-foreground">Every Monday</p>
                          </div>
                          <Button variant="outline" size="sm">Edit</Button>
                        </div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Monthly Report</p>
                            <p className="text-xs text-muted-foreground">1st of month</p>
                          </div>
                          <Button variant="outline" size="sm">Edit</Button>
                        </div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Quarterly Review</p>
                            <p className="text-xs text-muted-foreground">End of quarter</p>
                          </div>
                          <Button variant="outline" size="sm">Edit</Button>
                        </div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Annual Report</p>
                            <p className="text-xs text-muted-foreground">December 31</p>
                          </div>
                          <Button variant="outline" size="sm">Edit</Button>
                        </div>
                      </Card>
                    </div>
                    <Button variant="outline">
                      <ReceiptText className="h-4 w-4 mr-2" />
                      Create New Report Schedule
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Finance;
