export const isPdmActivity = (activity: string): boolean =>
  /pdm/i.test(activity) || /post\s*distribution\s*monitoring/i.test(activity);

export const isMdmRequired = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
};

export const PDM_QUESTIONNAIRES_PER_VISIT = 7;

export const calculatePdmSiteVisits = (questionnaires: number): number =>
  Math.floor(questionnaires / PDM_QUESTIONNAIRES_PER_VISIT);

export const calculatePdmRemainder = (questionnaires: number): number =>
  questionnaires % PDM_QUESTIONNAIRES_PER_VISIT;
