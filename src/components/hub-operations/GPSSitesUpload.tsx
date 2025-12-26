import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { Upload, FileSpreadsheet, MapPin, AlertCircle, CheckCircle2, XCircle, Download, Eye, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParsedSite {
  rowIndex: number;
  siteId: string;
  siteName: string;
  state: string;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  precision: number | null;
  rawGpsString?: string;
  isValid: boolean;
  validationErrors: string[];
  existsInRegistry: boolean;
  registrySiteId?: string;
  willUpdate: boolean;
}

interface UploadResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const EXPECTED_COLUMNS = [
  'site_id', 'site_code', 'siteid', 'id',
  'site_name', 'sitename', 'name',
  'state',
  'locality',
];

const GPS_COLUMN_PATTERNS = {
  latitude: [/_latitude$/i, /^latitude$/i, /^lat$/i, /_lat$/i, /:latitude$/i],
  longitude: [/_longitude$/i, /^longitude$/i, /^lng$/i, /^lon$/i, /_lon$/i, /_lng$/i, /:longitude$/i],
  altitude: [/_altitude$/i, /^altitude$/i, /^alt$/i, /_alt$/i, /:altitude$/i],
  precision: [/_precision$/i, /^precision$/i, /^accuracy$/i, /_accuracy$/i, /:precision$/i, /:accuracy$/i],
  combined: [/gps.*coordinates/i, /^gps$/i, /coordinates/i, /geopoint/i],
};

function isLikelyGeopointColumn(header: string, sampleValue: string): boolean {
  if (!sampleValue) return false;
  const parts = sampleValue.trim().split(/\s+/);
  if (parts.length >= 2 && parts.length <= 4) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return true;
    }
  }
  return false;
}

function findColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const header of headers) {
    for (const pattern of patterns) {
      if (pattern.test(header)) {
        return header;
      }
    }
  }
  return null;
}

function parseGPSString(gpsString: string): { lat: number | null; lng: number | null; alt: number | null; precision: number | null } {
  if (!gpsString || typeof gpsString !== 'string') {
    return { lat: null, lng: null, alt: null, precision: null };
  }
  
  const parts = gpsString.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
    const precision = parts.length >= 4 ? parseFloat(parts[3]) : null;
    
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng, alt: alt && !isNaN(alt) ? alt : null, precision: precision && !isNaN(precision) ? precision : null };
    }
  }
  
  return { lat: null, lng: null, alt: null, precision: null };
}

function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

export default function GPSSitesUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsedSites, setParsedSites] = useState<ParsedSite[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    siteId: string | null;
    siteName: string | null;
    state: string | null;
    locality: string | null;
    latitude: string | null;
    longitude: string | null;
    altitude: string | null;
    precision: string | null;
    combinedGps: string | null;
  }>({
    siteId: null,
    siteName: null,
    state: null,
    locality: null,
    latitude: null,
    longitude: null,
    altitude: null,
    precision: null,
    combinedGps: null,
  });
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const parseExcelFile = async (file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1, defval: '' });
    
    if (jsonData.length < 2) {
      return { headers: [], rows: [] };
    }
    
    const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
    const rows: Record<string, string>[] = [];
    
    for (let i = 1; i < jsonData.length; i++) {
      const rowData = jsonData[i] as any[];
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = String(rowData[idx] ?? '').trim();
      });
      if (Object.values(row).some(v => v !== '')) {
        rows.push(row);
      }
    }
    
    return { headers, rows };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    const fileName = selectedFile.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (!isCSV && !isExcel) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }
    
    setFile(selectedFile);
    setParsing(true);
    setParsedSites([]);
    setUploadResult(null);
    
    try {
      let fileHeaders: string[];
      let rows: Record<string, string>[];
      
      if (isExcel) {
        const result = await parseExcelFile(selectedFile);
        fileHeaders = result.headers;
        rows = result.rows;
      } else {
        const text = await selectedFile.text();
        const result = parseCSV(text);
        fileHeaders = result.headers;
        rows = result.rows;
      }
      
      setHeaders(fileHeaders);
      
      const siteIdCol = findColumn(fileHeaders, [/site_id/i, /site_code/i, /siteid/i, /^id$/i]);
      const siteNameCol = findColumn(fileHeaders, [/site_name/i, /sitename/i, /^name$/i]);
      const stateCol = findColumn(fileHeaders, [/^state$/i, /state_name/i]);
      const localityCol = findColumn(fileHeaders, [/^locality$/i, /locality_name/i]);
      const latCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.latitude);
      const lngCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.longitude);
      const altCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.altitude);
      const precisionCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.precision);
      let combinedCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.combined);
      
      if (!combinedCol && !latCol && !lngCol && rows.length > 0) {
        const sampleRow = rows[0];
        for (const header of fileHeaders) {
          if (sampleRow[header] && isLikelyGeopointColumn(header, sampleRow[header])) {
            combinedCol = header;
            console.log(`[GPS Upload] Auto-detected geopoint column: ${header}`);
            break;
          }
        }
      }
      
      setColumnMapping({
        siteId: siteIdCol,
        siteName: siteNameCol,
        state: stateCol,
        locality: localityCol,
        latitude: latCol,
        longitude: lngCol,
        altitude: altCol,
        precision: precisionCol,
        combinedGps: combinedCol,
      });
      
      const { data: existingSites } = await supabase
        .from('sites_registry')
        .select('id, site_code, site_name, state_name, locality_name, gps_latitude, gps_longitude');
      
      const siteMap = new Map<string, any>();
      (existingSites || []).forEach(site => {
        const key = `${(site.site_code || '').toLowerCase()}_${(site.site_name || '').toLowerCase()}_${(site.state_name || '').toLowerCase()}`;
        siteMap.set(key, site);
        if (site.site_code) {
          siteMap.set(site.site_code.toLowerCase(), site);
        }
      });
      
      const parsed: ParsedSite[] = rows.map((row, idx) => {
        const siteId = siteIdCol ? row[siteIdCol] || '' : '';
        const siteName = siteNameCol ? row[siteNameCol] || '' : '';
        const state = stateCol ? row[stateCol] || '' : '';
        const locality = localityCol ? row[localityCol] || '' : '';
        
        let latitude: number | null = null;
        let longitude: number | null = null;
        let altitude: number | null = null;
        let precision: number | null = null;
        let rawGpsString: string | undefined;
        
        if (combinedCol && row[combinedCol]) {
          rawGpsString = row[combinedCol];
          const parsed = parseGPSString(row[combinedCol]);
          latitude = parsed.lat;
          longitude = parsed.lng;
          altitude = parsed.alt;
          precision = parsed.precision;
        }
        
        if (latitude === null && latCol && row[latCol]) {
          latitude = parseFloat(row[latCol]);
          if (isNaN(latitude)) latitude = null;
        }
        if (longitude === null && lngCol && row[lngCol]) {
          longitude = parseFloat(row[lngCol]);
          if (isNaN(longitude)) longitude = null;
        }
        if (altitude === null && altCol && row[altCol]) {
          altitude = parseFloat(row[altCol]);
          if (isNaN(altitude)) altitude = null;
        }
        if (precision === null && precisionCol && row[precisionCol]) {
          precision = parseFloat(row[precisionCol]);
          if (isNaN(precision)) precision = null;
        }
        
        const validationErrors: string[] = [];
        if (!siteId && !siteName) validationErrors.push('Missing site ID or name');
        if (!state) validationErrors.push('Missing state');
        if (latitude === null || longitude === null) validationErrors.push('Invalid or missing GPS coordinates');
        if (latitude !== null && (latitude < -90 || latitude > 90)) validationErrors.push('Latitude out of range');
        if (longitude !== null && (longitude < -180 || longitude > 180)) validationErrors.push('Longitude out of range');
        
        const lookupKey = `${siteId.toLowerCase()}_${siteName.toLowerCase()}_${state.toLowerCase()}`;
        const existingSite = siteMap.get(siteId.toLowerCase()) || siteMap.get(lookupKey);
        
        return {
          rowIndex: idx + 2,
          siteId,
          siteName,
          state,
          locality,
          latitude,
          longitude,
          altitude,
          precision,
          rawGpsString,
          isValid: validationErrors.length === 0,
          validationErrors,
          existsInRegistry: !!existingSite,
          registrySiteId: existingSite?.id,
          willUpdate: !!existingSite && (existingSite.gps_latitude === null || existingSite.gps_longitude === null),
        };
      });
      
      setParsedSites(parsed);
      setSelectedRows(new Set(parsed.filter(p => p.isValid).map(p => p.rowIndex)));
      setPreviewOpen(true);
      
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast({
        title: 'Failed to parse file',
        description: 'Please check the file format and try again',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    const sitesToUpload = parsedSites.filter(s => selectedRows.has(s.rowIndex) && s.isValid);
    
    if (sitesToUpload.length === 0) {
      toast({
        title: 'No valid sites to upload',
        description: 'Please select valid sites to upload',
        variant: 'destructive',
      });
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    const result: UploadResult = {
      total: sitesToUpload.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };
    
    try {
      for (let i = 0; i < sitesToUpload.length; i++) {
        const site = sitesToUpload[i];
        setUploadProgress(Math.round(((i + 1) / sitesToUpload.length) * 100));
        
        try {
          if (site.existsInRegistry && site.registrySiteId) {
            const { error } = await supabase
              .from('sites_registry')
              .update({
                gps_latitude: site.latitude,
                gps_longitude: site.longitude,
                gps_captured_by: currentUser?.id,
                gps_captured_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', site.registrySiteId);
            
            if (error) {
              result.errors.push(`Row ${site.rowIndex}: ${error.message}`);
            } else {
              result.updated++;
            }
          } else {
            const { data: stateData } = await supabase
              .from('states')
              .select('id, name')
              .ilike('name', site.state)
              .single();
            
            let localityData = null;
            if (stateData && site.locality) {
              const { data: locData } = await supabase
                .from('localities')
                .select('id, name')
                .eq('state_id', stateData.id)
                .ilike('name', site.locality)
                .single();
              localityData = locData;
            }
            
            const siteCode = site.siteId || `SITE-${Date.now()}-${i}`;
            
            const { error } = await supabase
              .from('sites_registry')
              .insert({
                site_code: siteCode,
                site_name: site.siteName || siteCode,
                state_id: stateData?.id || '',
                state_name: stateData?.name || site.state,
                locality_id: localityData?.id || '',
                locality_name: localityData?.name || site.locality,
                gps_latitude: site.latitude,
                gps_longitude: site.longitude,
                gps_captured_by: currentUser?.id,
                gps_captured_at: new Date().toISOString(),
                status: 'registered',
                mmp_count: 0,
                created_by: currentUser?.id || 'system',
                created_at: new Date().toISOString(),
              });
            
            if (error) {
              if (error.code === '23505') {
                result.skipped++;
              } else {
                result.errors.push(`Row ${site.rowIndex}: ${error.message}`);
              }
            } else {
              result.created++;
            }
          }
        } catch (err: any) {
          result.errors.push(`Row ${site.rowIndex}: ${err.message}`);
        }
      }
      
      setUploadResult(result);
      
      toast({
        title: 'Upload Complete',
        description: `Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}${result.errors.length > 0 ? `, Errors: ${result.errors.length}` : ''}`,
        variant: result.errors.length > 0 ? 'destructive' : 'default',
      });
      
      if (onUploadComplete) {
        onUploadComplete();
      }
      
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const validCount = parsedSites.filter(s => s.isValid).length;
  const invalidCount = parsedSites.filter(s => !s.isValid).length;
  const existingCount = parsedSites.filter(s => s.existsInRegistry).length;
  const newCount = parsedSites.filter(s => !s.existsInRegistry && s.isValid).length;

  const toggleRowSelection = (rowIndex: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowIndex)) {
      newSelected.delete(rowIndex);
    } else {
      newSelected.add(rowIndex);
    }
    setSelectedRows(newSelected);
  };

  const toggleAllValid = () => {
    const validRows = parsedSites.filter(p => p.isValid).map(p => p.rowIndex);
    if (validRows.every(r => selectedRows.has(r))) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(validRows));
    }
  };

  return (
    <Card data-testid="card-gps-upload">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              GPS Sites Bulk Upload
            </CardTitle>
            <CardDescription>
              Upload CSV or Excel file with site coordinates (ODK/KoboToolbox format supported)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const template = 'site_id,site_name,state,locality,SECTION_A/A06_latitude,SECTION_A/A06_longitude,SECTION_A/A06_altitude,SECTION_A/A06_precision\nSITE001,Health Center A,North Darfur,Al Fasher,13.7506,34.4040,432.19,6.65';
              const blob = new Blob([template], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'gps_sites_template.csv';
              a.click();
            }}
            data-testid="button-download-template"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed rounded-md p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-file-upload"
          />
          
          {!file ? (
            <div className="space-y-2">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop your CSV or Excel file here or click to browse
              </p>
              <Button onClick={() => fileInputRef.current?.click()} data-testid="button-select-file">
                <Upload className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="outline">{(file.size / 1024).toFixed(1)} KB</Badge>
              </div>
              
              {parsing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing file...
                </div>
              )}
              
              {parsedSites.length > 0 && (
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {validCount} valid
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      {invalidCount} invalid
                    </Badge>
                  )}
                  <Badge variant="secondary" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {existingCount} existing in registry
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    {newCount} new sites
                  </Badge>
                </div>
              )}
              
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={parsedSites.length === 0}
                  data-testid="button-preview-data"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Data
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploading || validCount === 0}
                  data-testid="button-upload-sites"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading ({uploadProgress}%)
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {selectedRows.size} Sites
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setParsedSites([]);
                    setUploadResult(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  data-testid="button-clear-file"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {uploadResult && (
          <Alert variant={uploadResult.errors.length > 0 ? 'destructive' : 'default'}>
            <AlertDescription>
              <div className="flex items-center gap-4 flex-wrap">
                <span>Total: {uploadResult.total}</span>
                <Badge variant="default">{uploadResult.created} created</Badge>
                <Badge variant="secondary">{uploadResult.updated} updated</Badge>
                <Badge variant="outline">{uploadResult.skipped} skipped</Badge>
                {uploadResult.errors.length > 0 && (
                  <Badge variant="destructive">{uploadResult.errors.length} errors</Badge>
                )}
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="mt-2 text-xs max-h-20 overflow-auto">
                  {uploadResult.errors.slice(0, 5).map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                  {uploadResult.errors.length > 5 && (
                    <div>...and {uploadResult.errors.length - 5} more errors</div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Preview GPS Sites Data</DialogTitle>
              <DialogDescription>
                Review the parsed data before uploading. Column mapping: 
                {columnMapping.latitude && ` Lat: ${columnMapping.latitude}`}
                {columnMapping.longitude && `, Lng: ${columnMapping.longitude}`}
                {columnMapping.combinedGps && `, GPS: ${columnMapping.combinedGps}`}
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={parsedSites.filter(p => p.isValid).every(p => selectedRows.has(p.rowIndex))}
                        onCheckedChange={toggleAllValid}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>Site ID</TableHead>
                    <TableHead>Site Name</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Locality</TableHead>
                    <TableHead>Latitude</TableHead>
                    <TableHead>Longitude</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedSites.map((site) => (
                    <TableRow 
                      key={site.rowIndex}
                      className={!site.isValid ? 'bg-destructive/10' : site.existsInRegistry ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(site.rowIndex)}
                          onCheckedChange={() => toggleRowSelection(site.rowIndex)}
                          disabled={!site.isValid}
                          data-testid={`checkbox-row-${site.rowIndex}`}
                        />
                      </TableCell>
                      <TableCell>{site.rowIndex}</TableCell>
                      <TableCell className="font-mono text-xs">{site.siteId || '-'}</TableCell>
                      <TableCell>{site.siteName || '-'}</TableCell>
                      <TableCell>{site.state || '-'}</TableCell>
                      <TableCell>{site.locality || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {site.latitude?.toFixed(6) || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {site.longitude?.toFixed(6) || '-'}
                      </TableCell>
                      <TableCell>
                        {!site.isValid ? (
                          <Badge variant="destructive" className="text-xs">
                            {site.validationErrors[0]}
                          </Badge>
                        ) : site.existsInRegistry ? (
                          <Badge variant="secondary" className="text-xs">
                            {site.willUpdate ? 'Will Update' : 'Exists'}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            New
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <Button onClick={handleUpload} disabled={uploading || selectedRows.size === 0}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {selectedRows.size} Sites
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
