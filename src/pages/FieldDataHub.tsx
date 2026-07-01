import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Globe, Plus, Server, RefreshCw, Trash2, Edit3, Search,
  CheckCircle, XCircle, AlertTriangle, Clock, Loader2,
  Database, ChevronRight, Wifi, Settings,
  FileText, BarChart2, Activity, Layers, Zap,
  FlaskConical, BookOpen, ShieldCheck, FolderOpen,
  GitBranch, Download, Languages, Users2, HardDrive, Code2, Bell,
  ScanLine, Users,
} from 'lucide-react';
import { testServerConnection, syncFormFromServer } from '@/services/fieldDataSync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import FieldDataDatasets from './FieldDataDatasets';
import FieldDataSampling from './FieldDataSampling';
import FieldDataStudies from './FieldDataStudies';
import FieldDataQuality from './FieldDataQuality';
import FieldDataMonitoring from './FieldDataMonitoring';
import FieldDataCases from './FieldDataCases';
import FieldDataWorkflow from './FieldDataWorkflow';
import FieldDataExports from './FieldDataExports';
import FieldDataLanguages from './FieldDataLanguages';
import FieldDataCollaboration from './FieldDataCollaboration';
import FieldDataBackup from './FieldDataBackup';
import FieldDataAPI from './FieldDataAPI';
import FieldDataNotifications from './FieldDataNotifications';

interface FieldDataServer {
  id: string;
  name: string;
  type: 'odk_central' | 'ona' | 'moda' | 'kobo' | 'generic';
  base_url: string;
  username: string | null;
  api_token: string | null;
  project_id: string | null;
  status: 'connected' | 'error' | 'paused' | 'untested';
  last_health_check: string | null;
  sync_frequency_minutes: number;
  notes: string | null;
  created_at: string;
}

interface FieldDataForm {
  id: string;
  name: string;
  description: string | null;
  form_id_slug: string | null;
  status: 'active' | 'paused' | 'archived';
  default_language: string;
  submission_count: number;
  last_submission_at: string | null;
  created_at: string;
  updated_at: string;
  field_data_form_servers: Array<{
    server_id: string;
    submission_count: number;
    last_synced_at: string | null;
    field_data_servers: { name: string; type: string } | null;
  }>;
}

const SERVER_TYPE_CFG = {
  odk_central: { label: 'ODK Central', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  ona: { label: 'Ona', color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  moda: { label: 'WFP MoDa', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  kobo: { label: 'KoboToolbox', color: 'bg-teal-100 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  generic: { label: 'Generic ODK', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

const STATUS_CFG = {
  connected: { icon: CheckCircle, color: 'text-emerald-500', label: 'Connected' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error' },
  paused: { icon: Clock, color: 'text-amber-500', label: 'Paused' },
  untested: { icon: AlertTriangle, color: 'text-slate-400', label: 'Untested' },
};

const EMPTY_SERVER = {
  name: '', type: 'odk_central' as const, base_url: '',
  username: '', api_token: '', project_id: '', notes: '', sync_frequency_minutes: 60,
};

const TABS = [
  { id: 'forms',         label: 'Forms & Servers',    icon: Globe,        desc: 'ODK Central · Ona · WFP MoDa — unified in one place' },
  { id: 'datasets',      label: 'Datasets',            icon: Database,     desc: 'Browse and filter collected datasets' },
  { id: 'sampling',      label: 'Sampling',            icon: ScanLine,     desc: 'Design sampling frameworks and frames' },
  { id: 'studies',       label: 'Multi-Round Studies', icon: BookOpen,     desc: 'Baseline · Midline · Endline · Panel tracking' },
  { id: 'quality',       label: 'Data Quality',        icon: ShieldCheck,  desc: 'Rules, flags, and cleaning queue' },
  { id: 'monitoring',    label: 'Fieldwork Monitor',   icon: Activity,     desc: 'Daily progress and enumerator tracking' },
  { id: 'cases',         label: 'Case Management',     icon: FolderOpen,   desc: 'Escalations, follow-ups, and resolutions' },
  { id: 'workflow',      label: 'Workflow',             icon: GitBranch,    desc: 'Approval and review pipelines' },
  { id: 'exports',       label: 'Smart Export',        icon: Download,     desc: 'Export datasets with transformation options' },
  { id: 'languages',     label: 'Multi-Language',      icon: Languages,    desc: 'Translations and language versions' },
  { id: 'collaboration', label: 'Collaboration',       icon: Users2,       desc: 'Team access and shared workspaces' },
  { id: 'backup',        label: 'Backup & Recovery',   icon: HardDrive,    desc: 'Scheduled backups and restore points' },
  { id: 'api',           label: 'API & Integrations',  icon: Code2,        desc: 'Webhooks, API keys, and connectors' },
  { id: 'notifications', label: 'Notifications',       icon: Bell,         desc: 'Alerts, reminders, and escalation rules' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function FieldDataHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState<TabId>('forms');

  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serverDialog, setServerDialog] = useState(false);
  const [editServer, setEditServer] = useState<FieldDataServer | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_SERVER });
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null);
  const [newFormDialog, setNewFormDialog] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormDesc, setNewFormDesc] = useState('');
  const [newFormLanguage, setNewFormLanguage] = useState('English');
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [syncingFormId, setSyncingFormId] = useState<string | null>(null);
  const [syncAllRunning, setSyncAllRunning] = useState(false);

  const { data: servers = [], isLoading: loadingServers } = useQuery({
    queryKey: ['field-data-servers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_servers')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data as FieldDataServer[];
    },
  });

  const { data: forms = [], isLoading: loadingForms } = useQuery({
    queryKey: ['field-data-forms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_data_forms')
        .select(`*, field_data_form_servers(server_id, submission_count, last_synced_at, field_data_servers(name, type))`)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as FieldDataForm[];
    },
  });

  const saveServerMutation = useMutation({
    mutationFn: async (payload: typeof formData & { id?: string }) => {
      const row = {
        name: payload.name,
        type: payload.type,
        base_url: payload.base_url,
        username: payload.username || null,
        api_token: payload.api_token || null,
        project_id: payload.project_id || null,
        notes: payload.notes || null,
        sync_frequency_minutes: payload.sync_frequency_minutes,
        status: 'untested' as const,
        created_by: user?.id,
      };
      if (payload.id) {
        const { error } = await supabase.from('field_data_servers').update(row).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('field_data_servers').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-data-servers'] });
      setServerDialog(false);
      setEditServer(null);
      setFormData({ ...EMPTY_SERVER });
      toast({ title: editServer ? 'Server updated' : 'Server connected', description: 'Your server connection has been saved.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteServerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('field_data_servers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-data-servers'] });
      setDeleteServerId(null);
      toast({ title: 'Server removed' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createFormMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('field_data_forms').insert({
        name: newFormName,
        description: newFormDesc || null,
        default_language: newFormLanguage,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-data-forms'] });
      setNewFormDialog(false);
      setNewFormName('');
      setNewFormDesc('');
      toast({ title: 'Form created', description: 'Open it to import data or connect a server.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleTestConnection = useCallback(async (srv: FieldDataServer) => {
    setTestingServerId(srv.id);
    try {
      const result = await testServerConnection(srv);
      setTestResults(prev => ({ ...prev, [srv.id]: result }));
      await supabase.from('field_data_servers').update({
        status: result.ok ? 'connected' : 'error',
        last_health_check: new Date().toISOString(),
      }).eq('id', srv.id);
      qc.invalidateQueries({ queryKey: ['field-data-servers'] });
      toast({
        title: result.ok ? 'Connection successful' : 'Connection failed',
        description: result.message,
        variant: result.ok ? 'default' : 'destructive',
      });
    } finally {
      setTestingServerId(null);
    }
  }, [qc, toast]);

  const handleSyncForm = useCallback(async (form: FieldDataForm) => {
    const linkedServer = form.field_data_form_servers?.[0];
    if (!linkedServer) {
      toast({ title: 'No server linked', description: 'Link a server to this form before syncing.', variant: 'destructive' });
      return;
    }
    const srv = servers.find(s => s.id === linkedServer.server_id);
    if (!srv) return;
    setSyncingFormId(form.id);
    try {
      const result = await syncFormFromServer(srv, { id: form.id, name: form.name, form_id_slug: form.form_id_slug }, user?.id);
      if (result.success) {
        qc.invalidateQueries({ queryKey: ['field-data-forms'] });
        toast({
          title: `Synced — ${result.recordsNew} new, ${result.recordsUpdated} updated`,
          description: `${result.recordsPulled} records pulled in ${(result.durationMs / 1000).toFixed(1)}s`,
        });
      } else {
        toast({ title: 'Sync failed', description: result.error, variant: 'destructive' });
      }
    } finally {
      setSyncingFormId(null);
    }
  }, [servers, user, qc, toast]);

  const handleSyncAll = useCallback(async () => {
    setSyncAllRunning(true);
    let totalNew = 0;
    let errors = 0;
    for (const form of forms.filter(f => f.status === 'active')) {
      const linkedServer = form.field_data_form_servers?.[0];
      if (!linkedServer) continue;
      const srv = servers.find(s => s.id === linkedServer.server_id);
      if (!srv) continue;
      const result = await syncFormFromServer(srv, { id: form.id, name: form.name, form_id_slug: form.form_id_slug }, user?.id);
      if (result.success) totalNew += result.recordsNew;
      else errors++;
    }
    setSyncAllRunning(false);
    qc.invalidateQueries({ queryKey: ['field-data-forms'] });
    toast({
      title: errors === 0 ? `Sync All complete — ${totalNew} new records` : `Sync All — ${errors} error(s)`,
      description: errors > 0 ? 'Check individual forms for details.' : undefined,
      variant: errors > 0 ? 'destructive' : 'default',
    });
  }, [forms, servers, user, qc, toast]);

  function openNewServer() {
    setEditServer(null);
    setFormData({ ...EMPTY_SERVER });
    setServerDialog(true);
  }

  function openEditServer(s: FieldDataServer) {
    setEditServer(s);
    setFormData({
      name: s.name, type: s.type, base_url: s.base_url,
      username: s.username || '', api_token: s.api_token || '',
      project_id: s.project_id || '', notes: s.notes || '',
      sync_frequency_minutes: s.sync_frequency_minutes,
    });
    setServerDialog(true);
  }

  const filteredForms = forms.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || f.status === statusFilter;
    const matchServer = serverFilter === 'all' || f.field_data_form_servers?.some(fs => fs.server_id === serverFilter);
    return matchSearch && matchStatus && matchServer;
  });

  const totalSubmissions = forms.reduce((sum, f) => sum + (f.submission_count || 0), 0);
  const currentTab = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ── Gradient Header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-violet-700 via-blue-700 to-teal-600 text-white px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl">
                <currentTab.icon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Field Data Hub</h1>
                <p className="text-blue-100 text-sm mt-0.5">{currentTab.desc}</p>
              </div>
            </div>
            {activeTab === 'forms' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 bg-white/10"
                  onClick={handleSyncAll}
                  disabled={syncAllRunning || forms.length === 0}
                  data-testid="button-sync-all"
                >
                  {syncAllRunning
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Zap className="w-4 h-4 mr-2" />}
                  Sync All
                </Button>
                <Button
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 bg-white/10"
                  onClick={openNewServer}
                  data-testid="button-connect-server"
                >
                  <Server className="w-4 h-4 mr-2" />
                  Connect Server
                </Button>
                <Button
                  className="bg-white text-blue-700 hover:bg-blue-50 font-semibold"
                  onClick={() => setNewFormDialog(true)}
                  data-testid="button-new-form"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Form
                </Button>
              </div>
            )}
          </div>

          {/* KPI bar — always visible */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Connected Servers', value: servers.filter(s => s.status === 'connected').length, icon: Wifi },
              { label: 'Total Forms', value: forms.length, icon: FileText },
              { label: 'Total Submissions', value: totalSubmissions.toLocaleString(), icon: BarChart2 },
              { label: 'Active Forms', value: forms.filter(f => f.status === 'active').length, icon: Activity },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 flex items-center gap-3">
                <kpi.icon className="w-4 h-4 text-white/70 shrink-0" />
                <div>
                  <div className="text-lg font-bold">{kpi.value}</div>
                  <div className="text-xs text-white/70">{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-2">
          <div className="flex overflow-x-auto scrollbar-hide">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                )}
              >
                <tab.icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}

      {/* Forms & Servers tab (inline content) */}
      {activeTab === 'forms' && (
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

          {/* Servers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Servers</h2>
              {servers.length > 0 && (
                <button onClick={openNewServer} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Server
                </button>
              )}
            </div>

            {loadingServers ? (
              <div className="flex items-center gap-2 text-slate-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading servers…
              </div>
            ) : servers.length === 0 ? (
              <div
                onClick={openNewServer}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all group"
                data-testid="empty-state-servers"
              >
                <Server className="w-8 h-8 text-slate-300 group-hover:text-blue-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-slate-500 group-hover:text-blue-600">Connect your first server</p>
                <p className="text-xs text-slate-400 mt-1">ODK Central · Ona · WFP MoDa · KoboToolbox</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {servers.map(srv => {
                  const typeCfg = SERVER_TYPE_CFG[srv.type] || SERVER_TYPE_CFG.generic;
                  const statusCfg = STATUS_CFG[srv.status] || STATUS_CFG.untested;
                  const StatusIcon = statusCfg.icon;
                  const formCount = forms.filter(f => f.field_data_form_servers?.some(fs => fs.server_id === srv.id)).length;
                  return (
                    <div
                      key={srv.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md transition-all group"
                      data-testid={`card-server-${srv.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full', typeCfg.dot)} />
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', typeCfg.color)}>
                            {typeCfg.label}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                              <Settings className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={e => { e.stopPropagation(); handleTestConnection(srv); }}
                              disabled={testingServerId === srv.id}
                              data-testid={`button-test-${srv.id}`}
                            >
                              {testingServerId === srv.id
                                ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                : <FlaskConical className="w-3.5 h-3.5 mr-2" />}
                              Test Connection
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditServer(srv)}>
                              <Edit3 className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-500" onClick={() => setDeleteServerId(srv.id)}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">{srv.name}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{srv.base_url}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={cn('w-3.5 h-3.5', statusCfg.color)} />
                          <span className={cn('text-xs', statusCfg.color)}>{statusCfg.label}</span>
                        </div>
                        <span className="text-xs text-slate-400">{formCount} form{formCount !== 1 ? 's' : ''}</span>
                      </div>
                      {testResults[srv.id] && (
                        <div className={cn(
                          'mt-2 flex items-center gap-1.5 text-xs rounded-lg px-2 py-1',
                          testResults[srv.id].ok
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/20',
                        )}>
                          {testResults[srv.id].ok
                            ? <CheckCircle className="w-3 h-3 shrink-0" />
                            : <XCircle className="w-3 h-3 shrink-0" />}
                          <span className="truncate">{testResults[srv.id].message}</span>
                        </div>
                      )}
                      {!testResults[srv.id] && srv.last_health_check && (
                        <p className="text-xs text-slate-400 mt-1.5">
                          Checked {formatDistanceToNow(new Date(srv.last_health_check), { addSuffix: true })}
                        </p>
                      )}
                      <button
                        className="mt-2 w-full text-xs text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        onClick={e => { e.stopPropagation(); handleTestConnection(srv); }}
                        disabled={testingServerId === srv.id}
                        data-testid={`button-test-inline-${srv.id}`}
                      >
                        {testingServerId === srv.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <FlaskConical className="w-3 h-3" />}
                        {testingServerId === srv.id ? 'Testing…' : 'Test Connection'}
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={openNewServer}
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-slate-400 hover:text-blue-500"
                  data-testid="button-add-server-card"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-xs font-medium">Add Server</span>
                </button>
              </div>
            )}
          </div>

          {/* Forms List */}
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">All Forms</h2>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search forms…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm w-full sm:w-52"
                    data-testid="input-search-forms"
                  />
                </div>
                <Select value={serverFilter} onValueChange={setServerFilter}>
                  <SelectTrigger className="h-8 text-xs w-36" data-testid="select-server-filter">
                    <SelectValue placeholder="All Servers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Servers</SelectItem>
                    {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-28" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loadingForms ? (
              <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading forms…
              </div>
            ) : filteredForms.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
                {forms.length === 0 ? (
                  <>
                    <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">No forms yet</p>
                    <p className="text-sm text-slate-400 mt-1 mb-4">Create a form or import data via CSV to get started</p>
                    <Button onClick={() => setNewFormDialog(true)} size="sm" data-testid="button-create-first-form">
                      <Plus className="w-4 h-4 mr-1.5" /> Create Form
                    </Button>
                  </>
                ) : (
                  <>
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No forms match your filters</p>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm" data-testid="table-forms">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Form Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Servers</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Submissions</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Last Synced</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden xl:table-cell">Sync</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredForms.map(form => {
                      const linkedServers = form.field_data_form_servers ?? [];
                      return (
                        <tr
                          key={form.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group transition-colors"
                          onClick={() => navigate(`/field-data/${form.id}`)}
                          data-testid={`row-form-${form.id}`}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {form.name}
                              </p>
                              {form.description && (
                                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{form.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {linkedServers.slice(0, 3).map(fs => (
                                <span
                                  key={fs.server_id}
                                  className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded"
                                >
                                  {fs.field_data_servers?.name ?? '—'}
                                </span>
                              ))}
                              {linkedServers.length > 3 && (
                                <span className="text-xs text-slate-400">+{linkedServers.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {(form.submission_count || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-slate-500 text-xs">
                              {(() => {
                                const lastSync = form.field_data_form_servers
                                  ?.map(fs => fs.last_synced_at)
                                  .filter(Boolean)
                                  .sort()
                                  .pop();
                                return lastSync
                                  ? formatDistanceToNow(new Date(lastSync), { addSuffix: true })
                                  : '—';
                              })()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                form.status === 'active' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                form.status === 'paused' && 'bg-amber-50 text-amber-700 border-amber-200',
                                form.status === 'archived' && 'bg-slate-100 text-slate-500 border-slate-200',
                              )}
                            >
                              {form.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                            {(form.field_data_form_servers?.length ?? 0) > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5"
                                disabled={syncingFormId === form.id}
                                onClick={e => { e.stopPropagation(); handleSyncForm(form); }}
                                data-testid={`button-sync-form-${form.id}`}
                              >
                                {syncingFormId === form.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <RefreshCw className="w-3 h-3" />}
                                {syncingFormId === form.id ? 'Syncing…' : 'Sync'}
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">No server</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All other tabs — render imported components */}
      {activeTab === 'datasets'      && <FieldDataDatasets />}
      {activeTab === 'sampling'      && <FieldDataSampling />}
      {activeTab === 'studies'       && <FieldDataStudies />}
      {activeTab === 'quality'       && <FieldDataQuality />}
      {activeTab === 'monitoring'    && <FieldDataMonitoring />}
      {activeTab === 'cases'         && <FieldDataCases />}
      {activeTab === 'workflow'      && <FieldDataWorkflow />}
      {activeTab === 'exports'       && <FieldDataExports />}
      {activeTab === 'languages'     && <FieldDataLanguages />}
      {activeTab === 'collaboration' && <FieldDataCollaboration />}
      {activeTab === 'backup'        && <FieldDataBackup />}
      {activeTab === 'api'           && <FieldDataAPI />}
      {activeTab === 'notifications' && <FieldDataNotifications />}

      {/* ── Connect / Edit Server Dialog ──────────────────────────────── */}
      <Dialog open={serverDialog} onOpenChange={v => { setServerDialog(v); if (!v) setEditServer(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editServer ? 'Edit Server Connection' : 'Connect a Server'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Server Type</Label>
              <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v as typeof formData.type }))}>
                <SelectTrigger className="mt-1" data-testid="select-server-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="odk_central">ODK Central</SelectItem>
                  <SelectItem value="ona">Ona.io</SelectItem>
                  <SelectItem value="moda">WFP MoDa</SelectItem>
                  <SelectItem value="kobo">KoboToolbox</SelectItem>
                  <SelectItem value="generic">Generic ODK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Connection Name</Label>
              <Input
                className="mt-1"
                placeholder="e.g. PACT ODK Central Sudan"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                data-testid="input-server-name"
              />
            </div>
            <div>
              <Label>Base URL</Label>
              <Input
                className="mt-1"
                placeholder={
                  formData.type === 'ona' ? 'https://api.ona.io' :
                  formData.type === 'moda' ? 'https://moda.example.org' :
                  'https://your-central.example.org'
                }
                value={formData.base_url}
                onChange={e => setFormData(p => ({ ...p, base_url: e.target.value }))}
                data-testid="input-server-url"
              />
            </div>
            {(formData.type === 'odk_central') && (
              <div>
                <Label>Project ID <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 42"
                  value={formData.project_id}
                  onChange={e => setFormData(p => ({ ...p, project_id: e.target.value }))}
                  data-testid="input-project-id"
                />
              </div>
            )}
            <div>
              <Label>
                {formData.type === 'ona' || formData.type === 'moda' || formData.type === 'kobo' ? 'API Token' : 'Username or Email'}
              </Label>
              <Input
                className="mt-1"
                type={formData.type === 'odk_central' ? 'email' : 'text'}
                placeholder={formData.type === 'odk_central' ? 'admin@pact.org' : 'Paste your API token'}
                value={formData.type === 'odk_central' ? formData.username : formData.api_token}
                onChange={e => {
                  if (formData.type === 'odk_central') setFormData(p => ({ ...p, username: e.target.value }));
                  else setFormData(p => ({ ...p, api_token: e.target.value }));
                }}
                data-testid="input-server-credential"
              />
            </div>
            {formData.type === 'odk_central' && (
              <div>
                <Label>Password</Label>
                <Input
                  className="mt-1"
                  type="password"
                  placeholder="••••••••"
                  value={formData.api_token}
                  onChange={e => setFormData(p => ({ ...p, api_token: e.target.value }))}
                  data-testid="input-server-password"
                />
              </div>
            )}
            <div>
              <Label>Auto-Sync Every</Label>
              <Select
                value={String(formData.sync_frequency_minutes)}
                onValueChange={v => setFormData(p => ({ ...p, sync_frequency_minutes: Number(v) }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                  <SelectItem value="1440">Daily</SelectItem>
                  <SelectItem value="0">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Any notes about this server…"
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setServerDialog(false); setEditServer(null); }}>Cancel</Button>
            <Button
              onClick={() => saveServerMutation.mutate(editServer ? { ...formData, id: editServer.id } : formData)}
              disabled={!formData.name || !formData.base_url || saveServerMutation.isPending}
              data-testid="button-save-server"
            >
              {saveServerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editServer ? 'Save Changes' : 'Connect Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Form Dialog ────────────────────────────────────────────── */}
      <Dialog open={newFormDialog} onOpenChange={setNewFormDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Form Name</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Household Assessment 2026"
                value={newFormName}
                onChange={e => setNewFormName(e.target.value)}
                data-testid="input-form-name"
              />
            </div>
            <div>
              <Label>Description <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Brief description…"
                value={newFormDesc}
                onChange={e => setNewFormDesc(e.target.value)}
              />
            </div>
            <div>
              <Label>Default Language</Label>
              <Select value={newFormLanguage} onValueChange={setNewFormLanguage}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFormDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createFormMutation.mutate()}
              disabled={!newFormName.trim() || createFormMutation.isPending}
              data-testid="button-create-form"
            >
              {createFormMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Server Confirm ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteServerId} onOpenChange={v => !v && setDeleteServerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove server connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the connection from PACT. Your server and its data are not affected.
              Forms linked to this server will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteServerId && deleteServerMutation.mutate(deleteServerId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
