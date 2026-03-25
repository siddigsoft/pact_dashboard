
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Transaction } from "@/types";
import { Clipboard, BarChart, FileText, Calculator, MapPin, CalendarDays } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface SiteVisitFinancialTrackerProps {
  transactions: Transaction[];
}

export const SiteVisitFinancialTracker: React.FC<SiteVisitFinancialTrackerProps> = ({ transactions }) => {
  const [timeRange, setTimeRange] = useState<string>("all");
  const [view, setView] = useState<string>("summary");

  // Filter only site visit transactions
  const siteVisitTransactions = transactions.filter(
    transaction => transaction.siteVisitId && transaction.taskDetails
  );

  // Apply time range filtering
  const filteredTransactions = siteVisitTransactions.filter(transaction => {
    if (timeRange === "all") return true;
    
    const txDate = new Date(transaction.createdAt);
    const now = new Date();
    
    switch(timeRange) {
      case "today":
        return txDate.toDateString() === now.toDateString();
      case "week":
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return txDate >= weekAgo;
      case "month":
        const monthAgo = new Date();
        monthAgo.setMonth(now.getMonth() - 1);
        return txDate >= monthAgo;
      default:
        return true;
    }
  });

  // Calculate totals and statistics
  const totalEarned = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.type === 'credit' ? transaction.amount : 0), 
    0
  );
  
  const totalOperationalCosts = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.operationalCosts?.totalCosts || 0),
    0
  );

  const totalBaseAmount = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.taskDetails?.baseAmount || 0),
    0
  );
  
  const totalDistanceFees = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.taskDetails?.distanceFee || 0),
    0
  );
  
  const totalComplexityFees = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.taskDetails?.complexityFee || 0),
    0
  );
  
  const totalUrgencyFees = filteredTransactions.reduce(
    (total, transaction) => total + (transaction.taskDetails?.urgencyFee || 0),
    0
  );

  // Get currency from the first transaction or default to SDG
  const currency = filteredTransactions[0]?.currency || "SDG";
  
  // Calculate percentages for visualization
  const basePercentage = totalEarned > 0 ? (totalBaseAmount / totalEarned) * 100 : 0;
  const distancePercentage = totalEarned > 0 ? (totalDistanceFees / totalEarned) * 100 : 0;
  const complexityPercentage = totalEarned > 0 ? (totalComplexityFees / totalEarned) * 100 : 0;
  const urgencyPercentage = totalEarned > 0 ? (totalUrgencyFees / totalEarned) * 100 : 0;

  // Group transactions by payment status
  const paymentStatusGroups = filteredTransactions.reduce((acc, tx) => {
    acc[tx.status] = (acc[tx.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (siteVisitTransactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Site Visit Financial Tracking</CardTitle>
          <CardDescription>
            No site visit financial data available yet
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-6">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
          <p className="mt-4 text-sm text-muted-foreground">
            Site visit financial details will appear here as you complete tasks
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <Tabs value={view} onValueChange={setView} className="w-full md:w-auto">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "summary" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Site Visit Financial Summary</CardTitle>
            <CardDescription>
              Detailed financial breakdown for all site visits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart className="h-4 w-4 text-green-600" />
                    Task Fee Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Base Amount</span>
                      <span className="text-xs font-medium">{totalBaseAmount} {currency}</span>
                    </div>
                    <Progress value={basePercentage} className="h-1.5" />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Distance Fees</span>
                      <span className="text-xs font-medium">{totalDistanceFees} {currency}</span>
                    </div>
                    <Progress value={distancePercentage} className="h-1.5" />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Complexity Fees</span>
                      <span className="text-xs font-medium">{totalComplexityFees} {currency}</span>
                    </div>
                    <Progress value={complexityPercentage} className="h-1.5" />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Urgency Fees</span>
                      <span className="text-xs font-medium">{totalUrgencyFees} {currency}</span>
                    </div>
                    <Progress value={urgencyPercentage} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Completed Site Visits</span>
                      <span className="font-medium">{filteredTransactions.length}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Earnings</span>
                      <span className="font-medium text-green-600">{totalEarned} {currency}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Average Task Payment</span>
                      <span className="font-medium">
                        {filteredTransactions.length > 0 
                          ? (totalEarned / filteredTransactions.length).toFixed(2) 
                          : 0} {currency}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t">
                      <span className="text-sm font-medium">Operational Costs</span>
                      <span className="font-medium text-red-600">{totalOperationalCosts} {currency}</span>
                    </div>
                    
                    <div className="flex justify-between items-center pt-1 border-t">
                      <span className="text-sm font-medium">Net Total</span>
                      <span className="font-bold">
                        {(totalEarned - totalOperationalCosts).toFixed(2)} {currency}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-amber-600" />
                  Payment Status Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {["pending", "approved", "paid", "completed", "failed", "disputed"].map((status) => (
                    paymentStatusGroups[status] ? (
                      <Card key={status} className="text-center p-2">
                        <p className={`text-xs uppercase font-semibold ${
                          status === "completed" || status === "paid" || status === "approved" 
                            ? "text-green-600" 
                            : status === "pending" 
                              ? "text-amber-600" 
                              : "text-red-600"
                        }`}>
                          {status}
                        </p>
                        <p className="text-2xl font-bold">{paymentStatusGroups[status] || 0}</p>
                        <p className="text-xs text-muted-foreground">transactions</p>
                      </Card>
                    ) : null
                  ))}
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detailed Site Visit Finances</CardTitle>
            <CardDescription>
              Individual transaction details for site visits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredTransactions.map((tx) => (
              <Card key={tx.id} className="overflow-hidden">
                <div className={`h-1 w-full ${
                  tx.status === "completed" || tx.status === "paid" || tx.status === "approved" 
                    ? "bg-green-500" 
                    : tx.status === "pending" 
                      ? "bg-amber-500" 
                      : "bg-red-500"
                }`} />
                <CardContent className="pt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">{tx.description}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Site ID: {tx.siteVisitId}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(tx.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 md:mt-0 flex items-center gap-2">
                      <div className={`px-2 py-1 rounded-full text-xs ${
                        tx.status === "completed" || tx.status === "paid" || tx.status === "approved" 
                          ? "bg-green-100 text-green-800" 
                          : tx.status === "pending" 
                            ? "bg-amber-100 text-amber-800" 
                            : "bg-red-100 text-red-800"
                      }`}>
                        {tx.status}
                      </div>
                      <span className={`font-bold ${tx.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                        {tx.type === "credit" ? "+" : "-"}{tx.amount} {tx.currency}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3 mt-2">
                    {tx.taskDetails && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                          <Calculator className="h-3.5 w-3.5" />
                          Task Fee Breakdown
                        </h5>
                        <div className="grid grid-cols-2 gap-1 text-sm">
                          <span className="text-muted-foreground">Base Amount:</span>
                          <span>{tx.taskDetails.baseAmount} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Distance Fee:</span>
                          <span>{tx.taskDetails.distanceFee} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Complexity Fee:</span>
                          <span>{tx.taskDetails.complexityFee} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Urgency Fee:</span>
                          <span>{tx.taskDetails.urgencyFee} {tx.currency}</span>
                          
                          <span className="font-medium">Total Fee:</span>
                          <span className="font-medium">{tx.taskDetails.totalFee} {tx.currency}</span>
                        </div>
                      </div>
                    )}
                    
                    {tx.operationalCosts && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                          <Clipboard className="h-3.5 w-3.5" />
                          Operational Costs
                        </h5>
                        <div className="grid grid-cols-2 gap-1 text-sm">
                          <span className="text-muted-foreground">Permit Fees:</span>
                          <span>{tx.operationalCosts.permitFees} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Transportation:</span>
                          <span>{tx.operationalCosts.transportationFees} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Logistics:</span>
                          <span>{tx.operationalCosts.logisticsFees} {tx.currency}</span>
                          
                          <span className="text-muted-foreground">Other Fees:</span>
                          <span>{tx.operationalCosts.otherFees} {tx.currency}</span>
                          
                          <span className="font-medium">Total Costs:</span>
                          <span className="font-medium">{tx.operationalCosts.totalCosts} {tx.currency}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredTransactions.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <p className="mt-4 text-muted-foreground">No transactions found for the selected time period</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
