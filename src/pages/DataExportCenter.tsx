import { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download, FileSpreadsheet, FileText, BarChart3,
  Calendar, MapPin, TrendingUp, Loader2
} from 'lucide-react';

type ExportFormat = 'csv' | 'excel';

interface ExportJob {
  id: string;
  category: string;
  status: 'idle' | 'exporting' | 'done' | 'error';
  progress: number;
}

const DataExportCenter = () => {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();

  const isAdmin = hasAnyRole(['admin', 'Admin', 'super_admin', 'Super Admin']);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exportStatus, setExportStatus] = useState<Record<string, ExportJob>>({});
  const [hubFilter, setHubFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const setJobStatus = (category: string, status: ExportJob['status'], progress = 0) => {
    setExportStatus(prev => ({
      ...prev,
      [category]: { id: category, category, status, progress }
    }));
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToExcel = async (data: Record<string, unknown>[], sheetName: string, filename: string) => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const toCsv = (data: Record<string, unknown>[]) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  };

  const exportCycleReports = useCallback(async () => {
    setJobStatus('cycles', 'exporting', 10);
    try {
      let query = supabase
        .from('mmp_files')
        .select('id, name, month, year, region, hub, cycle_status, cycle_closed_at, cycle_closing_started_at')
        .eq('cycle_status', 'closed')
        .order('cycle_closed_at', { ascending: false });

      if (dateFrom) query = query.gte('cycle_closed_at', dateFrom);
      if (dateTo) query = query.lte('cycle_closed_at', dateTo);

      const { data: cycles, error } = await query;
      if (error) throw error;

      setJobStatus('cycles', 'exporting', 40);

      const cycleIds = (cycles || []).map(c => c.id);
      let siteStats: any[] = [];
      if (cycleIds.length > 0) {
        const { data } = await supabase
          .from('site_visits')
          .select('mmp_id, status, not_covered_flag, not_covered_reason')
          .in('mmp_id', cycleIds);
        siteStats = data || [];
      }

      setJobStatus('cycles', 'exporting', 70);

      const exportData = (cycles || []).map(c => {
        const sites = siteStats.filter(s => s.mmp_id === c.id);
        const uncovered = sites.filter(s => s.not_covered_flag).length;
        const completed = sites.filter(s => s.status === 'completed').length;
        const reasons: Record<string, number> = {};
        sites.filter(s => s.not_covered_flag && s.not_covered_reason).forEach(s => {
          reasons[s.not_covered_reason] = (reasons[s.not_covered_reason] || 0) + 1;
        });
        return {
          'Cycle Name': c.name,
          'Month': c.month || '',
          'Year': c.year || '',
          'Region': c.region || '',
          'Hub': (c as any).hub || '',
          'Total Sites': sites.length,
          'Completed': completed,
          'Uncovered': uncovered,
          'Coverage Rate': sites.length > 0 ? `${Math.round((completed / sites.length) * 100)}%` : 'N/A',
          'Closed At': c.cycle_closed_at || '',
          'Top Reasons': Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${r}(${n})`).join('; '),
        };
      });

      const filename = `cycle-reports-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        await exportToExcel(exportData, 'Cycle Reports', `${filename}.xlsx`);
      } else {
        downloadFile(toCsv(exportData), `${filename}.csv`, 'text/csv');
      }

      setJobStatus('cycles', 'done', 100);
      toast({ title: 'Export Complete', description: `Exported ${exportData.length} cycle reports.` });
    } catch (err: any) {
      setJobStatus('cycles', 'error', 0);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [dateFrom, dateTo, format, toast]);

  const exportSiteVisits = useCallback(async () => {
    setJobStatus('visits', 'exporting', 10);
    try {
      let query = supabase
        .from('site_visits')
        .select('id, site_name, site_code, state, locality, status, mmp_id, not_covered_flag, not_covered_reason, not_covered_reason_other, quality_score, quality_notes, created_at')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      setJobStatus('visits', 'exporting', 30);
      const { data, error } = await query.limit(5000);
      if (error) throw error;

      setJobStatus('visits', 'exporting', 70);

      const exportData = (data || []).map(s => ({
        'Site Name': s.site_name,
        'Site Code': s.site_code || '',
        'State': s.state || '',
        'Locality': s.locality || '',
        'Status': s.status,
        'Not Covered': s.not_covered_flag ? 'Yes' : 'No',
        'Reason': s.not_covered_reason || '',
        'Reason Details': s.not_covered_reason_other || '',
        'Quality Score': s.quality_score || '',
        'Quality Notes': s.quality_notes || '',
        'Created': s.created_at || '',
      }));

      const filename = `site-visits-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        await exportToExcel(exportData, 'Site Visits', `${filename}.xlsx`);
      } else {
        downloadFile(toCsv(exportData), `${filename}.csv`, 'text/csv');
      }

      setJobStatus('visits', 'done', 100);
      toast({ title: 'Export Complete', description: `Exported ${exportData.length} site visits.` });
    } catch (err: any) {
      setJobStatus('visits', 'error', 0);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [dateFrom, dateTo, format, statusFilter, toast]);

  const exportCoverageAnalytics = useCallback(async () => {
    setJobStatus('analytics', 'exporting', 10);
    try {
      const { data: cycles, error } = await supabase
        .from('mmp_files')
        .select('id, name, hub, region, month, year, cycle_status, cycle_closed_at')
        .eq('cycle_status', 'closed');

      if (error) throw error;

      setJobStatus('analytics', 'exporting', 40);

      const cycleIds = (cycles || []).map(c => c.id);
      let allSites: any[] = [];
      if (cycleIds.length > 0) {
        const { data } = await supabase
          .from('site_visits')
          .select('mmp_id, status, not_covered_flag, not_covered_reason')
          .in('mmp_id', cycleIds);
        allSites = data || [];
      }

      setJobStatus('analytics', 'exporting', 70);

      const hubMap: Record<string, { total: number; completed: number; uncovered: number; cycles: number }> = {};
      (cycles || []).forEach(c => {
        const hub = (c as any).hub || c.region || 'Unknown';
        if (!hubMap[hub]) hubMap[hub] = { total: 0, completed: 0, uncovered: 0, cycles: 0 };
        hubMap[hub].cycles++;
        const sites = allSites.filter(s => s.mmp_id === c.id);
        hubMap[hub].total += sites.length;
        hubMap[hub].completed += sites.filter(s => s.status === 'completed').length;
        hubMap[hub].uncovered += sites.filter(s => s.not_covered_flag).length;
      });

      const exportData = Object.entries(hubMap).map(([hub, d]) => ({
        'Hub': hub,
        'Total Cycles': d.cycles,
        'Total Sites': d.total,
        'Completed Sites': d.completed,
        'Uncovered Sites': d.uncovered,
        'Coverage Rate': d.total > 0 ? `${Math.round((d.completed / d.total) * 100)}%` : 'N/A',
        'Uncovered Rate': d.total > 0 ? `${Math.round((d.uncovered / d.total) * 100)}%` : 'N/A',
      }));

      const filename = `coverage-analytics-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        await exportToExcel(exportData, 'Coverage Analytics', `${filename}.xlsx`);
      } else {
        downloadFile(toCsv(exportData), `${filename}.csv`, 'text/csv');
      }

      setJobStatus('analytics', 'done', 100);
      toast({ title: 'Export Complete', description: `Exported analytics for ${exportData.length} hubs.` });
    } catch (err: any) {
      setJobStatus('analytics', 'error', 0);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [format, toast]);

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white dark:bg-gray-900 rounded-xl shadow text-center" data-testid="access-denied">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600 dark:text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  const ExportCard = ({ category, title, description, icon: Icon, onExport }: {
    category: string; title: string; description: string; icon: any; onExport: () => void;
  }) => {
    const job = exportStatus[category];
    const isExporting = job?.status === 'exporting';
    return (
      <Card data-testid={`card-export-${category}`}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isExporting && (
            <Progress value={job.progress} className="h-2" />
          )}
          <Button
            onClick={onExport}
            disabled={isExporting}
            className="w-full"
            data-testid={`button-export-${category}`}
          >
            {isExporting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Export {title}</>
            )}
          </Button>
          {job?.status === 'done' && (
            <Badge variant="secondary" className="text-green-600">Export completed</Badge>
          )}
          {job?.status === 'error' && (
            <Badge variant="destructive">Export failed</Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="data-export-center-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">Data Export Center</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Export cycle reports, site visits, and analytics data</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Export Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Date From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Date To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Format</label>
              <Select value={format} onValueChange={v => setFormat(v as ExportFormat)}>
                <SelectTrigger className="w-[140px]" data-testid="select-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Status Filter (Site Visits)</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <ExportCard
          category="cycles"
          title="Cycle Reports"
          description="Export closed cycle data with reason breakdowns and coverage rates"
          icon={FileText}
          onExport={exportCycleReports}
        />
        <ExportCard
          category="visits"
          title="Site Visits"
          description="Export site visit records with filters for status, dates, and quality scores"
          icon={MapPin}
          onExport={exportSiteVisits}
        />
        <ExportCard
          category="analytics"
          title="Coverage Analytics"
          description="Export hub-level performance data and coverage metrics"
          icon={TrendingUp}
          onExport={exportCoverageAnalytics}
        />
      </div>
    </div>
  );
};

export default DataExportCenter;
