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
  Users, 
  Clock,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  XCircle,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { 
  exportProductivityMetricsPDF, 
  exportOperationalEfficiencyPDF,
  exportToExcel, 
  exportToCSV 
} from '@/utils/report-export';
import type { ProductivityMetrics, OperationalEfficiency } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';

export function AnalyticsReports() {
  const [productivityData, setProductivityData] = useState<ProductivityMetrics[]>([]);
  const [efficiencyData, setEfficiencyData] = useState<OperationalEfficiency | null>(null);
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
      const [productivity, efficiency] = await Promise.all([
        ReportingService.getProductivityMetrics(range),
        ReportingService.getOperationalEfficiency(range),
      ]);
      setProductivityData(productivity);
      setEfficiencyData(efficiency);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const handleExportProductivityPDF = async () => {
    setExporting(true);
    try {
      const range = dateRange?.from && dateRange?.to 
        ? { from: dateRange.from, to: dateRange.to }
        : undefined;
      await exportProductivityMetricsPDF(productivityData, range);
      toast({
        title: 'Report Exported',
        description: 'Productivity report has been downloaded as PDF',
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

  const handleExportEfficiencyPDF = async () => {
    if (!efficiencyData) return;
    setExporting(true);
    try {
      const range = dateRange?.from && dateRange?.to 
        ? { from: dateRange.from, to: dateRange.to }
        : undefined;
      await exportOperationalEfficiencyPDF(efficiencyData, range);
      toast({
        title: 'Report Exported',
        description: 'Efficiency report has been downloaded as PDF',
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

  const handleExportProductivityExcel = () => {
    const excelData = productivityData.map(m => ({
      'Enumerator': m.enumeratorName,
      'Role': m.role,
      'Assigned': m.visitsAssigned,
      'Completed': m.visitsCompleted,
      'Pending': m.visitsPending,
      'Completion Rate (%)': m.completionRate.toFixed(1),
      'On-Time Rate (%)': m.onTimeRate.toFixed(1),
      'SLA Adherence (%)': m.slaAdherence.toFixed(1),
      'Total Earnings': m.totalEarnings,
    }));
    exportToExcel(excelData, 'Productivity', 'productivity_report.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Productivity report has been downloaded as Excel',
    });
  };

  const handleExportProductivityCSV = () => {
    const csvData = productivityData.map(m => ({
      Enumerator: m.enumeratorName,
      Role: m.role,
      Assigned: m.visitsAssigned,
      Completed: m.visitsCompleted,
      Pending: m.visitsPending,
      CompletionRate: m.completionRate,
      OnTimeRate: m.onTimeRate,
      SLAAdherence: m.slaAdherence,
      TotalEarnings: m.totalEarnings,
    }));
    exportToCSV(csvData, 'productivity_report.csv');
    toast({
      title: 'Report Exported',
      description: 'Productivity report has been downloaded as CSV',
    });
  };

  const handleExportEfficiencyCSV = () => {
    if (!efficiencyData) return;
    const csvData = [
      { Metric: 'Total Visits', Value: efficiencyData.totalVisits },
      { Metric: 'Completed Visits', Value: efficiencyData.completedVisits },
      { Metric: 'Pending Visits', Value: efficiencyData.pendingVisits },
      { Metric: 'Completion Rate', Value: efficiencyData.completionRate },
      { Metric: 'On-Time Rate', Value: efficiencyData.onTimeRate },
      { Metric: 'SLA Adherence', Value: efficiencyData.slaAdherence },
      { Metric: 'Avg Cycle Time (days)', Value: efficiencyData.averageCycleTime },
      { Metric: 'States Covered', Value: efficiencyData.statesCovered },
      { Metric: 'Localities Covered', Value: efficiencyData.localitiesCovered },
    ];
    exportToCSV(csvData, 'operational_efficiency.csv');
    toast({
      title: 'Report Exported',
      description: 'Efficiency report has been downloaded as CSV',
    });
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalAssigned = productivityData.reduce((sum, m) => sum + m.visitsAssigned, 0);
  const totalCompleted = productivityData.reduce((sum, m) => sum + m.visitsCompleted, 0);
  const avgCompletionRate = productivityData.length > 0 
    ? productivityData.reduce((sum, m) => sum + m.completionRate, 0) / productivityData.length 
    : 0;
  const avgOnTimeRate = productivityData.length > 0 
    ? productivityData.reduce((sum, m) => sum + m.onTimeRate, 0) / productivityData.length 
    : 0;

  return (
    <div className="space-y-6" data-testid="analytics-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">Analytics Reports</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Visits</p>
                <p className="text-2xl font-bold">{efficiencyData?.totalVisits || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {efficiencyData?.completedVisits || 0} completed
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">{formatPercent(avgCompletionRate)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
            <Progress value={avgCompletionRate} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On-Time Rate</p>
                <p className="text-2xl font-bold">{formatPercent(avgOnTimeRate)}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
            <Progress value={avgOnTimeRate} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue Visits</p>
                <p className="text-2xl font-bold text-red-500">{efficiencyData?.overdueVisits || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending: {efficiencyData?.pendingVisits || 0}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="productivity" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="productivity">Enumerator Productivity</TabsTrigger>
          <TabsTrigger value="efficiency">Operational Efficiency</TabsTrigger>
          <TabsTrigger value="coverage">Geographic Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="productivity" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Enumerator Productivity
                  </CardTitle>
                  <CardDescription>Performance metrics for field team members</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleExportProductivityPDF} disabled={exporting}>
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportProductivityExcel}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportProductivityCSV}>
                    <FileText className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Enumerator</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Assigned</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">Completion %</TableHead>
                    <TableHead className="text-center">On-Time %</TableHead>
                    <TableHead className="text-right">Earnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productivityData.slice(0, 20).map((metric, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{metric.enumeratorName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{metric.role}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{metric.visitsAssigned}</TableCell>
                      <TableCell className="text-center">{metric.visitsCompleted}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={metric.completionRate >= 80 ? 'default' : metric.completionRate >= 60 ? 'secondary' : 'destructive'}>
                          {formatPercent(metric.completionRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={metric.onTimeRate >= 80 ? 'default' : metric.onTimeRate >= 60 ? 'secondary' : 'destructive'}>
                          {formatPercent(metric.onTimeRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(metric.totalEarnings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="efficiency" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Operational Efficiency
                  </CardTitle>
                  <CardDescription>System-wide performance metrics</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleExportEfficiencyPDF} disabled={exporting}>
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportEfficiencyCSV}>
                    <FileText className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {efficiencyData && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Average Cycle Time</p>
                    <p className="text-2xl font-bold">{efficiencyData.averageCycleTime.toFixed(1)} days</p>
                    <p className="text-xs text-muted-foreground">From assignment to completion</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">First Pass Acceptance</p>
                    <p className="text-2xl font-bold">{formatPercent(efficiencyData.firstPassAcceptance)}</p>
                    <p className="text-xs text-muted-foreground">Completed without rework</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Rework Rate</p>
                    <p className="text-2xl font-bold text-amber-500">{formatPercent(efficiencyData.reworkRate)}</p>
                    <p className="text-xs text-muted-foreground">Required revision</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Assignment Latency</p>
                    <p className="text-2xl font-bold">{efficiencyData.assignmentLatency.toFixed(1)} hrs</p>
                    <p className="text-xs text-muted-foreground">Upload to assignment</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Coverage by State
                </CardTitle>
                <CardDescription>Site visit coverage across states</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>State</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Visited</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {efficiencyData?.coverageByState.slice(0, 10).map((state, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{state.name}</TableCell>
                        <TableCell className="text-center">{state.totalSites}</TableCell>
                        <TableCell className="text-center text-green-600">{state.visitedSites}</TableCell>
                        <TableCell className="text-center text-amber-600">{state.pendingSites}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={state.coveragePercentage >= 80 ? 'default' : state.coveragePercentage >= 50 ? 'secondary' : 'destructive'}>
                            {formatPercent(state.coveragePercentage)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Coverage by Hub
                </CardTitle>
                <CardDescription>Site visit coverage across hubs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Visited</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {efficiencyData?.coverageByHub.slice(0, 10).map((hub, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{hub.name}</TableCell>
                        <TableCell className="text-center">{hub.totalSites}</TableCell>
                        <TableCell className="text-center text-green-600">{hub.visitedSites}</TableCell>
                        <TableCell className="text-center text-amber-600">{hub.pendingSites}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={hub.coveragePercentage >= 80 ? 'default' : hub.coveragePercentage >= 50 ? 'secondary' : 'destructive'}>
                            {formatPercent(hub.coveragePercentage)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AnalyticsReports;
