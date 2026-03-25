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
  FileText, 
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Clock,
  FolderOpen,
  PenTool,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel, exportToCSV } from '@/utils/report-export';
import type { DocumentsSummary, DocumentEntry } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays, format } from 'date-fns';

export function DocumentsReport() {
  const [data, setData] = useState<DocumentsSummary | null>(null);
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
          receipt_metadata,
          transportation_cost_cents,
          accommodation_cost_cents,
          meal_allowance_cents,
          other_costs_cents,
          total_cost_cents,
          projects!inner(name)
        `);

      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', dateRange.to.toISOString());
      }

      const { data: submissions, error } = await query;

      if (error) throw error;

      const documents: DocumentEntry[] = [];
      const typeCount = new Map<string, number>();
      const projectCount = new Map<string, { name: string; count: number }>();
      const monthCount = new Map<string, number>();
      const statusCount = new Map<string, number>();
      let signedCount = 0;
      let unsignedCount = 0;
      let receiptsCount = 0;

      (submissions || []).forEach((sub: any) => {
        const receiptUrls = sub.receipt_urls || [];
        const projectName = sub.projects?.name || 'Unknown Project';
        const month = format(new Date(sub.created_at), 'yyyy-MM');
        
        receiptUrls.forEach((url: string, idx: number) => {
          const docType = 'receipt';
          const fileName = `Receipt ${idx + 1} - ${sub.id.slice(0, 8)}`;
          
          documents.push({
            id: `${sub.id}-${idx}`,
            type: docType,
            fileName,
            projectId: sub.project_id,
            projectName,
            createdAt: sub.created_at,
            signatureStatus: sub.status === 'approved' ? 'signed' : 'unsigned',
            uploadedBy: undefined,
          });

          typeCount.set(docType, (typeCount.get(docType) || 0) + 1);
          
          const projEntry = projectCount.get(sub.project_id) || { name: projectName, count: 0 };
          projEntry.count += 1;
          projectCount.set(sub.project_id, projEntry);
          
          monthCount.set(month, (monthCount.get(month) || 0) + 1);
          statusCount.set(sub.status, (statusCount.get(sub.status) || 0) + 1);

          if (sub.status === 'approved') {
            signedCount++;
          } else {
            unsignedCount++;
          }
          receiptsCount++;
        });
      });

      const summary: DocumentsSummary = {
        totalDocuments: documents.length,
        documentsByType: Array.from(typeCount.entries()).map(([type, count]) => ({ type, count })),
        documentsByProject: Array.from(projectCount.entries()).map(([projectId, data]) => ({
          projectId,
          projectName: data.name,
          count: data.count,
        })),
        documentsByMonth: Array.from(monthCount.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, count]) => ({ month, count })),
        documentsByStatus: Array.from(statusCount.entries()).map(([status, count]) => ({ status, count })),
        recentDocuments: documents.slice(0, 10),
        signedDocuments: signedCount,
        unsignedDocuments: unsignedCount,
        signatureComplianceRate: documents.length > 0 ? (signedCount / documents.length) * 100 : 0,
        documentsWithReceipts: receiptsCount,
      };

      setData(summary);
    } catch (error) {
      console.error('Error fetching documents data:', error);
      setData({
        totalDocuments: 0,
        documentsByType: [],
        documentsByProject: [],
        documentsByMonth: [],
        documentsByStatus: [],
        recentDocuments: [],
        signedDocuments: 0,
        unsignedDocuments: 0,
        signatureComplianceRate: 0,
        documentsWithReceipts: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const handleExportExcel = () => {
    if (!data) return;
    const exportData = data.recentDocuments.map(doc => ({
      'Document ID': doc.id,
      'Type': doc.type,
      'File Name': doc.fileName,
      'Project': doc.projectName || 'N/A',
      'Created At': format(new Date(doc.createdAt), 'yyyy-MM-dd HH:mm'),
      'Signature Status': doc.signatureStatus || 'N/A',
    }));
    exportToExcel(exportData, 'Documents', 'documents_report.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Documents report has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Total Documents', Value: data.totalDocuments },
      { Metric: 'Signed Documents', Value: data.signedDocuments },
      { Metric: 'Unsigned Documents', Value: data.unsignedDocuments },
      { Metric: 'Compliance Rate', Value: `${data.signatureComplianceRate.toFixed(1)}%` },
      ...data.documentsByType.map(t => ({
        Metric: `Type: ${t.type}`,
        Value: t.count,
      })),
    ];
    exportToCSV(csvData, 'documents_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Documents summary has been downloaded as CSV',
    });
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM dd, yyyy HH:mm');
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'signed':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle className="w-3 h-3 mr-1" />Signed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'unsigned':
      default:
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Unsigned</Badge>;
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
          <p className="text-muted-foreground">Unable to load documents data</p>
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
          <h2 className="text-xl font-semibold" data-testid="text-documents-title">Documents Report</h2>
          <p className="text-sm text-muted-foreground">Document management and signature compliance tracking</p>
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
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-total-documents">
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
              {data.totalDocuments}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Signed Documents</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-green-600" data-testid="text-signed-documents">
              <CheckCircle className="w-5 h-5" />
              {data.signedDocuments}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unsigned Documents</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-amber-600" data-testid="text-unsigned-documents">
              <XCircle className="w-5 h-5" />
              {data.unsignedDocuments}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compliance Rate</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-compliance-rate">
              <PenTool className="w-5 h-5 text-muted-foreground" />
              {data.signatureComplianceRate.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="by-project" data-testid="tab-by-project">By Project</TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">Recent Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {data.documentsByType.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No documents found</p>
                ) : (
                  <div className="space-y-2">
                    {data.documentsByType.map(item => (
                      <div key={item.type} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{item.type}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {data.documentsByStatus.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No documents found</p>
                ) : (
                  <div className="space-y-2">
                    {data.documentsByStatus.map(item => (
                      <div key={item.status} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{item.status.replace('_', ' ')}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Document Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {data.documentsByMonth.length === 0 ? (
                <p className="text-muted-foreground text-sm">No monthly data available</p>
              ) : (
                <div className="space-y-2">
                  {data.documentsByMonth.map(item => (
                    <div key={item.month} className="flex justify-between items-center">
                      <span className="text-sm">{format(new Date(item.month + '-01'), 'MMMM yyyy')}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${Math.min(100, (item.count / Math.max(...data.documentsByMonth.map(m => m.count))) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-project" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents by Project</CardTitle>
              <CardDescription>Document distribution across projects</CardDescription>
            </CardHeader>
            <CardContent>
              {data.documentsByProject.length === 0 ? (
                <p className="text-muted-foreground text-sm">No project data available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Documents</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.documentsByProject.map(item => (
                      <TableRow key={item.projectId}>
                        <TableCell className="font-medium">{item.projectName}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {data.totalDocuments > 0 
                            ? `${((item.count / data.totalDocuments) * 100).toFixed(1)}%` 
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
              <CardTitle className="text-base">Recent Documents</CardTitle>
              <CardDescription>Latest uploaded documents</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentDocuments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent documents</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentDocuments.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{doc.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{doc.type}</TableCell>
                        <TableCell>{doc.projectName || 'N/A'}</TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell>{getStatusBadge(doc.signatureStatus)}</TableCell>
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