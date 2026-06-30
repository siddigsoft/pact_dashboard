import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, subDays } from 'date-fns';
import {
  FileDown, Plus, Loader2, RefreshCw, CheckCircle, XCircle,
  Clock, Download, Trash2, FileSpreadsheet, FileCode, Globe,
  BarChart3, Filter, LayoutList, Bookmark, Copy, MoreHorizontal,
  AlertCircle, ChevronRight, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'queue' | 'history' | 'templates';

const EXPORT_FORMATS = [
  { value: 'xlsx',       label: 'Excel (.xlsx)',          icon: '📊', group: 'Standard',     desc: 'Default spreadsheet — compatible with all tools' },
  { value: 'csv',        label: 'CSV (.csv)',              icon: '📄', group: 'Standard',     desc: 'Plain comma-separated values' },
  { value: 'stata_dta',  label: 'Stata (.dta)',            icon: '📈', group: 'Statistical',  desc: 'Stata binary format with value labels & variable labels' },
  { value: 'spss_sav',   label: 'SPSS (.sav)',             icon: '📉', group: 'Statistical',  desc: 'IBM SPSS format with defined values' },
  { value: 'r_script',   label: 'R Script (.R)',           icon: '🔷', group: 'Statistical',  desc: 'R dataframe import script with factor labels' },
  { value: 'sas',        label: 'SAS (.sas7bdat)',         icon: '📐', group: 'Statistical',  desc: 'SAS dataset format' },
  { value: 'geojson',    label: 'GeoJSON (.geojson)',      icon: '🗺️', group: 'Geographic',   desc: 'GPS submissions as geographic features' },
  { value: 'kml',        label: 'KML (.kml)',              icon: '🌍', group: 'Geographic',   desc: 'Google Earth / field navigation format' },
  { value: 'shapefile',  label: 'Shapefile (.shp)',        icon: '🗾', group: 'Geographic',   desc: 'ArcGIS / QGIS compatible format' },
  { value: 'dhis2_json', label: 'DHIS2 JSON',              icon: '🏥', group: 'Interop',      desc: 'Ministry of Health / cluster reporting' },
  { value: 'activityinfo','label':'ActivityInfo',          icon: '📋', group: 'Interop',      desc: 'Humanitarian cluster reporting format' },
  { value: 'odata',      label: 'OData Feed',              icon: '📡', group: 'Interop',      desc: 'Power BI / Tableau live connector URL' },
] as const;

type ExportFormat = typeof EXPORT_FORMATS[number]['value'];

interface ExportJob {
  id: string;
  form_id: string | null;
  form_name: string | null;
  format: ExportFormat;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  options: Record<string, unknown>;
  record_count: number | null;
  file_size_bytes: number | null;
  file_url: string | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

interface ExportTemplate {
  id: string;
  name: string;
  form_id: string | null;
  form_name: string | null;
  format: ExportFormat;
  options: Record<string, unknown>;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
}

interface ExportOptions {
  value_style: 'labels' | 'codes';
  repeat_groups: 'separate_sheets' | 'flatten';
  include_gps_columns: boolean;
  include_media_urls: boolean;
  format_wide: boolean;
  split_select_multiple: boolean;
  include_audit_columns: boolean;
  review_status_filter: 'all' | 'approved' | 'pending' | 'rejected';
  date_from: string;
  date_to: string;
  enumerator_filter: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
  value_style: 'labels',
  repeat_groups: 'separate_sheets',
  include_gps_columns: true,
  include_media_urls: false,
  format_wide: true,
  split_select_multiple: false,
  include_audit_columns: false,
  review_status_filter: 'all',
  date_from: '',
  date_to: '',
  enumerator_filter: '',
};

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'queue',     label: 'Export Queue',  icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'history',   label: 'History',       icon: <LayoutList className="w-3.5 h-3.5" /> },
  { id: 'templates', label: 'Templates',     icon: <Bookmark className="w-3.5 h-3.5" /> },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: ExportJob['status'] }) {
  const map = {
    queued:     { label: 'Queued',     cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Clock className="w-3 h-3" /> },
    processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',   icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    completed:  { label: 'Ready',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: <CheckCircle className="w-3 h-3" /> },
    failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',       icon: <XCircle className="w-3 h-3" /> },
  };
  const m = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', m.cls)}>
      {m.icon}{m.label}
    </span>
  );
}

function FormatBadge({ fmt }: { fmt: string }) {
  const found = EXPORT_FORMATS.find(f => f.value === fmt);
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
      {found?.icon} {found?.label ?? fmt}
    </span>
  );
}

// ─── New Export Dialog ─────────────────────────────────────────────────────────

function NewExportDialog({
  open,
  onClose,
  onSubmit,
  isSaving,
  forms,
  defaultFormId,
  defaultOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { form_id: string; format: ExportFormat; options: ExportOptions; save_as_template: boolean; template_name: string }) => void;
  isSaving: boolean;
  forms: { id: string; name: string }[];
  defaultFormId?: string;
  defaultOptions?: Partial<ExportOptions>;
}) {
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [formId, setFormId]           = useState(defaultFormId ?? '');
  const [fmt, setFmt]                 = useState<ExportFormat>('xlsx');
  const [opts, setOpts]               = useState<ExportOptions>({ ...DEFAULT_OPTIONS, ...defaultOptions });
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  function reset() {
    setStep(1);
    setFormId(defaultFormId ?? '');
    setFmt('xlsx');
    setOpts({ ...DEFAULT_OPTIONS });
    setSaveTemplate(false);
    setTemplateName('');
  }

  function handleClose() { reset(); onClose(); }

  const grouped = useMemo(() => {
    const g: Record<string, typeof EXPORT_FORMATS[number][]> = {};
    for (const f of EXPORT_FORMATS) {
      (g[f.group] = g[f.group] ?? []).push(f);
    }
    return g;
  }, []);

  const isGeo = ['geojson', 'kml', 'shapefile'].includes(fmt);
  const isStat = ['stata_dta', 'spss_sav', 'r_script', 'sas'].includes(fmt);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-indigo-500" />
            New Export — Step {step} of 3
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs mb-4">
          {(['Choose Form', 'Format', 'Options'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center font-semibold',
                step === i + 1 ? 'bg-indigo-600 text-white' :
                step > i + 1  ? 'bg-green-500 text-white'   :
                'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              )}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={step === i + 1 ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-500'}>{label}</span>
              {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Choose Form ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Form</Label>
              <Select value={formId} onValueChange={setFormId}>
                <SelectTrigger data-testid="select-export-form">
                  <SelectValue placeholder="Select a form…" />
                </SelectTrigger>
                <SelectContent>
                  {forms.length === 0
                    ? <SelectItem value="__none" disabled>No forms found</SelectItem>
                    : forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500">
              Select the form whose submissions you want to export. All linked submissions (including from ODK Central, Ona, and MoDa) will be included.
            </p>
          </div>
        )}

        {/* ── Step 2: Format ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            {Object.entries(grouped).map(([group, fmts]) => (
              <div key={group}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{group}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {fmts.map(f => (
                    <button
                      key={f.value}
                      data-testid={`format-option-${f.value}`}
                      onClick={() => setFmt(f.value as ExportFormat)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                        fmt === f.value
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                      )}
                    >
                      <span className="text-lg">{f.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.label}</p>
                        <p className="text-xs text-slate-500 truncate">{f.desc}</p>
                      </div>
                      {fmt === f.value && <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Options ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">

            {/* Data representation */}
            {!isGeo && (
              <div>
                <Label className="text-sm font-semibold">Data Representation</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['labels', 'codes'] as const).map(v => (
                    <button
                      key={v}
                      data-testid={`value-style-${v}`}
                      onClick={() => setOpts(o => ({ ...o, value_style: v }))}
                      className={cn('rounded-lg border px-3 py-2 text-sm text-left',
                        opts.value_style === v ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 font-semibold' : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      {v === 'labels' ? (
                        <><p className="font-medium">Value Labels</p><p className="text-xs text-slate-500 mt-0.5">Yes / No / Male / Female</p></>
                      ) : (
                        <><p className="font-medium">Numeric Codes</p><p className="text-xs text-slate-500 mt-0.5">1 / 0 / 1 / 2</p></>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Repeat groups */}
            {!isGeo && (
              <div>
                <Label className="text-sm font-semibold">Repeat Groups</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['separate_sheets', 'flatten'] as const).map(v => (
                    <button
                      key={v}
                      data-testid={`repeat-${v}`}
                      onClick={() => setOpts(o => ({ ...o, repeat_groups: v }))}
                      className={cn('rounded-lg border px-3 py-2 text-sm text-left',
                        opts.repeat_groups === v ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 font-semibold' : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      {v === 'separate_sheets' ? (
                        <><p className="font-medium">Separate Sheets</p><p className="text-xs text-slate-500 mt-0.5">Recommended for Excel / Stata</p></>
                      ) : (
                        <><p className="font-medium">Flatten</p><p className="text-xs text-slate-500 mt-0.5">One row per main submission</p></>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Row format */}
            {!isGeo && !isStat && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Wide Format</p>
                  <p className="text-xs text-slate-500">One row per submission (vs long format: one row per repeat answer)</p>
                </div>
                <Switch
                  checked={opts.format_wide}
                  onCheckedChange={v => setOpts(o => ({ ...o, format_wide: v }))}
                  data-testid="switch-format-wide"
                />
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Include</Label>
              {[
                { key: 'include_gps_columns',     label: 'GPS as separate lat/lng columns', show: !isGeo },
                { key: 'include_media_urls',      label: 'Media attachment URLs' },
                { key: 'split_select_multiple',   label: 'Split select_multiple into binary columns', show: !isGeo, tip: 'Creates a separate 0/1 column per choice — Stata-friendly' },
                { key: 'include_audit_columns',   label: 'Audit trail fields (device ID, edit history, IP)' },
              ].filter(t => t.show !== false).map(t => (
                <div key={t.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm">{t.label}</p>
                    {t.tip && (
                      <TooltipProvider><Tooltip><TooltipTrigger>
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                      </TooltipTrigger><TooltipContent className="max-w-xs text-xs">{t.tip}</TooltipContent></Tooltip></TooltipProvider>
                    )}
                  </div>
                  <Switch
                    checked={!!(opts as any)[t.key]}
                    onCheckedChange={v => setOpts(o => ({ ...o, [t.key]: v }))}
                    data-testid={`switch-${t.key}`}
                  />
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Filters</Label>
              <div>
                <Label className="text-xs text-slate-500">Review Status</Label>
                <Select value={opts.review_status_filter} onValueChange={v => setOpts(o => ({ ...o, review_status_filter: v as ExportOptions['review_status_filter'] }))}>
                  <SelectTrigger className="mt-1" data-testid="select-review-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Submissions</SelectItem>
                    <SelectItem value="approved">Approved Only</SelectItem>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Date From</Label>
                  <Input
                    type="date"
                    className="mt-1 text-sm"
                    value={opts.date_from}
                    onChange={e => setOpts(o => ({ ...o, date_from: e.target.value }))}
                    data-testid="input-date-from"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Date To</Label>
                  <Input
                    type="date"
                    className="mt-1 text-sm"
                    value={opts.date_to}
                    onChange={e => setOpts(o => ({ ...o, date_to: e.target.value }))}
                    data-testid="input-date-to"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Enumerator (name / username filter)</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder="Leave blank for all enumerators"
                  value={opts.enumerator_filter}
                  onChange={e => setOpts(o => ({ ...o, enumerator_filter: e.target.value }))}
                  data-testid="input-enumerator-filter"
                />
              </div>
            </div>

            {/* Save as template */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Save as Template</p>
                  <p className="text-xs text-slate-500">Reuse these settings for future exports</p>
                </div>
                <Switch
                  checked={saveTemplate}
                  onCheckedChange={setSaveTemplate}
                  data-testid="switch-save-template"
                />
              </div>
              {saveTemplate && (
                <Input
                  placeholder="Template name…"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  data-testid="input-template-name"
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={step === 1 ? handleClose : () => setStep(s => (s - 1) as any)} data-testid="btn-export-back">
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                onClick={() => setStep(s => (s + 1) as any)}
                disabled={step === 1 && !formId}
                data-testid="btn-export-next"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={() => onSubmit({ form_id: formId, format: fmt, options: opts, save_as_template: saveTemplate, template_name: templateName })}
                disabled={isSaving}
                data-testid="btn-export-submit"
              >
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Queuing…</> : <><FileDown className="w-4 h-4 mr-2" />Start Export</>}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FieldDataExports() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab]                   = useState<TabId>('queue');
  const [showNew, setShowNew]           = useState(false);
  const [searchQ, setSearchQ]           = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [prefillFormId, setPrefillFormId] = useState<string | undefined>();
  const [prefillOpts, setPrefillOpts]   = useState<Partial<ExportOptions> | undefined>();

  // ── Data fetches ──────────────────────────────────────────────────────────

  const { data: jobs = [], isLoading: loadingJobs, refetch: refetchJobs } = useQuery<ExportJob[]>({
    queryKey: ['fd-export-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_export_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<ExportTemplate[]>({
    queryKey: ['fd-export-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_export_templates')
        .select('*')
        .order('last_used_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_forms')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createJob = useMutation({
    mutationFn: async (payload: {
      form_id: string; format: ExportFormat; options: ExportOptions;
      save_as_template: boolean; template_name: string;
    }) => {
      const jobPayload = {
        form_id:     payload.form_id || null,
        form_name:   forms.find(f => f.id === payload.form_id)?.name ?? null,
        format:      payload.format,
        options:     payload.options,
        status:      'queued',
        created_by:  user?.id ?? '',
      };
      const { data: job, error: jobErr } = await supabase
        .from('fd_export_jobs')
        .insert(jobPayload)
        .select()
        .single();
      if (jobErr) throw jobErr;

      if (payload.save_as_template && payload.template_name.trim()) {
        await supabase.from('fd_export_templates').insert({
          name:      payload.template_name.trim(),
          form_id:   payload.form_id || null,
          form_name: forms.find(f => f.id === payload.form_id)?.name ?? null,
          format:    payload.format,
          options:   payload.options,
        });
      }
      return job;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-export-jobs'] });
      qc.invalidateQueries({ queryKey: ['fd-export-templates'] });
      setShowNew(false);
      setPrefillFormId(undefined);
      setPrefillOpts(undefined);
      toast({ title: 'Export queued', description: 'Your export is being prepared.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fd_export_jobs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-export-jobs'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fd_export_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-export-templates'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const activeJobs  = jobs.filter(j => j.status === 'queued' || j.status === 'processing');
  const doneJobs    = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
  const todayJobs   = jobs.filter(j => j.created_at >= format(new Date(), 'yyyy-MM-dd'));
  const completedCount = jobs.filter(j => j.status === 'completed').length;

  const filteredHistory = useMemo(() => doneJobs.filter(j => {
    const q = searchQ.toLowerCase();
    const matchQ = !q || (j.form_name ?? '').toLowerCase().includes(q);
    const matchFmt = formatFilter === 'all' || j.format === formatFilter;
    return matchQ && matchFmt;
  }), [doneJobs, searchQ, formatFilter]);

  // ── Stats strip ───────────────────────────────────────────────────────────
  const stats = [
    { label: 'Total Exports',  value: jobs.length,      cls: 'text-slate-700 dark:text-slate-200' },
    { label: 'In Queue',       value: activeJobs.length, cls: 'text-blue-600 dark:text-blue-400' },
    { label: 'Ready Today',    value: todayJobs.filter(j => j.status === 'completed').length, cls: 'text-green-600 dark:text-green-400' },
    { label: 'Success Rate',   value: jobs.length ? `${Math.round((completedCount / jobs.length) * 100)}%` : '—', cls: 'text-indigo-600 dark:text-indigo-400' },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileDown className="w-5 h-5 text-indigo-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Smart Export</h1>
            <Badge variant="secondary" className="text-xs">Phase 13</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Analysis-ready exports in Stata, SPSS, R, GeoJSON, DHIS2, and more.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchJobs()} data-testid="btn-refresh-exports">
            <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="btn-new-export">
            <Plus className="w-4 h-4 mr-1.5" />New Export
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {t.icon}{t.label}
            {t.id === 'queue' && activeJobs.length > 0 && (
              <span className="ml-0.5 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {activeJobs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Export Queue ────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <div className="space-y-3">
          {loadingJobs ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : activeJobs.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No exports in queue</p>
              <p className="text-sm mt-1">Start a new export and it will appear here.</p>
              <Button className="mt-4" size="sm" onClick={() => setShowNew(true)} data-testid="btn-new-export-empty">
                <Plus className="w-4 h-4 mr-1.5" />New Export
              </Button>
            </div>
          ) : (
            activeJobs.map(job => (
              <ExportJobCard
                key={job.id}
                job={job}
                onDelete={() => deleteJob.mutate(job.id)}
              />
            ))
          )}

          {/* Recent completed shown at bottom of queue tab */}
          {doneJobs.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recently Completed</p>
              {doneJobs.slice(0, 5).map(job => (
                <ExportJobCard key={job.id} job={job} onDelete={() => deleteJob.mutate(job.id)} />
              ))}
              {doneJobs.length > 5 && (
                <button onClick={() => setTab('history')} className="text-xs text-indigo-600 hover:underline mt-2 ml-1">
                  View all {doneJobs.length} exports →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: History ─────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                className="pl-8 text-sm"
                placeholder="Search by form name…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                data-testid="input-history-search"
              />
            </div>
            <Select value={formatFilter} onValueChange={setFormatFilter}>
              <SelectTrigger className="w-44 text-sm" data-testid="select-format-filter">
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="All formats" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Formats</SelectItem>
                {EXPORT_FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadingJobs ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <LayoutList className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No export history found.</p>
            </div>
          ) : (
            filteredHistory.map(job => (
              <ExportJobCard
                key={job.id}
                job={job}
                onDelete={() => deleteJob.mutate(job.id)}
                onRepeat={() => {
                  setPrefillFormId(job.form_id ?? undefined);
                  setPrefillOpts(job.options as Partial<ExportOptions>);
                  setShowNew(true);
                }}
              />
            ))
          )}
        </div>
      )}

      {/* ── Tab: Templates ────────────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {loadingTemplates ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Bookmark className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No saved templates yet</p>
              <p className="text-sm mt-1">Check "Save as Template" when creating an export to save settings for reuse.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map(tpl => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onUse={() => {
                    setPrefillFormId(tpl.form_id ?? undefined);
                    setPrefillOpts(tpl.options as Partial<ExportOptions>);
                    setShowNew(true);
                  }}
                  onDelete={() => deleteTemplate.mutate(tpl.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New Export Dialog ──────────────────────────────────────────────── */}
      <NewExportDialog
        open={showNew}
        onClose={() => { setShowNew(false); setPrefillFormId(undefined); setPrefillOpts(undefined); }}
        onSubmit={data => createJob.mutate(data)}
        isSaving={createJob.isPending}
        forms={forms}
        defaultFormId={prefillFormId}
        defaultOptions={prefillOpts}
      />
    </div>
  );
}

// ─── ExportJobCard ────────────────────────────────────────────────────────────

function ExportJobCard({
  job,
  onDelete,
  onRepeat,
}: {
  job: ExportJob;
  onDelete: () => void;
  onRepeat?: () => void;
}) {
  return (
    <div
      data-testid={`export-job-${job.id}`}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-4"
    >
      {/* Format icon */}
      <div className="text-2xl flex-shrink-0 hidden sm:block">
        {EXPORT_FORMATS.find(f => f.value === job.format)?.icon ?? '📄'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {job.form_name ?? 'All Forms'}
          </p>
          <FormatBadge fmt={job.format} />
          <StatusBadge status={job.status} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
          <span>{format(parseISO(job.created_at), 'dd MMM yyyy, HH:mm')}</span>
          {job.record_count != null && <span>{job.record_count.toLocaleString()} records</span>}
          {job.file_size_bytes != null && <span>{fmtSize(job.file_size_bytes)}</span>}
          {job.completed_at && (
            <span>Done {format(parseISO(job.completed_at), 'HH:mm')}</span>
          )}
        </div>
        {job.error_message && (
          <p className="text-xs text-red-500 mt-1 truncate">{job.error_message}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {job.status === 'completed' && job.file_url && (
          <a href={job.file_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="default" data-testid={`btn-download-${job.id}`}>
              <Download className="w-4 h-4 mr-1.5" />Download
            </Button>
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`btn-menu-${job.id}`}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRepeat && (
              <DropdownMenuItem onClick={onRepeat} data-testid={`btn-repeat-${job.id}`}>
                <Copy className="w-4 h-4 mr-2" />Repeat Export
              </DropdownMenuItem>
            )}
            {job.status === 'completed' && job.file_url && (
              <DropdownMenuItem
                onClick={() => { navigator.clipboard.writeText(job.file_url!); }}
                data-testid={`btn-copy-url-${job.id}`}
              >
                <Copy className="w-4 h-4 mr-2" />Copy Download URL
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-600 focus:text-red-600"
              data-testid={`btn-delete-${job.id}`}
            >
              <Trash2 className="w-4 h-4 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: ExportTemplate;
  onUse: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-testid={`template-${template.id}`}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{EXPORT_FORMATS.find(f => f.value === template.format)?.icon ?? '📄'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{template.name}</p>
          <p className="text-xs text-slate-500 truncate">{template.form_name ?? 'Any form'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FormatBadge fmt={template.format} />
        {template.use_count > 0 && (
          <span className="text-xs text-slate-500">Used {template.use_count}×</span>
        )}
        {template.last_used_at && (
          <span className="text-xs text-slate-500">Last {format(parseISO(template.last_used_at), 'dd MMM')}</span>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onUse} data-testid={`btn-use-template-${template.id}`}>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />Use Template
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={onDelete} data-testid={`btn-delete-template-${template.id}`}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
