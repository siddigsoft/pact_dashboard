import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  MapPin,
  TrendingUp,
  Building2,
  Globe2,
  Layers,
  Activity,
  BarChart3,
  Target,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { 
  exportProductivityMetricsPDF, 
  exportOperationalEfficiencyPDF,
  exportToExcel, 
  exportToCSV 
} from '@/utils/report-export';
import type { ProductivityMetrics, OperationalEfficiency, CoverageEntry } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface LocalityCoverage {
  locality: string;
  state: string;
  totalSites: number;
  visitedSites: number;
  pendingSites: number;
  coveragePercentage: number;
}

interface ActivityCoverage {
  activity: string;
  totalSites: number;
  visitedSites: number;
  pendingSites: number;
  coveragePercentage: number;
  byHub?: { hub: string; sites: number; completed: number }[];
  byState?: { state: string; sites: number; completed: number }[];
}

export function AnalyticsReports() {
  const [productivityData, setProductivityData] = useState<ProductivityMetrics[]>([]);
  const [efficiencyData, setEfficiencyData] = useState<OperationalEfficiency | null>(null);
  const [localityCoverage, setLocalityCoverage] = useState<LocalityCoverage[]>([]);
  const [activityCoverage, setActivityCoverage] = useState<ActivityCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [coverageSubTab, setCoverageSubTab] = useState<'hub' | 'state' | 'locality' | 'activity'>('hub');
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

      let siteEntriesQuery = supabase
        .from('mmp_site_entries')
        .select('id, state, locality, activity_at_site, hub_office, status, created_at');
      
      if (range?.from) {
        siteEntriesQuery = siteEntriesQuery.gte('created_at', range.from.toISOString());
      }
      if (range?.to) {
        siteEntriesQuery = siteEntriesQuery.lte('created_at', range.to.toISOString());
      }
      
      const { data: siteEntries } = await siteEntriesQuery;

      if (siteEntries) {
        const localityMap = new Map<string, LocalityCoverage>();
        const activityMap = new Map<string, ActivityCoverage>();

        siteEntries.forEach((entry: any) => {
          const locality = entry.locality || 'Unknown';
          const state = entry.state || 'Unknown';
          const activity = entry.activity_at_site || 'Unknown';
          const hub = entry.hub_office || 'Unknown';
          const isCompleted = entry.status?.toLowerCase() === 'completed';
          const localityKey = `${state}|${locality}`;
          if (!localityMap.has(localityKey)) {
            localityMap.set(localityKey, {
              locality,
              state,
              totalSites: 0,
              visitedSites: 0,
              pendingSites: 0,
              coveragePercentage: 0,
            });
          }
          const loc = localityMap.get(localityKey)!;
          loc.totalSites++;
          if (isCompleted) loc.visitedSites++;
          else loc.pendingSites++;
          loc.coveragePercentage = loc.totalSites > 0 ? (loc.visitedSites / loc.totalSites) * 100 : 0;
          if (!activityMap.has(activity)) {
            activityMap.set(activity, {
              activity,
              totalSites: 0,
              visitedSites: 0,
              pendingSites: 0,
              coveragePercentage: 0,
              byHub: [],
              byState: [],
            });
          }
          const act = activityMap.get(activity)!;
          act.totalSites++;
          if (isCompleted) act.visitedSites++;
          else act.pendingSites++;
          act.coveragePercentage = act.totalSites > 0 ? (act.visitedSites / act.totalSites) * 100 : 0;
          const hubEntry = act.byHub?.find(h => h.hub === hub);
          if (hubEntry) {
            hubEntry.sites++;
            if (isCompleted) hubEntry.completed++;
          } else {
            act.byHub?.push({ hub, sites: 1, completed: isCompleted ? 1 : 0 });
          }
          const stateEntry = act.byState?.find(s => s.state === state);
          if (stateEntry) {
            stateEntry.sites++;
            if (isCompleted) stateEntry.completed++;
          } else {
            act.byState?.push({ state, sites: 1, completed: isCompleted ? 1 : 0 });
          }
        });

        setLocalityCoverage(Array.from(localityMap.values()).sort((a, b) => b.totalSites - a.totalSites));
        setActivityCoverage(Array.from(activityMap.values()).sort((a, b) => b.totalSites - a.totalSites));
      }
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
      toast({ title: 'Report Exported', description: 'Productivity report has been downloaded as PDF' });
    } catch {
      toast({ title: 'Export Failed', description: 'Unable to generate the PDF report', variant: 'destructive' });
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
      toast({ title: 'Report Exported', description: 'Efficiency report has been downloaded as PDF' });
    } catch {
      toast({ title: 'Export Failed', description: 'Unable to generate the PDF report', variant: 'destructive' });
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
    toast({ title: 'Report Exported', description: 'Productivity report has been downloaded as Excel' });
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
    toast({ title: 'Report Exported', description: 'Productivity report has been downloaded as CSV' });
  };

  const handleExportEfficiencyCSV = () => {
    if (!efficiencyData) return;
    const csvData = [
      { Metric: 'Total Visits', Value: efficiencyData.totalVisits },
      { Metric: 'Completed Visits', Value: efficiencyData.completedVisits },
      { Metric: 'Pending Visits', Value: efficiencyData.pendingVisits },
      { Metric: 'Avg Cycle Time (days)', Value: efficiencyData.averageCycleTime },
      { Metric: 'First Pass Acceptance', Value: efficiencyData.firstPassAcceptance },
      { Metric: 'Rework Rate', Value: efficiencyData.reworkRate },
      { Metric: 'Assignment Latency (hrs)', Value: efficiencyData.assignmentLatency },
    ];
    exportToCSV(csvData, 'operational_efficiency.csv');
    toast({ title: 'Report Exported', description: 'Efficiency report has been downloaded as CSV' });
  };

  const handleExportCoverageExcel = (type: string) => {
    let excelData: any[] = [];
    if (type === 'hub' && efficiencyData?.coverageByHub) {
      excelData = efficiencyData.coverageByHub.map(h => ({
        'Hub': h.name, 'Total Sites': h.totalSites, 'Visited': h.visitedSites, 'Pending': h.pendingSites, 'Coverage %': h.coveragePercentage.toFixed(1)
      }));
    } else if (type === 'state' && efficiencyData?.coverageByState) {
      excelData = efficiencyData.coverageByState.map(s => ({
        'State': s.name, 'Total Sites': s.totalSites, 'Visited': s.visitedSites, 'Pending': s.pendingSites, 'Coverage %': s.coveragePercentage.toFixed(1)
      }));
    } else if (type === 'locality') {
      excelData = localityCoverage.map(l => ({
        'State': l.state, 'Locality': l.locality, 'Total Sites': l.totalSites, 'Visited': l.visitedSites, 'Pending': l.pendingSites, 'Coverage %': l.coveragePercentage.toFixed(1)
      }));
    } else if (type === 'activity') {
      excelData = activityCoverage.map(a => ({
        'Activity': a.activity, 'Total Sites': a.totalSites, 'Visited': a.visitedSites, 'Pending': a.pendingSites, 'Coverage %': a.coveragePercentage.toFixed(1)
      }));
    }
    exportToExcel(excelData, `Coverage by ${type}`, `coverage_${type}.xlsx`);
    toast({ title: 'Report Exported', description: `Coverage by ${type} has been downloaded` });
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SDG', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const totalStats = useMemo(() => {
    const totalAssigned = productivityData.reduce((sum, m) => sum + m.visitsAssigned, 0);
    const totalCompleted = productivityData.reduce((sum, m) => sum + m.visitsCompleted, 0);
    const avgCompletionRate = productivityData.length > 0 ? productivityData.reduce((sum, m) => sum + m.completionRate, 0) / productivityData.length : 0;
    const avgOnTimeRate = productivityData.length > 0 ? productivityData.reduce((sum, m) => sum + m.onTimeRate, 0) / productivityData.length : 0;
    return { totalAssigned, totalCompleted, avgCompletionRate, avgOnTimeRate };
  }, [productivityData]);

  const getCoverageBadgeVariant = (percentage: number) => percentage >= 80 ? 'default' : percentage >= 50 ? 'secondary' : 'destructive';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between"><Skeleton className="h-10 w-64" /><Skeleton className="h-9 w-80" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="analytics-reports">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-6 border">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-primary" />
              Analytics Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">Comprehensive field operations analytics and coverage reports</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
            <Button variant="outline" size="sm" onClick={fetchData} data-testid="button-refresh-analytics">
              <RefreshCw className="w-4 h-4 mr-2" />Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Visits</p>
                <p className="text-3xl font-bold">{efficiencyData?.totalVisits || 0}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">{efficiencyData?.completedVisits || 0} completed</Badge>
                </div>
              </div>
              <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold">{formatPercent(totalStats.avgCompletionRate)}</p>
                <Progress value={totalStats.avgCompletionRate} className="mt-2 h-2" />
              </div>
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On-Time Rate</p>
                <p className="text-3xl font-bold">{formatPercent(totalStats.avgOnTimeRate)}</p>
                <Progress value={totalStats.avgOnTimeRate} className="mt-2 h-2" />
              </div>
              <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-7 h-7 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue Visits</p>
                <p className="text-3xl font-bold text-red-600">{efficiencyData?.overdueVisits || 0}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">{efficiencyData?.pendingVisits || 0} pending</Badge>
                </div>
              </div>
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b px-6 pt-4">
            <TabsList className="h-12 bg-muted/50 p-1 rounded-lg">
              <TabsTrigger value="overview" className="gap-2 px-4" data-testid="tab-overview">
                <Target className="w-4 h-4" />Overview
              </TabsTrigger>
              <TabsTrigger value="productivity" className="gap-2 px-4" data-testid="tab-productivity">
                <Users className="w-4 h-4" />Productivity
              </TabsTrigger>
              <TabsTrigger value="efficiency" className="gap-2 px-4" data-testid="tab-efficiency">
                <Clock className="w-4 h-4" />Efficiency
              </TabsTrigger>
              <TabsTrigger value="coverage" className="gap-2 px-4" data-testid="tab-coverage">
                <MapPin className="w-4 h-4" />Coverage Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" />Top Hubs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(efficiencyData?.coverageByHub || []).slice(0, 5).map((hub, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{hub.name}</span>
                        <Badge variant={getCoverageBadgeVariant(hub.coveragePercentage)}>{formatPercent(hub.coveragePercentage)}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Globe2 className="w-4 h-4" />Top States</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(efficiencyData?.coverageByState || []).slice(0, 5).map((state, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{state.name}</span>
                        <Badge variant={getCoverageBadgeVariant(state.coveragePercentage)}>{formatPercent(state.coveragePercentage)}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" />Top Activities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activityCoverage.slice(0, 5).map((act, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{act.activity}</span>
                        <Badge variant={getCoverageBadgeVariant(act.coveragePercentage)}>{formatPercent(act.coveragePercentage)}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="productivity" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5" />Enumerator Productivity</h3>
                <p className="text-sm text-muted-foreground">Performance metrics for field team members</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleExportProductivityPDF} disabled={exporting} data-testid="button-export-productivity-pdf"><Download className="w-4 h-4 mr-2" />PDF</Button>
                <Button variant="outline" size="sm" onClick={handleExportProductivityExcel} data-testid="button-export-productivity-excel"><FileSpreadsheet className="w-4 h-4 mr-2" />Excel</Button>
                <Button variant="outline" size="sm" onClick={handleExportProductivityCSV} data-testid="button-export-productivity-csv"><FileText className="w-4 h-4 mr-2" />CSV</Button>
              </div>
            </div>
            <ScrollArea className="h-[400px]">
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
                  {productivityData.map((metric, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{metric.enumeratorName}</TableCell>
                      <TableCell><Badge variant="outline">{metric.role}</Badge></TableCell>
                      <TableCell className="text-center">{metric.visitsAssigned}</TableCell>
                      <TableCell className="text-center">{metric.visitsCompleted}</TableCell>
                      <TableCell className="text-center"><Badge variant={getCoverageBadgeVariant(metric.completionRate)}>{formatPercent(metric.completionRate)}</Badge></TableCell>
                      <TableCell className="text-center"><Badge variant={getCoverageBadgeVariant(metric.onTimeRate)}>{formatPercent(metric.onTimeRate)}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(metric.totalEarnings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="efficiency" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2"><Clock className="w-5 h-5" />Operational Efficiency</h3>
                <p className="text-sm text-muted-foreground">System-wide performance metrics</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleExportEfficiencyPDF} disabled={exporting} data-testid="button-export-efficiency-pdf"><Download className="w-4 h-4 mr-2" />PDF</Button>
                <Button variant="outline" size="sm" onClick={handleExportEfficiencyCSV} data-testid="button-export-efficiency-csv"><FileText className="w-4 h-4 mr-2" />CSV</Button>
              </div>
            </div>
            {efficiencyData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average Cycle Time</p><p className="text-2xl font-bold">{efficiencyData.averageCycleTime.toFixed(1)} days</p><p className="text-xs text-muted-foreground mt-1">From assignment to completion</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">First Pass Acceptance</p><p className="text-2xl font-bold">{formatPercent(efficiencyData.firstPassAcceptance)}</p><p className="text-xs text-muted-foreground mt-1">Completed without rework</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Rework Rate</p><p className="text-2xl font-bold text-amber-600">{formatPercent(efficiencyData.reworkRate)}</p><p className="text-xs text-muted-foreground mt-1">Required revision</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Assignment Latency</p><p className="text-2xl font-bold">{efficiencyData.assignmentLatency.toFixed(1)} hrs</p><p className="text-xs text-muted-foreground mt-1">Upload to assignment</p></CardContent></Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="coverage" className="p-0">
            <div className="border-b bg-muted/30">
              <div className="flex items-center gap-1 p-2 px-6 overflow-x-auto">
                <Button variant={coverageSubTab === 'hub' ? 'default' : 'ghost'} size="sm" onClick={() => setCoverageSubTab('hub')} className="gap-2" data-testid="subtab-hub">
                  <Building2 className="w-4 h-4" />By Hub
                </Button>
                <Button variant={coverageSubTab === 'state' ? 'default' : 'ghost'} size="sm" onClick={() => setCoverageSubTab('state')} className="gap-2" data-testid="subtab-state">
                  <Globe2 className="w-4 h-4" />By State
                </Button>
                <Button variant={coverageSubTab === 'locality' ? 'default' : 'ghost'} size="sm" onClick={() => setCoverageSubTab('locality')} className="gap-2" data-testid="subtab-locality">
                  <Layers className="w-4 h-4" />By Locality
                </Button>
                <Button variant={coverageSubTab === 'activity' ? 'default' : 'ghost'} size="sm" onClick={() => setCoverageSubTab('activity')} className="gap-2" data-testid="subtab-activity">
                  <Activity className="w-4 h-4" />By Activity
                </Button>
              </div>
            </div>
            <div className="p-6">
              {coverageSubTab === 'hub' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div><h3 className="text-lg font-semibold flex items-center gap-2"><Building2 className="w-5 h-5" />Coverage by Hub</h3><p className="text-sm text-muted-foreground">Site visit coverage across field hubs</p></div>
                    <Button variant="outline" size="sm" onClick={() => handleExportCoverageExcel('hub')} data-testid="button-export-coverage-hub"><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow><TableHead>Hub</TableHead><TableHead className="text-center">Total Sites</TableHead><TableHead className="text-center">Visited</TableHead><TableHead className="text-center">Pending</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(efficiencyData?.coverageByHub || []).map((hub, i) => (
                          <TableRow key={i}><TableCell className="font-medium">{hub.name}</TableCell><TableCell className="text-center">{hub.totalSites}</TableCell><TableCell className="text-center text-green-600">{hub.visitedSites}</TableCell><TableCell className="text-center text-amber-600">{hub.pendingSites}</TableCell><TableCell className="text-right"><Badge variant={getCoverageBadgeVariant(hub.coveragePercentage)}>{formatPercent(hub.coveragePercentage)}</Badge></TableCell></TableRow>
                        ))}
                        {(efficiencyData?.coverageByHub || []).length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center">{(efficiencyData?.coverageByHub || []).reduce((sum, h) => sum + h.totalSites, 0)}</TableCell>
                            <TableCell className="text-center text-green-600">{(efficiencyData?.coverageByHub || []).reduce((sum, h) => sum + h.visitedSites, 0)}</TableCell>
                            <TableCell className="text-center text-amber-600">{(efficiencyData?.coverageByHub || []).reduce((sum, h) => sum + h.pendingSites, 0)}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline">{formatPercent((efficiencyData?.coverageByHub || []).reduce((sum, h) => sum + h.visitedSites, 0) / Math.max(1, (efficiencyData?.coverageByHub || []).reduce((sum, h) => sum + h.totalSites, 0)) * 100)}</Badge></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
              {coverageSubTab === 'state' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div><h3 className="text-lg font-semibold flex items-center gap-2"><Globe2 className="w-5 h-5" />Coverage by State</h3><p className="text-sm text-muted-foreground">Site visit coverage across states</p></div>
                    <Button variant="outline" size="sm" onClick={() => handleExportCoverageExcel('state')} data-testid="button-export-coverage-state"><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-center">Total Sites</TableHead><TableHead className="text-center">Visited</TableHead><TableHead className="text-center">Pending</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(efficiencyData?.coverageByState || []).map((state, i) => (
                          <TableRow key={i}><TableCell className="font-medium">{state.name}</TableCell><TableCell className="text-center">{state.totalSites}</TableCell><TableCell className="text-center text-green-600">{state.visitedSites}</TableCell><TableCell className="text-center text-amber-600">{state.pendingSites}</TableCell><TableCell className="text-right"><Badge variant={getCoverageBadgeVariant(state.coveragePercentage)}>{formatPercent(state.coveragePercentage)}</Badge></TableCell></TableRow>
                        ))}
                        {(efficiencyData?.coverageByState || []).length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center">{(efficiencyData?.coverageByState || []).reduce((sum, s) => sum + s.totalSites, 0)}</TableCell>
                            <TableCell className="text-center text-green-600">{(efficiencyData?.coverageByState || []).reduce((sum, s) => sum + s.visitedSites, 0)}</TableCell>
                            <TableCell className="text-center text-amber-600">{(efficiencyData?.coverageByState || []).reduce((sum, s) => sum + s.pendingSites, 0)}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline">{formatPercent((efficiencyData?.coverageByState || []).reduce((sum, s) => sum + s.visitedSites, 0) / Math.max(1, (efficiencyData?.coverageByState || []).reduce((sum, s) => sum + s.totalSites, 0)) * 100)}</Badge></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
              {coverageSubTab === 'locality' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div><h3 className="text-lg font-semibold flex items-center gap-2"><Layers className="w-5 h-5" />Coverage by Locality</h3><p className="text-sm text-muted-foreground">Site visit coverage across localities</p></div>
                    <Button variant="outline" size="sm" onClick={() => handleExportCoverageExcel('locality')} data-testid="button-export-coverage-locality"><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow><TableHead>State</TableHead><TableHead>Locality</TableHead><TableHead className="text-center">Total Sites</TableHead><TableHead className="text-center">Visited</TableHead><TableHead className="text-center">Pending</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {localityCoverage.map((loc, i) => (
                          <TableRow key={i}><TableCell className="text-muted-foreground">{loc.state}</TableCell><TableCell className="font-medium">{loc.locality}</TableCell><TableCell className="text-center">{loc.totalSites}</TableCell><TableCell className="text-center text-green-600">{loc.visitedSites}</TableCell><TableCell className="text-center text-amber-600">{loc.pendingSites}</TableCell><TableCell className="text-right"><Badge variant={getCoverageBadgeVariant(loc.coveragePercentage)}>{formatPercent(loc.coveragePercentage)}</Badge></TableCell></TableRow>
                        ))}
                        {localityCoverage.length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell colSpan={2}>Total ({localityCoverage.length} localities)</TableCell>
                            <TableCell className="text-center">{localityCoverage.reduce((sum, l) => sum + l.totalSites, 0)}</TableCell>
                            <TableCell className="text-center text-green-600">{localityCoverage.reduce((sum, l) => sum + l.visitedSites, 0)}</TableCell>
                            <TableCell className="text-center text-amber-600">{localityCoverage.reduce((sum, l) => sum + l.pendingSites, 0)}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline">{formatPercent(localityCoverage.reduce((sum, l) => sum + l.visitedSites, 0) / Math.max(1, localityCoverage.reduce((sum, l) => sum + l.totalSites, 0)) * 100)}</Badge></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
              {coverageSubTab === 'activity' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div><h3 className="text-lg font-semibold flex items-center gap-2"><Activity className="w-5 h-5" />Coverage by Activity</h3><p className="text-sm text-muted-foreground">Site visit coverage by activity type</p></div>
                    <Button variant="outline" size="sm" onClick={() => handleExportCoverageExcel('activity')} data-testid="button-export-coverage-activity"><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow><TableHead>Activity</TableHead><TableHead className="text-center">Total Sites</TableHead><TableHead className="text-center">Visited</TableHead><TableHead className="text-center">Pending</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {activityCoverage.map((act, i) => (
                          <TableRow key={i}><TableCell className="font-medium">{act.activity}</TableCell><TableCell className="text-center">{act.totalSites}</TableCell><TableCell className="text-center text-green-600">{act.visitedSites}</TableCell><TableCell className="text-center text-amber-600">{act.pendingSites}</TableCell><TableCell className="text-right"><Badge variant={getCoverageBadgeVariant(act.coveragePercentage)}>{formatPercent(act.coveragePercentage)}</Badge></TableCell></TableRow>
                        ))}
                        {activityCoverage.length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total ({activityCoverage.length} activities)</TableCell>
                            <TableCell className="text-center">{activityCoverage.reduce((sum, a) => sum + a.totalSites, 0)}</TableCell>
                            <TableCell className="text-center text-green-600">{activityCoverage.reduce((sum, a) => sum + a.visitedSites, 0)}</TableCell>
                            <TableCell className="text-center text-amber-600">{activityCoverage.reduce((sum, a) => sum + a.pendingSites, 0)}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline">{formatPercent(activityCoverage.reduce((sum, a) => sum + a.visitedSites, 0) / Math.max(1, activityCoverage.reduce((sum, a) => sum + a.totalSites, 0)) * 100)}</Badge></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

export default AnalyticsReports;
