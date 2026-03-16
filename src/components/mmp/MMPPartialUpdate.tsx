import React, { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, Upload, Trash2, RefreshCw, CheckCircle, XCircle, FileText,
  MapPin, Building2, Filter, Download, Eye, ArrowRight, Info, Loader2, Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { parseAndCountEntries } from '@/utils/mmpFileUpload';
import { getExcelSheetInfo, ExcelSheetInfo } from '@/utils/csvValidator';
import { sudanStates } from '@/data/sudanStates';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface MMPPartialUpdateProps {
  mmpFile: any;
  onComplete: () => void;
}

type UpdateAction = 'delete' | 'replace' | 'add';

const MMPPartialUpdate: React.FC<MMPPartialUpdateProps> = ({ mmpFile, onComplete }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedHub, setSelectedHub] = useState<string>('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedLocality, setSelectedLocality] = useState<string>('');
  const [action, setAction] = useState<UpdateAction>('replace');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sheetInfoList, setSheetInfoList] = useState<ExcelSheetInfo[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string; deletedCount?: number; addedCount?: number } | null>(null);

  const siteEntries = mmpFile?.siteEntries || [];

  const hubGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    siteEntries.forEach((entry: any) => {
      const hub = entry.hub_office || entry.hubOffice || entry.additionalData?.['Hub Office'] || '';
      if (hub) {
        groups[hub] = (groups[hub] || 0) + 1;
      }
    });
    return groups;
  }, [siteEntries]);

  const hubs = useMemo(() => Object.keys(hubGroups).sort(), [hubGroups]);

  const filteredByHub = useMemo(() => {
    if (!selectedHub) return siteEntries;
    return siteEntries.filter((entry: any) => {
      const hub = entry.hub_office || entry.hubOffice || entry.additionalData?.['Hub Office'] || '';
      return hub === selectedHub;
    });
  }, [siteEntries, selectedHub]);

  const stateGroups = useMemo(() => {
    const groups: Record<string, { count: number; localities: Record<string, number> }> = {};
    filteredByHub.forEach((entry: any) => {
      const state = entry.state || entry.additionalData?.State || 'Unknown';
      const locality = entry.locality || entry.additionalData?.Locality || 'Unknown';
      if (!groups[state]) groups[state] = { count: 0, localities: {} };
      groups[state].count++;
      groups[state].localities[locality] = (groups[state].localities[locality] || 0) + 1;
    });
    return groups;
  }, [filteredByHub]);

  const states = useMemo(() => Object.keys(stateGroups).sort(), [stateGroups]);

  const newStates = useMemo(() => {
    const existingSet = new Set(states.map(s => s.toLowerCase()));
    return sudanStates
      .filter(s => !existingSet.has(s.name.toLowerCase()))
      .map(s => s.name)
      .sort();
  }, [states]);

  const hasNewStates = useMemo(() => {
    return selectedStates.some(s => !stateGroups[s]);
  }, [selectedStates, stateGroups]);

  const localities = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const allLocalities: Record<string, number> = {};
    selectedStates.forEach(st => {
      if (stateGroups[st]) {
        Object.entries(stateGroups[st].localities).forEach(([loc, count]) => {
          allLocalities[loc] = (allLocalities[loc] || 0) + count;
        });
      }
    });
    return Object.keys(allLocalities).sort();
  }, [selectedStates, stateGroups]);

  const localityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedStates.forEach(st => {
      if (stateGroups[st]) {
        Object.entries(stateGroups[st].localities).forEach(([loc, count]) => {
          counts[loc] = (counts[loc] || 0) + count;
        });
      }
    });
    return counts;
  }, [selectedStates, stateGroups]);

  const newLocalities = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const allNew: string[] = [];
    const existingSet = new Set(localities.map(l => l.toLowerCase()));
    selectedStates.forEach(st => {
      const sudanState = sudanStates.find(s => s.name.toLowerCase() === st.toLowerCase());
      if (sudanState) {
        sudanState.localities.forEach(l => {
          if (!existingSet.has(l.name.toLowerCase()) && !allNew.includes(l.name)) {
            allNew.push(l.name);
          }
        });
      }
    });
    return allNew.sort();
  }, [selectedStates, localities]);

  const affectedCount = useMemo(() => {
    if (selectedStates.length === 0) return 0;
    if (selectedLocality) {
      return selectedStates.reduce((sum, st) => sum + (stateGroups[st]?.localities[selectedLocality] || 0), 0);
    }
    return selectedStates.reduce((sum, st) => sum + (stateGroups[st]?.count || 0), 0);
  }, [selectedStates, selectedLocality, stateGroups]);

  const affectedEntries = useMemo(() => {
    return siteEntries.filter((e: any) => {
      if (selectedHub) {
        const hub = e.hub_office || e.hubOffice || e.additionalData?.['Hub Office'] || '';
        if (hub !== selectedHub) return false;
      }
      const state = e.state || e.additionalData?.State || 'Unknown';
      const locality = e.locality || e.additionalData?.Locality || 'Unknown';
      if (selectedStates.length > 0 && !selectedStates.includes(state)) return false;
      if (selectedLocality && locality !== selectedLocality) return false;
      return true;
    });
  }, [siteEntries, selectedHub, selectedStates, selectedLocality]);

  const statesLabel = useMemo(() => {
    if (selectedStates.length === 0) return '';
    if (selectedStates.length === 1) return selectedStates[0];
    if (selectedStates.length <= 3) return selectedStates.join(', ');
    return `${selectedStates.slice(0, 2).join(', ')} +${selectedStates.length - 2} more`;
  }, [selectedStates]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setParsedEntries([]);
    setParseErrors([]);
    setParseWarnings([]);
    setShowPreview(false);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      try {
        setProcessing(true);
        setProgressStage('Reading Excel file sheets...');
        setProgress(10);

        const sheets = await getExcelSheetInfo(file);
        setSheetInfoList(sheets);

        if (sheets.length > 1) {
          setSelectedSheets([sheets[sheets.length - 1].name]);
          setShowSheetSelector(true);
          setProcessing(false);
          setProgress(0);
          return;
        } else if (sheets.length === 1) {
          setSelectedSheets([sheets[0].name]);
          await parseSelectedSheets(file, [sheets[0].name]);
        }
      } catch (err) {
        toast({ title: 'File Error', description: err instanceof Error ? err.message : 'Failed to read Excel file', variant: 'destructive' });
        setProcessing(false);
      }
    } else {
      await parseSelectedSheets(file, []);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseSelectedSheets = async (file: File, sheets: string[]) => {
    try {
      setProcessing(true);
      setShowSheetSelector(false);
      setProgress(20);
      setProgressStage('Parsing file...');

      let allEntries: any[] = [];
      let allErrors: string[] = [];
      let allWarnings: string[] = [];

      if (sheets.length <= 1) {
        const result = await parseAndCountEntries(file, sheets[0] || undefined);
        allEntries = result.entries;
        allErrors = result.errors;
        allWarnings = result.warnings;
      } else {
        for (let i = 0; i < sheets.length; i++) {
          setProgressStage(`Parsing sheet "${sheets[i]}" (${i + 1}/${sheets.length})...`);
          setProgress(20 + Math.round((i / sheets.length) * 50));

          const result = await parseAndCountEntries(file, sheets[i]);
          allEntries.push(...result.entries);
          if (result.errors.length > 0) {
            allErrors.push(...result.errors.map(e => `[${sheets[i]}] ${e}`));
          }
          if (result.warnings.length > 0) {
            allWarnings.push(...result.warnings.map(w => `[${sheets[i]}] ${w}`));
          }
        }
      }

      setProgress(80);
      setProgressStage('Validating entries...');

      setParseErrors(allErrors);

      const scopeWarnings = [...allWarnings];

      const mismatchedEntries = allEntries.filter((e: any) => {
        const entryState = (e.state || '').trim();
        if (entryState && selectedStates.length > 0 && !selectedStates.includes(entryState)) return true;
        if (selectedLocality) {
          const entryLocality = (e.locality || '').trim();
          if (entryLocality && entryLocality !== selectedLocality) return true;
        }
        return false;
      });

      if (mismatchedEntries.length > 0) {
        scopeWarnings.push(
          `${mismatchedEntries.length} entries have a different state/locality than selected (${statesLabel}${selectedLocality ? '/' + selectedLocality : ''}). Their state/locality will be set to match your selection.`
        );
      }

      const defaultState = selectedStates.length === 1 ? selectedStates[0] : '';
      const normalizedEntries = allEntries.map((e: any) => ({
        ...e,
        state: e.state || defaultState,
        locality: e.locality || selectedLocality || e.locality,
      }));

      setParseWarnings(scopeWarnings);
      setParsedEntries(normalizedEntries);
      setShowPreview(true);
      setProgress(100);
      setProgressStage(`Ready for review - ${normalizedEntries.length} entries from ${sheets.length || 1} sheet(s)`);
    } catch (err) {
      toast({ title: 'File Error', description: err instanceof Error ? err.message : 'Failed to parse the file', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleExecute = async () => {
    setShowConfirmDialog(false);
    setProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      const session = await ensureValidSession();
      if (!session.success) { setProcessing(false); return; }

      const mmpId = mmpFile.id;
      let deletedCount = 0;
      let addedCount = 0;

      if (action === 'delete' || action === 'replace') {
        setProgressStage('Counting existing sites for selected area...');
        setProgress(5);

        let totalPreDelete = 0;
        for (const st of selectedStates) {
          let countQuery = supabase
            .from('mmp_site_entries')
            .select('id', { count: 'exact', head: true })
            .eq('mmp_file_id', mmpId)
            .eq('state', st);
          if (selectedHub) countQuery = countQuery.eq('hub_office', selectedHub);
          if (selectedLocality) countQuery = countQuery.eq('locality', selectedLocality);
          const { count } = await countQuery;
          totalPreDelete += count ?? 0;
        }

        setProgressStage('Removing existing sites for selected area...');
        setProgress(10);

        for (const st of selectedStates) {
          let deleteQuery = supabase
            .from('mmp_site_entries')
            .delete()
            .eq('mmp_file_id', mmpId)
            .eq('state', st);
          if (selectedHub) deleteQuery = deleteQuery.eq('hub_office', selectedHub);
          if (selectedLocality) deleteQuery = deleteQuery.eq('locality', selectedLocality);

          const { error: delError } = await deleteQuery;
          if (delError) {
            throw new Error(`Failed to delete entries for ${st}: ${delError.message}`);
          }
        }

        deletedCount = totalPreDelete || affectedCount;
        setProgress(40);
      }

      if (action === 'replace' || action === 'add') {
        if (parsedEntries.length > 0) {
          setProgressStage('Adding new site entries...');
          setProgress(50);

          const toBool = (v: any) => {
            if (typeof v === 'boolean') return v;
            const s = String(v ?? '').toLowerCase();
            return s === 'yes' || s === 'true' || s === '1';
          };

          const defaultState = selectedStates.length === 1 ? selectedStates[0] : null;
          const rows = parsedEntries.map((e: any) => ({
            mmp_file_id: mmpId,
            site_code: e.siteCode || null,
            hub_office: e.hubOffice || null,
            state: e.state || defaultState || null,
            locality: e.locality || selectedLocality || null,
            site_name: e.siteName || null,
            cp_name: e.cpName || null,
            visit_type: e.visitType || null,
            visit_date: e.visitDate || null,
            main_activity: e.mainActivity || null,
            activity_at_site: e.siteActivity || null,
            monitoring_by: e.monitoringBy || null,
            survey_tool: e.surveyTool || null,
            use_market_diversion: toBool(e.useMarketDiversion),
            use_warehouse_monitoring: toBool(e.useWarehouseMonitoring),
            comments: e.comments || null,
            additional_data: e.additionalData || {},
            status: 'Pending',
          }));

          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase.from('mmp_site_entries').insert(batch);
            if (error) {
              throw new Error(`Failed to insert entries (batch ${Math.floor(i / batchSize) + 1}): ${error.message}`);
            }
            setProgress(50 + Math.round((i / rows.length) * 30));
          }

          addedCount = rows.length;
        }
      }

      setProgressStage('Updating MMP record...');
      setProgress(85);

      const { count: newCount } = await supabase
        .from('mmp_site_entries')
        .select('id', { count: 'exact', head: true })
        .eq('mmp_file_id', mmpId);

      const newTotalEntries = newCount ?? (siteEntries.length - deletedCount + addedCount);

      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const historyEntry = {
        action: action === 'delete' ? 'partial_delete' : action === 'replace' ? 'partial_replace' : 'partial_add',
        hub: selectedHub || 'All hubs',
        states: selectedStates,
        locality: selectedLocality || 'All localities',
        deletedCount,
        addedCount,
        performedBy: user?.id || 'Unknown',
        performedAt: now,
      };

      const existingHistory = mmpFile.modificationHistory || [];
      await supabase
        .from('mmp_files')
        .update({
          entries: newTotalEntries,
          modified_at: now,
          modification_history: [...existingHistory, historyEntry],
        })
        .eq('id', mmpId);

      setProgress(100);
      setProgressStage('Complete!');

      const actionLabel = action === 'delete' ? 'Deleted' : action === 'replace' ? 'Replaced' : 'Added';
      const scopeParts = [selectedLocality, statesLabel, selectedHub ? `(${selectedHub})` : ''].filter(Boolean);
      const scopeLabel = scopeParts.join(', ');

      setResult({
        success: true,
        message: `${actionLabel} sites for ${scopeLabel}. Removed ${deletedCount} entries${addedCount > 0 ? `, added ${addedCount} new entries` : ''}.`,
        deletedCount,
        addedCount,
      });

      toast({
        title: 'Partial Update Complete / تم التحديث الجزئي',
        description: `${actionLabel} ${deletedCount + addedCount} site entries for ${scopeLabel}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred';
      setResult({ success: false, message: msg });
      toast({
        title: 'Update Failed / فشل التحديث',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleFinish = () => {
    setResult(null);
    setParsedEntries([]);
    setShowPreview(false);
    setSelectedHub('');
    setSelectedStates([]);
    setSelectedLocality('');
    onComplete();
  };

  const canProceed = selectedStates.length > 0 && (action === 'delete' || parsedEntries.length > 0);

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Partial MMP Update / تحديث جزئي للخطة</AlertTitle>
        <AlertDescription>
          Update or correct sites for a specific state or locality without affecting other areas.
          You can delete existing sites, replace them with new data, or add additional sites.
          <br />
          <span className="text-muted-foreground text-xs">
            تحديث أو تصحيح المواقع لولاية أو محلية محددة دون التأثير على المناطق الأخرى.
          </span>
        </AlertDescription>
      </Alert>

      {result ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              {result.success ? (
                <CheckCircle className="h-16 w-16 text-green-500" />
              ) : (
                <XCircle className="h-16 w-16 text-red-500" />
              )}
              <h3 className="text-lg font-semibold">
                {result.success ? 'Update Successful / تم التحديث بنجاح' : 'Update Failed / فشل التحديث'}
              </h3>
              <p className="text-muted-foreground text-center max-w-md">{result.message}</p>
              {result.success && (
                <div className="flex gap-4 text-sm">
                  {result.deletedCount !== undefined && result.deletedCount > 0 && (
                    <Badge variant="destructive" data-testid="badge-deleted-count">{result.deletedCount} removed</Badge>
                  )}
                  {result.addedCount !== undefined && result.addedCount > 0 && (
                    <Badge variant="default" className="bg-green-600" data-testid="badge-added-count">{result.addedCount} added</Badge>
                  )}
                </div>
              )}
              <Button onClick={handleFinish} data-testid="button-finish-update">
                <RefreshCw className="h-4 w-4 mr-2" />
                Done - Refresh MMP / تم - تحديث الخطة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />
                Step 1: Select Area to Update / الخطوة 1: اختر المنطقة
              </CardTitle>
              <CardDescription>
                Choose the hub, state, and optionally a specific locality to update.
                <span className="text-xs text-muted-foreground block">اختر المحور والولاية واختياريًا المحلية المحددة للتحديث.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Hub / المحور</label>
                  <Select value={selectedHub} onValueChange={(v) => { setSelectedHub(v === '__all__' ? '' : v); setSelectedStates([]); setSelectedLocality(''); setParsedEntries([]); setShowPreview(false); }}>
                    <SelectTrigger data-testid="select-hub">
                      <SelectValue placeholder="All hubs..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Hubs / كل المحاور</SelectItem>
                      {hubs.map(hub => (
                        <SelectItem key={hub} value={hub}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{hub}</span>
                            <Badge variant="secondary" className="text-xs">{hubGroups[hub]} sites</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">State(s) / الولاية *</label>
                  <div className="relative" data-testid="select-state">
                    <button
                      type="button"
                      onClick={() => setStateDropdownOpen(!stateDropdownOpen)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <span className={selectedStates.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                        {selectedStates.length === 0 ? 'Select state(s)...' : statesLabel}
                      </span>
                      <span className="flex items-center gap-1">
                        {selectedStates.length > 0 && (
                          <Badge variant="secondary" className="text-xs h-5 px-1.5">{selectedStates.length}</Badge>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6"/></svg>
                      </span>
                    </button>
                    {stateDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                        <div className="p-1">
                          {states.length > 1 && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                              onClick={() => {
                                if (selectedStates.length === states.length) {
                                  setSelectedStates([]);
                                } else {
                                  setSelectedStates([...states]);
                                }
                                setSelectedLocality('');
                                setParsedEntries([]);
                                setShowPreview(false);
                              }}
                            >
                              <Checkbox checked={selectedStates.length === states.length && states.length > 0} />
                              <span className="font-medium">Select All / اختر الكل</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{states.reduce((s, st) => s + (stateGroups[st]?.count || 0), 0)}</Badge>
                            </button>
                          )}
                          <Separator className="my-1" />
                          {states.map(state => (
                            <button
                              key={state}
                              type="button"
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                              onClick={() => {
                                const next = selectedStates.includes(state)
                                  ? selectedStates.filter(s => s !== state)
                                  : [...selectedStates, state];
                                setSelectedStates(next);
                                setSelectedLocality('');
                                setParsedEntries([]);
                                setShowPreview(false);
                                if (next.length > 0 && next.every(s => !stateGroups[s])) setAction('add');
                              }}
                            >
                              <Checkbox checked={selectedStates.includes(state)} />
                              <span>{state}</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{stateGroups[state].count} sites</Badge>
                            </button>
                          ))}
                          {newStates.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                                Add New State / إضافة ولاية جديدة
                              </div>
                              {newStates.map(state => (
                                <button
                                  key={`new-${state}`}
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                                  onClick={() => {
                                    const next = selectedStates.includes(state)
                                      ? selectedStates.filter(s => s !== state)
                                      : [...selectedStates, state];
                                    setSelectedStates(next);
                                    setSelectedLocality('');
                                    setParsedEntries([]);
                                    setShowPreview(false);
                                    setAction('add');
                                  }}
                                >
                                  <Checkbox checked={selectedStates.includes(state)} />
                                  <span>{state}</span>
                                  <Badge variant="outline" className="ml-auto text-xs text-green-600 border-green-300">New</Badge>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                        <div className="border-t p-1.5 flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setStateDropdownOpen(false)} className="h-7 text-xs">
                            Done
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Locality / المحلية (Optional)</label>
                  <Select value={selectedLocality} onValueChange={(v) => setSelectedLocality(v === '__all__' ? '' : v)} disabled={selectedStates.length === 0}>
                    <SelectTrigger data-testid="select-locality">
                      <SelectValue placeholder={selectedStates.length > 0 ? "All localities" : "Select state first..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {!hasNewStates && <SelectItem value="__all__">All Localities / كل المحليات</SelectItem>}
                      {localities.map(loc => (
                        <SelectItem key={loc} value={loc}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{loc}</span>
                            <Badge variant="secondary" className="text-xs">{localityCounts[loc] || 0}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                      {newLocalities.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                            New Localities / محليات جديدة
                          </div>
                          {newLocalities.map(loc => (
                            <SelectItem key={`new-${loc}`} value={loc}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <span>{loc}</span>
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">New</Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedStates.length > 0 && !hasNewStates && (
                <Alert variant="default" className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong>{affectedCount} site(s)</strong> currently exist for{' '}
                    <strong>{selectedLocality && selectedLocality.trim() ? `${selectedLocality}, ` : ''}{statesLabel}{selectedHub ? ` (${selectedHub})` : ''}</strong> in this MMP.
                    <span className="text-xs text-muted-foreground block mt-1">
                      {affectedCount} موقع(مواقع) موجودة حاليًا في هذه الخطة لهذه المنطقة.
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {selectedStates.length > 0 && hasNewStates && (
                <Alert variant="default" className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                  <MapPin className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <strong>{statesLabel}</strong> includes new state(s) not yet in this MMP. Upload a CSV file to add sites.
                    <span className="text-xs text-muted-foreground block mt-1">
                      يتضمن ولاية جديدة غير موجودة في هذه الخطة. ارفع ملف CSV لإضافة مواقع.
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {selectedStates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Step 2: Choose Action / الخطوة 2: اختر الإجراء
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button
                    variant={action === 'replace' ? 'default' : 'outline'}
                    onClick={() => { setAction('replace'); setParsedEntries([]); setShowPreview(false); }}
                    className="flex flex-col items-start h-auto p-4 gap-1"
                    disabled={hasNewStates}
                    data-testid="button-action-replace"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <RefreshCw className="h-4 w-4" /> Replace / استبدال
                    </div>
                    <span className="text-xs font-normal text-left opacity-80">
                      Delete existing sites and upload corrected data
                    </span>
                  </Button>

                  <Button
                    variant={action === 'delete' ? 'destructive' : 'outline'}
                    onClick={() => { setAction('delete'); setParsedEntries([]); setShowPreview(false); }}
                    className="flex flex-col items-start h-auto p-4 gap-1"
                    disabled={hasNewStates}
                    data-testid="button-action-delete"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Trash2 className="h-4 w-4" /> Delete Only / حذف فقط
                    </div>
                    <span className="text-xs font-normal text-left opacity-80">
                      Remove all sites for this area
                    </span>
                  </Button>

                  <Button
                    variant={action === 'add' ? 'default' : 'outline'}
                    onClick={() => { setAction('add'); setParsedEntries([]); setShowPreview(false); }}
                    className="flex flex-col items-start h-auto p-4 gap-1"
                    data-testid="button-action-add"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Upload className="h-4 w-4" /> Add More / إضافة
                    </div>
                    <span className="text-xs font-normal text-left opacity-80">
                      Keep existing sites and add new ones
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedStates.length > 0 && action !== 'delete' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  Step 3: Upload Updated File / الخطوة 3: رفع الملف المحدث
                </CardTitle>
                <CardDescription>
                  Upload a CSV file with the corrected site entries for the selected area.
                  <span className="text-xs text-muted-foreground block">ارفع ملف CSV بإدخالات المواقع المصححة للمنطقة المحددة.</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                  data-testid="dropzone-upload"
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Click to upload CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .csv and .xlsx files</p>
                </div>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                    data-testid="button-choose-file"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File / اختر ملف
                  </Button>
                </div>

                {showSheetSelector && sheetInfoList.length > 1 && (
                  <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Select Sheet(s) / اختر الأوراق
                      </CardTitle>
                      <CardDescription className="text-xs">
                        This Excel file has {sheetInfoList.length} sheets. Choose which to import.
                        <span className="block text-muted-foreground">هذا الملف يحتوي على {sheetInfoList.length} أوراق. اختر أيها للاستيراد.</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        {sheetInfoList.map((sheet) => (
                          <div
                            key={sheet.name}
                            className={`flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                              selectedSheets.includes(sheet.name)
                                ? 'border-blue-400 bg-blue-100/50 dark:bg-blue-900/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                            onClick={() => {
                              setSelectedSheets(prev =>
                                prev.includes(sheet.name)
                                  ? prev.filter(s => s !== sheet.name)
                                  : [...prev, sheet.name]
                              );
                            }}
                            data-testid={`sheet-option-${sheet.name}`}
                          >
                            <Checkbox
                              checked={selectedSheets.includes(sheet.name)}
                              onCheckedChange={(checked) => {
                                setSelectedSheets(prev =>
                                  checked
                                    ? [...prev, sheet.name]
                                    : prev.filter(s => s !== sheet.name)
                                );
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{sheet.name}</p>
                              <p className="text-xs text-muted-foreground">
                                ~{sheet.rowCount} rows
                              </p>
                            </div>
                            <Badge variant={sheet.headerScore >= 5 ? 'default' : 'secondary'} className="text-xs">
                              {sheet.headerScore >= 5 ? 'Good match' : `${sheet.headerScore} headers`}
                            </Badge>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSheets(sheetInfoList.map(s => s.name))}
                            data-testid="button-select-all-sheets"
                          >
                            Select All / اختر الكل
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSheets([])}
                          >
                            Clear
                          </Button>
                        </div>
                        <Button
                          onClick={() => {
                            if (uploadedFile && selectedSheets.length > 0) {
                              parseSelectedSheets(uploadedFile, selectedSheets);
                            }
                          }}
                          disabled={selectedSheets.length === 0 || processing}
                          size="sm"
                          data-testid="button-parse-sheets"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Load {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''} / تحميل
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {processing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">{progressStage}</p>
                  </div>
                )}

                {parseErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Validation Errors</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                        {parseErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                        {parseErrors.length > 10 && <li>...and {parseErrors.length - 10} more errors</li>}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {parseWarnings.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-200">Warnings</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                        {parseWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                        {parseWarnings.length > 5 && <li>...and {parseWarnings.length - 5} more</li>}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {showPreview && parsedEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-4 w-4" />
                  Preview: {parsedEntries.length} New Entries / معاينة: {parsedEntries.length} إدخال جديد
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Site Name</TableHead>
                        <TableHead className="text-xs">Site Code</TableHead>
                        <TableHead className="text-xs">Hub</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs">Locality</TableHead>
                        <TableHead className="text-xs">CP Name</TableHead>
                        <TableHead className="text-xs">Visit Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedEntries.slice(0, 50).map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{entry.siteName || 'N/A'}</TableCell>
                          <TableCell className="text-xs">{entry.siteCode || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.hubOffice || selectedHub || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.state || (selectedStates.length === 1 ? selectedStates[0] : '-')}</TableCell>
                          <TableCell className="text-xs">{entry.locality || selectedLocality || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.cpName || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.visitDate || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {parsedEntries.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 50 of {parsedEntries.length} entries
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedStates.length > 0 && affectedCount > 0 && action === 'delete' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-4 w-4" />
                  Sites to be Deleted ({affectedCount}) / المواقع المراد حذفها
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Site Name</TableHead>
                        <TableHead className="text-xs">Site Code</TableHead>
                        <TableHead className="text-xs">Hub</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs">Locality</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {affectedEntries.slice(0, 50).map((entry: any, i: number) => (
                        <TableRow key={i} className="bg-red-50/50 dark:bg-red-950/20">
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{entry.siteName || entry.site_name || 'N/A'}</TableCell>
                          <TableCell className="text-xs">{entry.siteCode || entry.site_code || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.hub_office || entry.hubOffice || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.state || '-'}</TableCell>
                          <TableCell className="text-xs">{entry.locality || '-'}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-xs">{entry.status || 'Pending'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {affectedEntries.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 50 of {affectedEntries.length} entries
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {action === 'delete' && selectedStates.length > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  <Trash2 className="h-3 w-3 inline mr-1" />
                  Will delete {affectedCount} site(s) from {selectedLocality && selectedLocality.trim() ? `${selectedLocality}, ` : ''}{statesLabel}{selectedHub ? ` (${selectedHub})` : ''}
                </span>
              )}
              {action === 'replace' && selectedStates.length > 0 && parsedEntries.length > 0 && (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  <RefreshCw className="h-3 w-3 inline mr-1" />
                  Will replace {affectedCount} site(s) with {parsedEntries.length} new entries
                </span>
              )}
              {action === 'add' && parsedEntries.length > 0 && (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  <Upload className="h-3 w-3 inline mr-1" />
                  Will add {parsedEntries.length} site(s) to existing {affectedCount}
                </span>
              )}
            </div>

            <Button
              onClick={() => setShowConfirmDialog(true)}
              disabled={!canProceed || processing}
              className={action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
              data-testid="button-execute-update"
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><ArrowRight className="h-4 w-4 mr-2" /> Execute Update / تنفيذ التحديث</>
              )}
            </Button>
          </div>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{progressStage}</p>
            </div>
          )}
        </>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Confirm Partial Update / تأكيد التحديث الجزئي
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                You are about to{' '}
                <strong className={action === 'delete' ? 'text-red-600' : 'text-blue-600'}>
                  {action === 'delete' ? 'delete' : action === 'replace' ? 'replace' : 'add to'}
                </strong>{' '}
                sites for <strong>{selectedLocality && selectedLocality.trim() ? `${selectedLocality}, ` : ''}{statesLabel}{selectedHub ? ` (${selectedHub})` : ''}</strong> in MMP <strong>{mmpFile.name}</strong>.
              </p>

              <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                {(action === 'delete' || action === 'replace') && (
                  <p className="text-red-600">
                    <Trash2 className="h-3 w-3 inline mr-1" />
                    {affectedCount} existing site(s) will be removed
                  </p>
                )}
                {(action === 'replace' || action === 'add') && parsedEntries.length > 0 && (
                  <p className="text-green-600">
                    <Upload className="h-3 w-3 inline mr-1" />
                    {parsedEntries.length} new site(s) will be added
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Sites in other hubs/states/localities will NOT be affected.
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                This action will be recorded in the MMP modification history.
                <br />
                سيتم تسجيل هذا الإجراء في سجل تعديلات الخطة.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} data-testid="button-cancel-confirm">
              Cancel / إلغاء
            </Button>
            <Button
              onClick={handleExecute}
              className={action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
              data-testid="button-confirm-execute"
            >
              {action === 'delete' ? 'Delete Sites / حذف المواقع' : action === 'replace' ? 'Replace Sites / استبدال المواقع' : 'Add Sites / إضافة المواقع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MMPPartialUpdate;
