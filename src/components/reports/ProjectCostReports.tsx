import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
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
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  FolderOpen,
} from 'lucide-react';
import { ReportingService } from '@/services/reporting.service';
import { 
  exportProjectCostAnalysisPDF, 
  exportToExcel,
  exportToCSV,
} from '@/utils/report-export';
import type { ProjectCostAnalysis, RAGStatus } from '@/types/reports';
import { useToast } from '@/components/ui/use-toast';

const RAGBadge = ({ status }: { status: RAGStatus }) => {
  const variants = {
    green: 'default',
    amber: 'secondary',
    red: 'destructive',
  } as const;
  
  return (
    <Badge variant={variants[status]}>
      {status.toUpperCase()}
    </Badge>
  );
};

export function ProjectCostReports() {
  const [data, setData] = useState<ProjectCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const projectCosts = await ReportingService.getProjectCostAnalysis();
      setData(projectCosts);
    } catch (error) {
      console.error('Error fetching project cost data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load project cost data',
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
    setExporting(true);
    try {
      await exportProjectCostAnalysisPDF(data);
      toast({
        title: 'Report Exported',
        description: 'Project cost analysis has been downloaded as PDF',
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
    const excelData = data.map(p => ({
      'Project': p.projectName,
      'Code': p.projectCode || '-',
      'Status': p.status,
      'Total Budget': p.totalBudget,
      'Spent': p.totalSpent,
      'Remaining': p.remaining,
      'Utilization (%)': p.utilizationPercentage.toFixed(1),
      'Variance (%)': p.variancePercentage.toFixed(1),
      'Cost Per Site': p.costPerSite.toFixed(0),
      'Forecast at Completion': p.forecastAtCompletion.toFixed(0),
      'Blocked Items': p.blockedItems,
      'Override Items': p.overBudgetItems,
      'RAG Status': p.ragStatus.toUpperCase(),
    }));
    exportToExcel(excelData, 'Project Costs', 'project_cost_analysis.xlsx');
    toast({
      title: 'Report Exported',
      description: 'Project cost analysis has been downloaded as Excel',
    });
  };

  const handleExportCSV = () => {
    const csvData = data.map(p => ({
      Project: p.projectName,
      Code: p.projectCode || '',
      Status: p.status,
      TotalBudget: p.totalBudget,
      Spent: p.totalSpent,
      Remaining: p.remaining,
      UtilizationPercent: p.utilizationPercentage,
      VariancePercent: p.variancePercentage,
      CostPerSite: p.costPerSite,
      ForecastAtCompletion: p.forecastAtCompletion,
      BlockedItems: p.blockedItems,
      OverrideItems: p.overBudgetItems,
      RAGStatus: p.ragStatus,
    }));
    exportToCSV(csvData, 'project_cost_analysis.csv');
    toast({
      title: 'Report Exported',
      description: 'Project cost analysis has been downloaded as CSV',
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalBudget = data.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalSpent = data.reduce((sum, p) => sum + p.totalSpent, 0);
  const projectsOnTrack = data.filter(p => p.ragStatus === 'green').length;
  const projectsAtRisk = data.filter(p => p.ragStatus === 'amber').length;
  const projectsOverBudget = data.filter(p => p.ragStatus === 'red').length;
  const totalBlockedItems = data.reduce((sum, p) => sum + p.blockedItems, 0);

  return (
    <div className="space-y-6" data-testid="project-cost-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">Project Cost Analysis</h2>
        <div className="flex items-center gap-2">
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
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-2xl font-bold">{data.length}</p>
              </div>
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On Track</p>
                <p className="text-2xl font-bold text-green-600">{projectsOnTrack}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold text-amber-600">{projectsAtRisk}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Over Budget</p>
                <p className="text-2xl font-bold text-red-600">{projectsOverBudget}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Blocked Items</p>
                <p className="text-2xl font-bold">{totalBlockedItems}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Portfolio Overview
          </CardTitle>
          <CardDescription>Combined budget status across all projects</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Total Budget</p>
              <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Spent</p>
              <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalBudget - totalSpent)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Utilization</span>
              <span className="font-medium">{formatPercent(totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}</span>
            </div>
            <Progress value={totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Individual project budget and cost analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-center">Utilization</TableHead>
                <TableHead className="text-right">Cost/Site</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((project, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{project.projectName}</p>
                      {project.projectCode && (
                        <p className="text-xs text-muted-foreground">{project.projectCode}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(project.totalBudget)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(project.totalSpent)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(project.remaining)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <Progress value={project.utilizationPercentage} className="w-16 h-2" />
                      <span className="text-xs">{formatPercent(project.utilizationPercentage)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(project.costPerSite)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(project.forecastAtCompletion)}</TableCell>
                  <TableCell className="text-center">
                    <RAGBadge status={project.ragStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.some(p => p.costByRegion.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Region</CardTitle>
            <CardDescription>Regional cost distribution across projects</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Region/State</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-center">Site Count</TableHead>
                  <TableHead className="text-right">Avg Cost/Site</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.flatMap(p => p.costByRegion).slice(0, 15).map((region, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{region.region || region.state}</TableCell>
                    <TableCell className="text-right">{formatCurrency(region.totalCost)}</TableCell>
                    <TableCell className="text-center">{region.siteCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(region.averageCostPerSite)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ProjectCostReports;
