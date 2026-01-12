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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getHubForState, getHubNameForState, hubs, sudanStates, getStateName, getLocalityName } from '@/data/sudanStates';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';
import { siteRegistryService, SiteMatchResult } from '@/services/siteRegistry.service';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

type MatchType = 'site_code' | 'name_state_locality' | 'name_state' | 'gps_proximity' | 'none';

interface ParsedSite {
  rowIndex: number;
  siteId: string;
  siteName: string;
  hub: string;
  state: string;
  locality: string;
  activity: string;
  cp: string;
  tool: string;
  useMarketDiversion: string;
  useWarehouseMonitoring: string;
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
  matchType: MatchType;
  matchConfidence: number;
  willUpdate: boolean;
  monitoringCycle?: string;
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
  /^site\s*name$/i, /site_name/i, /sitename/i, /^name$/i,
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

const ACTIVITY_PATTERNS = [
  /^activity$/i, /activity_type/i, /activitytype/i,
  /activity\s*at\s*the\s*site/i,
  /SECTION_A\/A07$/i, /A07$/i,
  /_activity$/i, /Activity$/,
  /kind\s*of\s*process\s*monitoring/i, /process\s*monitoring/i,
  /1\.11/i, /what\s*kind\s*of\s*process\s*monitoring/i,
  /SECTION.*1\.11/i, /going\s*to\s*conduct/i,
  /1\.10a/i, /confirm\s*the\s*activity/i, /activity\s*of\s*the\s*site/i,
];

const CP_PATTERNS = [
  /^cp$/i, /^cp\s*name$/i, /cooperating.*partner/i, /cp_name/i, /cpname/i,
  /SECTION_A\/A08$/i, /A08$/i,
  /_cp$/i, /partner$/i,
  /implementing\s*partner/i, /1\.10c/i, /name\s*of\s*implementing/i,
];

const TOOL_PATTERNS = [
  /^tool$/i, /tool\s*to\s*be\s*used/i, /tool_type/i,
];

const MARKET_DIVERSION_PATTERNS = [
  /use\s*market\s*diversion/i, /market\s*diversion\s*monitoring/i,
];

const WAREHOUSE_MONITORING_PATTERNS = [
  /use\s*warehouse\s*monitoring/i, /warehouse\s*monitoring/i,
];

const MONITORING_CYCLE_PATTERNS = [
  /^monitoring[_\s]*cycle$/i, /^cycle[_\s]*month$/i, /^cycle$/i, 
  /^month$/i, /^mmp[_\s]*cycle$/i, /^reporting[_\s]*month$/i,
];

// Separate patterns for year/month when cycle is split across two columns
const MONITORING_CYCLE_YEAR_PATTERNS = [
  /cycle[_\s]*year/i, /1\.0a.*cycle.*year/i, /monitoring.*year/i,
];

const MONITORING_CYCLE_MONTH_PATTERNS = [
  /cycle[_\s]*month/i, /1\.0b.*cycle.*month/i, /monitoring.*month/i,
];

const GPS_COLUMN_PATTERNS = {
  latitude: [/[/_]A06[/_]latitude$/i, /A06.*latitude/i, /site.*latitude/i, /_latitude$/i, /^latitude$/i, /^lat$/i, /_lat$/i, /:latitude$/i, /_a_gps_latitude$/i, /a_gps_latitude/i],
  longitude: [/[/_]A06[/_]longitude$/i, /A06.*longitude/i, /site.*longitude/i, /_longitude$/i, /^longitude$/i, /^lng$/i, /^lon$/i, /_lon$/i, /_lng$/i, /:longitude$/i, /_a_gps_longitude$/i, /a_gps_longitude/i],
  altitude: [/[/_]A06[/_]altitude$/i, /A06.*altitude/i, /site.*altitude/i, /_altitude$/i, /^altitude$/i, /^alt$/i, /_alt$/i, /:altitude$/i, /_a_gps_altitude$/i, /a_gps_altitude/i],
  precision: [/[/_]A06[/_]precision$/i, /A06.*precision/i, /site.*precision/i, /_precision$/i, /^precision$/i, /^accuracy$/i, /_accuracy$/i, /:precision$/i, /:accuracy$/i, /_a_gps_precision$/i, /a_gps_precision/i],
  combined: [/gps.*coordinates.*site/i, /site.*gps/i, /gps.*coordinates/i, /^gps$/i, /coordinates/i, /geopoint/i, /geographic\s*coordinates/i],
  residenceLatitude: [/[/_]A05[/_]latitude$/i, /A05.*latitude/i, /residence.*latitude/i, /_A05_latitude$/i],
  residenceLongitude: [/[/_]A05[/_]longitude$/i, /A05.*longitude/i, /residence.*longitude/i, /_A05_longitude$/i],
  residenceAltitude: [/[/_]A05[/_]altitude$/i, /A05.*altitude/i, /residence.*altitude/i, /_A05_altitude$/i],
  residencePrecision: [/[/_]A05[/_]precision$/i, /A05.*precision/i, /residence.*precision/i, /_A05_precision$/i],
  residenceCombined: [/gps.*coordinates.*residence/i, /residence.*gps/i, /residence.*coordinates/i, /gps\s*coordinates\s*\(residence\)/i],
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
  
  // Detect MoDa/ODK format: Row 1 = internal column names, Row 2 = display labels, data starts Row 3
  const isMoDaFormat = headers.some(h => /^SECTION_/i.test(h) || /^[A-Z]_[A-Z0-9]+$/i.test(h));
  const dataStartRow = isMoDaFormat ? 2 : 1;
  
  console.log(`[GPS Upload CSV] File format: ${isMoDaFormat ? 'MoDa/ODK' : 'Standard'}, data starts at row ${dataStartRow + 1}`);
  
  for (let i = dataStartRow; i < lines.length; i++) {
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
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0, phase: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'preparing' | 'uploading' | 'complete' | null>(null);
  const [uploadEta, setUploadEta] = useState(0);
  const [parsedSites, setParsedSites] = useState<ParsedSite[]>([]);
  const [previewLimit, setPreviewLimit] = useState(50);
  const [columnMapping, setColumnMapping] = useState<{
    siteId: string | null;
    siteName: string | null;
    hub: string | null;
    state: string | null;
    locality: string | null;
    activity: string | null;
    cp: string | null;
    tool: string | null;
    useMarketDiversion: string | null;
    useWarehouseMonitoring: string | null;
    monitoringCycle: string | null;
    monitoringCycleYear: string | null;
    monitoringCycleMonthName: string | null;
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
    activity: null,
    cp: null,
    tool: null,
    useMarketDiversion: null,
    useWarehouseMonitoring: null,
    monitoringCycle: null,
    monitoringCycleYear: null,
    monitoringCycleMonthName: null,
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
    
    // Detect MoDa/ODK format: Row 1 = internal column names, Row 2 = display labels, data starts Row 3
    // MoDa files have SECTION_* style headers
    const isMoDaFormat = headers.some(h => /^SECTION_/i.test(h) || /^[A-Z]_[A-Z0-9]+$/i.test(h));
    const dataStartRow = isMoDaFormat ? 2 : 1; // Skip row 2 (display labels) for MoDa files
    
    console.log(`[GPS Upload] File format: ${isMoDaFormat ? 'MoDa/ODK' : 'Standard'}, data starts at row ${dataStartRow + 1}`);
    
    for (let i = dataStartRow; i < jsonData.length; i++) {
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
      const activityCol = findColumn(fileHeaders, ACTIVITY_PATTERNS);
      const cpCol = findColumn(fileHeaders, CP_PATTERNS);
      const toolCol = findColumn(fileHeaders, TOOL_PATTERNS);
      const marketDiversionCol = findColumn(fileHeaders, MARKET_DIVERSION_PATTERNS);
      const warehouseMonitoringCol = findColumn(fileHeaders, WAREHOUSE_MONITORING_PATTERNS);
      const monitoringCycleCol = findColumn(fileHeaders, MONITORING_CYCLE_PATTERNS);
      const monitoringCycleYearCol = findColumn(fileHeaders, MONITORING_CYCLE_YEAR_PATTERNS);
      const monitoringCycleMonthNameCol = findColumn(fileHeaders, MONITORING_CYCLE_MONTH_PATTERNS);
      const latCol = findColumn(fileHeaders, GPS_COLUMN_PATTERNS.latitude);
      
      console.log('[GPS Upload] File headers:', fileHeaders.slice(0, 20));
      console.log('[GPS Upload] Column detection:', { siteIdCol, siteNameCol, hubCol, stateCol, localityCol, activityCol, cpCol, toolCol, marketDiversionCol, warehouseMonitoringCol, latCol });
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
        activity: activityCol,
        cp: cpCol,
        tool: toolCol,
        useMarketDiversion: marketDiversionCol,
        useWarehouseMonitoring: warehouseMonitoringCol,
        monitoringCycle: monitoringCycleCol,
        monitoringCycleYear: monitoringCycleYearCol,
        monitoringCycleMonthName: monitoringCycleMonthNameCol,
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
      
      // Clear cache and load fresh site data for matching
      setParsingProgress({ current: 0, total: rows.length, phase: 'Loading site registry...' });
      siteRegistryService.clearCache();
      await siteRegistryService.loadAllSites();
      
      // Parse rows and match against registry in batches for better performance
      const parsed: ParsedSite[] = [];
      const BATCH_SIZE = 50;
      const totalRows = rows.length;
      
      setParsingProgress({ current: 0, total: totalRows, phase: 'Processing sites...' });
      
      // Process a single row
      const processRow = async (row: Record<string, string>, idx: number): Promise<ParsedSite> => {
        const siteId = siteIdCol ? row[siteIdCol] || '' : '';
        const siteName = siteNameCol ? row[siteNameCol] || '' : '';
        const rawState = stateCol ? row[stateCol] || '' : '';
        const locality = localityCol ? row[localityCol] || '' : '';
        const activity = activityCol ? row[activityCol] || '' : '';
        const cp = cpCol ? row[cpCol] || '' : '';
        const tool = toolCol ? row[toolCol] || '' : '';
        const useMarketDiversion = marketDiversionCol ? row[marketDiversionCol] || '' : '';
        const useWarehouseMonitoring = warehouseMonitoringCol ? row[warehouseMonitoringCol] || '' : '';
        
        // Handle monitoring cycle - either from combined column or separate year/month columns
        let rowMonitoringCycle = monitoringCycleCol ? row[monitoringCycleCol] || '' : '';
        if (!rowMonitoringCycle && monitoringCycleYearCol && monitoringCycleMonthNameCol) {
          const year = row[monitoringCycleYearCol] || '';
          const monthName = row[monitoringCycleMonthNameCol] || '';
          if (year && monthName) {
            // Convert month name to number (January=01, February=02, etc.)
            const monthMap: Record<string, string> = {
              'january': '01', 'february': '02', 'march': '03', 'april': '04',
              'may': '05', 'june': '06', 'july': '07', 'august': '08',
              'september': '09', 'october': '10', 'november': '11', 'december': '12',
              'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
              'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
            };
            const monthNum = monthMap[monthName.toLowerCase().trim()] || monthName;
            rowMonitoringCycle = `${year}-${monthNum.padStart(2, '0')}`;
          }
        }
        
        const normalizedStateId = normalizeStateId(rawState);
        const state = normalizedStateId || rawState;
        
        let hub = hubCol ? row[hubCol] || '' : '';
        if (!hub && normalizedStateId) {
          const derivedHub = getHubForState(normalizedStateId);
          if (derivedHub) {
            hub = derivedHub;
          }
        }
        
        if (hub && !hubs.find(h => h.id === hub)) {
          const normalizedHub = hub.toLowerCase().trim().replace(/\s+/g, '-');
          const matchedHub = hubs.find(h => 
            h.id === normalizedHub || 
            h.name.toLowerCase().includes(normalizedHub) ||
            normalizedHub.includes(h.id.replace('-hub', ''))
          );
          if (matchedHub) {
            hub = matchedHub.id;
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
        if (!hub) validationErrors.push('Missing Hub');
        if (!state) validationErrors.push('Missing State');
        if (!locality) validationErrors.push('Missing Locality');
        if (!siteName) validationErrors.push('Missing Site Name');
        if (!activity) validationErrors.push('Missing Activity');
        if (!cp) validationErrors.push('Missing CP (Cooperating Partner)');
        const hasSiteGps = latitude !== null && longitude !== null;
        const hasResidenceGps = residenceLatitude !== null && residenceLongitude !== null;
        // Only require GPS if neither site nor residence GPS is present
        if (!hasSiteGps && !hasResidenceGps) validationErrors.push('Missing GPS coordinates');
        // Residence GPS is optional - only validate if columns were detected in the file
        const hasResidenceColumnsInFile = resLatCol || resLngCol || resCombinedCol;
        if (hasResidenceColumnsInFile) {
          if (residenceLatitude === null) validationErrors.push('Missing Residence Latitude (A05)');
          if (residenceLongitude === null) validationErrors.push('Missing Residence Longitude (A05)');
          if (residenceAltitude === null) validationErrors.push('Missing Residence Altitude (A05)');
          if (residencePrecision === null) validationErrors.push('Missing Residence Precision (A05)');
        }
        if (latitude !== null && (latitude < -90 || latitude > 90)) validationErrors.push('Site latitude out of range');
        if (longitude !== null && (longitude < -180 || longitude > 180)) validationErrors.push('Site longitude out of range');
        if (residenceLatitude !== null && (residenceLatitude < -90 || residenceLatitude > 90)) validationErrors.push('Residence latitude out of range');
        if (residenceLongitude !== null && (residenceLongitude < -180 || residenceLongitude > 180)) validationErrors.push('Residence longitude out of range');
        
        // Use SiteRegistryService for improved matching
        const matchResult = await siteRegistryService.matchSite({
          siteId,
          siteCode: siteId,
          siteName,
          state,
          locality,
          latitude: residenceLatitude ?? latitude,
          longitude: residenceLongitude ?? longitude,
        });
        
        const existingSite = matchResult.existingSite;
        // Only mark as "will update" if we have GPS that the existing site is missing
        const willUpdateSiteGps = hasSiteGps && existingSite && (!existingSite.gps_latitude || !existingSite.gps_longitude);
        // Check if residence GPS will be updated (existing site missing residence coords)
        const existingHasResidenceGps = existingSite?.gps_latitude != null && existingSite?.gps_longitude != null;
        const willUpdateResidenceGps = hasResidenceGps && existingSite && !existingHasResidenceGps;
        
        return {
          rowIndex: idx + 2,
          siteId,
          siteName,
          hub,
          state,
          locality,
          activity,
          cp,
          tool,
          useMarketDiversion,
          useWarehouseMonitoring,
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
          existsInRegistry: matchResult.matched,
          registrySiteId: existingSite?.id,
          matchType: matchResult.matchType,
          matchConfidence: matchResult.confidence,
          willUpdate: matchResult.matched && (willUpdateSiteGps || willUpdateResidenceGps || hasSiteGps || hasResidenceGps),
          monitoringCycle: rowMonitoringCycle || undefined,
        };
      };
      
      // Process rows in batches for better performance and UI responsiveness
      for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
        const batchRows = rows.slice(batchStart, batchEnd);
        
        // Process batch in parallel
        const batchResults = await Promise.all(
          batchRows.map((row, i) => processRow(row, batchStart + i))
        );
        
        parsed.push(...batchResults);
        
        // Update progress
        setParsingProgress({ 
          current: batchEnd, 
          total: totalRows, 
          phase: `Processing sites... (${batchEnd}/${totalRows})`
        });
        
        // Yield to UI thread between batches
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      setParsingProgress({ current: totalRows, total: totalRows, phase: 'Complete!' });
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
    
    // Check if any sites are missing a monitoring cycle from the file
    const sitesWithoutCycle = sitesToUpload.filter(s => !s.monitoringCycle);
    if (sitesWithoutCycle.length > 0) {
      toast({
        title: 'Monitoring cycle required',
        description: `${sitesWithoutCycle.length} site(s) are missing a monitoring cycle. Add a "cycle" or "monitoring_cycle" column to your file.`,
        variant: 'destructive',
      });
      return;
    }
    
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
    setUploadPhase('preparing');
    
    const result: UploadResult = {
      total: sitesToUpload.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };
    
    try {
      // Prepare all site data first (faster than doing it in the loop)
      setUploadPhase('preparing');
      const preparedSites: Array<{
        site: ParsedSite;
        isUpdate: boolean;
        data: Record<string, any>;
        newSiteId?: string;
      }> = [];
      
      for (const site of sitesToUpload) {
        if (site.existsInRegistry && site.registrySiteId) {
          const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (site.latitude !== null) updateData.gps_latitude = site.latitude;
          if (site.longitude !== null) updateData.gps_longitude = site.longitude;
          if (site.residenceLatitude !== null) updateData.residence_latitude = site.residenceLatitude;
          if (site.residenceLongitude !== null) updateData.residence_longitude = site.residenceLongitude;
          
          preparedSites.push({ site, isUpdate: true, data: updateData });
        } else {
          const normalizedStateId = normalizeStateId(site.state);
          const stateInfo = sudanStates.find(s => s.id === normalizedStateId);
          const stateName = stateInfo?.name || site.state;
          
          let localityId = '';
          let localityName = site.locality;
          if (stateInfo && site.locality) {
            const normalizedLocality = site.locality.toLowerCase().trim();
            const localityInfo = stateInfo.localities.find(l => 
              l.id.toLowerCase() === normalizedLocality ||
              l.name.toLowerCase() === normalizedLocality ||
              l.name.toLowerCase().includes(normalizedLocality) ||
              normalizedLocality.includes(l.name.toLowerCase())
            );
            if (localityInfo) {
              localityId = localityInfo.id;
              localityName = localityInfo.name;
            }
          }
          
          const siteCode = site.siteId || `SITE-${Date.now()}-${preparedSites.length}`;
          const hubId = normalizedStateId ? getHubForState(normalizedStateId) : site.hub;
          const hubName = normalizedStateId ? getHubNameForState(normalizedStateId) : site.hub;
          const newSiteId = uuidv4();
          
          const insertData: Record<string, any> = {
            id: newSiteId,
            site_code: siteCode,
            site_name: site.siteName || siteCode,
            state_id: normalizedStateId || site.state,
            state_name: stateName,
            locality_id: localityId || site.locality,
            locality_name: localityName,
            hub_name: hubName || site.hub || '',
            activity_type: site.activity || 'GFA',
            cp_name: site.cp || '',
            status: 'active',
            mmp_count: 0,
            created_by: currentUser?.id || 'system',
            created_at: new Date().toISOString(),
          };
          // Only set hub_id if we have a valid hub ID (not empty string)
          if (hubId && hubId.length > 0) {
            insertData.hub_id = hubId;
          }
          
          const lat = site.residenceLatitude ?? site.latitude;
          const lng = site.residenceLongitude ?? site.longitude;
          if (lat !== null) insertData.gps_latitude = lat;
          if (lng !== null) insertData.gps_longitude = lng;
          
          preparedSites.push({ site, isUpdate: false, data: insertData, newSiteId });
        }
      }
      
      // Batch upload with parallel processing (5 concurrent operations)
      setUploadPhase('uploading');
      const BATCH_SIZE = 5;
      const startTime = Date.now();
      
      for (let i = 0; i < preparedSites.length; i += BATCH_SIZE) {
        const batch = preparedSites.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async ({ site, isUpdate, data, newSiteId }) => {
          try {
            if (isUpdate && site.registrySiteId) {
              const { error } = await supabase
                .from('sites_registry')
                .update(data)
                .eq('id', site.registrySiteId);
              
              if (error) {
                return { type: 'error' as const, message: `Row ${site.rowIndex}: ${error.message}` };
              }
              
              // Record monitoring cycle
              await supabase
                .from('site_monitoring_cycles')
                .upsert({
                  site_registry_id: site.registrySiteId,
                  cycle_month: site.monitoringCycle,
                  created_by: currentUser?.id || 'system',
                }, { onConflict: 'site_registry_id,cycle_month' });
              
              return { type: 'updated' as const };
            } else {
              const { error } = await supabase
                .from('sites_registry')
                .insert(data);
              
              if (error) {
                if (error.code === '23505') {
                  return { type: 'skipped' as const };
                }
                return { type: 'error' as const, message: `Row ${site.rowIndex}: ${error.message}` };
              }
              
              // Record monitoring cycle for new site
              if (newSiteId) {
                await supabase
                  .from('site_monitoring_cycles')
                  .insert({
                    site_registry_id: newSiteId,
                    cycle_month: site.monitoringCycle,
                    created_by: currentUser?.id || 'system',
                  });
              }
              
              return { type: 'created' as const };
            }
          } catch (err: any) {
            return { type: 'error' as const, message: `Row ${site.rowIndex}: ${err.message}` };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const res of batchResults) {
          if (res.type === 'created') result.created++;
          else if (res.type === 'updated') result.updated++;
          else if (res.type === 'skipped') result.skipped++;
          else if (res.type === 'error' && res.message) result.errors.push(res.message);
        }
        
        // Update progress with ETA
        const processed = Math.min(i + BATCH_SIZE, preparedSites.length);
        const elapsed = Date.now() - startTime;
        const rate = processed / elapsed;
        const remaining = preparedSites.length - processed;
        const eta = remaining > 0 ? Math.round(remaining / rate / 1000) : 0;
        
        setUploadProgress(Math.round((processed / preparedSites.length) * 100));
        setUploadEta(eta);
      }
      
      setUploadPhase('complete');
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
      setUploadPhase(null);
      setUploadEta(0);
    }
  };

  const validCount = parsedSites.filter(s => s.isValid).length;
  const invalidCount = parsedSites.filter(s => !s.isValid).length;
  const existingCount = parsedSites.filter(s => s.existsInRegistry).length;
  const newCount = parsedSites.filter(s => !s.existsInRegistry && s.isValid).length;
  const matchedBySiteCode = parsedSites.filter(s => s.matchType === 'site_code').length;
  const matchedByNameStateLocality = parsedSites.filter(s => s.matchType === 'name_state_locality').length;
  const matchedByNameState = parsedSites.filter(s => s.matchType === 'name_state').length;
  const matchedByGps = parsedSites.filter(s => s.matchType === 'gps_proximity').length;
  const willUpdateCount = parsedSites.filter(s => s.willUpdate).length;

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
              const template = 'Hub,State,Locality,Site name,CP name,Activity at the site,Tool to be used,Use Market Diversion Monitoring,Use Warehouse Monitoring,SECTION_A/_A05_latitude,SECTION_A/_A05_longitude,SECTION_A/_A05_altitude,SECTION_A/_A05_precision,SECTION_A/_A06_latitude,SECTION_A/_A06_longitude,SECTION_A/_A06_altitude,SECTION_A/_A06_precision\nKassala Hub,Kassala,Reifi Kassla,Health Center A,WFP,DM,ODK,Yes,No,15.4510,36.4045,430.50,5.20,15.4500,36.4000,432.19,6.65';
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
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">{parsingProgress.phase || 'Preparing...'}</span>
                  </div>
                  {parsingProgress.total > 0 && (
                    <div className="w-full max-w-xs mx-auto">
                      <Progress 
                        value={(parsingProgress.current / parsingProgress.total) * 100} 
                        className="h-2"
                      />
                      <p className="text-xs text-center text-muted-foreground mt-1">
                        {parsingProgress.current} of {parsingProgress.total} rows
                      </p>
                    </div>
                  )}
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
            
            {/* Upload Progress Bar */}
            {uploading && (
              <div className="flex-shrink-0 space-y-2 py-3 px-3 bg-primary/10 rounded-md border border-primary/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {uploadPhase === 'preparing' && 'Preparing site data...'}
                    {uploadPhase === 'uploading' && 'Uploading to database...'}
                    {uploadPhase === 'complete' && 'Finalizing...'}
                  </span>
                  <span className="text-muted-foreground">
                    {uploadProgress}% {uploadEta > 0 && `• ~${uploadEta}s remaining`}
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Summary Stats */}
            <div className="flex-shrink-0 flex flex-wrap gap-3 py-2 px-1 bg-muted/50 rounded-md text-sm">
              <div className="flex items-center gap-1">
                <Badge variant="default">{newCount} New</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary">{existingCount} Matched</Badge>
                {existingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({matchedBySiteCode > 0 && `${matchedBySiteCode} by ID`}
                    {matchedBySiteCode > 0 && matchedByNameStateLocality > 0 && ', '}
                    {matchedByNameStateLocality > 0 && `${matchedByNameStateLocality} by name`}
                    {(matchedBySiteCode > 0 || matchedByNameStateLocality > 0) && matchedByGps > 0 && ', '}
                    {matchedByGps > 0 && `${matchedByGps} by GPS`})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline">{willUpdateCount} Will Update</Badge>
              </div>
              {invalidCount > 0 && (
                <div className="flex items-center gap-1">
                  <Badge variant="destructive">{invalidCount} Invalid</Badge>
                </div>
              )}
            </div>
            
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
                  {parsedSites.slice(0, previewLimit).map((site) => (
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
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="text-xs">
                              {site.willUpdate ? 'Will Update' : 'Matched'}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {site.matchType === 'site_code' && 'by Site ID'}
                              {site.matchType === 'name_state_locality' && 'by Name+State+Locality'}
                              {site.matchType === 'name_state' && 'by Name+State'}
                              {site.matchType === 'gps_proximity' && 'by GPS (~500m)'}
                            </span>
                          </div>
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
              
              {/* Show More Button */}
              {parsedSites.length > previewLimit && (
                <div className="py-3 text-center border-t">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPreviewLimit(prev => prev + 50)}
                  >
                    Show {Math.min(50, parsedSites.length - previewLimit)} more 
                    <span className="text-muted-foreground ml-1">
                      (showing {Math.min(previewLimit, parsedSites.length)} of {parsedSites.length})
                    </span>
                  </Button>
                </div>
              )}
            </div>
            
            <DialogFooter className="flex-shrink-0">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <Button onClick={handleUpload} disabled={uploading || selectedRows.size === 0}>
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {uploadPhase === 'preparing' && 'Preparing...'}
                      {uploadPhase === 'uploading' && `Uploading ${uploadProgress}%`}
                      {uploadPhase === 'complete' && 'Finishing...'}
                    </span>
                    {uploadEta > 0 && uploadPhase === 'uploading' && (
                      <span className="text-xs opacity-70">~{uploadEta}s</span>
                    )}
                  </div>
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
