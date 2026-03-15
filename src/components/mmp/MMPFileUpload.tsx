import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { parseAndCountEntries, checkDuplicateSitesInMonth } from '@/utils/mmpFileUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface MMPFileUploadProps {
  existingMmp?: any;
}

export function MMPFileUpload({ existingMmp }: MMPFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedEntries, setParsedEntries] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [duplicatesResult, setDuplicatesResult] = useState<any | null>(null);
  const [duplicateNameSet, setDuplicateNameSet] = useState<Set<string>>(new Set());
  const [duplicateCodeSet, setDuplicateCodeSet] = useState<Set<string>>(new Set());
  const [viewFilter, setViewFilter] = useState<'all' | 'new' | 'existing'>('new');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [existingCollapsed, setExistingCollapsed] = useState<boolean>(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(existingMmp?.project_id || existingMmp?.projectId || '');
  const { uploadMMP } = useMMP();
  const { projects } = useProjectContext();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Reset previous parse state
      setParsedEntries([]);
      setParseErrors([]);
      setParseWarnings([]);
      setDuplicatesResult(null);
      setSelectedEntryIds(new Set());
      setUploadComplete(false);
      setUploadProgress(0);
      setError(null);
    }
  };

  // Parse file and run duplicate check when a file is selected
  React.useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    (async () => {
      try {
        setIsParsing(true);
        const { entries, count, errors, warnings } = await parseAndCountEntries(selectedFile);
        if (cancelled) return;
        setParsedEntries(entries || []);
        setParseErrors(errors || []);
        setParseWarnings(warnings || []);

        // Default selection: include non-duplicates; exclude duplicates if found
        const ids = new Set<string>();
        (entries || []).forEach((e: any) => ids.add(e.id || e.siteCode || JSON.stringify(e)));
        setSelectedEntryIds(ids);

        // If we have an existing MMP with a month, run duplicate check to identify entries already scheduled
        if (existingMmp && existingMmp.month) {
          const sitesForDuplicateCheck = (entries || []).map((e: any) => ({
            siteCode: e.siteCode,
            siteName: e.siteName,
            state: e.state,
            locality: e.locality,
          }));

          const dupRes = await checkDuplicateSitesInMonth(sitesForDuplicateCheck, existingMmp.month, existingMmp.project_id || existingMmp.projectId);
          if (cancelled) return;
          setDuplicatesResult(dupRes);

          // Remove duplicates from default selection (user can re-enable)
          if (dupRes.hasDuplicates) {
              const duplicateNames = new Set(dupRes.duplicateSites.map((d: any) => (d.siteName || '').toLowerCase()));
              const duplicateCodes = new Set(dupRes.duplicateSites.map((d: any) => (d.siteCode || '').toLowerCase()));
            const newSet = new Set<string>();
            (entries || []).forEach((e: any) => {
              const name = (e.siteName || '').toLowerCase();
              if (!duplicateNames.has(name)) newSet.add(e.id || e.siteCode || JSON.stringify(e));
            });
            setSelectedEntryIds(newSet);
              setDuplicateNameSet(duplicateNames);
              setDuplicateCodeSet(duplicateCodes);
          }
        }
      } catch (err) {
        console.error('Parsing error:', err);
        setParseErrors([err instanceof Error ? err.message : String(err)]);
      } finally {
        setIsParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFile, existingMmp]);

  const simulateProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 5;
      });
    }, 300);
    return interval;
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError(null);
    const progressInterval = simulateProgress();

    try {
      console.log('Starting upload for file:', selectedFile.name);
      
      const metadata: any = { projectId: selectedProjectId };
      if (existingMmp) {
        // Attach to the existing MMP instead of creating a new one
        metadata.targetMmpId = existingMmp.id;
        metadata.hub = existingMmp.hub || existingMmp.hub_office || existingMmp.hubOffice;
        metadata.name = `${existingMmp.name}-update-${Date.now()}`;
      }

      // If user filtered entries, create a temporary CSV containing only selected entries
      let fileToUpload: File = selectedFile;
      try {
        if (parsedEntries.length > 0 && selectedEntryIds.size > 0 && selectedEntryIds.size < parsedEntries.length) {
          // Build CSV from selected entries
          const headers = [
            'siteCode','siteName','state','locality','hubOffice','cpName','mainActivity','visitType','visitDate','siteActivity','monitoringBy','surveyTool','useMarketDiversion','useWarehouseMonitoring','comments'
          ];
          const escape = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
          const rows = [headers.join(',')];
          parsedEntries.forEach((e: any) => {
            const key = e.id || e.siteCode || JSON.stringify(e);
            if (!selectedEntryIds.has(key)) return;
            const row = [
              e.siteCode, e.siteName, e.state, e.locality, e.hubOffice, e.cpName, e.mainActivity, e.visitType, e.visitDate, e.siteActivity, e.monitoringBy, e.surveyTool, e.useMarketDiversion, e.useWarehouseMonitoring, e.comments
            ].map(escape).join(',');
            rows.push(row);
          });
          const csv = rows.join('\n');
          fileToUpload = new File([csv], `filtered_${selectedFile.name.replace(/\s+/g,'_')}.csv`, { type: 'text/csv' });
        }
      } catch (e) {
        console.warn('Failed to build filtered CSV, falling back to original file', e);
      }

      const result = await uploadMMP(fileToUpload, metadata);
      
      clearInterval(progressInterval);
      
      if (result) {
        setUploadProgress(100);
        setUploadComplete(true);
        toast.success('File uploaded successfully');
        
        setTimeout(() => {
          setSelectedFile(null);
          setSelectedProjectId('');
          const fileInput = document.getElementById('mmp-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          
          navigate('/mmp');
        }, 2000);
      } else {
        setUploadProgress(0);
        setError('Upload failed - please try again');
        toast.error('Upload failed');
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      toast.error(`Upload error: ${errorMessage}`);
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleEntrySelection = (entry: any) => {
    const key = entry.id || entry.siteCode || JSON.stringify(entry);
    const next = new Set(selectedEntryIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedEntryIds(next);
  };

  const isEntryDuplicate = (entry: any) => {
    const name = (entry.siteName || '').toLowerCase();
    const code = (entry.siteCode || '').toLowerCase();
    return duplicateNameSet.has(name) || duplicateCodeSet.has(code);
  };

  const filteredEntries = parsedEntries.filter((entry) => {
    const dup = isEntryDuplicate(entry);
    if (viewFilter === 'new' && dup) return false;
    if (viewFilter === 'existing' && !dup) return false;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = [entry.siteName, entry.siteCode, entry.state, entry.locality].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  const selectVisible = (select: boolean) => {
    const next = new Set(selectedEntryIds);
    filteredEntries.forEach((entry) => {
      const key = entry.id || entry.siteCode || JSON.stringify(entry);
      if (select) next.add(key);
      else next.delete(key);
    });
    setSelectedEntryIds(next);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between w-full">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Upload MMP File
            </CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{existingMmp ? (existingMmp.project_name || existingMmp.projectName || existingMmp.project_id || existingMmp.projectId) : (projects.find(p => p.id === selectedProjectId)?.name ?? 'No project selected')}</span>
              {existingMmp?.month && <span className="ml-3 inline-block bg-slate-100 text-xs px-2 py-0.5 rounded">{existingMmp.month}</span>}
            </div>
          </div>
          {/* header actions removed — use footer Upload button only */}
        </div>
      </CardHeader>
      <CardContent>
          <div className="space-y-3">
          <div className="space-y-2">
            <Label>Project</Label>
            {existingMmp ? (
              <div className="text-sm">{existingMmp.project_name || existingMmp.projectName || existingMmp.project_id || existingMmp.projectId}</div>
            ) : (
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={isUploading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Input
              id="mmp-file"
              type="file"
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls"
              className="flex-grow"
              disabled={isUploading}
            />
          </div>
          
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              Selected file: <span className="font-medium">{selectedFile.name}</span> ({(selectedFile.size / 1024).toFixed(1)} KB)
            </div>
          )}

          {/* Parsing / Preview UI */}
          {selectedFile && (
            <div className="mt-2 space-y-2 text-sm">
              {isParsing ? (
                <div className="text-muted-foreground">Parsing file and validating...</div>
              ) : (
                <>
                  {parseErrors.length > 0 && (
                    <div className="text-red-700 bg-red-50 p-2 rounded">
                      <div className="font-semibold">Validation errors ({parseErrors.length})</div>
                      <ul className="list-disc ml-5 mt-1">
                        {parseErrors.slice(0, 5).map((e, idx) => <li key={idx}>{e}</li>)}
                      </ul>
                      {parseErrors.length > 5 && <div className="text-xs">And {parseErrors.length - 5} more...</div>}
                    </div>
                  )}

                  {parseWarnings.length > 0 && (
                    <div className="text-yellow-800 bg-yellow-50 p-2 rounded">
                      <div className="font-medium">Warnings ({parseWarnings.length})</div>
                      <div className="text-xs">These are non-blocking; upload may proceed.</div>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm">Rows parsed: <span className="font-medium">{parsedEntries.length}</span></div>
                      <div className="text-sm">New: <span className="font-medium">{parsedEntries.length - (duplicatesResult?.duplicateSites?.length || 0)}</span></div>
                      <div className="text-sm">Existing: <span className="font-medium">{duplicatesResult?.duplicateSites?.length || 0}</span></div>
                      {parseWarnings.length > 0 && <div className="text-sm text-yellow-700">Warnings: <span className="font-medium">{parseWarnings.length}</span></div>}
                    </div>
                    {duplicatesResult && duplicatesResult.hasDuplicates && (
                      <div className="text-xs text-red-600">Found {duplicatesResult.duplicateSites.length} site(s) already scheduled this month.</div>
                    )}
                  </div>

                  {/* Preview list (first 10) with checkboxes to include/exclude rows */}
                  {parsedEntries.length > 0 && (
                    <div className="mt-2 border rounded p-2 bg-white">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-xs text-muted-foreground">Preview</div>
                          <div className="text-xs">Rows: <span className="font-medium">{parsedEntries.length}</span></div>
                          <div className="text-xs">Existing: <span className="font-medium">{duplicatesResult?.duplicateSites?.length || 0}</span></div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <input aria-label="Search entries" placeholder="Search" className="text-xs border rounded px-2 py-1 w-full md:w-auto" value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
                          <div className="text-xs hidden sm:inline">Filter:</div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewFilter('new')} className={`px-2 py-1 text-xs rounded ${viewFilter==='new'?'bg-slate-100':'bg-white'}`}>New</button>
                            <button onClick={() => setViewFilter('existing')} className={`px-2 py-1 text-xs rounded ${viewFilter==='existing'?'bg-slate-100':'bg-white'}`}>Existing</button>
                            <button onClick={() => setViewFilter('all')} className={`px-2 py-1 text-xs rounded ${viewFilter==='all'?'bg-slate-100':'bg-white'}`}>All</button>
                          </div>

                          <div className="ml-0 md:ml-2 flex items-center gap-1 overflow-auto">
                            <button className="text-xs px-2 py-1 border rounded" onClick={() => selectVisible(true)}>Select visible</button>
                            <button className="text-xs px-2 py-1 border rounded" onClick={() => selectVisible(false)}>Deselect visible</button>
                          </div>
                        </div>
                      </div>

                      {duplicatesResult?.hasDuplicates && (
                        <div className="mb-2 flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                          <div>Existing sites are collapsed ({duplicatesResult.duplicateSites.length}).</div>
                          <div className="flex items-center gap-2">
                            <button className="text-xs px-2 py-1 border rounded" onClick={() => setExistingCollapsed(false)}>Show existing</button>
                            <button className="text-xs px-2 py-1 border rounded" onClick={() => setExistingCollapsed(true)}>Hide existing</button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1 max-h-64 overflow-auto">
                        {filteredEntries.slice(0, 200).map((entry: any) => {
                          const key = entry.id || entry.siteCode || JSON.stringify(entry);
                          const checked = selectedEntryIds.has(key);
                          const isDup = isEntryDuplicate(entry);
                          // If existing entries are collapsed, hide them unless user explicitly filtered to 'existing'
                          if (isDup && existingCollapsed && viewFilter !== 'existing') {
                            return null;
                          }

                          return (
                            <label key={key} className="flex items-center justify-between p-1 rounded hover:bg-slate-50">
                              <div className="flex items-center gap-3">
                                <input type="checkbox" checked={checked} onChange={() => toggleEntrySelection(entry)} />
                                <div>
                                  <div className="font-medium">{entry.siteName || entry.siteCode || 'Unnamed site'}</div>
                                  <div className="text-xs text-muted-foreground">{[entry.siteCode, entry.state, entry.locality].filter(Boolean).join(' • ')}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-muted-foreground">{entry.visitDate || ''}</div>
                                <div className={`text-xs px-2 py-0.5 rounded ${isDup ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>{isDup ? 'Existing' : 'New'}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {filteredEntries.length > 200 && (
                        <div className="text-xs text-muted-foreground mt-2">Showing first 200 of {filteredEntries.length} rows</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
              </p>
            </div>
          )}
          
          {uploadComplete && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
              <CheckCircle className="h-4 w-4" />
              <span>Upload complete!</span>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">Selected <span className="font-medium">{selectedEntryIds.size}</span> of <span className="font-medium">{parsedEntries.length}</span></div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {error && <div className="text-sm text-red-600 mr-2">{error}</div>}
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || (!existingMmp && !selectedProjectId) || isUploading}
            className="flex items-center justify-center gap-2"
          >
            {isUploading ? (
              'Uploading...'
            ) : uploadComplete ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Uploaded
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload selected ({selectedEntryIds.size})
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default MMPFileUpload;
