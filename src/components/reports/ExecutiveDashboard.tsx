import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  DollarSign,
  Users,
  MapPin,
  Clock,
  FileText,
  Download,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { exportExecutiveSummaryPDF, exportToExcel, exportToCSV } from '@/utils/report-export';
import type { ExecutiveSummary, RAGStatus } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';

const RAGIndicator = ({ status, size = 'md' }: { status: RAGStatus; size?: 'sm' | 'md' | 'lg' }) => {
  const colors = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  
  const sizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <div className={`${sizes[size]} ${colors[status]} rounded-full animate-pulse`} />
  );
};

const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  trend,
  status,
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: any;
  trend?: 'up' | 'down' | 'stable';
  status?: RAGStatus;
}) => {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold">{value}</p>
              {trend && (
                <span className={trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}>
                  {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : trend === 'down' ? <TrendingDown className="w-4 h-4" /> : null}
                </span>
              )}
              {status && <RAGIndicator status={status} size="sm" />}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export function ExecutiveDashboard() {
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const summary = await ReportingService.getExecutiveSummary();
      setData(summary);
    } catch (error) {
      console.error('Error fetching executive summary:', error);
      toast({
        title: 'Error',
        description: 'Failed to load executive summary',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExportPDF = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportExecutiveSummaryPDF(data);
      toast({
        title: 'Report Exported',
        description: 'Executive summary has been downloaded as PDF',
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
      { Metric: 'Portfolio Health', Value: data.portfolioHealth.toUpperCase() },
      { Metric: 'Overall Score', Value: `${data.overallScore.toFixed(0)}%` },
      { Metric: 'Total Budget', Value: data.budgetPosture.totalBudget },
      { Metric: 'Total Spent', Value: data.budgetPosture.totalSpent },
      { Metric: 'Utilization Rate', Value: `${data.budgetPosture.utilizationRate.toFixed(1)}%` },
      { Metric: 'Projects On Track', Value: data.budgetPosture.projectsOnTrack },
      { Metric: 'Projects At Risk', Value: data.budgetPosture.projectsAtRisk },
      { Metric: 'Projects Over Budget', Value: data.budgetPosture.projectsOverBudget },
      { Metric: 'Total Site Visits', Value: data.operationalStatus.totalSiteVisits },
      { Metric: 'Completed Visits', Value: data.operationalStatus.completedVisits },
      { Metric: 'On-Time Rate', Value: `${data.operationalStatus.onTimeRate.toFixed(1)}%` },
      { Metric: 'Pending Escalations', Value: data.operationalStatus.escalationsPending },
      { Metric: 'States Covered', Value: data.fieldCoverage.statesCovered },
      { Metric: 'Sites Covered', Value: data.fieldCoverage.sitesCovered },
      { Metric: 'Coverage Percentage', Value: `${data.fieldCoverage.coveragePercentage.toFixed(1)}%` },
    ];
    exportToExcel(excelData, 'Executive Summary', 'executive_summary.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Executive summary has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvData = [
      { Metric: 'Portfolio Health', Value: data.portfolioHealth },
      { Metric: 'Overall Score', Value: data.overallScore },
      { Metric: 'Total Budget', Value: data.budgetPosture.totalBudget },
      { Metric: 'Total Spent', Value: data.budgetPosture.totalSpent },
      { Metric: 'Utilization Rate', Value: data.budgetPosture.utilizationRate },
      { Metric: 'Total Site Visits', Value: data.operationalStatus.totalSiteVisits },
      { Metric: 'Completed Visits', Value: data.operationalStatus.completedVisits },
      { Metric: 'Pending Escalations', Value: data.operationalStatus.escalationsPending },
    ];
    exportToCSV(csvData, 'executive_summary.csv');
    toast({
      title: 'Report Exported',
      description: 'Executive summary has been downloaded as CSV',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Unable to load executive summary</p>
          <Button variant="outline" onClick={fetchData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6" data-testid="executive-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Executive Overview</h2>
          <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full">
            <RAGIndicator status={data.portfolioHealth} size="md" />
            <span className="text-sm font-medium capitalize">{data.portfolioHealth} - Portfolio Health</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={exporting} data-testid="button-export-executive-pdf">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exporting...' : 'PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} data-testid="button-export-executive-excel">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-executive-csv">
            <FileText className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Overall Score"
          value={`${data.overallScore.toFixed(0)}%`}
          subtitle="Portfolio performance"
          icon={CheckCircle2}
          status={data.portfolioHealth}
        />
        <StatCard
          title="Budget Utilization"
          value={formatPercent(data.budgetPosture.utilizationRate)}
          subtitle={`${formatCurrency(data.budgetPosture.totalSpent)} of ${formatCurrency(data.budgetPosture.totalBudget)}`}
          icon={DollarSign}
          status={data.budgetPosture.utilizationRate > 90 ? 'red' : data.budgetPosture.utilizationRate > 70 ? 'amber' : 'green'}
        />
        <StatCard
          title="Field Coverage"
          value={formatPercent(data.fieldCoverage.coveragePercentage)}
          subtitle={`${data.fieldCoverage.sitesCovered} of ${data.fieldCoverage.totalSites} sites`}
          icon={MapPin}
          status={data.fieldCoverage.coveragePercentage > 80 ? 'green' : data.fieldCoverage.coveragePercentage > 50 ? 'amber' : 'red'}
        />
        <StatCard
          title="Pending Escalations"
          value={data.operationalStatus.escalationsPending}
          subtitle="Requiring attention"
          icon={AlertTriangle}
          status={data.operationalStatus.escalationsPending > 5 ? 'red' : data.operationalStatus.escalationsPending > 0 ? 'amber' : 'green'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Budget Posture
            </CardTitle>
            <CardDescription>Financial status across all projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Budget Utilization</span>
                <span className="font-medium">{formatPercent(data.budgetPosture.utilizationRate)}</span>
              </div>
              <Progress 
                value={Math.min(data.budgetPosture.utilizationRate, 100)} 
                className="h-3"
              />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-2xl font-bold">{data.budgetPosture.projectsOnTrack}</span>
                </div>
                <p className="text-xs text-muted-foreground">On Track</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-amber-500 rounded-full" />
                  <span className="text-2xl font-bold">{data.budgetPosture.projectsAtRisk}</span>
                </div>
                <p className="text-xs text-muted-foreground">At Risk</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span className="text-2xl font-bold">{data.budgetPosture.projectsOverBudget}</span>
                </div>
                <p className="text-xs text-muted-foreground">Over Budget</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-xl font-bold">{formatCurrency(data.budgetPosture.totalBudget)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold">{formatCurrency(data.budgetPosture.totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Operational Status
            </CardTitle>
            <CardDescription>Site visit and approval metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Total Site Visits</span>
              <span className="font-medium">{data.operationalStatus.totalSiteVisits}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Completed</span>
              <span className="font-medium text-green-600">{data.operationalStatus.completedVisits}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">On-Time Rate</span>
              <Badge variant={data.operationalStatus.onTimeRate > 80 ? 'default' : 'destructive'}>
                {formatPercent(data.operationalStatus.onTimeRate)}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Pending Approvals</span>
              <span className="font-medium">{data.operationalStatus.pendingApprovals}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Escalations</span>
              <Badge variant={data.operationalStatus.escalationsPending > 0 ? 'destructive' : 'outline'}>
                {data.operationalStatus.escalationsPending}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Field Coverage
            </CardTitle>
            <CardDescription>Geographic coverage across states and sites</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-3xl font-bold">{data.fieldCoverage.statesCovered}</p>
                <p className="text-sm text-muted-foreground">of {data.fieldCoverage.totalStates} States</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-3xl font-bold">{data.fieldCoverage.sitesCovered}</p>
                <p className="text-sm text-muted-foreground">of {data.fieldCoverage.totalSites} Sites</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Coverage Progress</span>
                <span className="font-medium">{formatPercent(data.fieldCoverage.coveragePercentage)}</span>
              </div>
              <Progress value={data.fieldCoverage.coveragePercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Recent Exceptions
            </CardTitle>
            <CardDescription>Budget overrides and policy exceptions</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentExceptions.length > 0 ? (
              <div className="space-y-3">
                {data.recentExceptions.map((exception) => (
                  <div key={exception.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{exception.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {exception.approvedBy && `Approved by ${exception.approvedBy}`}
                        {exception.amount && ` - ${formatCurrency(exception.amount)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">No recent exceptions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
