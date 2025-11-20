
import { validateSiteCode } from './mmpIdGenerator';
import { format, parse, isValid } from 'date-fns'; 
import * as XLSX from 'xlsx';

export interface CSVValidationError {
  type: 'error' | 'warning';
  message: string;
  row?: number;
  column?: string;
  category?: string; // Added category for grouping similar errors/warnings
}

export interface CSVValidationSummary {
  total: number;
  categories: Record<string, number>;
}

export interface CSVParseResult {
  isValid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationError[];
  data: any[];
  hubOffices: string[]; // Added to track detected hub offices
  errorSummary: CSVValidationSummary;
  warningSummary: CSVValidationSummary;
}

const REQUIRED_HEADERS = [
  'Hub Office',
  'State',
  'Locality',
  'Site Name',
  'CP Name',
  'Activity at Site',
  'Monitoring By',
  'Survey under Master tool',
  'Use Market Diversion Monitoring',
  'Use Warehouse Monitoring',
  'Visit Date',
  'Comments'
];

// Define regex patterns for date validation
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{2}-\d{2}-\d{4}$/  // DD-MM-YYYY
];

export const validateCSV = async (
  file: File,
  onProgress?: (progress: { current: number; total: number; stage: string }) => void
): Promise<CSVParseResult> => {
  const errors: CSVValidationError[] = [];
  const warnings: CSVValidationError[] = [];
  const data: any[] = [];
  const hubOffices: string[] = []; // Track hub offices found in the file
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  // Canonical required field keys and their header synonyms (normalized)
  const requiredFieldSynonyms: Record<string, string[]> = {
    hubOffice: ['huboffice','hub','office','hubofficename'],
    state: ['state','statename','region','stateprovince'],
    locality: ['locality','localityname','district','county','lga'],
    siteName: ['sitename','site','facilityname','distributionpoint'],
    siteCode: ['sitecode','siteid','code'],
    cpName: ['cpname','cp','partner','partnername','implementingpartner','ipname'],
    siteActivity: ['activityatsite','siteactivity','activitysite','activityatthesite'],
    mainActivity: ['mainactivity','activity','activitydetails'],
    monitoringBy: ['monitoringby','monitoringby:','monitoring by','monitoredby','visitby'],
    surveyTool: ['surveytool','surveyundermastertool','survey under master tool','tooltobeused','tool']
  };

  try {
    // Detect file extension and parse accordingly (Excel or CSV)
    const ext = file.name.split('.').pop()?.toLowerCase();
    let headers: string[] = [];
    let rows: string[][] = [];

    if (ext === 'xlsx' || ext === 'xls') {
      // Parse Excel workbook with memory optimization
      onProgress?.({ current: 0, total: 100, stage: 'Reading Excel file' });
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true, dense: false });

      // Choose the worksheet that best matches required headers (fallback to first sheet)
      const norm = (s: string) => String(s || '').toLowerCase().trim();
      const requiredSet = new Set(REQUIRED_HEADERS.map(h => norm(h)));

      const scoreSheet = (ws: XLSX.WorkSheet): number => {
        const hdr = (XLSX.utils.sheet_to_json(ws, { header: 1, range: 'A1:ZZ1' })[0] as any[] | undefined) || [];
        const normalized = hdr.map(h => norm(String(h)));
        // score by number of required headers present
        return normalized.reduce((acc, h) => acc + (requiredSet.has(h) ? 1 : 0), 0);
      };

      let bestSheetName = wb.SheetNames[0];
      let bestScore = -1;
      for (const name of wb.SheetNames) {
        const wsCandidate = wb.Sheets[name];
        const s = scoreSheet(wsCandidate);
        if (s > bestScore) {
          bestScore = s;
          bestSheetName = name;
        }
      }

      const ws = wb.Sheets[bestSheetName];

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      let bestHeaderRow = range.s.r;
      let bestHeaderScore = -1;
      const scanEnd = Math.min(range.e.r, range.s.r + 20);
      for (let r = range.s.r; r <= scanEnd; r++) {
        const hdr = (XLSX.utils.sheet_to_json(ws, { header: 1, range: `A${r + 1}:ZZ${r + 1}` })[0] as any[] | undefined) || [];
        const normalized = hdr.map(h => norm(String(h)));
        const s = normalized.reduce((acc, h) => acc + (requiredSet.has(h) ? 1 : 0), 0);
        if (s > bestHeaderScore) {
          bestHeaderScore = s;
          bestHeaderRow = r;
        }
      }
      const totalRows = range.e.r - bestHeaderRow;

      if (totalRows < 2) {
        errors.push({
          type: 'error',
          message: 'File is empty or contains only headers',
          category: 'file_structure'
        });
        return {
          isValid: false,
          errors,
          warnings,
          data,
          hubOffices,
          errorSummary: summarizeIssues(errors),
          warningSummary: summarizeIssues(warnings)
        };
      }

      const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: `A${bestHeaderRow + 1}:ZZ${bestHeaderRow + 1}` })[0] as any[];
      headers = (headerRow || []).map(h => String(h ?? '').trim());

      const CHUNK_SIZE = 100;
      const chunks = [];
      for (let startRow = bestHeaderRow + 1; startRow <= range.e.r; startRow += CHUNK_SIZE) {
        const endRow = Math.min(startRow + CHUNK_SIZE - 1, range.e.r);
        const chunkRange = { s: { r: startRow, c: 0 }, e: { r: endRow, c: range.e.c } };
        const chunk = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          range: XLSX.utils.encode_range(chunkRange),
          raw: true
        }) as any[][];
        chunks.push(chunk);

        onProgress?.({
          current: Math.min(startRow + CHUNK_SIZE, range.e.r),
          total: range.e.r,
          stage: `Reading rows ${startRow}-${endRow}`
        });
      }

      // Combine chunks
      rows = chunks.flat().map(r => headers.map((h, idx) => {
        const v = (r || [])[idx];
        if (v === undefined || v === null) return '';
        const hNorm = norm(String(h));
        if (hNorm === 'visitdate' || hNorm === 'date') {
          if (v instanceof Date) return format(v, 'dd-MM-yyyy');
          if (typeof v === 'number') {
            const excelEpoch = Date.UTC(1899, 11, 30);
            const days = Math.floor(v);
            const d = new Date(excelEpoch + days * 24 * 60 * 60 * 1000);
            return format(d, 'dd-MM-yyyy');
          }
        }
        return String(v).trim();
      }));

      // Clean up memory
      chunks.length = 0;
    } else {
      // Parse as CSV text
      onProgress?.({ current: 0, total: 100, stage: 'Reading CSV file' });
      const content = await file.text();
      const lines = content.split(/\r?\n/);

      if (lines.length < 2) {
        errors.push({
          type: 'error',
          message: 'File is empty or contains only headers',
          category: 'file_structure'
        });
        return {
          isValid: false,
          errors,
          warnings,
          data,
          hubOffices,
          errorSummary: summarizeIssues(errors),
          warningSummary: summarizeIssues(warnings)
        };
      }

      // Validate headers
      headers = lines[0].trim().split(',').map(h => h.trim());
      rows = lines.slice(1)
        .filter(line => line.trim() !== '')
        .map(line => line.split(',').map(v => v.trim()));
    }
    
    // Validate headers
    const missingHeaders = REQUIRED_HEADERS.filter(required =>
      !headers.find(h => h === required)
    );

    if (missingHeaders.length > 0) {
      warnings.push({
        type: 'warning',
        message: `Missing headers: ${missingHeaders.join(', ')}`,
        category: 'missing_headers'
      });
    }

    // Track site codes to check for duplicates
    const siteCodes = new Set<string>();

    // Process rows in chunks to avoid blocking the UI and reduce memory pressure
    const VALIDATION_CHUNK_SIZE = 50;
    const totalRows = rows.length;

    onProgress?.({ current: 0, total: totalRows, stage: 'Validating data' });

    // Track duplicates by Site Code or composite key
    const seenKeys = new Map<string, number>();

    for (let chunkStart = 0; chunkStart < totalRows; chunkStart += VALIDATION_CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + VALIDATION_CHUNK_SIZE, totalRows);

      // Process chunk
      for (let i = chunkStart; i < chunkEnd; i++) {
        const values = rows[i];
        const row = i + 2; // Account for header row

        // Create record object - preserve ALL fields from the original CSV
        const record: any = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });

        // Build a normalized header->value map for fast lookup
        const nrec: Record<string, string> = {};
        Object.entries(record).forEach(([k, v]) => { nrec[norm(k)] = String(v ?? ''); });

        // Early skip: if ALL compulsory fields are missing/blank, treat as empty row.
        const getSynValEarly = (syns: string[]) => syns.map(s => nrec[norm(s)]).find(v => v && v.trim() !== '') || '';
        const hasAnyRequiredEarly = (
          getSynValEarly(requiredFieldSynonyms.hubOffice) ||
          getSynValEarly(requiredFieldSynonyms.state) ||
          getSynValEarly(requiredFieldSynonyms.locality) ||
          getSynValEarly(requiredFieldSynonyms.siteName) ||
          getSynValEarly(requiredFieldSynonyms.siteCode) ||
          getSynValEarly(requiredFieldSynonyms.cpName) ||
          getSynValEarly(requiredFieldSynonyms.siteActivity) ||
          getSynValEarly(requiredFieldSynonyms.mainActivity) ||
          getSynValEarly(requiredFieldSynonyms.monitoringBy) ||
          getSynValEarly(requiredFieldSynonyms.surveyTool)
        );
        if (!hasAnyRequiredEarly) {
          continue; // skip silently: do not include in data, errors, or warnings
        }

        // Track Hub Offices for hub validation
        if (record['Hub Office'] && !hubOffices.includes(record['Hub Office'])) {
          hubOffices.push(record['Hub Office']);
        }

        // Handle Visit Date - use today's date if not provided
        if (!record['Visit Date'] || record['Visit Date'].trim() === '') {
          const today = new Date();
          // Use DD-MM-YYYY format for display consistency
          record['Visit Date'] = format(today, 'dd-MM-yyyy');
          record['OriginalDate'] = format(today, 'yyyy-MM-dd'); // Keep internal format for processing
          warnings.push({
            type: 'warning',
            message: 'No visit date provided, using today\'s date',
            row,
            column: 'Visit Date',
            category: 'missing_date'
          });
        } else {
          // Try parsing the date in different formats
          let parsedDate: Date | null = null;

          // Try DD-MM-YYYY format first
          parsedDate = parse(record['Visit Date'], 'dd-MM-yyyy', new Date());

          // If DD-MM-YYYY fails, try YYYY-MM-DD
          if (!isValid(parsedDate)) {
            parsedDate = parse(record['Visit Date'], 'yyyy-MM-dd', new Date());
          }

          // Validate parsed date
          if (!isValid(parsedDate)) {
            // Fallback to today's date but report as warning
            const today = new Date();
            record['OriginalDate'] = format(today, 'yyyy-MM-dd');
            record['Visit Date'] = format(today, 'dd-MM-yyyy');
            warnings.push({
              type: 'warning',
              message: 'Invalid Visit Date format, using today\'s date',
              row,
              column: 'Visit Date',
              category: 'invalid_date_format'
            });
          } else {
            // Store the original format for processing
            record['OriginalDate'] = format(parsedDate, 'yyyy-MM-dd');

            // Keep the display format as DD-MM-YYYY for consistency
            record['Visit Date'] = format(parsedDate, 'dd-MM-yyyy');
          }
        }

        // Validate site code if present
        if (record['Site Code']) {
          if (!validateSiteCode(record['Site Code'])) {
            warnings.push({
              type: 'warning',
              message: 'Site Code must follow pattern [HH][SS][YYMMDD]-[0001] (e.g., KOKH230524-0001)',
              row,
              column: 'Site Code',
              category: 'invalid_site_code'
            });
          } else if (siteCodes.has(record['Site Code'])) {
            warnings.push({
              type: 'warning',
              message: `Duplicate Site Code: ${record['Site Code']}`,
              row,
              column: 'Site Code',
              category: 'duplicate_site_code'
            });
          } else {
            siteCodes.add(record['Site Code']);
          }
        }

        // Blocking validation for required fields using synonyms
        const getVal = (key: keyof typeof requiredFieldSynonyms): string => {
          for (const syn of requiredFieldSynonyms[key]) {
            const v = nrec[syn];
            if (v && v.trim() !== '') return v;
          }
          return '';
        };

        const requiredChecks: Array<{label: string; key: keyof typeof requiredFieldSynonyms}> = [
          { label: 'Hub Office', key: 'hubOffice' },
          { label: 'State', key: 'state' },
          { label: 'Locality', key: 'locality' },
          { label: 'Site Name', key: 'siteName' },
          { label: 'Site ID', key: 'siteCode' },
          { label: 'CP Name', key: 'cpName' },
          { label: 'Activity at Site', key: 'siteActivity' },
          { label: 'Activity Details', key: 'mainActivity' },
          { label: 'Visit by', key: 'monitoringBy' },
          { label: 'Tool to be used', key: 'surveyTool' },
        ];

        requiredChecks.forEach(chk => {
          const v = getVal(chk.key);
          if (!v) {
            errors.push({
              type: 'error',
              message: `Missing ${chk.label}`,
              row,
              column: chk.label,
              category: 'missing_field'
            });
          }
        });

        // Duplicate detection within file
        const sc = getVal('siteCode');
        const siteKey = sc || [getVal('hubOffice'), getVal('state'), getVal('locality'), getVal('siteName'), getVal('cpName')].map(v => v.trim().toLowerCase()).join('|');
        if (siteKey.trim() !== '') {
          if (seenKeys.has(siteKey)) {
            const firstRow = seenKeys.get(siteKey)!;
            errors.push({
              type: 'error',
              message: `Duplicate site found (matches row ${firstRow})`,
              row,
              column: sc ? 'Site ID' : 'Composite Site Fields',
              category: 'duplicate_site'
            });
          } else {
            seenKeys.set(siteKey, row);
          }
        }

        // Validate boolean fields for monitoring plan
        if (record['Use Market Diversion Monitoring']) {
          const value = String(record['Use Market Diversion Monitoring']).toLowerCase().trim();
          if (!['yes', 'no', 'true', 'false', '1', '0', ''].includes(value)) {
            warnings.push({
              type: 'warning',
              message: 'Use Market Diversion Monitoring should be Yes/No',
              row,
              column: 'Use Market Diversion Monitoring',
              category: 'invalid_boolean'
            });
          }
        }

        if (record['Use Warehouse Monitoring']) {
          const value = String(record['Use Warehouse Monitoring']).toLowerCase().trim();
          if (!['yes', 'no', 'true', 'false', '1', '0', ''].includes(value)) {
            warnings.push({
              type: 'warning',
              message: 'Use Warehouse Monitoring should be Yes/No',
              row,
              column: 'Use Warehouse Monitoring',
              category: 'invalid_boolean'
            });
          }
        }

        data.push(record);
      }

      // Update progress after each chunk
      onProgress?.({
        current: chunkEnd,
        total: totalRows,
        stage: `Validated ${chunkEnd} of ${totalRows} rows`
      });

      // Allow UI to update between chunks
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Create summaries of issues by category
    const errorSummary = summarizeIssues(errors);
    const warningSummary = summarizeIssues(warnings);

    // Memory cleanup - clear large arrays that are no longer needed
    rows.length = 0;

    // Force garbage collection if available (development mode)
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }

    // Limit the number of warnings to display to prevent UI issues
    if (warnings.length > 15) {
      const extraWarnings = warnings.length - 15;
      const displayWarnings = warnings.slice(0, 15);
      displayWarnings.push({
        type: 'warning',
        message: `...and ${extraWarnings} more warnings. See validation results for details.`,
        category: 'summary'
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings: displayWarnings, // Return limited warnings for display
        data,
        hubOffices,
        errorSummary,
        warningSummary
      };
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data,
      hubOffices,
      errorSummary,
      warningSummary
    };
    
  } catch (error) {
    errors.push({
      type: 'error',
      message: `Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      category: 'parse_error'
    });
    
    return { 
      isValid: false, 
      errors, 
      warnings, 
      data, 
      hubOffices, 
      errorSummary: summarizeIssues(errors),
      warningSummary: summarizeIssues(warnings)
    };
  }
};

// Helper function to summarize issues by category
function summarizeIssues(issues: CSVValidationError[]): CSVValidationSummary {
  const categories: Record<string, number> = {};
  
  issues.forEach(issue => {
    const category = issue.category || 'other';
    categories[category] = (categories[category] || 0) + 1;
  });
  
  return {
    total: issues.length,
    categories
  };
}

// Add a hub validation function that works with the existing hub structure
export const validateHubMatch = (
  detectedHubOffices: string[], 
  selectedHubId: string,
  hubs: { id: string; name: string; states: string[] }[]
): CSVValidationError[] => {
  const errors: CSVValidationError[] = [];
  
  // Find the selected hub
  const selectedHub = hubs.find(h => h.id === selectedHubId);
  if (!selectedHub) {
    errors.push({
      type: 'error',
      message: `Selected hub '${selectedHubId}' not found`,
      category: 'hub_mismatch'
    });
    return errors;
  }
  
  // Map of hub name to its ID for validation
  const hubNameToId: Record<string, string> = {};
  hubs.forEach(hub => {
    // Add case insensitive hub name mapping
    hubNameToId[hub.name.toLowerCase()] = hub.id;
    // Add shorter versions of hub names (without "Hub Office" suffix)
    const shortenedName = hub.name.replace(/\s+Hub\s+Office$/i, '').toLowerCase();
    hubNameToId[shortenedName] = hub.id;
  });
  
  // Check each detected hub office
  detectedHubOffices.forEach(office => {
    // Normalize office name for case-insensitive comparison
    const normalizedOffice = office.toLowerCase();
    
    let matchFound = false;
    
    // Check if this office name matches the selected hub
    if (
      selectedHub.name.toLowerCase() === normalizedOffice || 
      selectedHub.name.toLowerCase().includes(normalizedOffice) ||
      normalizedOffice.includes(selectedHub.name.toLowerCase()) ||
      normalizedOffice.includes(selectedHub.id.toLowerCase())
    ) {
      matchFound = true;
    }
    
    // Check shortened versions (without "Hub Office" suffix)
    const shortenedSelectedHub = selectedHub.name.replace(/\s+Hub\s+Office$/i, '').toLowerCase();
    if (normalizedOffice === shortenedSelectedHub || normalizedOffice.includes(shortenedSelectedHub)) {
      matchFound = true;
    }
    
    if (!matchFound) {
      errors.push({
        type: 'error',
        message: `Hub Office '${office}' does not belong to selected hub '${selectedHub.name}'`,
        category: 'hub_mismatch'
      });
    }
  });
  
  return errors;
};

// Enhanced function to create a more compact and functional validation summary
export const createValidationSummary = (result: CSVParseResult): string => {
  const parts: string[] = [];
  let errorCount = result.errors.length;
  let warningCount = result.warnings.length;
  
  if (errorCount > 0 || warningCount > 0) {
    // Create a compact header summary
    parts.push(`Validation completed with ${errorCount > 0 ? `${errorCount} errors` : ''} ${errorCount > 0 && warningCount > 0 ? 'and' : ''} ${warningCount > 0 ? `${warningCount} warnings` : ''}`);
    parts.push('');
    
    // Add error summary in a concise format
    if (errorCount > 0) {
      parts.push('Critical issues:');
      Object.entries(result.errorSummary.categories)
        .sort((a, b) => b[1] - a[1]) // Sort by count (highest first)
        .forEach(([category, count]) => {
          const readableCategory = formatCategoryName(category);
          parts.push(`• ${readableCategory}: ${count}`);
        });
    }
    
    // Add warning summary in a concise format
    if (warningCount > 0) {
      if (errorCount > 0) parts.push('');
      parts.push('Warnings:');
      Object.entries(result.warningSummary.categories)
        .sort((a, b) => b[1] - a[1]) // Sort by count (highest first)
        .forEach(([category, count]) => {
          const readableCategory = formatCategoryName(category);
          parts.push(`• ${readableCategory}: ${count}`);
        });
    }
  } else {
    parts.push("Validation completed successfully. No issues found.");
  }
  
  return parts.join("\n");
};

// Create a more compact validation headline for toast notifications
export const createValidationHeadline = (result: CSVParseResult): string => {
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;
  
  if (errorCount > 0) {
    return `CSV Validation: ${errorCount} errors found`;
  } else if (warningCount > 0) {
    return `CSV Validation: ${warningCount} warnings found`;
  } else {
    return "CSV Validation: Successful";
  }
};

// Helper to format category names for display
function formatCategoryName(category: string): string {
  switch (category) {
    case 'missing_headers':
      return 'Missing required headers';
    case 'missing_field':
      return 'Missing required fields';
    case 'invalid_date_format':
      return 'Invalid date format';
    case 'missing_date':
      return 'Missing dates';
    case 'invalid_site_code':
      return 'Invalid site codes';
    case 'duplicate_site_code':
      return 'Duplicate site codes';
    case 'hub_mismatch':
      return 'Hub office mismatches';
    case 'incomplete_activity':
      return 'Incomplete activity info';
    case 'invalid_boolean':
      return 'Invalid boolean values';
    case 'file_structure':
      return 'File structure issues';
    case 'parse_error':
      return 'File parsing issues';
    default:
      return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
