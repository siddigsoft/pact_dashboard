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
  PenTool, 
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Key,
  Fingerprint,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel, exportToCSV } from '@/utils/report-export';
import type { SignaturesSummary, SignatureEntry } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays, format, differenceInHours } from 'date-fns';

export function SignaturesReport() {
  const [data, setData] = useState<SignaturesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      let txnSigQuery = supabase
        .from('transaction_signatures')
        .select(`
          id,
          created_at,
          signer_id,
          transaction_id,
          signature_method,
          is_valid,
          verification_status,
          verified_at
        `);

      let docSigQuery = supabase
        .from('document_signatures')
        .select(`
          id,
          created_at,
          signer_id,
          document_id,
          signature_method,
          verification_status,
          verified_at
        `);

      if (dateRange?.from) {
        txnSigQuery = txnSigQuery.gte('created_at', dateRange.from.toISOString());
        docSigQuery = docSigQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        txnSigQuery = txnSigQuery.lte('created_at', dateRange.to.toISOString());
        docSigQuery = docSigQuery.lte('created_at', dateRange.to.toISOString());
      }

      const [txnRes, docRes, profilesRes] = await Promise.all([
        txnSigQuery.order('created_at', { ascending: false }),
        docSigQuery.order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name'),
      ]);

      if (txnRes.error) throw txnRes.error;
      if (docRes.error) throw docRes.error;

      const profiles = new Map<string, string>();
      (profilesRes.data || []).forEach((p: any) => {
        profiles.set(p.id, p.full_name || 'Unknown User');
      });

      const allSignatures: SignatureEntry[] = [];
      const typeCount = new Map<string, number>();
      const methodCount = new Map<string, number>();
      const monthCount = new Map<string, number>();
      
      let verifiedCount = 0;
      let pendingCount = 0;
      let totalVerificationTime = 0;
      let verifiedWithTime = 0;

      (txnRes.data || []).forEach((sig: any) => {
        const sigEntry: SignatureEntry = {
          id: sig.id,
          type: 'transaction',
          signerId: sig.signer_id,
          signerName: profiles.get(sig.signer_id) || 'Unknown User',
          createdAt: sig.created_at,
          verifiedAt: sig.verified_at,
          method: sig.signature_method || 'unknown',
          entityId: sig.transaction_id,
          entityType: 'wallet_transaction',
          isValid: sig.is_valid ?? true,
        };
        allSignatures.push(sigEntry);

        typeCount.set('transaction', (typeCount.get('transaction') || 0) + 1);
        methodCount.set(sig.signature_method || 'unknown', (methodCount.get(sig.signature_method || 'unknown') || 0) + 1);
        
        const month = format(new Date(sig.created_at), 'yyyy-MM');
        monthCount.set(month, (monthCount.get(month) || 0) + 1);

        if (sig.verification_status === 'verified' || sig.verified_at) {
          verifiedCount++;
          if (sig.verified_at) {
            const hours = differenceInHours(new Date(sig.verified_at), new Date(sig.created_at));
            totalVerificationTime += hours;
            verifiedWithTime++;
          }
        } else {
          pendingCount++;
        }
      });

      (docRes.data || []).forEach((sig: any) => {
        const sigEntry: SignatureEntry = {
          id: sig.id,
          type: 'document',
          signerId: sig.signer_id,
          signerName: profiles.get(sig.signer_id) || 'Unknown User',
          createdAt: sig.created_at,
          verifiedAt: sig.verified_at,
          method: sig.signature_method || 'unknown',
          entityId: sig.document_id,
          entityType: 'document',
          isValid: true,
        };
        allSignatures.push(sigEntry);

        typeCount.set('document', (typeCount.get('document') || 0) + 1);
        methodCount.set(sig.signature_method || 'unknown', (methodCount.get(sig.signature_method || 'unknown') || 0) + 1);
        
        const month = format(new Date(sig.created_at), 'yyyy-MM');
        monthCount.set(month, (monthCount.get(month) || 0) + 1);

        if (sig.verification_status === 'verified' || sig.verified_at) {
          verifiedCount++;
          if (sig.verified_at) {
            const hours = differenceInHours(new Date(sig.verified_at), new Date(sig.created_at));
            totalVerificationTime += hours;
            verifiedWithTime++;
          }
        } else {
          pendingCount++;
        }
      });

      allSignatures.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const summary: SignaturesSummary = {
        totalSignatures: allSignatures.length,
        signaturesByType: Array.from(typeCount.entries()).map(([type, count]) => ({ type, count })),
        signaturesByMethod: Array.from(methodCount.entries()).map(([method, count]) => ({ method, count })),
        signaturesByMonth: Array.from(monthCount.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, count]) => ({ month, count })),
        recentSignatures: allSignatures.slice(0, 15),
        verifiedSignatures: verifiedCount,
        pendingVerifications: pendingCount,
        averageVerificationTime: verifiedWithTime > 0 ? totalVerificationTime / verifiedWithTime : 0,
      };

      setData(summary);
    } catch (error) {
      console.error('Error fetching signatures data:', error);
      setData({
        totalSignatures: 0,
        signaturesByType: [],
        signaturesByMethod: [],
        signaturesByMonth: [],
        recentSignatures: [],
        verifiedSignatures: 0,
        pendingVerifications: 0,
        averageVerificationTime: 0,
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
    const exportData = data.recentSignatures.map(sig => ({
      'Signature ID': sig.id,
      'Type': sig.type,
      'Signer': sig.signerName,
      'Method': sig.method,
      'Created At': format(new Date(sig.createdAt), 'yyyy-MM-dd HH:mm'),
      'Verified At': sig.verifiedAt ? format(new Date(sig.verifiedAt), 'yyyy-MM-dd HH:mm') : 'Pending',
      'Valid': sig.isValid ? 'Yes' : 'No',
    }));
    exportToExcel(exportData, 'Signatures', 'signatures_report.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Signatures report has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Total Signatures', Value: data.totalSignatures },
      { Metric: 'Verified Signatures', Value: data.verifiedSignatures },
      { Metric: 'Pending Verifications', Value: data.pendingVerifications },
      { Metric: 'Avg Verification Time (hrs)', Value: data.averageVerificationTime.toFixed(1) },
      ...data.signaturesByType.map(t => ({
        Metric: `Type: ${t.type}`,
        Value: t.count,
      })),
      ...data.signaturesByMethod.map(m => ({
        Metric: `Method: ${m.method}`,
        Value: m.count,
      })),
    ];
    exportToCSV(csvData, 'signatures_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Signatures summary has been downloaded as CSV',
    });
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM dd, yyyy HH:mm');
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'uuid':
        return <Key className="w-3 h-3" />;
      case 'phone':
      case 'email':
        return <User className="w-3 h-3" />;
      case 'handwriting':
        return <PenTool className="w-3 h-3" />;
      case 'biometric':
        return <Fingerprint className="w-3 h-3" />;
      default:
        return <PenTool className="w-3 h-3" />;
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
          <p className="text-muted-foreground">Unable to load signatures data</p>
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
          <h2 className="text-xl font-semibold" data-testid="text-signatures-title">Signatures Report</h2>
          <p className="text-sm text-muted-foreground">Digital signature audit trail and verification tracking</p>
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
            <CardDescription>Total Signatures</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-total-signatures">
              <PenTool className="w-5 h-5 text-muted-foreground" />
              {data.totalSignatures}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Verified</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-green-600" data-testid="text-verified-signatures">
              <CheckCircle className="w-5 h-5" />
              {data.verifiedSignatures}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-amber-600" data-testid="text-pending-signatures">
              <Clock className="w-5 h-5" />
              {data.pendingVerifications}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Verification Time</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-avg-time">
              <Clock className="w-5 h-5 text-muted-foreground" />
              {data.averageVerificationTime.toFixed(1)}h
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="by-method" data-testid="tab-by-method">By Method</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signatures by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {data.signaturesByType.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No signatures found</p>
                ) : (
                  <div className="space-y-3">
                    {data.signaturesByType.map(item => (
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
                <CardTitle className="text-base">Monthly Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {data.signaturesByMonth.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No monthly data available</p>
                ) : (
                  <div className="space-y-2">
                    {data.signaturesByMonth.map(item => (
                      <div key={item.month} className="flex justify-between items-center">
                        <span className="text-sm">{format(new Date(item.month + '-01'), 'MMMM yyyy')}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full" 
                              style={{ width: `${Math.min(100, (item.count / Math.max(...data.signaturesByMonth.map(m => m.count))) * 100)}%` }}
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
          </div>
        </TabsContent>

        <TabsContent value="by-method" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signatures by Method</CardTitle>
              <CardDescription>Authentication method distribution</CardDescription>
            </CardHeader>
            <CardContent>
              {data.signaturesByMethod.length === 0 ? (
                <p className="text-muted-foreground text-sm">No method data available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.signaturesByMethod.map(item => (
                      <TableRow key={item.method}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getMethodIcon(item.method)}
                            <span className="font-medium capitalize">{item.method}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {data.totalSignatures > 0 
                            ? `${((item.count / data.totalSignatures) * 100).toFixed(1)}%` 
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

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Signatures</CardTitle>
              <CardDescription>Latest signature activities</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentSignatures.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent signatures</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Signer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentSignatures.map(sig => (
                      <TableRow key={sig.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{sig.signerName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{sig.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 capitalize">
                            {getMethodIcon(sig.method)}
                            {sig.method}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(sig.createdAt)}</TableCell>
                        <TableCell>
                          {sig.verifiedAt ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : sig.isValid ? (
                            <Badge variant="secondary">
                              <Clock className="w-3 h-3 mr-1" />
                              Valid
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              Invalid
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