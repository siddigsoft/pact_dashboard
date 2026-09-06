import type { MatchPair } from '@/utils/fuzzyMatcher';

const MMP_MATCH_ALIASES: Array<{ mmpCol: string; keywords: string[] }> = [
  // Site identity must never consume an activity question. Keep aliases
  // location-specific and deliberately exclude the broad word "site".
  { mmpCol: 'site_name', keywords: ['exact location name', 'exact site name', 'site name', 'location name', 'village name', 'موقع'] },
  { mmpCol: 'state', keywords: ['state of the site', 'state', 'governorate', 'ولاية'] },
  { mmpCol: 'locality', keywords: ['locality of the site', 'locality', 'district', 'محلية'] },
  { mmpCol: 'activity_at_site', keywords: ['confirm the activity', 'activity of the site', 'activity', 'programme', 'النشاط'] },
  { mmpCol: 'enumerator_name', keywords: ['name of interviewer', 'enumerator name', 'enumerator', 'data collector', 'interviewer', 'المعدد', 'اسم المعدد'] },
  { mmpCol: 'monitoring_by', keywords: ['monitoring by', 'monitored by', 'رقابة', 'مراقب'] },
  { mmpCol: 'site_code', keywords: ['site code', 'site id', 'site_code', 'location code', 'location id'] },
  { mmpCol: 'hub_office', keywords: ['hub', 'office'] },
  { mmpCol: 'cp_name', keywords: ['cp name', 'cooperating partner', 'community point'] },
];

export function autoDetectPairs(mmpCols: string[], wfpCols: string[]): MatchPair[] {
  const pairs: MatchPair[] = [];
  const usedWfp = new Set<string>();
  const wfpLower = wfpCols.map(column => column.toLowerCase());

  for (const { mmpCol, keywords } of MMP_MATCH_ALIASES) {
    if (!mmpCols.includes(mmpCol)) continue;
    let matched: string | null = null;
    outer:
    for (const keyword of keywords) {
      for (let index = 0; index < wfpCols.length; index++) {
        if (!usedWfp.has(wfpCols[index]) && wfpLower[index].includes(keyword)) {
          matched = wfpCols[index];
          break outer;
        }
      }
    }
    if (matched) {
      pairs.push({ mmpColumn: mmpCol, wfpColumn: matched });
      usedWfp.add(matched);
    }
  }
  return pairs;
}