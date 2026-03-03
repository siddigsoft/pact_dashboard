export const isPdmActivity = (activity: string): boolean =>
  /pdm/i.test(activity) || /post\s*distribution\s*monitoring/i.test(activity);

export const isMdmRequired = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
};

export const isWhmRequired = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
};

const DM_KEYWORDS = ['gfa', 'gfa cbt', 'e-bsfp', 'ebsfp', 'distribution monitoring'];

export const isDmActivity = (activity: string): boolean => {
  if (!activity) return false;
  const lower = activity.toLowerCase().trim();
  if (lower === 'dm') return true;
  return DM_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' ') || lower.includes(' ' + k));
};

const AIM_KEYWORDS = ['aim', 'tsfp', 'psn', 'ffa', 'sf', 'thr', 'phl'];

export const isAimActivity = (activity: string): boolean => {
  if (!activity) return false;
  const lower = activity.toLowerCase().trim();
  return AIM_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' ') || lower.startsWith(k + '-'));
};

export const PDM_QUESTIONNAIRES_PER_VISIT = 7;

export const calculatePdmSiteVisits = (questionnaires: number): number =>
  Math.floor(questionnaires / PDM_QUESTIONNAIRES_PER_VISIT);

export const calculatePdmRemainder = (questionnaires: number): number =>
  questionnaires % PDM_QUESTIONNAIRES_PER_VISIT;
