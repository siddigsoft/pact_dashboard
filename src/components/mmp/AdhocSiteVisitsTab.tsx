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

interface AdhocRow {
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
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
  assigned_to?: string;
  assignedToName?: string;
  transport_fee?: number;
  enumerator_fee?: number;
  due_date?: string;
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

const FILTER_STATUSES = ['all', 'dispatched', 'assigned', 'claimed', 'completed'] as const;

const emptyRow = (): AdhocRow => ({
  siteName: '', siteCode: '', state: '', locality: '',
  transportFee: '', enumeratorFee: '', assignToId: '', assignToName: '', dueDate: '',
});

const validateRow = (row: AdhocRow): string[] => {
  const errors: string[] = [];
  if (!row.siteName.trim()) errors.push('Site Name required');
  if (!row.state.trim()) errors.push('State required');
  if (!row.locality.trim()) errors.push('Locality required');
  return errors;
};

const getOrCreateAdhocMMPFile = async (): Promise<string> => {
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const mmpId = `adhoc-tasks-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mmpName = `Ad-hoc Tasks — ${monthYear}`;

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
      type: 'adhoc',
      status: 'Approved',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
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

interface AdhocSiteVisitsTabProps {
  canManage: boolean;
}

export default function AdhocSiteVisitsTab({ canManage }: AdhocSiteVisitsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collectors
  const [collectors, setCollectors] = useState<DataCollector[]>([]);

  // Create mode
  const [createMode, setCreateMode] = useState<'upload' | 'manual'>('manual');

  // Upload sub-tab state
  const [uploadedRows, setUploadedRows] = useState<AdhocRow[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

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

  // Load existing adhoc entries
  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const { data: adhocFiles } = await supabase
        .from('mmp_files')
        .select('id')
        .eq('type', 'adhoc');

      if (!adhocFiles || adhocFiles.length === 0) {
        setExistingEntries([]);
        return;
      }

      const fileIds = adhocFiles.map(f => f.id);
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, assigned_to, transport_fee, enumerator_fee, due_date, created_at, dispatched_at')
        .in('mmp_file_id', fileIds)
        .order('created_at', { ascending: false });

      if (!entries) { setExistingEntries([]); return; }

      // Resolve enumerator names
      const assignedIds = [...new Set(entries.filter(e => e.assigned_to).map(e => e.assigned_to!))] as string[];
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
        status: e.status || 'dispatched',
        assignedToName: e.assigned_to ? (namesMap[e.assigned_to] || e.assigned_to) : undefined,
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

        const headers = raw[0].map(h => String(h).trim().toLowerCase());
        const get = (row: (string | number)[], ...keys: string[]) => {
          for (const k of keys) {
            const idx = headers.indexOf(k);
            if (idx >= 0 && row[idx] !== undefined && row[idx] !== '') return String(row[idx]).trim();
          }
          return '';
        };

        const parsed: AdhocRow[] = raw.slice(1).map(row => {
          const assignToName = get(row, 'assign to', 'assignto', 'enumerator');
          const matchedCollector = collectors.find(c =>
            (c.full_name || '').toLowerCase() === assignToName.toLowerCase() ||
            (c.email || '').toLowerCase() === assignToName.toLowerCase()
          );
          const r: AdhocRow = {
            siteName: get(row, 'site name', 'sitename', 'name'),
            siteCode: get(row, 'site code', 'sitecode', 'code'),
            state: get(row, 'state'),
            locality: get(row, 'locality'),
            transportFee: get(row, 'transport fee', 'transportfee', 'transport'),
            enumeratorFee: get(row, 'enumerator fee', 'enumeratorfee', 'fee'),
            assignToId: matchedCollector?.id || '',
            assignToName: assignToName || (matchedCollector ? (matchedCollector.full_name || '') : ''),
            dueDate: get(row, 'due date', 'duedate', 'due'),
          };
          r._errors = validateRow(r);
          return r;
        }).filter(r => r.siteName || r.state || r.locality);

        setUploadedRows(parsed);
      } catch (err) {
        toast({ title: 'Parse error', description: 'Could not read the file. Please use the template.', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
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
      ['Site Name', 'Site Code', 'State', 'Locality', 'Transport Fee', 'Enumerator Fee', 'Assign To', 'Due Date'],
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
    setSubmitting(true);
    try {
      const mmpFileId = await getOrCreateAdhocMMPFile();
      const now = new Date().toISOString();
      let assigned = 0, open = 0;

      const entries = validRows.map(row => {
        const hasAssignee = !!row.assignToId;
        if (hasAssignee) assigned++; else open++;
        return {
          mmp_file_id: mmpFileId,
          site_name: row.siteName.trim(),
          site_code: row.siteCode.trim() || null,
          state: row.state.trim(),
          locality: row.locality.trim(),
          transport_fee: row.transportFee ? Number(row.transportFee) : null,
          enumerator_fee: row.enumeratorFee ? Number(row.enumeratorFee) : null,
          assigned_to: row.assignToId || null,
          status: hasAssignee ? 'assigned' : 'dispatched',
          dispatched_at: now,
          due_date: row.dueDate || null,
        };
      });

      const { error } = await supabase.from('mmp_site_entries').insert(entries);
      if (error) throw error;

      toast({
        title: `${validRows.length} site visit${validRows.length !== 1 ? 's' : ''} created`,
        description: `${assigned} pre-assigned · ${open} open for claim`,
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
      assigned_to: entry.assigned_to,
      due_date: entry.due_date,
    });
    setCollectorSearch(entry.assignedToName || '');
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      const hasAssignee = !!editForm.assigned_to;
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          transport_fee: editForm.transport_fee ?? null,
          enumerator_fee: editForm.enumerator_fee ?? null,
          assigned_to: editForm.assigned_to || null,
          due_date: editForm.due_date || null,
          status: hasAssignee ? 'assigned' : 'dispatched',
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
    return s === 'dispatched' || s === 'assigned';
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
                    <Label className="text-xs">Locality *</Label>
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
                            {['Site Name', 'Code', 'State', 'Locality', 'Transport', 'Enum. Fee', 'Assign To', 'Due Date', ''].map(h => (
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
                                <span className={row._errors?.includes('Locality required') ? 'text-red-500' : ''}>
                                  {row.locality || <span className="text-red-400 italic">required</span>}
                                </span>
                              </td>
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
                    {['Site Name', 'State', 'Locality', 'Status', 'Assigned To', 'Transport', 'Enum. Fee', 'Due Date', 'Created', ''].map(h => (
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
                        <td className="px-2 py-2 text-muted-foreground">{entry.due_date || '—'}</td>
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
              <Label className="text-xs">Due Date</Label>
              <Input type="date" className="h-8 text-xs"
                value={editForm.due_date || ''}
                onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                data-testid="input-edit-due-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign To</Label>
              <Select value={editForm.assigned_to || '__open__'}
                onValueChange={v => setEditForm(f => ({ ...f, assigned_to: v === '__open__' ? undefined : v }))}>
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
