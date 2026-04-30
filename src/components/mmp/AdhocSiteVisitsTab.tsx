import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, FileSpreadsheet, PlusCircle, Trash2, Pencil, XCircle,
  Loader2, Download, CheckCircle2, Users, AlertTriangle, RefreshCw
} from 'lucide-react';

interface DataCollector {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface AdhocRow {
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
  phoneNumber: string;
  transportFee: string;
  enumeratorFee: string;
  assignToId: string;
  assignToName: string;
  dueDate: string;
  _errors?: string[];
}

interface ExistingEntry {
  id: string;
  site_name: string;
  site_code?: string;
  state?: string;
  locality?: string;
  status: string;
  accepted_by?: string;
  preferred_assignee_id?: string;
  assignedToName?: string;
  phone_number?: string;
  transport_fee?: number;
  enumerator_fee?: number;
  visit_date?: string;
  created_at?: string;
  dispatched_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  dispatched: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  assigned: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  claimed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ongoing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  completed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  recalled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const FILTER_STATUSES = ['all', 'pending', 'dispatched', 'assigned', 'claimed', 'completed'] as const;

const emptyRow = (): AdhocRow => ({
  siteName: '', siteCode: '', state: '', locality: '',
  phoneNumber: '', transportFee: '', enumeratorFee: '', assignToId: '', assignToName: '', dueDate: '',
});

const validateRow = (row: AdhocRow): string[] => {
  const errors: string[] = [];
  if (!row.siteName.trim()) errors.push('Site Name required');
  if (!row.state.trim()) errors.push('State required');
  return errors;
};

const normalizePhoneNumbers = (raw: string): string[] => {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*-\s*|\s*\/\s*|\s*,\s*|\s*;\s*/)
    .map((part) => part.replace(/\s+/g, '').replace(/[^\d+]/g, '').trim())
    .filter((part) => part.length >= 7);
};

const getOrCreateAdhocMMPFile = async (
  projectId: string,
  projectName: string
): Promise<string> => {
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mmpId = `adhoc-tasks-${projectId}-${monthKey}`;
  const mmpName = `Ad-hoc Tasks — ${projectName} — ${monthYear}`;

  const { data: existing } = await supabase
    .from('mmp_files')
    .select('id')
    .eq('mmp_id', mmpId)
    .single();

  if (existing) return existing.id;

  const { data: newMMP, error } = await supabase
    .from('mmp_files')
    .insert({
      mmp_id: mmpId,
      name: mmpName,
      status: 'Approved',
      month: now.toISOString().slice(0, 7),
      project_id: projectId,
      uploaded_by: 'system',
      uploaded_at: now.toISOString(),
      approved_by: 'system',
      approved_at: now.toISOString(),
      file_path: `system/${mmpId}`,
    })
    .select('id')
    .single();

  if (error || !newMMP) throw error || new Error('Failed to create adhoc MMP file');
  return newMMP.id;
};

// ── Column-mapping types ─────────────────────────────────────────────────────
interface ColumnMap {
  siteName: string;   // required
  state: string;      // required
  locality: string;   // optional (falls back to state when missing)
  siteCode: string;
  phoneNumber: string;
  transportFee: string;
  enumeratorFee: string;
  assignTo: string;
  dueDate: string;
}

// Known column aliases for auto-detection (lowercase)
const COL_ALIASES: Record<keyof ColumnMap, string[]> = {
  siteName:     ['site name','sitename','name','trdname','tradername','trader name','school name','market name','distribution point','site','market','location name','beneficiary site','pdm site','retailer name','retailer','trader'],
  state:        ['state','location','admin1name','admin1 name','province','governorate','region','wilaya'],
  locality:     ['locality','location','admin2name','admin2 name','district','county','sub-district','sub district','mahalia','locality name'],
  siteCode:     ['site code','sitecode','code','id','site id','trdid','school code','pdm code','retailer code','site_code'],
  phoneNumber:  ['phone number','phone','mobile','tel','telephone','contact number','contact'],
  transportFee: ['transport fee','transportfee','transport','transport cost','travel fee','travel cost'],
  enumeratorFee:['enumerator fee','enumeratorfee','fee','monitor fee','enumerator fee (sdg)','enum fee','data collector fee'],
  assignTo:     ['assign to','assignto','enumerator','monitor','data collector','collector','assigned to','assigned_to'],
  dueDate:      ['due date','duedate','due','visit date','collection date','survey date','date'],
};

const autoDetectColumn = (headers: string[], field: keyof ColumnMap): string => {
  const lower = headers.map(h => h.toLowerCase());
  for (const alias of COL_ALIASES[field]) {
    const idx = lower.indexOf(alias);
    if (idx >= 0) return headers[idx];
  }
  return '';
};

interface AdhocSiteVisitsTabProps {
  canManage: boolean;
}

export default function AdhocSiteVisitsTab({ canManage }: AdhocSiteVisitsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collectors
  const [collectors, setCollectors] = useState<DataCollector[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Create mode
  const [createMode, setCreateMode] = useState<'upload' | 'manual'>('manual');

  // Upload sub-tab state
  const [uploadedRows, setUploadedRows] = useState<AdhocRow[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  // Column mapper
  const [rawFileHeaders, setRawFileHeaders] = useState<string[]>([]);
  const [rawFileRows, setRawFileRows] = useState<(string | number)[][]>([]);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [columnMap, setColumnMap] = useState<ColumnMap>({ siteName: '', state: '', locality: '', siteCode: '', phoneNumber: '', transportFee: '', enumeratorFee: '', assignTo: '', dueDate: '' });

  // Manual entry sub-tab state
  const [manualRows, setManualRows] = useState<AdhocRow[]>([]);
  const [formRow, setFormRow] = useState<AdhocRow>(emptyRow());
  const [collectorSearch, setCollectorSearch] = useState('');
  const [showCollectorDropdown, setShowCollectorDropdown] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ assigned: number; open: number } | null>(null);

  // Existing tasks
  const [existingEntries, setExistingEntries] = useState<ExistingEntry[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Edit dialog
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<ExistingEntry>>({});
  const [saving, setSaving] = useState(false);

  // Recall confirm dialog
  const [recallEntry, setRecallEntry] = useState<ExistingEntry | null>(null);
  const [recalling, setRecalling] = useState(false);

  // Load collectors
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, role')
        .order('full_name', { ascending: true });
      if (data) {
        const rolePatterns = ['datacollector', 'data collector', 'collector', 'enumerator'];
        setCollectors(
          data.filter(p => {
            const r = (p.role || '').toLowerCase().replace(/\s+/g, '');
            return rolePatterns.some(pat => r.includes(pat.replace(/\s+/g, '')));
          })
        );
      }
    })();
  }, []);

  // Load projects for adhoc assignment
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Failed to load projects for ad-hoc sites:', error);
        return;
      }
      setProjects((data || []).map((p: any) => ({ id: p.id, name: p.name || p.id })));
    })();
  }, []);

  // Load existing adhoc entries
  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const { data: adhocFiles } = await supabase
        .from('mmp_files')
        .select('id')
        .ilike('mmp_id', 'adhoc-tasks-%');

      if (!adhocFiles || adhocFiles.length === 0) {
        setExistingEntries([]);
        return;
      }

      const fileIds = adhocFiles.map(f => f.id);
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, accepted_by, additional_data, transport_fee, enumerator_fee, visit_date, created_at, dispatched_at')
        .in('mmp_file_id', fileIds)
        .order('created_at', { ascending: false });

      if (!entries) { setExistingEntries([]); return; }

      // Resolve enumerator names
      const assignedIds = [...new Set(entries.flatMap(e => {
        const pref = (e as any).additional_data?.assigned_to;
        const accepted = (e as any).accepted_by;
        return [pref, accepted].filter(Boolean);
      }))] as string[];
      let namesMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, username, email')
          .in('id', assignedIds);
        (profiles || []).forEach(p => {
          namesMap[p.id] = p.full_name || p.username || p.email || p.id;
        });
      }

      setExistingEntries(entries.map(e => ({
        ...e,
        site_name: e.site_name || '',
        status: e.status || 'pending',
        preferred_assignee_id: (e as any).additional_data?.assigned_to,
        phone_number: (e as any).phone_number
          || (e as any).additional_data?.phone_number_raw
          || (e as any).additional_data?.phone_number
          || (e as any).additional_data?.['Phone Number']
          || undefined,
        assignedToName: (e as any).accepted_by
          ? (namesMap[(e as any).accepted_by] || (e as any).accepted_by)
          : ((e as any).additional_data?.assigned_to
              ? (namesMap[(e as any).additional_data.assigned_to] || (e as any).additional_data.assigned_to)
              : undefined),
      })));
    } catch (err) {
      console.error('Failed to load adhoc entries:', err);
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => { loadExisting(); }, [loadExisting, refreshTrigger]);

  // Localities for form manual entry
  const localities = useMemo(() => {
    if (!formRow.state) return [];
    return sudanStates.find(s => s.name === formRow.state)?.localities || [];
  }, [formRow.state]);

  // Filtered collector search
  const filteredCollectors = useMemo(() => {
    const q = collectorSearch.trim().toLowerCase();
    if (!q) return collectors.slice(0, 30);
    return collectors.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [collectors, collectorSearch]);

  // ── File upload helpers ──────────────────────────────────────────────────

  const buildRowsFromMap = useCallback((headers: string[], rows: (string | number)[][], map: ColumnMap): AdhocRow[] => {
    const getByHeader = (row: (string | number)[], colName: string) => {
      if (!colName) return '';
      const idx = headers.indexOf(colName);
      if (idx < 0 || row[idx] === undefined || row[idx] === '') return '';
      return String(row[idx]).trim();
    };
    return rows.map(row => {
      const assignToName = getByHeader(row, map.assignTo);
      const stateRaw = getByHeader(row, map.state);
      const localityRaw = getByHeader(row, map.locality);
      const matchedCollector = collectors.find(c =>
        (c.full_name || '').toLowerCase() === assignToName.toLowerCase() ||
        (c.email || '').toLowerCase() === assignToName.toLowerCase()
      );
      const unmatchedAssignee = assignToName && !matchedCollector;
      const r: AdhocRow = {
        siteName:      getByHeader(row, map.siteName),
        siteCode:      getByHeader(row, map.siteCode),
        state:         stateRaw,
        locality:      localityRaw || stateRaw,
        phoneNumber:   getByHeader(row, map.phoneNumber),
        transportFee:  getByHeader(row, map.transportFee),
        enumeratorFee: getByHeader(row, map.enumeratorFee),
        assignToId:    matchedCollector?.id || '',
        assignToName:  assignToName || (matchedCollector ? (matchedCollector.full_name || '') : ''),
        dueDate:       getByHeader(row, map.dueDate),
      };
      r._errors = validateRow(r);
      if (unmatchedAssignee) {
        r._errors = [...(r._errors || []), `Enumerator "${assignToName}" not found — will be left open for claim`];
      }
      return r;
    }).filter(r => r.siteName || r.state || r.locality);
  }, [collectors]);

  const parseFile = (file: File) => {
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
        if (raw.length < 2) {
          toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' });
          return;
        }

        const headers = raw[0].map(h => String(h).trim());
        const dataRows = raw.slice(1);

        // Auto-detect columns using known aliases
        const detected: ColumnMap = {
          siteName:      autoDetectColumn(headers, 'siteName'),
          state:         autoDetectColumn(headers, 'state'),
          locality:      autoDetectColumn(headers, 'locality'),
          siteCode:      autoDetectColumn(headers, 'siteCode'),
          phoneNumber:   autoDetectColumn(headers, 'phoneNumber'),
          transportFee:  autoDetectColumn(headers, 'transportFee'),
          enumeratorFee: autoDetectColumn(headers, 'enumeratorFee'),
          assignTo:      autoDetectColumn(headers, 'assignTo'),
          dueDate:       autoDetectColumn(headers, 'dueDate'),
        };

        const requiredMissing = !detected.siteName || !detected.state;

        if (requiredMissing) {
          // Store raw data and open column mapper
          setRawFileHeaders(headers);
          setRawFileRows(dataRows);
          setColumnMap(detected);
          setShowColumnMapper(true);
        } else {
          // All required columns found — parse immediately
          setUploadedRows(buildRowsFromMap(headers, dataRows, detected));
        }
      } catch (err) {
        toast({ title: 'Parse error', description: 'Could not read the file.', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const applyColumnMap = () => {
    if (!columnMap.siteName || !columnMap.state) {
      toast({ title: 'Required fields missing', description: 'Please map Site Name and State/Location before continuing.', variant: 'destructive' });
      return;
    }
    setUploadedRows(buildRowsFromMap(rawFileHeaders, rawFileRows, columnMap));
    setShowColumnMapper(false);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Site Name', 'Site Code', 'State', 'Locality', 'Phone Number', 'Transport Fee', 'Enumerator Fee', 'Assign To', 'Due Date'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ad-hoc Sites Template');
    XLSX.writeFile(wb, 'adhoc-sites-template.xlsx');
  };

  // ── Manual row helpers ───────────────────────────────────────────────────

  const addManualRow = () => {
    const errors = validateRow(formRow);
    if (errors.length > 0) {
      toast({ title: 'Missing required fields', description: errors.join(', '), variant: 'destructive' });
      return;
    }
    setManualRows(prev => [...prev, { ...formRow, _errors: [] }]);
    setFormRow(emptyRow());
    setCollectorSearch('');
  };

  const removeManualRow = (idx: number) => setManualRows(prev => prev.filter((_, i) => i !== idx));
  const removeUploadRow = (idx: number) => setUploadedRows(prev => prev.filter((_, i) => i !== idx));

  // ── Submission ───────────────────────────────────────────────────────────

  const submitRows = async (rows: AdhocRow[]) => {
    const validRows = rows.filter(r => !r._errors?.length);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Please fix validation errors before submitting.', variant: 'destructive' });
      return;
    }
    if (!selectedProjectId) {
      toast({ title: 'Project required', description: 'Please select the project for these ad-hoc sites.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const selectedProject = projects.find((p) => p.id === selectedProjectId);
      const mmpFileId = await getOrCreateAdhocMMPFile(
        selectedProjectId,
        selectedProject?.name || 'Project'
      );
      let assigned = 0, open = 0;

      const entries = validRows.map(row => {
        const hasAssignee = !!row.assignToId;
        if (hasAssignee) assigned++; else open++;
        return {
          mmp_file_id: mmpFileId,
          site_name: row.siteName.trim(),
          site_code: row.siteCode.trim() || null,
          state: row.state.trim(),
          locality: row.locality.trim() || row.state.trim(),
          transport_fee: row.transportFee ? Number(row.transportFee) : null,
          enumerator_fee: row.enumeratorFee ? Number(row.enumeratorFee) : null,
          accepted_by: null,
          status: 'pending',
          visit_date: row.dueDate || null,
          additional_data: {
            assigned_to: row.assignToId || null,
            phone_number_raw: row.phoneNumber || null,
            phone_numbers: normalizePhoneNumbers(row.phoneNumber || ''),
          },
        };
      });

      const { error } = await supabase.from('mmp_site_entries').insert(entries);
      if (error) throw error;

      toast({
        title: `${validRows.length} site visit${validRows.length !== 1 ? 's' : ''} created`,
        description: `${assigned} with preferred assignee · ${open} open`,
      });
      setLastResult({ assigned, open });
      if (createMode === 'upload') { setUploadedRows([]); setUploadedFileName(''); }
      else setManualRows([]);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Failed to create site visits', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit / Recall ────────────────────────────────────────────────────────

  const openEdit = (entry: ExistingEntry) => {
    setEditEntry(entry);
    setEditForm({
      transport_fee: entry.transport_fee,
      enumerator_fee: entry.enumerator_fee,
      preferred_assignee_id: entry.preferred_assignee_id,
      phone_number: entry.phone_number,
      visit_date: entry.visit_date,
    });
    setCollectorSearch(entry.assignedToName || '');
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      const { data: currentRow } = await supabase
        .from('mmp_site_entries')
        .select('additional_data')
        .eq('id', editEntry.id)
        .single();

      const nextAdditionalData = {
        ...((currentRow as any)?.additional_data || {}),
        assigned_to: editForm.preferred_assignee_id || null,
        phone_number_raw: editForm.phone_number || null,
        phone_numbers: normalizePhoneNumbers(String(editForm.phone_number || '')),
      };

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          transport_fee: editForm.transport_fee ?? null,
          enumerator_fee: editForm.enumerator_fee ?? null,
          visit_date: editForm.visit_date || null,
          additional_data: nextAdditionalData,
        })
        .eq('id', editEntry.id);
      if (error) throw error;
      toast({ title: 'Updated successfully' });
      setEditEntry(null);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmRecall = async () => {
    if (!recallEntry) return;
    setRecalling(true);
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ status: 'recalled' })
        .eq('id', recallEntry.id);
      if (error) throw error;
      toast({ title: 'Site recalled', description: `"${recallEntry.site_name}" removed from enumerators' view.` });
      setRecallEntry(null);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recall failed';
      toast({ title: 'Recall failed', description: msg, variant: 'destructive' });
    } finally {
      setRecalling(false);
    }
  };

  // ── Filtered existing entries ────────────────────────────────────────────

  const filteredExisting = useMemo(() => {
    if (statusFilter === 'all') return existingEntries;
    const s = statusFilter.toLowerCase();
    return existingEntries.filter(e => {
      const es = (e.status || '').toLowerCase();
      if (s === 'claimed') return es === 'claimed' || es === 'accepted';
      return es === s;
    });
  }, [existingEntries, statusFilter]);

  const canEdit = (entry: ExistingEntry) => {
    const s = (entry.status || '').toLowerCase();
    return s === 'pending' || s === 'dispatched' || s === 'assigned';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const activeRows = createMode === 'upload' ? uploadedRows : manualRows;
  const validCount = activeRows.filter(r => !r._errors?.length).length;

  return (
    <div className="space-y-6">

      {/* ── CREATE SECTION ── */}
      {canManage && (
        <Card className="border border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-teal-500" />
              Create Ad-hoc Site Visits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as 'manual' | 'upload')}>
              <TabsList className="mb-4">
                <TabsTrigger value="manual" data-testid="tab-manual-entry">
                  <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                  Select Manually
                </TabsTrigger>
                <TabsTrigger value="upload" data-testid="tab-file-upload">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload File
                </TabsTrigger>
              </TabsList>

              <div className="mb-4 max-w-sm space-y-1">
                <Label className="text-xs">Project *</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-adhoc-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── MANUAL ENTRY ── */}
              <TabsContent value="manual" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {/* State */}
                  <div className="space-y-1">
                    <Label className="text-xs">State *</Label>
                    <Select value={formRow.state} onValueChange={v => setFormRow(r => ({ ...r, state: v, locality: '' }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-adhoc-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {sudanStates.map(s => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Locality */}
                  <div className="space-y-1">
                    <Label className="text-xs">Locality</Label>
                    <Select value={formRow.locality} onValueChange={v => setFormRow(r => ({ ...r, locality: v }))} disabled={!formRow.state}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-adhoc-locality">
                        <SelectValue placeholder="Select locality" />
                      </SelectTrigger>
                      <SelectContent>
                        {localities.map(l => (
                          <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Site Name */}
                  <div className="space-y-1">
                    <Label className="text-xs">Site Name *</Label>
                    <Input className="h-8 text-xs" placeholder="e.g. Al Nour School" value={formRow.siteName}
                      onChange={e => setFormRow(r => ({ ...r, siteName: e.target.value }))}
                      data-testid="input-adhoc-site-name" />
                  </div>
                  {/* Site Code */}
                  <div className="space-y-1">
                    <Label className="text-xs">Site Code</Label>
                    <Input className="h-8 text-xs" placeholder="Optional" value={formRow.siteCode}
                      onChange={e => setFormRow(r => ({ ...r, siteCode: e.target.value }))}
                      data-testid="input-adhoc-site-code" />
                  </div>
                  {/* Phone Number */}
                  <div className="space-y-1">
                    <Label className="text-xs">Phone Number</Label>
                    <Input className="h-8 text-xs" placeholder="e.g. 0912345678" value={formRow.phoneNumber}
                      onChange={e => setFormRow(r => ({ ...r, phoneNumber: e.target.value }))}
                      data-testid="input-adhoc-phone-number" />
                  </div>
                  {/* Transport Fee */}
                  <div className="space-y-1">
                    <Label className="text-xs">Transport Fee (SDG)</Label>
                    <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={formRow.transportFee}
                      onChange={e => setFormRow(r => ({ ...r, transportFee: e.target.value }))}
                      data-testid="input-adhoc-transport-fee" />
                  </div>
                  {/* Enumerator Fee */}
                  <div className="space-y-1">
                    <Label className="text-xs">Enumerator Fee (SDG)</Label>
                    <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={formRow.enumeratorFee}
                      onChange={e => setFormRow(r => ({ ...r, enumeratorFee: e.target.value }))}
                      data-testid="input-adhoc-enumerator-fee" />
                  </div>
                  {/* Assign To */}
                  <div className="space-y-1 relative">
                    <Label className="text-xs">Assign To (optional)</Label>
                    <Input className="h-8 text-xs" placeholder="Search enumerator..."
                      value={collectorSearch}
                      onChange={e => { setCollectorSearch(e.target.value); setShowCollectorDropdown(true); setFormRow(r => ({ ...r, assignToId: '', assignToName: '' })); }}
                      onFocus={() => setShowCollectorDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCollectorDropdown(false), 150)}
                      data-testid="input-adhoc-assign-to" />
                    {showCollectorDropdown && filteredCollectors.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
                        <div className="p-1 border-b border-gray-100 dark:border-gray-800">
                          <button className="w-full text-left text-xs px-2 py-1 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                            onMouseDown={() => { setFormRow(r => ({ ...r, assignToId: '', assignToName: '' })); setCollectorSearch(''); setShowCollectorDropdown(false); }}>
                            Clear (open for claim)
                          </button>
                        </div>
                        {filteredCollectors.map(c => (
                          <button key={c.id}
                            className="w-full text-left text-xs px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex flex-col"
                            onMouseDown={() => {
                              const name = c.full_name || c.username || c.email || '';
                              setFormRow(r => ({ ...r, assignToId: c.id, assignToName: name }));
                              setCollectorSearch(name);
                              setShowCollectorDropdown(false);
                            }}>
                            <span className="font-medium">{c.full_name || c.username}</span>
                            {c.email && <span className="text-muted-foreground">{c.email}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Due Date */}
                  <div className="space-y-1">
                    <Label className="text-xs">Due Date</Label>
                    <Input className="h-8 text-xs" type="date" value={formRow.dueDate}
                      onChange={e => setFormRow(r => ({ ...r, dueDate: e.target.value }))}
                      data-testid="input-adhoc-due-date" />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={addManualRow} data-testid="button-add-adhoc-row"
                  className="flex items-center gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add Row
                </Button>

                {/* Pending rows list */}
                {manualRows.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between">
                      <span>{manualRows.length} row{manualRows.length !== 1 ? 's' : ''} ready</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {manualRows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{row.siteName}</span>
                            <span className="text-muted-foreground ml-2">{row.state} › {row.locality}</span>
                            {row.siteCode && <span className="text-muted-foreground ml-2">({row.siteCode})</span>}
                            {row.phoneNumber && <span className="text-muted-foreground ml-2">📞 {row.phoneNumber}</span>}
                            {row.assignToName && <span className="ml-2 text-amber-600 dark:text-amber-400">→ {row.assignToName}</span>}
                            {row.transportFee && <span className="ml-2 text-muted-foreground">T: {row.transportFee} SDG</span>}
                            {row.enumeratorFee && <span className="ml-2 text-muted-foreground">E: {row.enumeratorFee} SDG</span>}
                          </div>
                          <button onClick={() => removeManualRow(idx)} className="text-red-500 hover:text-red-700 flex-shrink-0"
                            data-testid={`button-remove-manual-row-${idx}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── UPLOAD FILE ── */}
              <TabsContent value="upload" className="mt-0 space-y-4">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadTemplate} data-testid="button-download-template"
                    className="flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-browse-file"
                    className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Browse File
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleFileChange} />
                </div>

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  data-testid="dropzone-adhoc-upload"
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-muted-foreground">
                    {uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Drag & drop an .xlsx or .csv file here, or use "Browse File"'}
                  </p>
                </div>

                {/* Preview table */}
                {uploadedRows.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between">
                      <span>{uploadedRows.length} row{uploadedRows.length !== 1 ? 's' : ''} parsed · {validCount} valid</span>
                      <span className="text-red-500">{uploadedRows.length - validCount} error{uploadedRows.length - validCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/30">
                          <tr>
                            {['Site Name', 'Code', 'State', 'Locality', 'Phone', 'Transport', 'Enum. Fee', 'Assign To', 'Due Date', ''].map(h => (
                              <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {uploadedRows.map((row, idx) => (
                            <tr key={idx} className={row._errors?.length ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                              <td className="px-2 py-1.5">
                                <span className={row._errors?.includes('Site Name required') ? 'text-red-500' : ''}>
                                  {row.siteName || <span className="text-red-400 italic">required</span>}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.siteCode}</td>
                              <td className="px-2 py-1.5">
                                <span className={row._errors?.includes('State required') ? 'text-red-500' : ''}>
                                  {row.state || <span className="text-red-400 italic">required</span>}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {row.locality || '—'}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.phoneNumber || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.transportFee}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.enumeratorFee}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.assignToName || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.dueDate}</td>
                              <td className="px-2 py-1.5">
                                <button onClick={() => removeUploadRow(idx)} className="text-red-500 hover:text-red-700"
                                  data-testid={`button-remove-upload-row-${idx}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── Submit button (shared) ── */}
            {activeRows.length > 0 && (
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                {lastResult && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Last batch: {lastResult.assigned} pre-assigned · {lastResult.open} open
                  </div>
                )}
                <Button
                  onClick={() => submitRows(activeRows)}
                  disabled={submitting || validCount === 0}
                  className="ml-auto flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="button-create-adhoc-visits"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Create {validCount} Site Visit{validCount !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── EXISTING TASKS ── */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-500" />
              Ad-hoc Site Visits
              <Badge variant="outline" className="text-xs">{filteredExisting.length}</Badge>
            </CardTitle>
            <button onClick={() => setRefreshTrigger(t => t + 1)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-refresh-adhoc">
              <RefreshCw className={`h-4 w-4 ${loadingExisting ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {/* Status filter chips */}
          <div className="flex gap-1.5 flex-wrap pt-2">
            {FILTER_STATUSES.map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${statusFilter === s ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-gray-400'}`}
                data-testid={`filter-chip-${s}`}
              >
                {s === 'all' ? `All (${existingEntries.length})` : s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingExisting ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : filteredExisting.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No ad-hoc site visits found.</p>
              {canManage && <p className="text-xs mt-1">Use the form above to create some.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {['Site Name', 'State', 'Locality', 'Phone', 'Status', 'Assigned To', 'Transport', 'Enum. Fee', 'Visit Date', 'Created', ''].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredExisting.map(entry => {
                    const editable = canEdit(entry) && canManage;
                    const recallable = canEdit(entry) && canManage;
                    const statusKey = (entry.status || '').toLowerCase();
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                        data-testid={`row-adhoc-entry-${entry.id}`}>
                        <td className="px-2 py-2 font-medium max-w-[160px] truncate">{entry.site_name}</td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.state || '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.locality || '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground max-w-[140px] truncate">{entry.phone_number || '—'}</td>
                        <td className="px-2 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_COLORS[statusKey] || 'bg-gray-100 text-gray-600'}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground max-w-[120px] truncate">
                          {entry.assignedToName || <span className="text-blue-500 text-[10px]">Open</span>}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {entry.transport_fee != null ? `${entry.transport_fee} SDG` : '—'}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {entry.enumerator_fee != null ? `${entry.enumerator_fee} SDG` : '—'}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.visit_date || '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            {editable && (
                              <button onClick={() => openEdit(entry)} className="text-blue-500 hover:text-blue-700 transition-colors"
                                title="Edit" data-testid={`button-edit-adhoc-${entry.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {recallable && (
                              <button onClick={() => setRecallEntry(entry)} className="text-red-500 hover:text-red-700 transition-colors"
                                title="Recall" data-testid={`button-recall-adhoc-${entry.id}`}>
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── COLUMN MAPPER DIALOG ── */}
      <Dialog open={showColumnMapper} onOpenChange={open => { if (!open) setShowColumnMapper(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-teal-500" />
              Map File Columns
            </DialogTitle>
            <DialogDescription className="text-xs">
              Some required columns couldn't be detected automatically in <strong>{uploadedFileName}</strong>.
              Match each field to the correct column from your file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {(
              [
                { field: 'siteName'      as keyof ColumnMap, label: 'Site Name',       required: true },
                { field: 'state'         as keyof ColumnMap, label: 'State',            required: true },
                { field: 'locality'      as keyof ColumnMap, label: 'Locality',         required: false },
                { field: 'siteCode'      as keyof ColumnMap, label: 'Site Code',        required: false },
                { field: 'phoneNumber'   as keyof ColumnMap, label: 'Phone Number',     required: false },
                { field: 'transportFee'  as keyof ColumnMap, label: 'Transport Fee',    required: false },
                { field: 'enumeratorFee' as keyof ColumnMap, label: 'Enumerator Fee',   required: false },
                { field: 'assignTo'      as keyof ColumnMap, label: 'Assign To',        required: false },
                { field: 'dueDate'       as keyof ColumnMap, label: 'Due Date',         required: false },
              ]
            ).map(({ field, label, required }) => (
              <div key={field} className="grid grid-cols-2 items-center gap-3">
                <Label className="text-xs text-right">
                  {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <Select
                  value={columnMap[field] || '__skip__'}
                  onValueChange={v => setColumnMap(m => ({ ...m, [field]: v === '__skip__' ? '' : v }))}
                >
                  <SelectTrigger className={`h-8 text-xs ${required && !columnMap[field] ? 'border-red-400' : ''}`}
                    data-testid={`mapper-select-${field}`}>
                    <SelectValue placeholder="(skip)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">(skip / not in file)</SelectItem>
                    {rawFileHeaders.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {rawFileHeaders.length > 0 && (
            <div className="text-xs text-muted-foreground bg-gray-50 dark:bg-gray-800/50 rounded p-2">
              <strong>Detected columns:</strong> {rawFileHeaders.join(', ')}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowColumnMapper(false)}>Cancel</Button>
            <Button size="sm" onClick={applyColumnMap}
              disabled={!columnMap.siteName || !columnMap.state}
              className="bg-teal-600 hover:bg-teal-700 text-white"
              data-testid="button-apply-column-map">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Apply Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={!!editEntry} onOpenChange={open => !open && setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ad-hoc Visit</DialogTitle>
            <DialogDescription className="text-xs">
              {editEntry?.site_name} · {editEntry?.state} › {editEntry?.locality}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Transport Fee (SDG)</Label>
              <Input type="number" min="0" className="h-8 text-xs"
                value={editForm.transport_fee ?? ''}
                onChange={e => setEditForm(f => ({ ...f, transport_fee: e.target.value ? Number(e.target.value) : undefined }))}
                data-testid="input-edit-transport-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Enumerator Fee (SDG)</Label>
              <Input type="number" min="0" className="h-8 text-xs"
                value={editForm.enumerator_fee ?? ''}
                onChange={e => setEditForm(f => ({ ...f, enumerator_fee: e.target.value ? Number(e.target.value) : undefined }))}
                data-testid="input-edit-enumerator-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone Number</Label>
              <Input className="h-8 text-xs"
                value={editForm.phone_number || ''}
                onChange={e => setEditForm(f => ({ ...f, phone_number: e.target.value }))}
                data-testid="input-edit-phone-number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input type="date" className="h-8 text-xs"
                value={editForm.visit_date || ''}
                onChange={e => setEditForm(f => ({ ...f, visit_date: e.target.value }))}
                data-testid="input-edit-due-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign To</Label>
              <Select value={editForm.preferred_assignee_id || '__open__'}
                onValueChange={v => setEditForm(f => ({ ...f, preferred_assignee_id: v === '__open__' ? undefined : v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-edit-assign-to">
                  <SelectValue placeholder="Open for claim" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__open__">Open for claim</SelectItem>
                  {collectors.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || c.username || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} data-testid="button-save-edit-adhoc">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RECALL CONFIRM DIALOG ── */}
      <Dialog open={!!recallEntry} onOpenChange={open => !open && setRecallEntry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recall Site Visit?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{recallEntry?.site_name}</strong> from the enumerators' available sites list immediately.
              They will no longer be able to see or claim this visit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecallEntry(null)} disabled={recalling}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRecall} disabled={recalling} data-testid="button-confirm-recall">
              {recalling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
              Recall Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
