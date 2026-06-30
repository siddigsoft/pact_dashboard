import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, Upload, Download, Trash2, Plus, Database,
  Search, RefreshCw, Layers, Link2, Unlink, History,
  Copy, CheckCircle2, FileSpreadsheet, Eye, X, ChevronRight,
  AlertCircle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ServerDataset {
  id: string;
  name: string;
  description: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  row_count: number;
  columns: { name: string; type: string }[];
  version: number;
  country_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  linked_form_count?: number;
}

interface DatasetVersion {
  id: string;
  dataset_id: string;
  version_number: number;
  file_name: string | null;
  file_url: string | null;
  row_count: number;
  columns: { name: string; type: string }[];
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface FieldForm {
  id: string;
  title: string;
  form_id: string | null;
}

function detectColType(vals: string[]): string {
  const nonEmpty = vals.filter(Boolean);
  if (nonEmpty.length === 0) return 'text';
  if (nonEmpty.every(v => !isNaN(Number(v)))) return 'decimal';
  if (nonEmpty.every(v => /^\d{4}-\d{2}-\d{2}/.test(v))) return 'date';
  return 'text';
}

function parseFile(file: File): Promise<{ rows: string[][]; headers: string[]; rowCount: number; columns: { name: string; type: string }[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
        if (!rows.length) { resolve({ rows: [], headers: [], rowCount: 0, columns: [] }); return; }
        const headers = (rows[0] as string[]).map(h => String(h).trim());
        const dataRows = rows.slice(1) as string[][];
        const columns = headers.map((h, i) => ({
          name: h,
          type: detectColType(dataRows.map(r => String(r[i] ?? ''))),
        }));
        resolve({ rows: dataRows, headers, rowCount: dataRows.length, columns });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function PulldataSnippet({ dataset }: { dataset: ServerDataset }) {
  const [copied, setCopied] = useState(false);
  const [keyCol, setKeyCol] = useState(dataset.columns[0]?.name ?? '');
  const [valCol, setValCol] = useState(dataset.columns[1]?.name ?? dataset.columns[0]?.name ?? '');

  const snippet = `pulldata('${dataset.name.replace(/\s+/g, '_').toLowerCase()}', '${valCol}', '${keyCol}', \${${keyCol}})`;

  const copy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Use <code className="bg-muted px-1 py-0.5 rounded text-[11px]">pulldata()</code> in your XLSForm calculation column to auto-fill values when the enumerator enters a key.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Key column (lookup by)</Label>
          <Select value={keyCol} onValueChange={setKeyCol}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dataset.columns.map(c => <SelectItem key={c.name} value={c.name} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Value column (return this)</Label>
          <Select value={valCol} onValueChange={setValCol}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dataset.columns.map(c => <SelectItem key={c.name} value={c.name} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="relative">
        <div className="bg-slate-900 dark:bg-slate-800 text-emerald-300 text-xs font-mono rounded-lg px-4 py-3 pr-10 break-all">
          {snippet}
        </div>
        <button
          onClick={copy}
          className="absolute top-2 right-2 text-slate-400 hover:text-white transition-colors"
          data-testid="button-copy-snippet"
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
        <strong>Example XLSForm usage:</strong><br />
        In a <code>calculate</code> row, set the <code>calculation</code> to this expression.
        The dataset file (<code>{dataset.file_name ?? dataset.name}</code>) must be attached to the form in ODK Collect or referenced via <code>search()</code> in an <code>external_select</code>.
      </div>
    </div>
  );
}

export default function FieldDataDatasets() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detailDataset, setDetailDataset] = useState<ServerDataset | null>(null);
  const [versionsDataset, setVersionsDataset] = useState<ServerDataset | null>(null);
  const [linkDialog, setLinkDialog] = useState<ServerDataset | null>(null);
  const [snippetDataset, setSnippetDataset] = useState<ServerDataset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadParsed, setUploadParsed] = useState<{ rowCount: number; columns: { name: string; type: string }[] } | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadAsVersion, setUploadAsVersion] = useState<string | null>(null); // dataset id to version-bump
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Version history state
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Link forms state
  const [linkedForms, setLinkedForms] = useState<string[]>([]); // form IDs
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: datasets = [], isLoading, refetch } = useQuery<ServerDataset[]>({
    queryKey: ['field_data_server_datasets'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_server_datasets')
        .select('*, field_data_dataset_form_links(count)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        columns: Array.isArray(d.columns) ? d.columns : [],
        linked_form_count: d.field_data_dataset_form_links?.[0]?.count ?? 0,
      }));
    },
  });

  const { data: allForms = [] } = useQuery<FieldForm[]>({
    queryKey: ['field_data_forms_list'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_forms')
        .select('id,title,form_id')
        .order('title');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── File selection + parse ────────────────────────────────────────────────
  const handleFileSelect = async (file: File) => {
    setUploadFile(file);
    setUploadParsing(true);
    setUploadParsed(null);
    try {
      const { rowCount, columns } = await parseFile(file);
      setUploadParsed({ rowCount, columns });
      if (!uploadName && !uploadAsVersion) {
        setUploadName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
      }
    } catch {
      toast({ title: 'Could not parse file', description: 'Ensure it is a valid CSV or Excel file.', variant: 'destructive' });
    } finally {
      setUploadParsing(false);
    }
  };

  // ── Upload / create dataset ───────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || !uploadParsed) return;
    if (!uploadName.trim() && !uploadAsVersion) {
      toast({ title: 'Dataset name is required', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ts = Date.now();
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `datasets/${ts}-${safeName}`;

      const { error: storageErr } = await (supabase as any).storage
        .from('field-data-datasets')
        .upload(storagePath, uploadFile, { upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = (supabase as any).storage
        .from('field-data-datasets')
        .getPublicUrl(storagePath);
      const fileUrl = urlData?.publicUrl ?? null;

      if (uploadAsVersion) {
        // Bump version on existing dataset
        const existing = datasets.find(d => d.id === uploadAsVersion);
        const newVersion = (existing?.version ?? 1) + 1;
        const { error: vErr } = await (supabase as any)
          .from('field_data_dataset_versions')
          .insert({
            dataset_id: uploadAsVersion,
            version_number: newVersion,
            file_name: uploadFile.name,
            file_url: fileUrl,
            storage_path: storagePath,
            row_count: uploadParsed.rowCount,
            columns: uploadParsed.columns,
            notes: uploadNotes || null,
            uploaded_by: user?.id ?? null,
          });
        if (vErr) throw vErr;
        const { error: uErr } = await (supabase as any)
          .from('field_data_server_datasets')
          .update({
            file_name: uploadFile.name,
            file_url: fileUrl,
            storage_path: storagePath,
            row_count: uploadParsed.rowCount,
            columns: uploadParsed.columns,
            version: newVersion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', uploadAsVersion);
        if (uErr) throw uErr;
        toast({ title: 'New version uploaded', description: `v${newVersion} — ${uploadParsed.rowCount.toLocaleString()} rows` });
      } else {
        // Create new dataset + first version
        const { data: newDs, error: dsErr } = await (supabase as any)
          .from('field_data_server_datasets')
          .insert({
            name: uploadName.trim(),
            description: uploadDesc.trim() || null,
            file_name: uploadFile.name,
            file_url: fileUrl,
            storage_path: storagePath,
            row_count: uploadParsed.rowCount,
            columns: uploadParsed.columns,
            version: 1,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single();
        if (dsErr) throw dsErr;
        await (supabase as any).from('field_data_dataset_versions').insert({
          dataset_id: newDs.id,
          version_number: 1,
          file_name: uploadFile.name,
          file_url: fileUrl,
          storage_path: storagePath,
          row_count: uploadParsed.rowCount,
          columns: uploadParsed.columns,
          notes: uploadNotes || null,
          uploaded_by: user?.id ?? null,
        });
        toast({ title: 'Dataset created', description: `${uploadParsed.rowCount.toLocaleString()} rows · ${uploadParsed.columns.length} columns` });
      }

      qc.invalidateQueries({ queryKey: ['field_data_server_datasets'] });
      closeUploadDialog();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const closeUploadDialog = () => {
    setUploadDialog(false);
    setUploadFile(null);
    setUploadParsed(null);
    setUploadName('');
    setUploadDesc('');
    setUploadNotes('');
    setUploadAsVersion(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openVersionUpload = (ds: ServerDataset) => {
    setUploadAsVersion(ds.id);
    setUploadName(ds.name);
    setUploadDialog(true);
  };

  // ── Version history ───────────────────────────────────────────────────────
  const openVersions = async (ds: ServerDataset) => {
    setVersionsDataset(ds);
    setVersionsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('field_data_dataset_versions')
        .select('*')
        .eq('dataset_id', ds.id)
        .order('version_number', { ascending: false });
      if (error) throw error;
      setVersions(data ?? []);
    } catch (e: any) {
      toast({ title: 'Could not load versions', description: e.message, variant: 'destructive' });
    } finally {
      setVersionsLoading(false);
    }
  };

  // ── Link forms ────────────────────────────────────────────────────────────
  const openLinkDialog = async (ds: ServerDataset) => {
    setLinkDialog(ds);
    setLinkLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('field_data_dataset_form_links')
        .select('form_id')
        .eq('dataset_id', ds.id);
      if (error) throw error;
      setLinkedForms((data ?? []).map((r: any) => r.form_id));
    } catch {
      setLinkedForms([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const toggleFormLink = async (formId: string) => {
    if (!linkDialog) return;
    setLinkSaving(true);
    try {
      if (linkedForms.includes(formId)) {
        await (supabase as any)
          .from('field_data_dataset_form_links')
          .delete()
          .eq('dataset_id', linkDialog.id)
          .eq('form_id', formId);
        setLinkedForms(p => p.filter(id => id !== formId));
      } else {
        await (supabase as any)
          .from('field_data_dataset_form_links')
          .insert({ dataset_id: linkDialog.id, form_id: formId });
        setLinkedForms(p => [...p, formId]);
      }
      qc.invalidateQueries({ queryKey: ['field_data_server_datasets'] });
    } catch (e: any) {
      toast({ title: 'Could not update link', description: e.message, variant: 'destructive' });
    } finally {
      setLinkSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from('field_data_server_datasets')
        .delete()
        .eq('id', deleteId);
      if (error) throw error;
      toast({ title: 'Dataset deleted' });
      qc.invalidateQueries({ queryKey: ['field_data_server_datasets'] });
      setDeleteId(null);
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = datasets.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/field-data')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Server Datasets</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reference data for <code className="bg-muted px-1 rounded">pulldata()</code> in XLSForms</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-slate-400"
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button onClick={() => setUploadDialog(true)} size="sm" data-testid="button-new-dataset">
              <Plus className="w-4 h-4 mr-1.5" /> New Dataset
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-sm text-indigo-800 dark:text-indigo-300">
            <strong>Server Datasets</strong> let enumerators look up reference data while filling a form — beneficiary lists, site registers, distribution rosters.
            Upload a CSV or Excel file, then use <code className="bg-indigo-100 dark:bg-indigo-900/50 px-1 py-0.5 rounded text-[11px]">pulldata('dataset_name', 'value_col', 'key_col', $&#123;key&#125;)</code> in your XLSForm calculation.
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets…"
            className="pl-9"
            data-testid="input-search"
          />
        </div>

        {/* Datasets table */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
            <p className="text-sm">Loading datasets…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No datasets yet</p>
            <p className="text-sm text-slate-400 mt-1">Upload a CSV or Excel file to create a reference dataset for your forms.</p>
            <Button onClick={() => setUploadDialog(true)} className="mt-4" size="sm">
              <Upload className="w-4 h-4 mr-1.5" /> Upload Dataset
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Name</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden sm:table-cell">Rows</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Columns</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden lg:table-cell">Version</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden lg:table-cell">Linked Forms</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Last Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(ds => (
                  <tr key={ds.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{ds.name}</div>
                          {ds.description && <div className="text-xs text-slate-500 truncate max-w-xs">{ds.description}</div>}
                          {ds.file_name && <div className="text-[11px] text-slate-400">{ds.file_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-mono hidden sm:table-cell">
                      {ds.row_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <button
                        onClick={() => setDetailDataset(ds)}
                        className="text-slate-500 hover:text-indigo-600 transition-colors text-sm"
                        data-testid={`button-view-cols-${ds.id}`}
                      >
                        {ds.columns.length} cols
                        <ChevronRight className="w-3.5 h-3.5 inline ml-0.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs font-mono">v{ds.version}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <button
                        onClick={() => openLinkDialog(ds)}
                        className={cn(
                          'text-sm font-medium transition-colors',
                          (ds.linked_form_count ?? 0) > 0
                            ? 'text-emerald-600 hover:text-emerald-700'
                            : 'text-slate-400 hover:text-slate-600',
                        )}
                        data-testid={`button-link-forms-${ds.id}`}
                      >
                        {ds.linked_form_count ?? 0} forms
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 hidden md:table-cell whitespace-nowrap">
                      {format(new Date(ds.updated_at), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSnippetDataset(ds)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="pulldata() snippet"
                          data-testid={`button-snippet-${ds.id}`}
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openLinkDialog(ds)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Link to forms"
                          data-testid={`button-link-${ds.id}`}
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openVersions(ds)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-slate-400 hover:text-amber-600 transition-colors"
                          title="Version history"
                          data-testid={`button-versions-${ds.id}`}
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openVersionUpload(ds)}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 transition-colors"
                          title="Upload new version"
                          data-testid={`button-new-version-${ds.id}`}
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                        {ds.file_url && (
                          <a
                            href={ds.file_url}
                            download={ds.file_name ?? true}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Download current version"
                            data-testid={`button-download-${ds.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => setDeleteId(ds.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete dataset"
                          data-testid={`button-delete-${ds.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Upload / New Version Dialog ──────────────────────────────────────── */}
      <Dialog open={uploadDialog} onOpenChange={o => { if (!o) closeUploadDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-600" />
              {uploadAsVersion ? `Upload New Version — ${datasets.find(d => d.id === uploadAsVersion)?.name}` : 'New Server Dataset'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File drop zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                uploadFile
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-slate-700',
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFileSelect(f);
              }}
              data-testid="dropzone-file"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                data-testid="input-file"
              />
              {uploadParsing ? (
                <div className="text-sm text-indigo-600">
                  <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  Parsing file…
                </div>
              ) : uploadFile ? (
                <div className="text-sm">
                  <FileSpreadsheet className="w-7 h-7 mx-auto mb-2 text-indigo-600" />
                  <div className="font-medium text-slate-800 dark:text-slate-200">{uploadFile.name}</div>
                  {uploadParsed && (
                    <div className="text-xs text-slate-500 mt-1">
                      {uploadParsed.rowCount.toLocaleString()} rows · {uploadParsed.columns.length} columns detected
                    </div>
                  )}
                  <div className="text-xs text-indigo-500 mt-1">Click to change file</div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  <Upload className="w-7 h-7 mx-auto mb-2 opacity-50" />
                  <div className="font-medium">Drop CSV or Excel here</div>
                  <div className="text-xs mt-1">or click to browse</div>
                </div>
              )}
            </div>

            {/* Detected columns preview */}
            {uploadParsed && uploadParsed.columns.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Detected columns</Label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {uploadParsed.columns.map(c => (
                    <span key={c.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono">
                      {c.name}
                      <span className="text-slate-400 text-[10px]">{c.type}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!uploadAsVersion && (
              <>
                <div>
                  <Label>Dataset Name *</Label>
                  <Input
                    value={uploadName}
                    onChange={e => setUploadName(e.target.value)}
                    placeholder="e.g. Beneficiary Registry Q2 2026"
                    data-testid="input-dataset-name"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    This name is used in <code className="bg-muted px-1 rounded">pulldata('{uploadName.replace(/\s+/g, '_').toLowerCase() || 'dataset_name'}', …)</code>
                  </p>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                    rows={2}
                    placeholder="What does this dataset contain?"
                    data-testid="textarea-desc"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Version Notes</Label>
              <Input
                value={uploadNotes}
                onChange={e => setUploadNotes(e.target.value)}
                placeholder="e.g. Added Q2 beneficiaries, removed inactive records"
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeUploadDialog} disabled={uploading}>Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadParsed || (!uploadName.trim() && !uploadAsVersion)}
              data-testid="button-upload"
            >
              {uploading ? (
                <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Uploading…</>
              ) : uploadAsVersion ? (
                <><Upload className="w-4 h-4 mr-1.5" /> Upload New Version</>
              ) : (
                <><Plus className="w-4 h-4 mr-1.5" /> Create Dataset</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Column Detail Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!detailDataset} onOpenChange={o => !o && setDetailDataset(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-600" />
              {detailDataset?.name} — Columns
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="text-xs text-muted-foreground mb-2">
              {detailDataset?.row_count.toLocaleString()} rows · {detailDataset?.columns.length} columns · v{detailDataset?.version}
            </div>
            {(detailDataset?.columns ?? []).map((c, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                <span className="font-mono text-sm">{c.name}</span>
                <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDataset(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── pulldata() Snippet Dialog ────────────────────────────────────────── */}
      <Dialog open={!!snippetDataset} onOpenChange={o => !o && setSnippetDataset(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              pulldata() Snippet — {snippetDataset?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {snippetDataset && <PulldataSnippet dataset={snippetDataset} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnippetDataset(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Version History Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!versionsDataset} onOpenChange={o => { if (!o) { setVersionsDataset(null); setVersions([]); } }}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-amber-600" />
              Version History — {versionsDataset?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {versionsLoading ? (
              <p className="text-sm text-center text-muted-foreground py-6">Loading…</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-6">No versions recorded yet.</p>
            ) : versions.map(v => (
              <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">v{v.version_number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{v.file_name ?? `Version ${v.version_number}`}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{format(new Date(v.created_at), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {v.row_count.toLocaleString()} rows · {(Array.isArray(v.columns) ? v.columns : []).length} columns
                  </div>
                  {v.notes && <div className="text-xs text-slate-400 mt-0.5 italic">"{v.notes}"</div>}
                </div>
                {v.file_url && (
                  <a
                    href={v.file_url}
                    download
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                    title="Download this version"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setVersionsDataset(null); setVersions([]); openVersionUpload(versionsDataset!); }}
              className="w-full"
              data-testid="button-upload-from-history"
            >
              <Upload className="w-4 h-4 mr-1.5" /> Upload New Version
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVersionsDataset(null); setVersions([]); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Forms Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!linkDialog} onOpenChange={o => { if (!o) { setLinkDialog(null); setLinkedForms([]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />
              Link Forms — {linkDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Select which forms use this dataset. The <code className="bg-muted px-1 rounded text-xs">pulldata()</code> function in those forms will reference this dataset.
            </p>
            {linkLoading ? (
              <p className="text-center text-sm text-muted-foreground py-6">Loading…</p>
            ) : allForms.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No forms found in Field Data Hub.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allForms.map(f => {
                  const linked = linkedForms.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFormLink(f.id)}
                      disabled={linkSaving}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center justify-between',
                        linked
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                          : 'border-border hover:bg-muted/40',
                      )}
                      data-testid={`button-toggle-form-${f.id}`}
                    >
                      <div>
                        <div className="text-sm font-medium">{f.title}</div>
                        {f.form_id && <div className="text-[11px] text-muted-foreground">{f.form_id}</div>}
                      </div>
                      {linked
                        ? <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                        : <Link2 className="w-4 h-4 text-slate-300 shrink-0" />
                      }
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDialog(null); setLinkedForms([]); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Delete Dataset?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete the dataset, all version history, and all form links. Forms using <code className="bg-muted px-1 rounded text-xs">pulldata()</code> with this dataset will break.
            </p>
            <p className="text-sm font-medium text-destructive mt-2">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} data-testid="button-confirm-delete">
              {deleting ? 'Deleting…' : 'Delete Dataset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
