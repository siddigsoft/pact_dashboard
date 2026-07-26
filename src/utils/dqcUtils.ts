// Data Quality Control utilities — works with any ODK/KoBoCollect CSV export

export type QCFlagType =
  | 'SHORT_DURATION'
  | 'LONG_DURATION'
  | 'MISSING_GPS'
  | 'POOR_GPS'
  | 'NO_CONSENT'
  | 'MISSING_PHONE'
  | 'HIGH_NA_RATE'
  | 'DUPLICATE_QN'
  | 'TEST_SUBMISSION'
  | 'NIGHT_SUBMISSION'
  | 'FAST_SEQUENCE'
  | 'ADMIN_MISMATCH';

export const FLAG_META: Record<QCFlagType, { label: string; color: string; desc: string }> = {
  SHORT_DURATION:   { label: 'Short Duration',      color: 'orange', desc: 'Interview completed in under 10 minutes' },
  LONG_DURATION:    { label: 'Long Duration',        color: 'yellow', desc: 'Interview took more than 4 hours' },
  MISSING_GPS:      { label: 'Missing GPS',          color: 'red',    desc: 'No GPS coordinates recorded' },
  POOR_GPS:         { label: 'Poor GPS Accuracy',    color: 'orange', desc: 'GPS precision worse than 10 metres' },
  NO_CONSENT:       { label: 'No Consent',           color: 'red',    desc: 'Respondent consent not recorded as given' },
  MISSING_PHONE:    { label: 'Missing Phone',        color: 'yellow', desc: 'Mobile number not collected' },
  HIGH_NA_RATE:     { label: 'High N/A Rate',        color: 'orange', desc: 'More than 50% of fields are n/a' },
  DUPLICATE_QN:     { label: 'Duplicate QN',         color: 'red',    desc: 'Questionnaire number appears more than once' },
  TEST_SUBMISSION:  { label: 'Test Submission',      color: 'red',    desc: 'Likely a test entry (suspicious questionnaire number or admin name)' },
  NIGHT_SUBMISSION: { label: 'Night Submission',     color: 'yellow', desc: 'Interview started before 06:00 or after 19:00' },
  FAST_SEQUENCE:    { label: 'Fast Sequence',        color: 'orange', desc: 'Less than 5 minutes between consecutive submissions by the same enumerator' },
  ADMIN_MISMATCH:   { label: 'Admin Name Mismatch',  color: 'yellow', desc: 'Same admin3 code has inconsistent name spellings across submissions' },
};

export interface ParsedRow {
  _index: number;
  _flags: QCFlagType[];
  _durationMin: number | null;
  _naRate: number;
  [key: string]: unknown;
}

export interface DetectedColumns {
  enumerator: string;
  supervisor: string;
  start: string;
  end: string;
  today: string;
  deviceId: string;
  gpsLat: string;
  gpsLon: string;
  gpsPrecision: string;
  admin1: string;
  admin2: string;
  admin3: string;
  admin3Code: string;
  questionnaireNo: string;
  householdNo: string;
  consent: string;
  phone: string;
}

export interface EnumeratorStats {
  name: string;
  total: number;
  flagged: number;
  cleanRate: number;
  avgDurationMin: number | null;
  missingGps: number;
  noConsent: number;
  shortDuration: number;
  longDuration: number;
  highNaRate: number;
  duplicateQn: number;
  testSubmissions: number;
  nightSubmissions: number;
  fastSequence: number;
  flagsByType: Partial<Record<QCFlagType, number>>;
  activeDates: string[];
  admin3Areas: Set<string>;
  submissions: ParsedRow[];
}

export interface DatasetSummary {
  totalRows: number;
  flaggedRows: number;
  cleanRate: number;
  dateRange: { min: string; max: string };
  enumerators: string[];
  admin1Values: string[];
  admin2Values: string[];
  admin3Values: string[];
  avgDurationMin: number | null;
  missingGpsPct: number;
  flagCounts: Partial<Record<QCFlagType, number>>;
}

// ── CSV parsing ────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Handle quoted fields
  function splitLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// ── Column auto-detection ──────────────────────────────────────────────────
function findCol(headers: string[], candidates: string[]): string {
  const lower = headers.map(h => h.toLowerCase().replace(/[\s/_-]/g, ''));
  for (const c of candidates) {
    const cl = c.toLowerCase().replace(/[\s/_-]/g, '');
    const idx = lower.indexOf(cl);
    if (idx >= 0) return headers[idx];
  }
  return '';
}

export function autoDetectColumns(headers: string[]): DetectedColumns {
  return {
    enumerator:      findCol(headers, ['N/EnuName','enumerator_name','EnuName','enum_name','enumerator','collector','interviewer']),
    supervisor:      findCol(headers, ['N/EnuSupervisorName','supervisor_name','supervisor','EnuSupervisorName']),
    start:           findCol(headers, ['N/start','start','_start','starttime']),
    end:             findCol(headers, ['N/end','end','_end','endtime']),
    today:           findCol(headers, ['N/today','today','_today','date','submission_date']),
    deviceId:        findCol(headers, ['N/deviceid','deviceid','device_id','_device_id']),
    gpsLat:          findCol(headers, ['N/_GPS_latitude','_GPS_latitude','gps_latitude','latitude','_latitude']),
    gpsLon:          findCol(headers, ['N/_GPS_longitude','_GPS_longitude','gps_longitude','longitude','_longitude']),
    gpsPrecision:    findCol(headers, ['N/_GPS_precision','_GPS_precision','gps_accuracy','precision','accuracy','_accuracy']),
    admin1:          findCol(headers, ['N/ADMIN1Name','ADMIN1Name','admin1','state','governorate','region']),
    admin2:          findCol(headers, ['N/ADMIN2Name','ADMIN2Name','admin2','district','locality']),
    admin3:          findCol(headers, ['N/ADMIN3Name','ADMIN3Name','admin3','village','community','locality_name']),
    admin3Code:      findCol(headers, ['N/ADMIN3Code','ADMIN3Code','admin3_code','village_code','locality_code']),
    questionnaireNo: findCol(headers, ['N/Questionnaire_Number','Questionnaire_Number','questionnaire_no','_uuid','_id','uuid']),
    householdNo:     findCol(headers, ['N/QHouseold_Number','QHouseold_Number','household_no','hh_number','hhid']),
    consent:         findCol(headers, ['ConsentAss_submodule/RESPConsent','RESPConsent','consent','respondent_consent']),
    phone:           findCol(headers, ['ConsentAss_submodule/QMobile_Number','QMobile_Number','mobile','phone','contact_number']),
  };
}

// ── Helper ─────────────────────────────────────────────────────────────────
function isNA(val: string | undefined): boolean {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return v === 'n/a' || v === 'na' || v === '' || v === 'null' || v === 'none';
}

function toDate(val: string): Date | null {
  if (!val || isNA(val)) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function durationMin(startVal: string, endVal: string): number | null {
  const s = toDate(startVal);
  const e = toDate(endVal);
  if (!s || !e) return null;
  const ms = e.getTime() - s.getTime();
  if (ms < 0) return null;
  return ms / 60000;
}

// ── Main QC engine ─────────────────────────────────────────────────────────
export function runQC(
  rawRows: Record<string, string>[],
  cols: DetectedColumns
): { rows: ParsedRow[]; summary: DatasetSummary; byEnumerator: Map<string, EnumeratorStats> } {

  // First pass: compute basic fields and find duplicates
  const qnCounts: Record<string, number> = {};
  const admin3Map: Record<string, Set<string>> = {}; // code -> set of names

  rawRows.forEach(r => {
    const qn = cols.questionnaireNo ? r[cols.questionnaireNo] : '';
    if (qn && !isNA(qn)) qnCounts[qn] = (qnCounts[qn] ?? 0) + 1;

    const code = cols.admin3Code ? r[cols.admin3Code] : '';
    const name = cols.admin3 ? r[cols.admin3]?.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    if (code && !isNA(code) && name && !isNA(name)) {
      if (!admin3Map[code]) admin3Map[code] = new Set();
      admin3Map[code].add(name);
    }
  });

  // Sort by enumerator + start for sequence checking
  const sorted = [...rawRows].map((r, i) => ({ r, origIdx: i })).sort((a, b) => {
    const eA = cols.enumerator ? a.r[cols.enumerator] ?? '' : '';
    const eB = cols.enumerator ? b.r[cols.enumerator] ?? '' : '';
    if (eA < eB) return -1;
    if (eA > eB) return 1;
    const tA = toDate(cols.start ? a.r[cols.start] : '')?.getTime() ?? 0;
    const tB = toDate(cols.start ? b.r[cols.start] : '')?.getTime() ?? 0;
    return tA - tB;
  });

  const parsedRows: ParsedRow[] = new Array(rawRows.length);

  // Track previous submission per enumerator for fast-sequence check
  const lastSubmission: Record<string, Date> = {};

  sorted.forEach(({ r, origIdx }) => {
    const flags: QCFlagType[] = [];

    // Duration
    const durMin = durationMin(
      cols.start ? r[cols.start] : '',
      cols.end ? r[cols.end] : ''
    );
    if (durMin !== null) {
      if (durMin < 10) flags.push('SHORT_DURATION');
      if (durMin > 240) flags.push('LONG_DURATION');
    }

    // GPS
    const lat = cols.gpsLat ? r[cols.gpsLat] : '';
    const prec = cols.gpsPrecision ? r[cols.gpsPrecision] : '';
    if (isNA(lat)) {
      flags.push('MISSING_GPS');
    } else if (!isNA(prec)) {
      const precVal = parseFloat(prec);
      if (!isNaN(precVal) && precVal > 10) flags.push('POOR_GPS');
    }

    // Consent
    if (cols.consent && !isNA(r[cols.consent]) && r[cols.consent].trim() !== '1') {
      flags.push('NO_CONSENT');
    }

    // Missing phone
    if (cols.phone && isNA(r[cols.phone])) flags.push('MISSING_PHONE');

    // High n/a rate
    const allVals = Object.values(r);
    const naCount = allVals.filter(v => isNA(v)).length;
    const naRate = allVals.length > 0 ? naCount / allVals.length : 0;
    if (naRate > 0.5) flags.push('HIGH_NA_RATE');

    // Duplicate QN
    const qn = cols.questionnaireNo ? r[cols.questionnaireNo] : '';
    if (qn && !isNA(qn) && (qnCounts[qn] ?? 0) > 1) flags.push('DUPLICATE_QN');

    // Test submission
    const isTestQN = qn && /^(1234567|0000|9999|test|demo)/i.test(qn.trim());
    const admin3Name = cols.admin3 ? r[cols.admin3]?.trim() : '';
    const isTestAdmin = admin3Name && /^(r|test|demo|x|y|z)$/i.test(admin3Name);
    if (isTestQN || isTestAdmin) flags.push('TEST_SUBMISSION');

    // Night submission
    const startDate = toDate(cols.start ? r[cols.start] : '');
    if (startDate) {
      const hour = startDate.getHours();
      if (hour < 6 || hour >= 19) flags.push('NIGHT_SUBMISSION');
    }

    // Fast sequence
    const enu = cols.enumerator ? r[cols.enumerator] ?? 'Unknown' : 'Unknown';
    if (startDate && lastSubmission[enu]) {
      const gapMin = (startDate.getTime() - lastSubmission[enu].getTime()) / 60000;
      if (gapMin >= 0 && gapMin < 5) flags.push('FAST_SEQUENCE');
    }
    if (startDate) lastSubmission[enu] = startDate;

    // Admin3 mismatch
    const a3code = cols.admin3Code ? r[cols.admin3Code] : '';
    if (a3code && !isNA(a3code) && (admin3Map[a3code]?.size ?? 0) > 1) {
      flags.push('ADMIN_MISMATCH');
    }

    parsedRows[origIdx] = {
      ...r,
      _index: origIdx,
      _flags: flags,
      _durationMin: durMin,
      _naRate: naRate,
    };
  });

  // ── By-enumerator aggregation ──────────────────────────────────────────
  const byEnumerator = new Map<string, EnumeratorStats>();

  parsedRows.forEach(row => {
    const name = cols.enumerator ? String(row[cols.enumerator] ?? 'Unknown') : 'Unknown';
    if (!byEnumerator.has(name)) {
      byEnumerator.set(name, {
        name,
        total: 0,
        flagged: 0,
        cleanRate: 0,
        avgDurationMin: null,
        missingGps: 0,
        noConsent: 0,
        shortDuration: 0,
        longDuration: 0,
        highNaRate: 0,
        duplicateQn: 0,
        testSubmissions: 0,
        nightSubmissions: 0,
        fastSequence: 0,
        flagsByType: {},
        activeDates: [],
        admin3Areas: new Set(),
        submissions: [],
      });
    }
    const st = byEnumerator.get(name)!;
    st.total++;
    if (row._flags.length > 0) st.flagged++;
    if (row._flags.includes('MISSING_GPS'))   st.missingGps++;
    if (row._flags.includes('NO_CONSENT'))    st.noConsent++;
    if (row._flags.includes('SHORT_DURATION')) st.shortDuration++;
    if (row._flags.includes('LONG_DURATION')) st.longDuration++;
    if (row._flags.includes('HIGH_NA_RATE'))  st.highNaRate++;
    if (row._flags.includes('DUPLICATE_QN'))  st.duplicateQn++;
    if (row._flags.includes('TEST_SUBMISSION')) st.testSubmissions++;
    if (row._flags.includes('NIGHT_SUBMISSION')) st.nightSubmissions++;
    if (row._flags.includes('FAST_SEQUENCE')) st.fastSequence++;
    row._flags.forEach(f => { st.flagsByType[f] = (st.flagsByType[f] ?? 0) + 1; });
    const dateStr = cols.today ? String(row[cols.today] ?? '') : '';
    if (dateStr && !st.activeDates.includes(dateStr)) st.activeDates.push(dateStr);
    const a3 = cols.admin3 ? String(row[cols.admin3] ?? '').trim() : '';
    if (a3 && !isNA(a3)) st.admin3Areas.add(a3);
    st.submissions.push(row);
  });

  // Compute averages
  byEnumerator.forEach(st => {
    st.cleanRate = st.total > 0 ? Math.round(((st.total - st.flagged) / st.total) * 100) : 100;
    const durs = st.submissions.map(s => s._durationMin).filter((d): d is number => d !== null);
    st.avgDurationMin = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  });

  // ── Global summary ─────────────────────────────────────────────────────
  const flaggedRows = parsedRows.filter(r => r._flags.length > 0).length;
  const flagCounts: Partial<Record<QCFlagType, number>> = {};
  parsedRows.forEach(r => r._flags.forEach(f => { flagCounts[f] = (flagCounts[f] ?? 0) + 1; }));

  const dates = parsedRows
    .map(r => cols.today ? String(r[cols.today] ?? '') : '')
    .filter(d => d && !isNA(d))
    .sort();
  const durationList = parsedRows.map(r => r._durationMin).filter((d): d is number => d !== null);
  const gpsCount = parsedRows.filter(r => isNA(cols.gpsLat ? String(r[cols.gpsLat] ?? '') : '')).length;

  const summary: DatasetSummary = {
    totalRows: parsedRows.length,
    flaggedRows,
    cleanRate: parsedRows.length > 0 ? Math.round(((parsedRows.length - flaggedRows) / parsedRows.length) * 100) : 100,
    dateRange: { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' },
    enumerators: [...new Set(parsedRows.map(r => cols.enumerator ? String(r[cols.enumerator] ?? '') : '').filter(Boolean))].sort(),
    admin1Values: [...new Set(parsedRows.map(r => cols.admin1 ? String(r[cols.admin1] ?? '').trim() : '').filter(v => v && !isNA(v)))].sort(),
    admin2Values: [...new Set(parsedRows.map(r => cols.admin2 ? String(r[cols.admin2] ?? '').trim() : '').filter(v => v && !isNA(v)))].sort(),
    admin3Values: [...new Set(parsedRows.map(r => cols.admin3 ? String(r[cols.admin3] ?? '').trim() : '').filter(v => v && !isNA(v)))].sort(),
    avgDurationMin: durationList.length > 0 ? Math.round(durationList.reduce((a, b) => a + b, 0) / durationList.length) : null,
    missingGpsPct: parsedRows.length > 0 ? Math.round((gpsCount / parsedRows.length) * 100) : 0,
    flagCounts,
  };

  return { rows: parsedRows, summary, byEnumerator };
}

export { parseCSV, isNA };
