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
  Receipt, 
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  PenTool,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel, exportToCSV } from '@/utils/report-export';
import type { ReceiptsSummary, ReceiptEntry } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays, format } from 'date-fns';

export function ReceiptsReport() {
  const [data, setData] = useState<ReceiptsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cost_submissions')
        .select(`
          id,
          created_at,
          status,
          project_id,
          receipt_urls,
          total_cost_cents,
          approved_by,
          approved_at,
          approval_signature_id,
          payment_signature_id,
          projects!inner(name)
        `);

      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', dateRange.to.toISOString());
      }

      const { data: submissions, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const receipts: ReceiptEntry[] = [];
      const projectAmounts = new Map<string, { name: string; count: number; amount: number }>();
      const monthAmounts = new Map<string, { count: number; amount: number }>();
      const statusAmounts = new Map<string, { count: number; amount: number }>();
      
      let totalAmount = 0;
      let approvedAmount = 0;
      let pendingAmount = 0;
      let rejectedAmount = 0;

      (submissions || []).forEach((sub: any) => {
        const amount = (sub.total_cost_cents || 0) / 100;
        const projectName = sub.projects?.name || 'Unknown Project';
        const month = format(new Date(sub.created_at), 'yyyy-MM');
        const hasReceipts = (sub.receipt_urls || []).length > 0;
        const hasSignature = !!(sub.approval_signature_id || sub.payment_signature_id);

        if (hasReceipts) {
          receipts.push({
            id: sub.id,
            costSubmissionId: sub.id,
            projectName,
            amount,
            status: sub.status,
            uploadedAt: sub.created_at,
            approvedAt: sub.approved_at,
            approvedBy: sub.approved_by,
            hasSignature,
          });
        }

        totalAmount += amount;
        
        if (sub.status === 'approved' || sub.status === 'paid') {
          approvedAmount += amount;
        } else if (sub.status === 'rejected') {
          rejectedAmount += amount;
        } else {
          pendingAmount += amount;
        }

        const projEntry = projectAmounts.get(sub.project_id) || { name: projectName, count: 0, amount: 0 };
        projEntry.count += 1;
        projEntry.amount += amount;
        projectAmounts.set(sub.project_id, projEntry);

        const monthEntry = monthAmounts.get(month) || { count: 0, amount: 0 };
        monthEntry.count += 1;
        monthEntry.amount += amount;
        monthAmounts.set(month, monthEntry);

        const statusEntry = statusAmounts.get(sub.status) || { count: 0, amount: 0 };
        statusEntry.count += 1;
        statusEntry.amount += amount;
        statusAmounts.set(sub.status, statusEntry);
      });

      const summary: ReceiptsSummary = {
        totalReceipts: receipts.length,
        receiptsByProject: Array.from(projectAmounts.entries()).map(([projectId, data]) => ({
          projectId,
          projectName: data.name,
          count: data.count,
          amount: data.amount,
        })),
        receiptsByMonth: Array.from(monthAmounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, data]) => ({ month, count: data.count, amount: data.amount })),
        receiptsByStatus: Array.from(statusAmounts.entries()).map(([status, data]) => ({
          status,
          count: data.count,
          amount: data.amount,
        })),
        totalAmount,
        approvedAmount,
        pendingAmount,
        rejectedAmount,
        recentReceipts: receipts.slice(0, 15),
      };

      setData(summary);
    } catch (error) {
      console.error('Error fetching receipts data:', error);
      setData({
        totalReceipts: 0,
        receiptsByProject: [],
        receiptsByMonth: [],
        receiptsByStatus: [],
        totalAmount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        rejectedAmount: 0,
        recentReceipts: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleExportExcel = () => {
    if (!data) return;
    const exportData = data.recentReceipts.map(receipt => ({
      'Receipt ID': receipt.id,
      'Project': receipt.projectName,
      'Amount': formatCurrency(receipt.amount),
      'Status': receipt.status,
      'Uploaded': format(new Date(receipt.uploadedAt), 'yyyy-MM-dd HH:mm'),
      'Approved At': receipt.approvedAt ? format(new Date(receipt.approvedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
      'Has Signature': receipt.hasSignature ? 'Yes' : 'No',
    }));
    exportToExcel(exportData, 'Receipts', 'receipts_report.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Receipts report has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Total Receipts', Value: data.totalReceipts },
      { Metric: 'Total Amount', Value: formatCurrency(data.totalAmount) },
      { Metric: 'Approved Amount', Value: formatCurrency(data.approvedAmount) },
      { Metric: 'Pending Amount', Value: formatCurrency(data.pendingAmount) },
      { Metric: 'Rejected Amount', Value: formatCurrency(data.rejectedAmount) },
    ];
    exportToCSV(csvData, 'receipts_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Receipts summary has been downloaded as CSV',
    });
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM dd, yyyy HH:mm');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'pending':
      case 'under_review':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
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
          <p className="text-muted-foreground">Unable to load receipts data</p>
          <Button variant="outline" onClick={fetchData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-receipts-title">Receipts Report</h2>
          <p className="text-sm text-muted-foreground">Financial receipt tracking and signature compliance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerWithRange
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
          <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-total-amount">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              {formatCurrency(data.totalAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-green-600" data-testid="text-approved-amount">
              <CheckCircle className="w-5 h-5" />
              {formatCurrency(data.approvedAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-amber-600" data-testid="text-pending-amount">
              <Clock className="w-5 h-5" />
              {formatCurrency(data.pendingAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-red-600" data-testid="text-rejected-amount">
              <XCircle className="w-5 h-5" />
              {formatCurrency(data.rejectedAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="by-project" data-testid="tab-by-project">By Project</TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">Recent Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receipts by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {data.receiptsByStatus.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No receipts found</p>
                ) : (
                  <div className="space-y-3">
                    {data.receiptsByStatus.map(item => (
                      <div key={item.status} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{item.status.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.count}</Badge>
                          <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {data.receiptsByMonth.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No monthly data available</p>
                ) : (
                  <div className="space-y-2">
                    {data.receiptsByMonth.map(item => (
                      <div key={item.month} className="flex justify-between items-center">
                        <span className="text-sm">{format(new Date(item.month + '-01'), 'MMMM yyyy')}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{item.count}</Badge>
                          <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="by-project" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipts by Project</CardTitle>
              <CardDescription>Financial breakdown across projects</CardDescription>
            </CardHeader>
            <CardContent>
              {data.receiptsByProject.length === 0 ? (
                <p className="text-muted-foreground text-sm">No project data available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Receipts</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.receiptsByProject.map(item => (
                      <TableRow key={item.projectId}>
                        <TableCell className="font-medium">{item.projectName}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        <TableCell className="text-right">
                          {data.totalAmount > 0 
                            ? `${((item.amount / data.totalAmount) * 100).toFixed(1)}%` 
                            : '0%'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Receipts</CardTitle>
              <CardDescription>Latest cost submissions with receipts</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentReceipts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent receipts</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Signature</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentReceipts.map(receipt => (
                      <TableRow key={receipt.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{receipt.projectName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(receipt.amount)}</TableCell>
                        <TableCell>{formatDate(receipt.uploadedAt)}</TableCell>
                        <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                        <TableCell>
                          {receipt.hasSignature ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <PenTool className="w-3 h-3 mr-1" />
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <XCircle className="w-3 h-3 mr-1" />
                              Unsigned
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}