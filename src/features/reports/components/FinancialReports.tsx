import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Download, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { 
  exportFinancialSummaryPDF, 
  exportToExcel, 
  exportToCSV 
} from '@/utils/report-export';
import type { FinancialSummary, RAGStatus } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';

export function FinancialReports() {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const range = dateRange?.from && dateRange?.to 
        ? { from: dateRange.from, to: dateRange.to }
        : undefined;
      const summary = await ReportingService.getFinancialSummary(range);
      setData(summary);
    } catch (error) {
      console.error('Error fetching financial summary:', error);
      toast({
        title: 'Error',
        description: 'Failed to load financial data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const handleExportPDF = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const range = dateRange?.from && dateRange?.to 
        ? { from: dateRange.from, to: dateRange.to }
        : undefined;
      await exportFinancialSummaryPDF(data, range);
      toast({
        title: 'Report Exported',
        description: 'Financial summary has been downloaded as PDF',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Unable to generate the PDF report',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = () => {
    if (!data) return;
    const excelData = [
      { Metric: 'Total Budget', Value: data.totalBudget, Unit: 'SDG' },
      { Metric: 'Total Spent', Value: data.totalSpent, Unit: 'SDG' },
      { Metric: 'Remaining', Value: data.totalRemaining, Unit: 'SDG' },
      { Metric: 'Utilization Rate', Value: data.utilizationRate, Unit: '%' },
      { Metric: 'Monthly Burn Rate', Value: data.burnRate, Unit: 'SDG' },
      { Metric: 'Projected Runway', Value: data.projectedRunway, Unit: 'months' },
      { Metric: 'Pending Approvals', Value: data.pendingApprovals, Unit: 'count' },
      { Metric: 'Pending Amount', Value: data.pendingApprovalsAmount, Unit: 'SDG' },
    ];
    exportToExcel(excelData, 'Financial Summary', 'financial_summary.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Financial summary has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Total Budget', Value: data.totalBudget },
      { Metric: 'Total Spent', Value: data.totalSpent },
      { Metric: 'Remaining', Value: data.totalRemaining },
      { Metric: 'Utilization Rate', Value: data.utilizationRate },
    ];
    exportToCSV(csvData, 'financial_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Financial summary has been downloaded as CSV',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const getVarianceColor = (variance: number) => {
    if (variance > 10) return 'text-red-500';
    if (variance > 0) return 'text-amber-500';
    return 'text-green-500';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Unable to load financial data</p>
          <Button variant="outline" onClick={fetchData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="financial-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">Financial Reports</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
            <FileText className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={exporting} data-testid="button-export-pdf">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exporting...' : 'PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">{formatCurrency(data.totalBudget)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold">{formatCurrency(data.totalSpent)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatPercent(data.utilizationRate)} utilized
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.totalRemaining)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ~{data.projectedRunway.toFixed(1)} months runway
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
                <p className="text-2xl font-bold">{data.pendingApprovals}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(data.pendingApprovalsAmount)} value
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Budget Utilization</span>
          <span className="font-medium">{formatPercent(data.utilizationRate)}</span>
        </div>
        <Progress 
          value={Math.min(data.utilizationRate, 100)} 
          className={`h-3 ${data.utilizationRate > 90 ? '[&>div]:bg-red-500' : data.utilizationRate > 70 ? '[&>div]:bg-amber-500' : ''}`}
        />
      </div>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses">Expenses by Category</TabsTrigger>
          <TabsTrigger value="budget_vs_actual">Budget vs Actual</TabsTrigger>
          <TabsTrigger value="cash_flow">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Expenses by Category</CardTitle>
              <CardDescription>Breakdown of spending across expense categories</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expensesByCategory.map((cat, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{cat.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cat.budgeted)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cat.actual)}</TableCell>
                      <TableCell className={`text-right ${getVarianceColor(cat.variance)}`}>
                        {formatCurrency(cat.variance)}
                      </TableCell>
                      <TableCell className={`text-right ${getVarianceColor(cat.variancePercentage)}`}>
                        {formatPercent(cat.variancePercentage)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget_vs_actual" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget vs Actual by Entity</CardTitle>
              <CardDescription>Comparison of planned vs actual spending per project/MMP</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.budgetVsActual.slice(0, 15).map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.entityName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.entityType}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.budgeted)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.actual)}</TableCell>
                      <TableCell className={`text-right ${getVarianceColor(item.variancePercentage)}`}>
                        {formatPercent(item.variancePercentage)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.status === 'green' ? 'default' : item.status === 'amber' ? 'secondary' : 'destructive'}>
                          {item.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash_flow" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow</CardTitle>
              <CardDescription>Monthly inflows and outflows</CardDescription>
            </CardHeader>
            <CardContent>
              {data.cashFlow.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Inflow</TableHead>
                      <TableHead className="text-right">Outflow</TableHead>
                      <TableHead className="text-right">Net Flow</TableHead>
                      <TableHead className="text-right">Cumulative</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cashFlow.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{entry.period}</TableCell>
                        <TableCell className="text-right text-green-600">
                          +{formatCurrency(entry.inflow)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatCurrency(entry.outflow)}
                        </TableCell>
                        <TableCell className={`text-right ${entry.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(entry.netFlow)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(entry.cumulativeBalance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <DollarSign className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No cash flow data for this period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FinancialReports;
