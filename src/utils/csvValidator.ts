
// Fix the import to use validateSiteCode
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
  'Main Activity',
  'Activity at Site',
  'Visit Type',
  'Visit Date',
  'Comments'
];

// Define regex patterns for date validation
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{2}-\d{2}-\d{4}$/  // DD-MM-YYYY
];

export const validateCSV = async (file: File): Promise<CSVParseResult> => {
  const errors: CSVValidationError[] = [];
  const warnings: CSVValidationError[] = [];
  const data: any[] = [];
  const hubOffices: string[] = []; // Track hub offices found in the file
  
  try {
    // Detect file extension and parse accordingly (Excel or CSV)
    const ext = file.name.split('.').pop()?.toLowerCase();
    let headers: string[] = [];
    let rows: string[][] = [];
    
    if (ext === 'xlsx' || ext === 'xls') {
      // Parse Excel workbook
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
      
      if (!aoa || aoa.length < 2) {
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
      
      headers = (aoa[0] || []).map(h => String(h ?? '').trim());
      rows = aoa.slice(1).map(r => headers.map((h, idx) => {
        const v = (r || [])[idx];
        if (v === undefined || v === null) return '';
        // Normalize Excel date cells or serials specifically for Visit Date
        if (h === 'Visit Date') {
          if (v instanceof Date) return format(v, 'dd-MM-yyyy');
          if (typeof v === 'number') {
            // Convert Excel serial (1900 date system) to JS Date
            const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30
            const days = Math.floor(v);
            const d = new Date(excelEpoch + days * 24 * 60 * 60 * 1000);
            return format(d, 'dd-MM-yyyy');
          }
        }
        return String(v).trim();
      }));
    } else {
      // Parse as CSV text
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
      errors.push({
        type: 'error',
        message: `Missing required headers: ${missingHeaders.join(', ')}`,
        category: 'missing_headers'
      });
    }
    
    // Track site codes to check for duplicates
    const siteCodes = new Set<string>();
    
    // Validate each row
    for (let i = 0; i < rows.length; i++) {
      const values = rows[i];
      const row = i + 2; // Account for header row
      
      // Create record object - preserve ALL fields from the original CSV
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      
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
          errors.push({
            type: 'error',
            message: 'Visit Date must be in DD-MM-YYYY or YYYY-MM-DD format',
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
          errors.push({
            type: 'error',
            message: 'Site Code must follow pattern [HH][SS][YYMMDD]-[0001] (e.g., KOKH230524-0001)',
            row,
            column: 'Site Code',
            category: 'invalid_site_code'
          });
        } else if (siteCodes.has(record['Site Code'])) {
          errors.push({
            type: 'error',
            message: `Duplicate Site Code: ${record['Site Code']}`,
            row,
            column: 'Site Code',
            category: 'duplicate_site_code'
          });
        } else {
          siteCodes.add(record['Site Code']);
        }
      }
      
      // Check for missing required fields
      if (!record['Hub Office']) {
        warnings.push({
          type: 'warning',
          message: 'Missing Hub Office',
          row,
          column: 'Hub Office',
          category: 'missing_field'
        });
      }
      
      if (!record['State']) {
        warnings.push({
          type: 'warning',
          message: 'Missing State',
          row,
          column: 'State',
          category: 'missing_field'
        });
      }
      
      if (!record['Site Name']) {
        warnings.push({
          type: 'warning',
          message: 'Missing Site Name',
          row,
          column: 'Site Name',
          category: 'missing_field'
        });
      }
      
      // Check for incomplete tool information
      if (!record['Main Activity'] || !record['Activity at Site']) {
        warnings.push({
          type: 'warning',
          message: 'Incomplete activity/tool information',
          row,
          category: 'incomplete_activity'
        });
      }
      
      data.push(record);
    }
    
    // Create summaries of issues by category
    const errorSummary = summarizeIssues(errors);
    const warningSummary = summarizeIssues(warnings);
    
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
    case 'file_structure':
      return 'File structure issues';
    case 'parse_error':
      return 'File parsing issues';
    default:
      return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
