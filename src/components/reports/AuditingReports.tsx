import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Shield, 
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Users,
  Activity,
  Clock,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { 
  exportAuditSummaryPDF, 
  exportToExcel,
  exportToCSV,
} from '@/utils/report-export';
import type { AuditSummary } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays, format } from 'date-fns';

export function AuditingReports() {
  const [data, setData] = useState<AuditSummary | null>(null);
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
      const auditSummary = await ReportingService.getAuditSummary(range);
      setData(auditSummary);
    } catch (error) {
      console.error('Error fetching audit data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit data',
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
      await exportAuditSummaryPDF(data, range);
      toast({
        title: 'Report Exported',
        description: 'Audit summary has been downloaded as PDF',
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
    const actionsData = data.actionsByType.map(a => ({
      'Action Type': a.type,
      'Count': a.count,
    }));
    exportToExcel(actionsData, 'Audit Actions', 'audit_summary.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Audit summary has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Total Actions', Value: data.totalActions },
      { Metric: 'Override Count', Value: data.overrideCount },
      { Metric: 'Override Rate', Value: data.overrideRate },
      { Metric: 'Approval Rate', Value: data.approvalRate },
      { Metric: 'Avg Processing Time (hrs)', Value: data.averageProcessingTime },
      { Metric: 'Compliance Score', Value: data.complianceScore },
      { Metric: 'Data Quality Score', Value: data.dataQualityScore },
      ...data.actionsByType.map(a => ({
        Metric: `Action: ${a.type}`,
        Value: a.count,
      })),
    ];
    exportToCSV(csvData, 'audit_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Audit summary has been downloaded as CSV',
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

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM dd, yyyy HH:mm');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Unable to load audit data</p>
          <Button variant="outline" onClick={fetchData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const topActions = data.actionsByType.slice(0, 5);
  const topUsers = data.actionsByUser.slice(0, 5);

  return (
    <div className="space-y-6" data-testid="auditing-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">Audit & Compliance Reports</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={exporting} data-testid="button-export-pdf">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exporting...' : 'PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
            <FileText className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Actions</p>
                <p className="text-2xl font-bold">{data.totalActions}</p>
              </div>
              <Activity className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Budget Overrides</p>
                <p className="text-2xl font-bold">{data.recentOverrides.length}</p>
              </div>
              <Shield className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{data.actionsByUser.length}</p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="overrides">Budget Overrides</TabsTrigger>
          <TabsTrigger value="users">User Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Actions by Type
              </CardTitle>
              <CardDescription>Breakdown of audit trail activities</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action Type</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.actionsByType.map((action, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <Badge variant="outline">{action.type.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{action.count}</TableCell>
                      <TableCell className="text-right">
                        {data.totalActions > 0 
                          ? ((action.count / data.totalActions) * 100).toFixed(1) 
                          : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Budget Override Log
              </CardTitle>
              <CardDescription>Record of budget policy exceptions and approvals</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentOverrides.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Override</TableHead>
                      <TableHead>Justification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOverrides.map((override, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm">
                          {formatDate(override.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{override.approvedBy}</p>
                            <p className="text-xs text-muted-foreground">{override.approverRole}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{override.projectName}</p>
                            {override.mmpName && (
                              <p className="text-xs text-muted-foreground">{override.mmpName}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(override.originalAmount)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(override.overrideAmount)}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-sm truncate" title={override.justification}>
                            {override.justification}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="w-12 h-12 text-green-500 mb-2" />
                  <p className="text-muted-foreground">No budget overrides in this period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Activity
              </CardTitle>
              <CardDescription>Actions performed by users</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.actionsByUser.map((user, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{user.userName}</TableCell>
                      <TableCell className="text-right">{user.count}</TableCell>
                      <TableCell className="text-right">
                        {data.totalActions > 0 
                          ? ((user.count / data.totalActions) * 100).toFixed(1) 
                          : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Top Activity Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topActions.map((action, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>
                    <Badge variant="outline">{action.type.replace(/_/g, ' ')}</Badge>
                  </div>
                  <span className="font-medium">{action.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Most Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topUsers.map((user, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>
                    <span>{user.userName}</span>
                  </div>
                  <Badge>{user.count} actions</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AuditingReports;
