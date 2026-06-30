import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, BarChart2, Table2, Upload, Download, Settings,
  Loader2, FileText, Users, Clock, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Search, Filter, MapPin, Eye,
  MoreHorizontal, Trash2, RefreshCw, Plus, Globe,
  AlertCircle, Activity, TrendingUp, Zap, Copy, ExternalLink,
  Wifi, Info,
} from 'lucide-react';
import { syncFormFromServer, getWebhookUrl } from '@/services/fieldDataSync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import * as XLSX from 'xlsx';

type Tab = 'overview' | 'table' | 'import' | 'exports' | 'sync';

interface SyncLog {
  id: string;
  form_id: string;
  server_id: string | null;
  sync_type: string;
  status: 'running' | 'success' | 'error';
  records_pulled: number;
  records_new: number;
  records_updated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  field_data_servers?: { name: string; type: string } | null;
}

interface FieldDataForm {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'archived';
  default_language: string;
  submission_count: number;
  last_submission_at: string | null;
  created_at: string;
  updated_at: string;
  question_schema: unknown[];
  settings: Record<string, unknown>;
  field_data_form_servers: Array<{
    server_id: string;
    submission_count: number;
    last_synced_at: string | null;
    field_data_servers: { name: string; type: string } | null;
  }>;
}

interface Submission {
  id: string;
  form_id: string;
  server_id: string | null;
  submission_uuid: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  enumerator_name: string | null;
  data: Record<string, unknown>;
  gps_lat: number | null;
  gps_lng: number | null;
  review_status: 'pending' | 'approved' | 'rejected' | 'on_hold';
  source: string;
  created_at: string;
  field_data_servers: { name: string; type: string } | null;
}

interface ExportRecord {
  id: string;
  format: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  file_name: string | null;
  file_url: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  created_at: string;
  ready_at: string | null;
}

const REVIEW_CFG = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200' },
  on_hold: { label: 'On Hold', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const SERVER_TYPE_COLOR: Record<string, string> = {
  odk_central: 'bg-blue-100 text-blue-700 border-blue-200',
  ona: 'bg-violet-100 text-violet-700 border-violet-200',
  moda: 'bg-orange-100 text-orange-700 border-orange-200',
  kobo: 'bg-teal-100 text-teal-700 border-teal-200',
  generic: 'bg-slate-100 text-slate-500 border-slate-200',
  csv_import: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FieldDataFormDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [sortField, setSortField] = useState<'submitted_at' | 'enumerator_name'>('submitted_at');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [importDialog, setImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string[][]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');
  const [exportLoading, setExportLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: form, isLoading: loadingForm } = useQuery({
    queryKey: ['field-data-form', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_forms')
        .select(`*, field_data_form_servers(server_id, submission_count, last_synced_at, field_data_servers(name, type))`)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as FieldDataForm;
    },
    enabled: !!id,
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ['field-data-submissions', id, sortField, sortDir],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_submissions')
        .select(`*, field_data_servers(name, type)`)
        .eq('form_id', id!)
        .order(sortField, { ascending: sortDir === 'asc' })
        .limit(500);
      if (error) throw error;
      return data as Submission[];
    },
    enabled: !!id,
  });

  const { data: exports = [], isLoading: loadingExports } = useQuery({
    queryKey: ['field-data-exports', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_exports')
        .select('*')
        .eq('form_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ExportRecord[];
    },
    enabled: !!id && activeTab === 'exports',
  });

  const { data: syncLogs = [], isLoading: loadingSyncLogs, refetch: refetchSyncLogs } = useQuery({
    queryKey: ['field-data-sync-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_sync_logs')
        .select('*, field_data_servers(name, type)')
        .eq('form_id', id!)
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as SyncLog[];
    },
    enabled: !!id && activeTab === 'sync',
    refetchInterval: pollingEnabled ? 10000 : false,
  });

  const deleteSubmissionsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('field_data_submissions').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-data-submissions', id] });
      qc.invalidateQueries({ queryKey: ['field-data-form', id] });
      setSelectedRows(new Set());
      toast({ title: 'Deleted', description: 'Selected submissions removed.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from('field_data_submissions')
        .update({ review_status: status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-data-submissions', id] });
      setSelectedRows(new Set());
      toast({ title: 'Updated', description: 'Review status updated.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleSyncNow = useCallback(async () => {
    if (!form) return;
    const linkedServer = form.field_data_form_servers?.[0];
    if (!linkedServer?.field_data_servers) {
      toast({ title: 'No server linked', description: 'Link a server to this form first.', variant: 'destructive' });
      return;
    }
    const { data: srvRow } = await supabase
      .from('field_data_servers')
      .select('*')
      .eq('id', linkedServer.server_id)
      .single();
    if (!srvRow) { toast({ title: 'Server not found', variant: 'destructive' }); return; }

    setIsSyncing(true);
    const result = await syncFormFromServer(srvRow, { id: form.id, name: form.name, form_id_slug: null }, user?.id);
    setIsSyncing(false);

    if (result.success) {
      qc.invalidateQueries({ queryKey: ['field-data-submissions', id] });
      qc.invalidateQueries({ queryKey: ['field-data-form', id] });
      qc.invalidateQueries({ queryKey: ['field-data-sync-logs', id] });
      toast({
        title: `Sync complete — ${result.recordsNew} new, ${result.recordsUpdated} updated`,
        description: `${result.recordsPulled} records in ${(result.durationMs / 1000).toFixed(1)}s`,
      });
    } else {
      qc.invalidateQueries({ queryKey: ['field-data-sync-logs', id] });
      toast({ title: 'Sync failed', description: result.error, variant: 'destructive' });
    }
  }, [form, id, user, qc, toast]);

  const handleFileSelect = useCallback((file: File) => {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
        setImportPreview(rows.slice(0, 6) as string[][]);
      } catch {
        toast({ title: 'Error reading file', description: 'Please use CSV or Excel format.', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleImport = async () => {
    if (!importFile || !id) return;
    setImportLoading(true);
    try {
      const data = new Uint8Array(await importFile.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (rows.length === 0) {
        toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' });
        return;
      }

      const toInsert = rows.map((row, i) => {
        const gpsLat = row['_gps_latitude'] ?? row['gps_lat'] ?? row['latitude'] ?? null;
        const gpsLng = row['_gps_longitude'] ?? row['gps_lng'] ?? row['longitude'] ?? null;
        const submittedAt = row['_submission_time'] ?? row['submitted_at'] ?? row['SubmissionDate'] ?? null;
        const uuid = row['_uuid'] ?? row['_id'] ?? row['uuid'] ?? `import-${id}-${i}`;
        const enumerator = row['_submitted_by'] ?? row['enumerator'] ?? row['enumerator_name'] ?? null;
        return {
          form_id: id,
          submission_uuid: String(uuid),
          submitted_at: submittedAt ? new Date(String(submittedAt)).toISOString() : null,
          submitted_by: enumerator ? String(enumerator) : null,
          enumerator_name: enumerator ? String(enumerator) : null,
          data: row,
          gps_lat: gpsLat ? Number(gpsLat) : null,
          gps_lng: gpsLng ? Number(gpsLng) : null,
          source: 'csv_import',
          review_status: 'pending',
        };
      });

      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const { error } = await supabase
          .from('field_data_submissions')
          .upsert(toInsert.slice(i, i + BATCH), { onConflict: 'form_id,submission_uuid', ignoreDuplicates: true });
        if (error) throw error;
      }

      await supabase.from('field_data_forms').update({
        submission_count: submissions.length + rows.length,
        last_submission_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      qc.invalidateQueries({ queryKey: ['field-data-submissions', id] });
      qc.invalidateQueries({ queryKey: ['field-data-form', id] });
      qc.invalidateQueries({ queryKey: ['field-data-forms'] });
      setImportDialog(false);
      setImportFile(null);
      setImportPreview([]);
      toast({ title: `${rows.length} rows imported`, description: 'Your data is now in the Table tab.' });
    } catch (e) {
      toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    if (!id || !form) return;
    setExportLoading(true);
    try {
      const { data: allSubs, error } = await supabase
        .from('field_data_submissions')
        .select('*')
        .eq('form_id', id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;

      const rows = (allSubs || []).map(s => ({
        uuid: s.submission_uuid,
        submitted_at: s.submitted_at,
        enumerator: s.enumerator_name,
        review_status: s.review_status,
        source: s.source,
        gps_lat: s.gps_lat,
        gps_lng: s.gps_lng,
        ...s.data,
      }));

      const fileName = `${form.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}`;

      if (exportFormat === 'json') {
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${fileName}.json`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
        XLSX.writeFile(wb, `${fileName}.${exportFormat}`);
      }

      await supabase.from('field_data_exports').insert({
        form_id: id,
        format: exportFormat,
        status: 'ready',
        file_name: `${fileName}.${exportFormat}`,
        row_count: rows.length,
        ready_at: new Date().toISOString(),
        created_by: user?.id,
      });

      qc.invalidateQueries({ queryKey: ['field-data-exports', id] });
      setExportDialog(false);
      toast({ title: 'Export downloaded', description: `${rows.length} rows exported as ${exportFormat.toUpperCase()}.` });
    } catch (e) {
      toast({ title: 'Export failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setExportLoading(false);
    }
  };

  const filteredSubs = submissions.filter(s => {
    const matchSearch = !search ||
      String(s.enumerator_name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(s.submitted_by || '').toLowerCase().includes(search.toLowerCase()) ||
      String(s.submission_uuid || '').toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(s.data).toLowerCase().includes(search.toLowerCase());
    const matchReview = reviewFilter === 'all' || s.review_status === reviewFilter;
    return matchSearch && matchReview;
  });

  const dataKeys = submissions.length > 0
    ? Object.keys(submissions[0].data || {}).filter(k => !k.startsWith('_')).slice(0, 12)
    : [];

  const timelineData = (() => {
    const map: Record<string, number> = {};
    submissions.forEach(s => {
      if (!s.submitted_at) return;
      const day = format(new Date(s.submitted_at), 'dd MMM');
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).slice(-30).map(([date, count]) => ({ date, count }));
  })();

  const enumeratorData = (() => {
    const map: Record<string, number> = {};
    submissions.forEach(s => {
      const name = s.enumerator_name || s.submitted_by || 'Unknown';
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  })();

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleRow = (rowId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === filteredSubs.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filteredSubs.map(s => s.id)));
  };

  if (loadingForm) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-slate-500">
        <AlertCircle className="w-8 h-8" />
        <p>Form not found</p>
        <Button variant="outline" onClick={() => navigate('/field-data')}>Back to Hub</Button>
      </div>
    );
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'table', label: `Table (${submissions.length})`, icon: Table2 },
    { id: 'import', label: 'Import', icon: Upload },
    { id: 'exports', label: 'Exports', icon: Download },
    { id: 'sync', label: 'Sync', icon: Zap },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-3 py-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/field-data')} className="shrink-0" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg shrink-0">
                <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{form.name}</h1>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs shrink-0',
                  form.status === 'active' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  form.status === 'paused' && 'bg-amber-50 text-amber-700 border-amber-200',
                  form.status === 'archived' && 'bg-slate-100 text-slate-500 border-slate-200',
                )}
              >
                {form.status}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {(form.field_data_form_servers || []).slice(0, 3).map(fs => (
                <span
                  key={fs.server_id}
                  className={cn('text-xs px-2 py-0.5 rounded-full border font-medium hidden sm:inline-flex',
                    SERVER_TYPE_COLOR[fs.field_data_servers?.type || 'generic'] || SERVER_TYPE_COLOR.generic
                  )}
                >
                  {fs.field_data_servers?.name || 'Server'}
                </span>
              ))}
              <Button size="sm" variant="outline" onClick={() => setImportDialog(true)} data-testid="button-import">
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400"
                data-testid="button-sync-now"
              >
                {isSyncing
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </Button>
              <Button size="sm" onClick={() => setExportDialog(true)} data-testid="button-export">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ══════════ OVERVIEW TAB ══════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Submissions', value: submissions.length.toLocaleString(), icon: FileText, color: 'text-blue-600 bg-blue-50' },
                { label: 'Enumerators', value: new Set(submissions.map(s => s.enumerator_name || s.submitted_by)).size, icon: Users, color: 'text-violet-600 bg-violet-50' },
                { label: 'Pending Review', value: submissions.filter(s => s.review_status === 'pending').length, icon: Clock, color: 'text-amber-600 bg-amber-50' },
                { label: 'Approved', value: submissions.filter(s => s.review_status === 'approved').length, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn('p-2 rounded-lg', kpi.color.split(' ')[1])}>
                      <kpi.icon className={cn('w-4 h-4', kpi.color.split(' ')[0])} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{kpi.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Timeline */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Submission Timeline
                </h3>
                {timelineData.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                    No submissions yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <RTooltip />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#subGrad)" strokeWidth={2} dot={false} name="Submissions" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Enumerators */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-500" /> Top Enumerators
                </h3>
                {enumeratorData.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                    No data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={enumeratorData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} tickLine={false} width={90} />
                      <RTooltip />
                      <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Submissions" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent submissions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">Recent Submissions</h3>
                <button onClick={() => setActiveTab('table')} className="text-xs text-blue-600 hover:underline">
                  View all →
                </button>
              </div>
              {submissions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No submissions yet — <button onClick={() => setActiveTab('import')} className="text-blue-500 hover:underline">import a CSV</button></p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {submissions.slice(0, 5).map(s => (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {s.enumerator_name || s.submitted_by || 'Unknown enumerator'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {s.submitted_at ? format(new Date(s.submitted_at), 'dd MMM yyyy HH:mm') : 'No date'} · {s.source}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn('text-xs shrink-0', REVIEW_CFG[s.review_status]?.cls || REVIEW_CFG.pending.cls)}>
                        {REVIEW_CFG[s.review_status]?.label || 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ TABLE TAB ════════════════════════════════════════ */}
        {activeTab === 'table' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-0 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Search submissions…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-submissions"
                />
              </div>
              <Select value={reviewFilter} onValueChange={setReviewFilter}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-review-filter">
                  <SelectValue placeholder="Review status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
              {selectedRows.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-slate-500">{selectedRows.size} selected</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 text-xs">
                        Actions <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => reviewMutation.mutate({ ids: [...selectedRows], status: 'approved' })}>
                        <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => reviewMutation.mutate({ ids: [...selectedRows], status: 'rejected' })}>
                        <XCircle className="w-3.5 h-3.5 mr-2 text-red-500" /> Reject
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => deleteSubmissionsMutation.mutate([...selectedRows])}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <span className="text-xs text-slate-400 ml-auto">
                {filteredSubs.length} of {submissions.length}
              </span>
            </div>

            {loadingSubs ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]" data-testid="table-submissions">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedRows.size === filteredSubs.length && filteredSubs.length > 0}
                          onChange={toggleAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">
                        <button onClick={() => toggleSort('enumerator_name')} className="flex items-center gap-1 hover:text-slate-700">
                          Enumerator
                          {sortField === 'enumerator_name' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">
                        <button onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-slate-700">
                          Submitted
                          {sortField === 'submitted_at' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                      {dataKeys.slice(0, 5).map(k => (
                        <th key={k} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase truncate max-w-[120px]">
                          {k}
                        </th>
                      ))}
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Source</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Review</th>
                      <th className="px-3 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSubs.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                          {submissions.length === 0 ? (
                            <div>
                              <Upload className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              <p>No submissions — <button onClick={() => setActiveTab('import')} className="text-blue-500 hover:underline">import a CSV file</button></p>
                            </div>
                          ) : (
                            <p>No submissions match your filters</p>
                          )}
                        </td>
                      </tr>
                    ) : filteredSubs.map(s => (
                      <tr key={s.id} className={cn(
                        'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                        selectedRows.has(s.id) && 'bg-blue-50/50 dark:bg-blue-900/10',
                      )} data-testid={`row-submission-${s.id}`}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" className="rounded" checked={selectedRows.has(s.id)} onChange={() => toggleRow(s.id)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-slate-700 dark:text-slate-200 text-xs">
                            {s.enumerator_name || s.submitted_by || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {s.submitted_at ? format(new Date(s.submitted_at), 'dd MMM yy HH:mm') : '—'}
                        </td>
                        {dataKeys.slice(0, 5).map(k => (
                          <td key={k} className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-[120px]">
                            <span className="truncate block" title={String(s.data[k] ?? '')}>
                              {String(s.data[k] ?? '—')}
                            </span>
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-slate-400">{s.source}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={cn('text-xs', REVIEW_CFG[s.review_status]?.cls || REVIEW_CFG.pending.cls)}>
                            {REVIEW_CFG[s.review_status]?.label || 'Pending'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => reviewMutation.mutate({ ids: [s.id], status: 'approved' })}>
                                <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => reviewMutation.mutate({ ids: [s.id], status: 'rejected' })}>
                                <XCircle className="w-3.5 h-3.5 mr-2 text-red-500" /> Reject
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => deleteSubmissionsMutation.mutate([s.id])}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════ IMPORT TAB ══════════════════════════════════════ */}
        {activeTab === 'import' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Import Submissions</h2>
              <p className="text-sm text-slate-500 mb-6">
                Upload a CSV or Excel file exported from ODK Central, Ona, MoDa, or any ODK-compatible server.
              </p>

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all group"
                data-testid="dropzone-import"
              >
                <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
                {importFile ? (
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{importFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB · Click to replace</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-slate-600 dark:text-slate-300">Drop your file here or click to browse</p>
                    <p className="text-xs text-slate-400 mt-1">CSV · XLS · XLSX · up to 50 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
              />

              {/* Preview */}
              {importPreview.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Preview (first 5 rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                          {(importPreview[0] || []).slice(0, 8).map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{String(h)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreview.slice(1, 6).map((row, ri) => (
                          <tr key={ri}>
                            {row.slice(0, 8).map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{String(cell ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button
                className="mt-4 w-full"
                onClick={handleImport}
                disabled={!importFile || importLoading}
                data-testid="button-run-import"
              >
                {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4 mr-2" /> Import File</>}
              </Button>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
              <h3 className="font-semibold text-blue-800 dark:text-blue-300 text-sm mb-3">Tips for importing</h3>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5 list-disc list-inside">
                <li>Use the raw export from Ona / ODK Central / MoDa (not a summary sheet)</li>
                <li>Columns named <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">_uuid</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">_submission_time</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">_submitted_by</code> are recognised automatically</li>
                <li>GPS: columns named <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">_gps_latitude</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">_gps_longitude</code> are mapped to the map tab</li>
                <li>Duplicate UUIDs are skipped — safe to re-import an updated export</li>
                <li>Maximum 50,000 rows per import</li>
              </ul>
            </div>
          </div>
        )}

        {/* ══════════ EXPORTS TAB ══════════════════════════════════════ */}
        {activeTab === 'exports' && (
          <div className="space-y-5 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">Data Exports</h2>
                <p className="text-sm text-slate-500 mt-0.5">Generate and download submission data</p>
              </div>
              <Button onClick={() => setExportDialog(true)} data-testid="button-prepare-export">
                <Plus className="w-4 h-4 mr-2" /> Prepare Export
              </Button>
            </div>

            {loadingExports ? (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : exports.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center text-slate-400">
                <Download className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No exports yet</p>
                <p className="text-xs mt-1">Click "Prepare Export" to generate a downloadable file</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm" data-testid="table-exports">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">File</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Rows</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {exports.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`row-export-${exp.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-slate-700 dark:text-slate-200 font-medium text-xs truncate max-w-[200px]">
                              {exp.file_name || `export.${exp.format}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell whitespace-nowrap">
                          {format(new Date(exp.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-200 hidden md:table-cell">
                          {exp.row_count?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              exp.status === 'ready' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                              exp.status === 'processing' && 'bg-blue-50 text-blue-700 border-blue-200',
                              exp.status === 'failed' && 'bg-red-50 text-red-700 border-red-200',
                              exp.status === 'pending' && 'bg-slate-100 text-slate-500 border-slate-200',
                            )}
                          >
                            {exp.status === 'processing' && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                            {exp.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {exp.status === 'ready' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExportDialog(true)}>
                              <Download className="w-3 h-3 mr-1" /> Re-export
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════ SYNC TAB ══════════════════════════════════════════ */}
        {activeTab === 'sync' && (
          <div className="space-y-6">

            {/* ── Connected Servers row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(form.field_data_form_servers || []).length === 0 ? (
                <div className="col-span-3 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
                  <Wifi className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 font-medium">No servers linked to this form</p>
                  <p className="text-xs text-slate-400 mt-1">Go back to the Field Data Hub and link a server to enable live sync.</p>
                </div>
              ) : (
                (form.field_data_form_servers || []).map(fs => {
                  const lastSynced = fs.last_synced_at;
                  return (
                    <div key={fs.server_id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full border',
                          fs.field_data_servers?.type === 'odk_central' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          fs.field_data_servers?.type === 'ona' ? 'bg-violet-100 text-violet-700 border-violet-200' :
                          fs.field_data_servers?.type === 'moda' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          'bg-slate-100 text-slate-600 border-slate-200',
                        )}>
                          {fs.field_data_servers?.type?.replace('_', ' ').toUpperCase() ?? 'Server'}
                        </span>
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{fs.field_data_servers?.name ?? 'Server'}</p>
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <div className="flex items-center justify-between">
                          <span>Submissions pulled</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{(fs.submission_count || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Last synced</span>
                          <span>{lastSynced ? formatDistanceToNow(new Date(lastSynced), { addSuffix: true }) : '—'}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full h-7 text-xs"
                        disabled={isSyncing}
                        onClick={handleSyncNow}
                        data-testid={`button-sync-server-${fs.server_id}`}
                      >
                        {isSyncing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                        {isSyncing ? 'Syncing…' : 'Sync Now'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Webhook config ── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <ExternalLink className="w-4 h-4 text-violet-500" />
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">Inbound Webhook</h3>
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Requires Edge Function</Badge>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Configure your ODK Central / Ona / MoDa server to push submissions here in real-time. Each new submission triggers an immediate sync without any polling delay.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={getWebhookUrl(form.id)}
                  className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800"
                  data-testid="input-webhook-url"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(getWebhookUrl(form.id));
                    toast({ title: 'Copied', description: 'Webhook URL copied to clipboard.' });
                  }}
                  data-testid="button-copy-webhook"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <span>
                  In ODK Central: go to <strong>Form → Submissions → Webhooks</strong> and paste this URL.
                  In Ona: go to <strong>Form Settings → External Export</strong>.
                  A HMAC-SHA256 secret will be generated automatically for security.
                </span>
              </div>
            </div>

            {/* ── Sync History table ── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-500" /> Sync History
                </h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pollingEnabled}
                      onChange={e => setPollingEnabled(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-polling"
                    />
                    Auto-refresh (10s)
                  </label>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetchSyncLogs()} data-testid="button-refresh-logs">
                    <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                  </Button>
                </div>
              </div>

              {loadingSyncLogs ? (
                <div className="flex items-center gap-2 py-8 justify-center text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading sync history…
                </div>
              ) : syncLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Zap className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No sync runs yet — click "Sync Now" to pull submissions from your server.</p>
                </div>
              ) : (
                <table className="w-full text-sm" data-testid="table-sync-logs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">When</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Server</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Pulled</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">New</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {syncLogs.map(log => {
                      const durMs = log.completed_at && log.started_at
                        ? new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()
                        : null;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`row-sync-log-${log.id}`}>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">
                            {log.field_data_servers?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200 capitalize">
                              {log.sync_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {log.status === 'success' && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                <CheckCircle className="w-2.5 h-2.5" /> Success
                              </Badge>
                            )}
                            {log.status === 'error' && (
                              <div>
                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 gap-1">
                                  <XCircle className="w-2.5 h-2.5" /> Error
                                </Badge>
                                {log.error_message && (
                                  <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate" title={log.error_message}>
                                    {log.error_message}
                                  </p>
                                )}
                              </div>
                            )}
                            {log.status === 'running' && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Running
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-200 hidden md:table-cell">
                            {log.records_pulled ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium text-emerald-600 hidden md:table-cell">
                            {log.records_new > 0 ? `+${log.records_new}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                            {durMs != null ? `${(durMs / 1000).toFixed(1)}s` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Polling note ── */}
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-300">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">About automatic sync</p>
                <p className="text-xs text-slate-500">
                  Automatic background polling runs based on the interval you set when connecting the server (e.g. every 60 minutes).
                  For real-time sync, configure the inbound webhook above.
                  Manual "Sync Now" pulls all submissions since the last successful sync.
                </p>
              </div>
            </div>

          </div>
        )}

      {/* ── Import Dialog (quick-access from header) ──────────────────── */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Import</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
            >
              <Upload className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              {importFile ? (
                <p className="text-sm font-medium text-slate-700">{importFile.name}</p>
              ) : (
                <p className="text-sm text-slate-500">Drop CSV/Excel or click to browse</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Cancel</Button>
            <Button onClick={() => { setImportDialog(false); setActiveTab('import'); }} variant="outline">
              Full Import →
            </Button>
            <Button onClick={() => { setImportDialog(false); handleImport(); }} disabled={!importFile || importLoading}>
              {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Dialog ─────────────────────────────────────────────── */}
      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Prepare Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Format</Label>
              <Select value={exportFormat} onValueChange={v => setExportFormat(v as typeof exportFormat)}>
                <SelectTrigger className="mt-1" data-testid="select-export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500">
              All <strong>{submissions.length.toLocaleString()}</strong> submissions will be included. The file will download immediately.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={exportLoading || submissions.length === 0} data-testid="button-run-export">
              {exportLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting…</> : <><Download className="w-4 h-4 mr-2" /> Download</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
