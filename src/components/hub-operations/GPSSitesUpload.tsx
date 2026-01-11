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
import { getHubForState, getHubNameForState } from '@/data/sudanStates';
import * as XLSX from 'xlsx';

interface ParsedSite {
  rowIndex: number;
  siteId: string;
  siteName: string;
  hub: string;
  state: string;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  precision: number | null;
  rawGpsString?: string;
  residenceLatitude: number | null;
  residenceLongitude: number | null;
  residenceAltitude: number | null;
  residencePrecision: number | null;
  rawResidenceGpsString?: string;
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

const SITE_ID_PATTERNS = [
  /site_id/i, /site_code/i, /siteid/i, /^id$/i,
  /A02.*site.*id/i, /A02.*siteid/i, /SECTION.*A02.*id/i,
  /A01.*site.*id/i, /A01.*siteid/i,
  /siteID$/i, /_siteid$/i,
  /site.*code/i, /code.*site/i,
];

const SITE_NAME_PATTERNS = [
  /site_name/i, /sitename/i, /^name$/i,
  /SECTION_A\/A06$/i,
  /A06$/i,
  /A03.*site.*name/i, /A03.*sitename/i, /SECTION.*A03.*name/i,
  /A02.*site.*name/i, /A02.*sitename/i,
  /Activity.*site/i, /activity_site/i,
  /_sitename$/i,
  /site.*name/i, /name.*site/i,
];

const STATE_PATTERNS = [
  /^state$/i, /state_name/i, /statename/i,
  /SECTION_A\/A03$/i,
  /A03$/i,
  /A04.*state/i, /SECTION.*state/i,
  /_state$/i, /State$/,
  /[/_]state[/_]/i,
  /location.*hub/i,
];

const LOCALITY_PATTERNS = [
  /^locality$/i, /locality_name/i, /localityname/i,
  /SECTION_A\/A04$/i,
  /A04$/i,
  /A04.*locality/i, /SECTION.*locality/i,
  /_locality$/i, /Locality$/,
  /[/_]locality[/_]/i,
];

const HUB_PATTERNS = [
  /^hub$/i, /hub_name/i, /hubname/i, /wfp.*hub/i,
  /[/_]hub[/_]/i,
];

const GPS_COLUMN_PATTERNS = {
  latitude: [/[/_]A06[/_]latitude$/i, /A06.*latitude/i, /site.*latitude/i, /_latitude$/i, /^latitude$/i, /^lat$/i, /_lat$/i, /:latitude$/i],
  longitude: [/[/_]A06[/_]longitude$/i, /A06.*longitude/i, /site.*longitude/i, /_longitude$/i, /^longitude$/i, /^lng$/i, /^lon$/i, /_lon$/i, /_lng$/i, /:longitude$/i],
  altitude: [/[/_]A06[/_]altitude$/i, /A06.*altitude/i, /site.*altitude/i, /_altitude$/i, /^altitude$/i, /^alt$/i, /_alt$/i, /:altitude$/i],
  precision: [/[/_]A06[/_]precision$/i, /A06.*precision/i, /site.*precision/i, /_precision$/i, /^precision$/i, /^accuracy$/i, /_accuracy$/i, /:precision$/i, /:accuracy$/i],
  combined: [/gps.*coordinates.*site/i, /site.*gps/i, /gps.*coordinates/i, /^gps$/i, /coordinates/i, /geopoint/i],
  residenceLatitude: [/[/_]A05[/_]latitude$/i, /A05.*latitude/i, /residence.*latitude/i],
  residenceLongitude: [/[/_]A05[/_]longitude$/i, /A05.*longitude/i, /residence.*longitude/i],
  residenceAltitude: [/[/_]A05[/_]altitude$/i, /A05.*altitude/i, /residence.*altitude/i],
  residencePrecision: [/[/_]A05[/_]precision$/i, /A05.*precision/i, /residence.*precision/i],
  residenceCombined: [/gps.*coordinates.*residence/i, /residence.*gps/i, /residence.*coordinates/i],
};

function isA05Column(header: string): boolean {
  return /[/_]A05[/_]/i.test(header) || /A05/i.test(header);
}

function isA06Column(header: string): boolean {
  return /[/_]A06[/_]/i.test(header) || /A06/i.test(header);
}

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
    hub: string | null;
    state: string | null;
    locality: string | null;
    latitude: string | null;
    longitude: string | null;
    altitude: string | null;
    precision: string | null;
    combinedGps: string | null;
    residenceLatitude: string | null;
    residenceLongitude: string | null;
    residenceAltitude: string | null;
    residencePrecision: string | null;
    residenceCombinedGps: string | null;
  }>({
    siteId: null,
    siteName: null,
    hub: null,
    state: null,
    locality: null,
    latitude: null,
    longitude: null,
    altitude: null,
    precision: null,
    combinedGps: null,
    residenceLatitude: null,
    residenceLongitude: null,
    residenceAltitude: null,
    residencePrecision: null,
    residenceCombinedGps: null,
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
      
      const siteIdCol = findColumn(fileHeaders, SITE_ID_PATTERNS);
      const siteNameCol = findColumn(fileHeaders, SITE_NAME_PATTERNS);
      const hubCol = findColumn(fileHeaders, HUB_PATTERNS);
      const stateCol = findColumn(fileHeaders, STATE_PATTERNS);
      const localityCol = findColumn(fileHeaders, LOCALITY_PATTERNS);
      const latCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.latitude);
      
      console.log('[GPS Upload] File headers:', fileHeaders.slice(0, 20));
      console.log('[GPS Upload] Column detection:', { siteIdCol, siteNameCol, hubCol, stateCol, localityCol, latCol });
      const lngCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.longitude);
      const altCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.altitude);
      const precisionCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.precision);
      let combinedCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.combined);
      
      const resLatCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.residenceLatitude);
      const resLngCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.residenceLongitude);
      const resAltCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.residenceAltitude);
      const resPrecisionCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.residencePrecision);
      let resCombinedCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.residenceCombined);
      
      if (rows.length > 0) {
        const sampleRow = rows[0];
        for (const header of fileHeaders) {
          if (sampleRow[header] && isLikelyGeopointColumn(header, sampleRow[header])) {
            if (isA05Column(header) || header.toLowerCase().includes('residence')) {
              if (!resCombinedCol) {
                resCombinedCol = header;
                console.log(`[GPS Upload] Auto-detected residence geopoint column: ${header}`);
              }
            } else if (!combinedCol && !latCol && !lngCol) {
              combinedCol = header;
              console.log(`[GPS Upload] Auto-detected site geopoint column: ${header}`);
            }
          }
        }
      }
      
      console.log(`[GPS Upload] Detected columns - Site GPS: ${latCol || combinedCol || 'none'}, Residence GPS: ${resLatCol || resCombinedCol || 'none'}`);
      
      setColumnMapping({
        siteId: siteIdCol,
        siteName: siteNameCol,
        hub: hubCol,
        state: stateCol,
        locality: localityCol,
        latitude: latCol,
        longitude: lngCol,
        altitude: altCol,
        precision: precisionCol,
        combinedGps: combinedCol,
        residenceLatitude: resLatCol,
        residenceLongitude: resLngCol,
        residenceAltitude: resAltCol,
        residencePrecision: resPrecisionCol,
        residenceCombinedGps: resCombinedCol,
      });
      
      const { data: existingSites } = await supabase
        .from('sites_registry')
        .select('id, site_code, site_name, state_name, locality_name, gps_latitude, gps_longitude, residence_latitude, residence_longitude');
      
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
        
        let hub = hubCol ? row[hubCol] || '' : '';
        if (!hub && state) {
          const derivedHub = getHubForState(state);
          if (derivedHub) {
            hub = derivedHub;
          }
        }
        
        let latitude: number | null = null;
        let longitude: number | null = null;
        let altitude: number | null = null;
        let precision: number | null = null;
        let rawGpsString: string | undefined;
        
        let residenceLatitude: number | null = null;
        let residenceLongitude: number | null = null;
        let residenceAltitude: number | null = null;
        let residencePrecision: number | null = null;
        let rawResidenceGpsString: string | undefined;
        
        if (combinedCol && row[combinedCol]) {
          rawGpsString = row[combinedCol];
          const parsedGps = parseGPSString(row[combinedCol]);
          latitude = parsedGps.lat;
          longitude = parsedGps.lng;
          altitude = parsedGps.alt;
          precision = parsedGps.precision;
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
        
        if (resCombinedCol && row[resCombinedCol]) {
          rawResidenceGpsString = row[resCombinedCol];
          const parsedResGps = parseGPSString(row[resCombinedCol]);
          residenceLatitude = parsedResGps.lat;
          residenceLongitude = parsedResGps.lng;
          residenceAltitude = parsedResGps.alt;
          residencePrecision = parsedResGps.precision;
        }
        
        if (residenceLatitude === null && resLatCol && row[resLatCol]) {
          residenceLatitude = parseFloat(row[resLatCol]);
          if (isNaN(residenceLatitude)) residenceLatitude = null;
        }
        if (residenceLongitude === null && resLngCol && row[resLngCol]) {
          residenceLongitude = parseFloat(row[resLngCol]);
          if (isNaN(residenceLongitude)) residenceLongitude = null;
        }
        if (residenceAltitude === null && resAltCol && row[resAltCol]) {
          residenceAltitude = parseFloat(row[resAltCol]);
          if (isNaN(residenceAltitude)) residenceAltitude = null;
        }
        if (residencePrecision === null && resPrecisionCol && row[resPrecisionCol]) {
          residencePrecision = parseFloat(row[resPrecisionCol]);
          if (isNaN(residencePrecision)) residencePrecision = null;
        }
        
        const validationErrors: string[] = [];
        if (!siteId && !siteName) validationErrors.push('Missing site ID or name');
        if (!state && !locality) validationErrors.push('Missing location info (state or locality)');
        const hasSiteGps = latitude !== null && longitude !== null;
        const hasResidenceGps = residenceLatitude !== null && residenceLongitude !== null;
        if (!hasSiteGps && !hasResidenceGps) validationErrors.push('Invalid or missing GPS coordinates (need site or residence)');
        if (latitude !== null && (latitude < -90 || latitude > 90)) validationErrors.push('Site latitude out of range');
        if (longitude !== null && (longitude < -180 || longitude > 180)) validationErrors.push('Site longitude out of range');
        if (residenceLatitude !== null && (residenceLatitude < -90 || residenceLatitude > 90)) validationErrors.push('Residence latitude out of range');
        if (residenceLongitude !== null && (residenceLongitude < -180 || residenceLongitude > 180)) validationErrors.push('Residence longitude out of range');
        
        const lookupKey = `${siteId.toLowerCase()}_${siteName.toLowerCase()}_${state.toLowerCase()}`;
        const existingSite = siteMap.get(siteId.toLowerCase()) || siteMap.get(lookupKey);
        
        const willUpdateSiteGps = hasSiteGps && (!existingSite?.gps_latitude || !existingSite?.gps_longitude);
        const willUpdateResidenceGps = hasResidenceGps && (!existingSite?.residence_latitude || !existingSite?.residence_longitude);
        
        return {
          rowIndex: idx + 2,
          siteId,
          siteName,
          hub,
          state,
          locality,
          latitude,
          longitude,
          altitude,
          precision,
          rawGpsString,
          residenceLatitude,
          residenceLongitude,
          residenceAltitude,
          residencePrecision,
          rawResidenceGpsString,
          isValid: validationErrors.length === 0,
          validationErrors,
          existsInRegistry: !!existingSite,
          registrySiteId: existingSite?.id,
          willUpdate: !!existingSite && (willUpdateSiteGps || willUpdateResidenceGps || hasSiteGps || hasResidenceGps),
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
            const updateData: Record<string, any> = {
              gps_captured_by: currentUser?.id,
              gps_captured_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (site.latitude !== null) updateData.gps_latitude = site.latitude;
            if (site.longitude !== null) updateData.gps_longitude = site.longitude;
            if (site.altitude !== null) updateData.gps_altitude = site.altitude;
            if (site.precision !== null) updateData.gps_precision = site.precision;
            if (site.residenceLatitude !== null) updateData.residence_latitude = site.residenceLatitude;
            if (site.residenceLongitude !== null) updateData.residence_longitude = site.residenceLongitude;
            if (site.residenceAltitude !== null) updateData.residence_altitude = site.residenceAltitude;
            if (site.residencePrecision !== null) updateData.residence_precision = site.residencePrecision;
            
            const { error } = await supabase
              .from('sites_registry')
              .update(updateData)
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
            
            // Get hub information based on state
            const stateId = stateData?.id || '';
            const hubId = stateId ? getHubForState(stateId) : undefined;
            const hubName = stateId ? getHubNameForState(stateId) : undefined;
            
            // Only include columns that exist in sites_registry table:
            // id, site_code, site_name, state_id, state_name, locality_id, locality_name,
            // hub_id, hub_name, gps_latitude, gps_longitude, activity_type, status, mmp_count,
            // created_at, updated_at, created_by
            const insertData: Record<string, any> = {
              site_code: siteCode,
              site_name: site.siteName || siteCode,
              state_id: stateId,
              state_name: stateData?.name || site.state,
              locality_id: localityData?.id || '',
              locality_name: localityData?.name || site.locality,
              hub_id: hubId || '',
              hub_name: hubName || '',
              activity_type: 'GFA',
              status: 'active',
              mmp_count: 0,
              created_by: currentUser?.id || 'system',
              created_at: new Date().toISOString(),
            };
            // Only add GPS if available (these columns exist in the table)
            if (site.latitude !== null) insertData.gps_latitude = site.latitude;
            if (site.longitude !== null) insertData.gps_longitude = site.longitude;
            
            const { error } = await supabase
              .from('sites_registry')
              .insert(insertData);
            
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
              const template = 'site_id,site_name,state,locality,SECTION_A/_A06_latitude,SECTION_A/_A06_longitude,SECTION_A/_A06_altitude,SECTION_A/_A06_precision,SECTION_A/_A05_latitude,SECTION_A/_A05_longitude,SECTION_A/_A05_altitude,SECTION_A/_A05_precision\nSITE001,Health Center A,North Darfur,Al Fasher,13.7506,34.4040,432.19,6.65,13.7510,34.4045,430.50,5.20';
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
          <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Preview GPS Sites Data</DialogTitle>
              <DialogDescription className="space-y-1">
                <p>Review the parsed data before uploading.</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {columnMapping.siteId && <Badge variant="outline">ID: {columnMapping.siteId}</Badge>}
                  {columnMapping.siteName && <Badge variant="outline">Name: {columnMapping.siteName}</Badge>}
                  {columnMapping.hub && <Badge variant="outline">Hub: {columnMapping.hub}</Badge>}
                  {columnMapping.state && <Badge variant="outline">State: {columnMapping.state}</Badge>}
                  {columnMapping.locality && <Badge variant="outline">Locality: {columnMapping.locality}</Badge>}
                  {(columnMapping.latitude || columnMapping.residenceLatitude) && (
                    <Badge variant="secondary">Lat: {columnMapping.latitude || columnMapping.residenceLatitude}</Badge>
                  )}
                  {(columnMapping.longitude || columnMapping.residenceLongitude) && (
                    <Badge variant="secondary">Lng: {columnMapping.longitude || columnMapping.residenceLongitude}</Badge>
                  )}
                  {columnMapping.combinedGps && <Badge variant="secondary">GPS: {columnMapping.combinedGps}</Badge>}
                </div>
                {!columnMapping.siteId && !columnMapping.siteName && (
                  <p className="text-amber-600 dark:text-amber-400">
                    No site ID/name columns detected. Expected: site_id, siteid, site_name, Activity site, etc.
                  </p>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
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
                    <TableHead>Hub</TableHead>
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
                      <TableCell>{site.hub || '-'}</TableCell>
                      <TableCell>{site.state || '-'}</TableCell>
                      <TableCell>{site.locality || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {(site.latitude ?? site.residenceLatitude)?.toFixed(6) || '-'}
                        {site.latitude === null && site.residenceLatitude !== null && (
                          <span className="text-amber-500 ml-1" title="Using residence GPS">(R)</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {(site.longitude ?? site.residenceLongitude)?.toFixed(6) || '-'}
                        {site.longitude === null && site.residenceLongitude !== null && (
                          <span className="text-amber-500 ml-1" title="Using residence GPS">(R)</span>
                        )}
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
            </div>
            
            <DialogFooter className="flex-shrink-0">
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
