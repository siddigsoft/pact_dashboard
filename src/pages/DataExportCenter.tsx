import { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useMMP } from '@/context/mmp/MMPContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Download, FileText, MapPin, TrendingUp, Loader2, ClipboardList
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
  const { mmpFiles } = useMMP();
  const { toast } = useToast();

  const isAdmin = hasAnyRole([
    'admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin',
    'country_director', 'countryDirector', 'CountryDirector',
    'fom', 'FOM', 'ict', 'ICT', 'financialAdmin',
  ]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exportStatus, setExportStatus] = useState<Record<string, ExportJob>>({});
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
      const closedMmps = (mmpFiles || []).filter(m => {
        const cycleStatus = (m as any).cycle_status || (m as any).cycleStatus;
        return cycleStatus === 'closed';
      });

      if (closedMmps.length === 0) {
        toast({ title: 'No Data', description: 'No closed cycles found to export.', variant: 'destructive' });
        setJobStatus('cycles', 'idle', 0);
        return;
      }

      setJobStatus('cycles', 'exporting', 30);

      const cycleIds = closedMmps.map(c => c.id);
      let siteStats: any[] = [];
      if (cycleIds.length > 0) {
        const { data } = await supabase
          .from('site_visits')
          .select('mmp_id, status, not_covered_flag, not_covered_reason')
          .in('mmp_id', cycleIds);
        siteStats = data || [];
      }

      setJobStatus('cycles', 'exporting', 70);

      const exportData = closedMmps.map(c => {
        const mmpAny = c as any;
        const sites = siteStats.filter(s => s.mmp_id === c.id);
        const uncovered = sites.filter(s => s.not_covered_flag).length;
        const completed = sites.filter(s => s.status === 'completed').length;
        const reasons: Record<string, number> = {};
        sites.filter(s => s.not_covered_flag && s.not_covered_reason).forEach(s => {
          reasons[s.not_covered_reason] = (reasons[s.not_covered_reason] || 0) + 1;
        });
        return {
          'Cycle Name': c.name,
          'Month': mmpAny.month || '',
          'Project': mmpAny.projectName || mmpAny.project_name || '',
          'Status': c.status || '',
          'Total Sites': sites.length,
          'Completed': completed,
          'Uncovered': uncovered,
          'Coverage Rate': sites.length > 0 ? `${Math.round((completed / sites.length) * 100)}%` : 'N/A',
          'Closed At': mmpAny.cycle_closed_at || mmpAny.cycleClosedAt || '',
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
  }, [mmpFiles, format, toast]);

  const exportSiteVisits = useCallback(async () => {
    setJobStatus('visits', 'exporting', 10);
    try {
      // Fetch from mmp_site_entries instead of site_visits
      let allSites: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSites = allSites.concat(data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      // Apply filters in-memory (status, dateFrom, dateTo)
      let filteredSites = allSites;
      if (statusFilter !== 'all') {
        filteredSites = filteredSites.filter(s => (s.status || '').toLowerCase() === statusFilter.toLowerCase());
      }
      if (dateFrom) {
        filteredSites = filteredSites.filter(s => s.created_at && s.created_at >= dateFrom);
      }
      if (dateTo) {
        filteredSites = filteredSites.filter(s => s.created_at && s.created_at <= dateTo + 'T23:59:59');
      }

      setJobStatus('visits', 'exporting', 70);

      const mmpLookup: Record<string, string> = {};
      (mmpFiles || []).forEach(m => { mmpLookup[m.id] = m.name; });

      const exportData = (filteredSites || []).map((s: any) => ({
        'Site Name': s.site_name || '',
        'Site Code': s.site_code || '',
        'State': s.state || '',
        'Locality': s.locality || '',
        'Status': s.status || '',
        'MMP': mmpLookup[s.mmp_file_id] || s.mmp_file_id || '',
        'Visit Date': s.visit_date || '',
        'Not Covered': s.not_covered_flag ? 'Yes' : 'No',
        'Reason': s.not_covered_reason || '',
        'Reason Details': s.not_covered_reason_other || '',
        'Assigned To': s.assigned_to || '',
        'Completed By': s.completed_by || '',
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
  }, [dateFrom, dateTo, format, statusFilter, mmpFiles, toast]);

  const exportCoverageAnalytics = useCallback(async () => {
    setJobStatus('analytics', 'exporting', 10);
    try {
      setJobStatus('analytics', 'exporting', 30);
      // Fetch all site entries (global, not filtered by MMPs)
      let allSites: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('id, mmp_file_id, status, not_covered_flag, hub_office')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSites = allSites.concat(data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      setJobStatus('analytics', 'exporting', 70);

      // Build per-hub breakdown
      const hubGroups: Record<string, typeof allSites> = {};
      for (const s of allSites) {
        const hub = (s.hub_office as string) || 'Unknown';
        if (!hubGroups[hub]) hubGroups[hub] = [];
        hubGroups[hub].push(s);
      }

      const makeRow = (label: string, sites: typeof allSites) => {
        const total = sites.length;
        const done = sites.filter(s => (s.status || '').toLowerCase() === 'completed').length;
        const notDone = total - done;
        const mmps = new Set(sites.map(s => s.mmp_file_id).filter(Boolean)).size;
        return {
          'Hub / Office': label,
          'Total MMPs': mmps,
          'Total Sites': total,
          'Completed Sites': done,
          'Uncovered Sites': notDone,
          'Coverage Rate': total > 0 ? `${Math.round((done / total) * 100)}%` : 'N/A',
          'Uncovered Rate': total > 0 ? `${Math.round((notDone / total) * 100)}%` : 'N/A',
        };
      };

      const hubRows = Object.entries(hubGroups)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hub, sites]) => makeRow(hub, sites));

      const exportData = [
        makeRow('All Hubs (Total)', allSites),
        ...hubRows,
      ];

      const filename = `coverage-analytics-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        await exportToExcel(exportData, 'Coverage Analytics', `${filename}.xlsx`);
      } else {
        downloadFile(toCsv(exportData), `${filename}.csv`, 'text/csv');
      }

      setJobStatus('analytics', 'done', 100);
      toast({ title: 'Export Complete', description: `Exported analytics for all site entries.` });
    } catch (err: any) {
      setJobStatus('analytics', 'error', 0);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [format, toast]);

  const exportAllMmps = useCallback(async () => {
    setJobStatus('allmmps', 'exporting', 10);
    try {
      const allMmps = mmpFiles || [];
      if (allMmps.length === 0) {
        toast({ title: 'No Data', description: 'No MMPs found to export.', variant: 'destructive' });
        setJobStatus('allmmps', 'idle', 0);
        return;
      }

      setJobStatus('allmmps', 'exporting', 30);

      // Fetch all site entries from mmp_site_entries
      let allSites = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSites = allSites.concat(data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      setJobStatus('allmmps', 'exporting', 70);

      const exportData = allMmps.map(m => {
        const mmpAny = m as any;
        // Map mmp_file_id in site entries to m.id
        const sites = allSites.filter(s => s.mmp_file_id === m.id);
        const completed = sites.filter(s => (s.status || '').toLowerCase() === 'completed').length;
        const pending = sites.filter(s => (s.status || '').toLowerCase() === 'pending').length;
        const assigned = sites.filter(s => (s.status || '').toLowerCase() === 'assigned').length;
        const dispatched = sites.filter(s => (s.status || '').toLowerCase() === 'dispatched').length;
        // Uncovered: all sites not completed
        const uncovered = sites.filter(s => (s.status || '').toLowerCase() !== 'completed').length;
        const cycleStatus = mmpAny.cycle_status || mmpAny.cycleStatus || 'active';
        return {
          'MMP Name': m.name,
          'Month': mmpAny.month || '',
          'Year': mmpAny.year || '',
          'Project': mmpAny.projectName || mmpAny.project_name || '',
          'Hub': mmpAny.hub || mmpAny.hubOffice || mmpAny.region || '',
          'Status': m.status || '',
          'Cycle Status': cycleStatus,
          'Total Site Visits': sites.length,
          'Completed': completed,
          'Pending': pending,
          'Assigned': assigned,
          'Dispatched': dispatched,
          'Uncovered': uncovered,
          'Coverage Rate': sites.length > 0 ? `${Math.round((completed / sites.length) * 100)}%` : 'N/A',
          'Created': mmpAny.created_at || mmpAny.createdAt || '',
          'Closed At': mmpAny.cycle_closed_at || mmpAny.cycleClosedAt || '',
        };
      });

      const filename = `all-mmps-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        await exportToExcel(exportData, 'All MMPs', `${filename}.xlsx`);
      } else {
        downloadFile(toCsv(exportData), `${filename}.csv`, 'text/csv');
      }

      setJobStatus('allmmps', 'done', 100);
      toast({ title: 'Export Complete', description: `Exported ${exportData.length} MMPs with full details.` });
    } catch (err: any) {
      setJobStatus('allmmps', 'error', 0);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [mmpFiles, format, toast]);

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
        <Badge variant="secondary" data-testid="badge-mmp-count">
          {(mmpFiles || []).length} MMPs loaded
        </Badge>
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
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="wfp_confirmed">WFP Confirmed</SelectItem>
                  <SelectItem value="not_covered">Not Covered</SelectItem>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ExportCard
          category="allmmps"
          title="All MMPs"
          description="Export all MMPs with site counts, coverage rates, and cycle status"
          icon={ClipboardList}
          onExport={exportAllMmps}
        />
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
          description="Export site visit records with filters for status and dates"
          icon={MapPin}
          onExport={exportSiteVisits}
        />
        <ExportCard
          category="analytics"
          title="Coverage Analytics"
          description="Export per-hub breakdown: total sites, completion, coverage rate, and uncovered rate across all hub offices"
          icon={TrendingUp}
          onExport={exportCoverageAnalytics}
        />
      </div>
    </div>
  );
};

export default DataExportCenter;
