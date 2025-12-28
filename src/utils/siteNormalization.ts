import { sudanStates } from '@/data/sudanStates';

export interface MMPSiteEntry {
  id: string;
  site_code: string | null;
  site_name: string | null;
  state: string | null;
  locality: string | null;
  hub_office: string | null;
  registry_site_id: string | null;
  created_at: string | null;
  cp_name: string | null;
  activity_at_site: string | null;
  monitoring_by: string | null;
  survey_tool: string | null;
  visit_date: string | null;
  visit_type: string | null;
  main_activity: string | null;
  use_market_diversion: boolean | null;
  use_warehouse_monitoring: boolean | null;
  comments: string | null;
  additional_data: Record<string, any> | null;
  status: string | null;
  mmp_file_id?: string | null;
}

export interface NormalizedSiteData {
  stateId: string | null;
  stateName: string;
  localityId: string | null;
  localityName: string;
  normalizedSiteKey: string;
  normalizedSiteCode: string;
}

const stateAliases: Record<string, string> = {
  'river nile': 'river-nile',
  'river nile state': 'river-nile',
  'nahr an nil': 'river-nile',
  'nile river': 'river-nile',
  'blue nile': 'blue-nile',
  'blue nile state': 'blue-nile',
  'an nil al azraq': 'blue-nile',
  'white nile': 'white-nile',
  'white nile state': 'white-nile',
  'an nil al abyad': 'white-nile',
  'red sea': 'red-sea',
  'red sea state': 'red-sea',
  'al bahr al ahmar': 'red-sea',
  'north darfur': 'north-darfur',
  'north darfur state': 'north-darfur',
  'shamal darfur': 'north-darfur',
  'south darfur': 'south-darfur',
  'south darfur state': 'south-darfur',
  'janub darfur': 'south-darfur',
  'west darfur': 'west-darfur',
  'west darfur state': 'west-darfur',
  'gharb darfur': 'west-darfur',
  'east darfur': 'east-darfur',
  'east darfur state': 'east-darfur',
  'sharq darfur': 'east-darfur',
  'central darfur': 'central-darfur',
  'central darfur state': 'central-darfur',
  'wasat darfur': 'central-darfur',
  'north kordofan': 'north-kordofan',
  'north kordofan state': 'north-kordofan',
  'shamal kurdufan': 'north-kordofan',
  'south kordofan': 'south-kordofan',
  'south kordofan state': 'south-kordofan',
  'janub kurdufan': 'south-kordofan',
  'west kordofan': 'west-kordofan',
  'west kordofan state': 'west-kordofan',
  'gharb kurdufan': 'west-kordofan',
  'northern': 'northern',
  'northern state': 'northern',
  'ash shamaliyah': 'northern',
  'khartoum': 'khartoum',
  'khartoum state': 'khartoum',
  'al khartum': 'khartoum',
  'kassala': 'kassala',
  'kassala state': 'kassala',
  'gedaref': 'gedaref',
  'gedaref state': 'gedaref',
  'al qadarif': 'gedaref',
  'al gedaref': 'gedaref',
  'gezira': 'gezira',
  'gezira state': 'gezira',
  'aj jazirah': 'gezira',
  'al jazirah': 'gezira',
  'sennar': 'sennar',
  'sennar state': 'sennar',
  'sinnar': 'sennar',
  'abyei': 'abyei',
  'abyei pca': 'abyei',
};

export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '');
}

export function normalizeStateId(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  
  const normalized = normalizeText(stateName);
  
  if (stateAliases[normalized]) {
    return stateAliases[normalized];
  }
  
  const kebabCase = normalized.replace(/\s+/g, '-');
  const found = sudanStates.find(s => 
    s.id === kebabCase || 
    normalizeText(s.name) === normalized ||
    s.id === normalized
  );
  
  return found?.id || null;
}

export function normalizeLocalityId(
  localityName: string | null | undefined, 
  stateId: string | null | undefined
): string | null {
  if (!localityName || !stateId) return null;
  
  const normalizedLocality = normalizeText(localityName);
  const state = sudanStates.find(s => s.id === stateId);
  
  if (!state) return null;
  
  const exactMatch = state.localities.find(l => 
    l.id === normalizedLocality ||
    normalizeText(l.name) === normalizedLocality
  );
  
  if (exactMatch) return exactMatch.id;
  
  const fuzzyMatch = state.localities.find(l => {
    const locNorm = normalizeText(l.name);
    return locNorm.includes(normalizedLocality) || 
           normalizedLocality.includes(locNorm) ||
           levenshteinDistance(locNorm, normalizedLocality) <= 2;
  });
  
  return fuzzyMatch?.id || null;
}

export function normalizeSiteCode(siteCode: string | null | undefined): string {
  if (!siteCode) return '';
  return siteCode.toLowerCase().trim().replace(/\s+/g, '');
}

export function generateNormalizedSiteKey(
  siteCode: string | null | undefined,
  siteName: string | null | undefined,
  state: string | null | undefined,
  locality: string | null | undefined
): string {
  const parts = [
    normalizeSiteCode(siteCode),
    normalizeText(siteName),
    normalizeText(state),
    normalizeText(locality)
  ];
  return parts.join('|');
}

export function generateAlternateSiteKeys(
  siteCode: string | null | undefined,
  siteName: string | null | undefined,
  state: string | null | undefined,
  locality: string | null | undefined
): string[] {
  const keys: string[] = [];
  
  keys.push(generateNormalizedSiteKey(siteCode, siteName, state, locality));
  
  if (siteCode) {
    keys.push(`code:${normalizeSiteCode(siteCode)}`);
  }
  
  if (siteName && state) {
    keys.push(`name-state:${normalizeText(siteName)}|${normalizeText(state)}`);
  }
  
  if (siteName && locality) {
    keys.push(`name-locality:${normalizeText(siteName)}|${normalizeText(locality)}`);
  }
  
  return keys;
}

export function findMatchingMmpEntry(
  site: { id?: string; site_code?: string; site_name?: string; state_name?: string; locality_name?: string },
  mmpByRegistryId: Record<string, MMPSiteEntry>,
  mmpBySiteKey: Record<string, MMPSiteEntry>,
  mmpBySiteCode: Record<string, MMPSiteEntry>
): MMPSiteEntry | null {
  if (site.id && mmpByRegistryId[site.id]) {
    return mmpByRegistryId[site.id];
  }
  
  if (site.site_code) {
    const normalizedCode = normalizeSiteCode(site.site_code);
    if (mmpBySiteCode[normalizedCode]) {
      return mmpBySiteCode[normalizedCode];
    }
  }
  
  const primaryKey = generateNormalizedSiteKey(
    site.site_code,
    site.site_name,
    site.state_name,
    site.locality_name
  );
  if (mmpBySiteKey[primaryKey]) {
    return mmpBySiteKey[primaryKey];
  }
  
  const alternateKeys = generateAlternateSiteKeys(
    site.site_code,
    site.site_name,
    site.state_name,
    site.locality_name
  );
  for (const key of alternateKeys) {
    if (mmpBySiteKey[key]) {
      return mmpBySiteKey[key];
    }
  }
  
  return null;
}

export function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'y';
  }
  return false;
}

export function enrichSiteWithMmpData(
  site: Record<string, any>,
  mmpEntry: MMPSiteEntry | null
): Record<string, any> {
  if (!mmpEntry) return site;
  
  return {
    ...site,
    cp_name: mmpEntry.cp_name || site.cp_name || '',
    cpName: mmpEntry.cp_name || site.cpName || '',
    activity_at_site: mmpEntry.activity_at_site || site.activity_at_site || '',
    siteActivity: mmpEntry.activity_at_site || site.siteActivity || '',
    monitoring_by: mmpEntry.monitoring_by || site.monitoring_by || '',
    monitoringBy: mmpEntry.monitoring_by || site.monitoringBy || '',
    survey_tool: mmpEntry.survey_tool || site.survey_tool || '',
    surveyTool: mmpEntry.survey_tool || site.surveyTool || '',
    visit_date: mmpEntry.visit_date || site.visit_date || '',
    visitDate: mmpEntry.visit_date || site.visitDate || '',
    visit_type: mmpEntry.visit_type || site.visit_type || '',
    visitType: mmpEntry.visit_type || site.visitType || '',
    main_activity: mmpEntry.main_activity || site.main_activity || '',
    mainActivity: mmpEntry.main_activity || site.mainActivity || '',
    use_market_diversion: parseBoolean(mmpEntry.use_market_diversion) || parseBoolean(site.use_market_diversion),
    useMarketDiversion: parseBoolean(mmpEntry.use_market_diversion) || parseBoolean(site.useMarketDiversion),
    use_warehouse_monitoring: parseBoolean(mmpEntry.use_warehouse_monitoring) || parseBoolean(site.use_warehouse_monitoring),
    useWarehouseMonitoring: parseBoolean(mmpEntry.use_warehouse_monitoring) || parseBoolean(site.useWarehouseMonitoring),
    hub_office: mmpEntry.hub_office || site.hub_office || '',
    hubOffice: mmpEntry.hub_office || site.hubOffice || '',
    comments: mmpEntry.comments || site.comments || '',
    additional_data: { ...(site.additional_data || {}), ...(mmpEntry.additional_data || {}) },
    additionalData: { ...(site.additionalData || {}), ...(mmpEntry.additional_data || {}) },
    mmp_entry_id: mmpEntry.id,
  };
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

export function aggregateMmpHistory(mmpEntries: MMPSiteEntry[]): {
  count: number;
  latestEntry: MMPSiteEntry | null;
  allEntries: MMPSiteEntry[];
} {
  if (!mmpEntries || mmpEntries.length === 0) {
    return { count: 0, latestEntry: null, allEntries: [] };
  }
  
  const sorted = [...mmpEntries].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });
  
  return {
    count: sorted.length,
    latestEntry: sorted[0],
    allEntries: sorted
  };
}

export function buildMmpLookupMaps(mmpSites: MMPSiteEntry[]): {
  byRegistryId: Record<string, MMPSiteEntry[]>;
  bySiteKey: Record<string, MMPSiteEntry[]>;
  bySiteCode: Record<string, MMPSiteEntry[]>;
} {
  const byRegistryId: Record<string, MMPSiteEntry[]> = {};
  const bySiteKey: Record<string, MMPSiteEntry[]> = {};
  const bySiteCode: Record<string, MMPSiteEntry[]> = {};
  
  for (const mmpSite of mmpSites) {
    if (mmpSite.registry_site_id) {
      if (!byRegistryId[mmpSite.registry_site_id]) {
        byRegistryId[mmpSite.registry_site_id] = [];
      }
      byRegistryId[mmpSite.registry_site_id].push(mmpSite);
    }
    
    const primaryKey = generateNormalizedSiteKey(
      mmpSite.site_code,
      mmpSite.site_name,
      mmpSite.state,
      mmpSite.locality
    );
    if (!bySiteKey[primaryKey]) {
      bySiteKey[primaryKey] = [];
    }
    bySiteKey[primaryKey].push(mmpSite);
    
    const alternateKeys = generateAlternateSiteKeys(
      mmpSite.site_code,
      mmpSite.site_name,
      mmpSite.state,
      mmpSite.locality
    );
    for (const key of alternateKeys) {
      if (!bySiteKey[key]) {
        bySiteKey[key] = [];
      }
      if (!bySiteKey[key].includes(mmpSite)) {
        bySiteKey[key].push(mmpSite);
      }
    }
    
    if (mmpSite.site_code) {
      const normalizedCode = normalizeSiteCode(mmpSite.site_code);
      if (!bySiteCode[normalizedCode]) {
        bySiteCode[normalizedCode] = [];
      }
      bySiteCode[normalizedCode].push(mmpSite);
    }
  }
  
  return { byRegistryId, bySiteKey, bySiteCode };
}
