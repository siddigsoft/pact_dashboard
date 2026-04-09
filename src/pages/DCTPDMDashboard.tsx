import { useState, useMemo, useRef, useCallback, Fragment, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import rawData from '@/data/pdm_data.json';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart, LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  Users, MapPin, CheckCircle2, TrendingUp,
  Download, Filter, BarChart3, ShoppingCart,
  Phone, ThumbsUp, X, FileSpreadsheet, Upload, FileDown, RefreshCw,
  MessageSquare, AlertTriangle, ChevronDown, ChevronUp, Plus, Pencil, Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSafeAppContext } from '@/context/AppContext';

// ── Types & Config ──────────────────────────────────────────────────────────

interface PDMRecord {
  id: number | null;
  date: number | string | null;
  state: string | null;
  locality: string | null;
  location: string | null;
  interviewer: string | null;
  deviceid: string | null;
  hhid: string | null;
  org: number | null;
  sex: number | null;
  hhStatus: number | null;
  occupation: number | null;
  hhTotal: number | null;
  hhChildren05: number | null;
  hhChildren618: number | null;
  hhAdults: number | null;
  hhElderly: number | null;
  asstReceived: number | null;
  asstAmtRec: number | null;
  asstAmtExp: number | null;
  paidFees: number | null;
  usedAssistance: number | null;
  modeUsed: number | null;
  priceHigher: number | null;
  marketAccess: number | null;
  foodAvailable: number | null;
  expChallenge: number | null;
  challenges: number[];
  propFood: number | null;
  propNFI: number | null;
  sharing: number | null;
  sharingPct: number | null;
  securityChallenge: number | null;
  freeResponse: string | null;
  cfm: number | null;
  satisfaction: number | null;
  submission: string | null;
}

const STATIC_DATA = (rawData as any).processed as PDMRecord[];

// ── Excel processing (mirrors the Node.js build-time script) ────────────────
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};
const toStr = (v: any): string | null =>
  (v !== null && v !== undefined && String(v).trim() !== '') ? String(v).trim() : null;

// ── Name normaliser: folds Arabic vowel/spelling variants + Latin case/spacing ──
function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')   // alef variants → plain alef
    .replace(/ة/g, 'ه')          // ta marbuta → ha
    .replace(/ى/g, 'ي')          // alef maqsura → ya
    .replace(/\s+/g, ' ');       // collapse multi-space
}

// ── Canonical-name helper ────────────────────────────────────────────────────
// Phase 1 — per deviceid: pick longest/most-frequent name per device
// Phase 2 — cross-name: merge spelling variants (Arabic vowels, case, spacing)
//            and prefix names ("نفيسة" → "نفيسة محمد", "Shams" → "Shams Mohammed")
// Works on records with OR without a deviceid, so static data is also cleaned.
function canonicaliseInterviewers(recs: PDMRecord[]): PDMRecord[] {
  // ── Phase 1: fill BLANK names only from same-device records ────────────────
  // IMPORTANT: never overwrite an existing name — multiple people can share
  // the same device (tablet passed between collectors). Only use device lookup
  // to fill in records where identification/a_interviewer was left empty.
  const devFreq: Record<string, Record<string, number>> = {};
  for (const r of recs) {
    if (!r.deviceid) continue;
    const n = r.interviewer?.trim();
    if (!n) continue;
    if (!devFreq[r.deviceid]) devFreq[r.deviceid] = {};
    devFreq[r.deviceid][n] = (devFreq[r.deviceid][n] || 0) + 1;
  }
  const devCanonical: Record<string, string> = {};
  for (const [dev, freq] of Object.entries(devFreq)) {
    devCanonical[dev] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }
  const phase1 = recs.map(r => {
    // Only fill blank names — never overwrite a name that is already set
    if (r.interviewer?.trim()) return r;
    if (!r.deviceid) return r;
    const c = devCanonical[r.deviceid];
    return c ? { ...r, interviewer: c } : r;
  });

  // ── Phase 2: cross-name normalisation (handles static data + uploaded) ─────
  // Build frequency map across ALL records
  const freq: Record<string, number> = {};
  phase1.forEach(r => {
    const n = r.interviewer?.trim();
    if (n) freq[n] = (freq[n] || 0) + 1;
  });

  // 2a — Group exact-normalized matches; canonical = most-frequent (tie: longer)
  const normGroups: Record<string, string[]> = {};
  Object.keys(freq).forEach(n => {
    const k = normName(n);
    (normGroups[k] = normGroups[k] || []).push(n);
  });
  const nameMap: Record<string, string> = {};
  for (const group of Object.values(normGroups)) {
    group.sort((a, b) => {
      const fd = (freq[b] || 0) - (freq[a] || 0);
      return fd !== 0 ? fd : b.length - a.length;
    });
    const canon = group[0];
    group.forEach(n => { nameMap[n] = canon; });
  }

  // 2b — Prefix merging: if norm(A) words are a strict prefix of norm(B) words,
  //      merge A → B (e.g. "نفيسة محمد" ← "نفيسة"; "Shams Mohammed" ← "Shams")
  //      Require A to have ≥ 1 word (single Arabic first-names are common prefixes).
  const canonicals = Array.from(new Set(Object.values(nameMap)));
  const prefixMap: Record<string, string> = {};
  for (const a of canonicals) {
    const wa = normName(a).split(' ');
    let best = '';
    let bestLen = wa.length;
    for (const b of canonicals) {
      if (a === b) continue;
      const wb = normName(b).split(' ');
      if (wb.length <= bestLen) continue;
      if (wa.every((w, i) => w === wb[i])) { best = b; bestLen = wb.length; }
    }
    if (best) prefixMap[a] = best;
  }
  // Resolve chains: A→B→C becomes A→C
  const resolve = (n: string, d = 0): string =>
    d > 5 ? n : prefixMap[n] ? resolve(prefixMap[n], d + 1) : n;

  // Apply both maps to every record
  return phase1.map(r => {
    const n = r.interviewer?.trim();
    if (!n) return r;
    return { ...r, interviewer: resolve(nameMap[n] || n) };
  });
}

function processWorkbook(wb: any, XLSXLib: any): PDMRecord[] {
  const sheetName = (wb.SheetNames as string[]).find((n: string) => n.toLowerCase() === 'data') || wb.SheetNames[0];
  const rows = XLSXLib.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null }) as any[][];
  if (rows.length < 3) return [];
  const headers: string[] = rows[0] as string[];
  const idx = (col: string) => headers.indexOf(col);
  const chalNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 999];
  const raw = (rows.slice(2) as any[][]).map((row) => ({
    id:             toNum(row[idx('_id')]),
    date:           row[idx('general_info/a_date')],
    state:          toStr(row[idx('general_info/a_state')]),
    locality:       toStr(row[idx('general_info/locality')]),
    location:       toStr(row[idx('general_info/location')]),
    interviewer:    toStr(row[idx('identification/a_interviewer')]),
    deviceid:       toStr(row[idx('deviceid')]),
    hhid:           toStr(row[idx('identification/hhid')]),
    org:            toNum(row[idx('general_info/a_org')]),
    sex:            toNum(row[idx('PDM_Demographic_module/RESPSex')]),
    hhStatus:       toNum(row[idx('PDM_Demographic_module/HHRstatus')]),
    occupation:     toNum(row[idx('PDM_Demographic_module/Hhoccupation')]),
    hhTotal:        toNum(row[idx('PDM_Demographic_module/PDMHHTotal')]),
    hhChildren05:   toNum(row[idx('PDM_Demographic_module/PDM_HHNumchild')]),
    hhChildren618:  toNum(row[idx('PDM_Demographic_module/PDM_HHNumchild618')]),
    hhAdults:       toNum(row[idx('PDM_Demographic_module/PDM_HHNuadult')]),
    hhElderly:      toNum(row[idx('PDM_Demographic_module/PDM_HHNeldery')]),
    asstReceived:   toNum(row[idx('PDM_Asst_verif/Asstreceived')]),
    asstAmtRec:     toNum(row[idx('PDM_Asst_verif/HHAsstCBTRec')]),
    asstAmtExp:     toNum(row[idx('PDM_Asst_verif/HHAsstCBTExp')]),
    paidFees:       toNum(row[idx('PDM_Asst_verif/HHAsstPayEnt')]),
    usedAssistance: toNum(row[idx('Utilization/used_assitance')]),
    modeUsed:       toNum(row[idx('Utilization/mode_used_assitance')]),
    priceHigher:    toNum(row[idx('Utilization/price_higher')]),
    marketAccess:   toNum(row[idx('Utilization/access_local_market')]),
    foodAvailable:  toNum(row[idx('Utilization/food_available')]),
    expChallenge:   toNum(row[idx('Utilization/Experiencechallenge')]),
    challenges: chalNums
      .map((n) => (toNum(row[idx(`Utilization/Challenges/${n}`)]) === 1 ? n : null))
      .filter(Boolean) as number[],
    propFood:           toNum(row[idx('Utilization/PRPOPTIONfi')]),
    propNFI:            toNum(row[idx('Utilization/PRPOPTIONnfi')]),
    sharing:            toNum(row[idx('Utilization/HHAsstUsageShareGift')]),
    sharingPct:         toNum(row[idx('Utilization/HHAsstUsageShareGiftSh')]),
    securityChallenge:  toNum(row[idx('Utilization/SECUchalleng')]),
    freeResponse:       toStr(row[idx('PDM_other/FreeResp')]),
    cfm:          toNum(row[idx('PDM_other/PDM_HHAsstKnowCFM')]),
    satisfaction: toNum(row[idx('PDM_other/Satisfaction_self')]),
    submission:   toStr(row[idx('_submission_time')]),
  }));
  // Merge name variants that share the same deviceid → single canonical full name
  return canonicaliseInterviewers(raw);
}

const STATE_LABELS: Record<string, string> = {
  SD01: 'Khartoum', SD09: 'White Nile', SD16: 'River Nile', SD17: 'Northern',
  SD15: 'Aj Jazirah', SD08: 'Blue Nile', SD06: 'Central Darfur',
  SD05: 'East Darfur', SD12: 'Gedaref', SD11: 'Kassala',
  SD02: 'North Darfur', SD13: 'North Kordofan', SD10: 'Red Sea',
  SD14: 'Sennar', SD03: 'South Darfur', SD07: 'South Kordofan',
  SD04: 'West Darfur', SD18: 'West Kordofan',
};

const LOCALITY_LABELS: Record<string, string> = {
  SD16010: 'Hosh Banga',
  SD01003: 'Al Kadaro',
  SD01004: 'Al-Ulayfun',
  SD01002: 'Um Badda',
  SD01006: 'Omdurman',
  SD01007: 'Haj Yousif – Sq. 7',
  SD17018: 'Montego (Sheikh Ismail)',
  SD17017: 'Nawa',
  SD17016: 'Komi Al-Jadida',
  SD09047: 'Square 42',
  SD09045: 'Wad Nimir – District 5',
  SD09046: 'Rabak – Sq. 48',
};

const SATISFACTION_CFG = [
  { key: 1, label: 'Very Dissatisfied', color: '#ef4444' },
  { key: 2, label: 'Dissatisfied',      color: '#f97316' },
  { key: 3, label: 'Neutral',           color: '#eab308' },
  { key: 4, label: 'Satisfied',         color: '#22c55e' },
  { key: 5, label: 'Very Satisfied',    color: '#16a34a' },
];

const CHALLENGE_LABELS: Record<number, string> = {
  1: 'Connectivity issues',
  2: 'Bankak/Mashreg not accepted',
  3: 'No agents / No cash',
  4: 'Limited food availability',
  5: 'Few retailers',
  6: 'Higher prices / Fees',
  7: 'Distance to market',
  8: 'Security concerns',
  9: 'Market not operating',
  10: 'Higher food prices',
  999: 'Other',
};

const STATUS_LABELS: Record<number, string> = { 1: 'IDP', 2: 'Refugee / Returnee', 3: 'Host Community' };
const STATUS_COLORS = ['#3b82f6', '#a855f7', '#22c55e'];
const SEX_COLORS   = ['#ec4899', '#3b82f6'];
const MODE_COLORS  = ['#0ea5e9', '#8b5cf6', '#14b8a6'];
const RECEIPT_COLORS = ['#22c55e', '#f97316', '#ef4444'];
const STATE_COLORS = ['#1D3461', '#0ea5e9', '#14b8a6', '#a855f7', '#f97316'];

const PCT = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;
const AVG = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const fmt = (n: number) => n.toLocaleString();
const fmtK = (n: number) => n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n);

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, accent, trend }: {
  label: string; value: string | number; sub?: string;
  icon: any; accent: string; trend?: { val: string; good: boolean };
}) {
  return (
    <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-extrabold text-foreground leading-none">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold mt-1.5 ${trend.good ? 'text-emerald-600' : 'text-red-500'}`}>
                {trend.val}
              </span>
            )}
          </div>
          <div className={`rounded-xl p-2.5 ${accent.replace('bg-', 'bg-').replace('-600', '-100').replace('-500', '-100').replace('-700', '-100')}`}>
            <Icon className={`h-5 w-5 ${accent.replace('bg-', 'text-')}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title, sub, count }: { title: string; sub?: string; count?: number }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {count !== undefined && (
        <span className="shrink-0 mt-0.5 text-[11px] font-bold text-[#1D3461] bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-2 py-0.5 rounded-full leading-none">
          {count.toLocaleString()}
        </span>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{fmt(p.value)}{p.unit || ''}</span></p>
      ))}
    </div>
  );
};

// ── Main Dashboard ──────────────────────────────────────────────────────────

interface DataSource { name: string; uploadedAt: string; count: number; }
interface LocalityTarget { planned: string; locality: string; deviation: string; remarks: string; }
interface LocalityRow { id: string; stateCode: string; locality: string; planned: string; deviation: string; remarks: string; }

const FEEDBACK_PAGE_SIZE = 10;
const LOCALITY_ROWS_VER  = 'v10'; // v10: force re-migration to catch any stale Rabak/Shendi/Al Golid
const DEVIATIONS_VER    = 'v2';  // v2: SD01 corrected from 60 HHs → 45 HHs

// ── State-level Reason for Deviation — edit here, bump DEVIATIONS_VER, push to deploy ─
const SEED_STATE_DEVIATIONS: Record<string, string> = {
  SD01: '45 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 20 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 7 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.',
  SD09: '100 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 40 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 14 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.',
  SD16: '37 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 9 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 13 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.',
  SD17: '25 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 14 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 1 HH had an incorrect or invalid phone number that does not correspond to the registered beneficiary, confirmed after several verification attempts.',
};

// State-level totals — GREEN rows only from DCT Sample Excel (Apr 2026)
// v8: All localities corrected to green-highlighted HH counts from DCT Sample file
const SAMPLE_PLANNED: Record<string, string> = {
  SD01: '250', // Khartoum:       Bahri 100 + Sharg An Neel 150
  SD02: '150', // North Darfur:   El Fasher 116 + El Fasher Town 9 + El Fasher Rural 25
  SD07: '339', // South Kordofan: Kadugli 150 + Habila 39 + Dilling 150
  SD09: '250', // White Nile:     Rabak 100 + Kosti 100 + Um Rimta 50
  SD10: '21',  // Red Sea:        Port Sudan 21
  SD13: '250', // North Kordofan: Um Rawaba 100 + Sheikan 150
  SD16: '150', // River Nile:     Shendi 150
  SD17: '150', // Northern:       Al Golid 150
  SD18: '100', // West Kordofan:  As Sunut 50 + Al Lagowa 50
  SD03: '', SD04: '', SD05: '', SD06: '',
  SD08: '', SD11: '', SD12: '',
  SD14: '', SD15: '',
};
const SAMPLE_BACKUP: Record<string, number> = {};
const SAMPLE_DEFAULTS: Record<string, { locality: string; deviation: string; remarks: string }> = {
  SD01: { locality: 'Bahri / Sharg El-Neel', deviation: '60 closed · 20 not reply · 7 wrong number',   remarks: '' },
  SD09: { locality: '',                       deviation: '100 closed · 40 not reply · 14 wrong number', remarks: '' },
  SD16: { locality: 'Shandi',                deviation: '37 closed · 9 not reply · 13 wrong number',   remarks: '' },
  SD17: { locality: 'Al Golid',              deviation: '25 closed · 14 not reply · 1 wrong number',   remarks: '' },
  SD02: { locality: '', deviation: '', remarks: '' }, SD03: { locality: '', deviation: '', remarks: '' },
  SD04: { locality: '', deviation: '', remarks: '' }, SD05: { locality: '', deviation: '', remarks: '' },
  SD06: { locality: '', deviation: '', remarks: '' }, SD07: { locality: '', deviation: '', remarks: '' },
  SD08: { locality: '', deviation: '', remarks: '' }, SD10: { locality: '', deviation: '', remarks: '' },
  SD11: { locality: '', deviation: '', remarks: '' }, SD12: { locality: '', deviation: '', remarks: '' },
  SD13: { locality: '', deviation: '', remarks: '' }, SD14: { locality: '', deviation: '', remarks: '' },
  SD15: { locality: '', deviation: '', remarks: '' }, SD18: { locality: '', deviation: '', remarks: '' },
};

// Per-locality seed — GREEN rows only from DCT Sample Excel (Apr 2026)
// Each planned number = count of green-highlighted HHs in the respective sheet
const SEED_LOCALITY_ROWS_V2: LocalityRow[] = [
  // Khartoum (SD01): KRT Bahri sheet 100 green; KRT Sharg An Neel sheet 150 green
  { id: 'SD01-0', stateCode: 'SD01', locality: 'Bahri',         planned: '100', deviation: '45 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 20 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 7 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.', remarks: '' },
  { id: 'SD01-1', stateCode: 'SD01', locality: 'Sharg An Neel', planned: '150', deviation: '', remarks: '' },
  // North Darfur (SD02): ND sheet — El Fasher 116 + El Fasher Town 9 + El Fasher Rural 25 = 150 green
  { id: 'SD02-0', stateCode: 'SD02', locality: 'El Fasher',     planned: '150', deviation: '', remarks: '' },
  // South Kordofan (SD07): SK Kadugli 150 + SK Habila 39 + SK Dilling 150 green
  { id: 'SD07-0', stateCode: 'SD07', locality: 'Kadugli',       planned: '150', deviation: '', remarks: '' },
  { id: 'SD07-1', stateCode: 'SD07', locality: 'Habila',        planned: '39',  deviation: '', remarks: '' },
  { id: 'SD07-2', stateCode: 'SD07', locality: 'Dilling',       planned: '150', deviation: '', remarks: '' },
  // White Nile (SD09): WN Rabak 100 + WN Kosti 100 + WN Um Rimta 50 green
  { id: 'SD09-0', stateCode: 'SD09', locality: 'Rabak',         planned: '100', deviation: '100 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 40 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 14 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.', remarks: '' },
  { id: 'SD09-1', stateCode: 'SD09', locality: 'Kosti',         planned: '100', deviation: '', remarks: '' },
  { id: 'SD09-2', stateCode: 'SD09', locality: 'Um Rimta',      planned: '50',  deviation: '', remarks: '' },
  // Red Sea (SD10): RS sheet 21 green (no yellow rows)
  { id: 'SD10-0', stateCode: 'SD10', locality: 'Port Sudan',    planned: '21',  deviation: '', remarks: '' },
  // North Kordofan (SD13): NK Um Rawaba 100 + NK Sheikan 150 green
  { id: 'SD13-0', stateCode: 'SD13', locality: 'Um Rawaba',     planned: '100', deviation: '', remarks: '' },
  { id: 'SD13-1', stateCode: 'SD13', locality: 'Sheikan',       planned: '150', deviation: '', remarks: '' },
  // River Nile (SD16): RN Shendi 150 green
  { id: 'SD16-0', stateCode: 'SD16', locality: 'Shendi',        planned: '150', deviation: '37 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 9 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 13 HHs had incorrect or invalid phone numbers that do not correspond to the registered beneficiaries, confirmed after several verification attempts.', remarks: '' },
  // Northern (SD17): NS sheet 150 green
  { id: 'SD17-0', stateCode: 'SD17', locality: 'Al Golid',      planned: '150', deviation: '25 HHs phone numbers were found closed — multiple contact attempts were made at different times and dates throughout the data collection period with no success; 14 HHs did not respond despite repeated calls placed at different times of day and on separate dates, with all attempts exhausted and no answer received; 1 HH had an incorrect or invalid phone number that does not correspond to the registered beneficiary, confirmed after several verification attempts.', remarks: '' },
  // West Kordofan (SD18): WK As Sunut 50 + WK Al Lagowa 50 green
  { id: 'SD18-0', stateCode: 'SD18', locality: 'As Sunut',      planned: '50',  deviation: '', remarks: '' },
  { id: 'SD18-1', stateCode: 'SD18', locality: 'Al Lagowa',     planned: '50',  deviation: '', remarks: '' },
  // Remaining states — blank rows for admin entry when activated
  { id: 'SD03-0', stateCode: 'SD03', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD04-0', stateCode: 'SD04', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD05-0', stateCode: 'SD05', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD06-0', stateCode: 'SD06', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD08-0', stateCode: 'SD08', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD11-0', stateCode: 'SD11', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD12-0', stateCode: 'SD12', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD14-0', stateCode: 'SD14', locality: '', planned: '', deviation: '', remarks: '' },
  { id: 'SD15-0', stateCode: 'SD15', locality: '', planned: '', deviation: '', remarks: '' },
];

// Maps survey locality sub-codes → seed locality row IDs (derived from hhid patterns)
// SD01: KH-BI→Bahri(SD01-0); KH_SH→Sharg An Neel(SD01-1)
// SD09: WH_RK→Rabak(SD09-0); WH-KT→Kosti(SD09-1); WH-UR→Um Rimta(SD09-2)
// SD16: all one locality (Shendi); SD17: all one locality (Al Golid)
const SUBCODE_TO_ROW_ID: Record<string, string> = {
  SD01003: 'SD01-0', SD01006: 'SD01-0', SD01002: 'SD01-0',
  SD01004: 'SD01-1', SD01007: 'SD01-1',
  SD09046: 'SD09-0',
  SD09047: 'SD09-1',
  SD09045: 'SD09-2',
  SD16010: 'SD16-0',
  SD17016: 'SD17-0', SD17017: 'SD17-0', SD17018: 'SD17-0',
};

// ── Heartbeat Ticker ────────────────────────────────────────────────────────

const TICKER_TOTAL_PLANNED = Object.values(SAMPLE_PLANNED)
  .reduce((sum, v) => sum + (v ? parseInt(v, 10) : 0), 0); // 1660

const URGENCY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f5c842',
  low:    '#60a5fa',
};

type TickerPhase = 'collapsed' | 'expanding' | 'open' | 'collapsing';
type TickerMsg   = { text: string; label: string; urgency: 'high' | 'medium' | 'low' };

interface TickerProps { dataSource: DataSource | null; records: PDMRecord[]; }

function PDMHeartbeatTicker({ dataSource, records }: TickerProps) {
  const messages = useMemo((): TickerMsg[] => {
    const msgs: TickerMsg[] = [];

    // ① Batch / upload info
    if (dataSource) {
      msgs.push({
        urgency: 'low',
        label:   'BATCH',
        text:    `${dataSource.name} · ${dataSource.count.toLocaleString()} records · Uploaded: ${dataSource.uploadedAt}`,
      });
    } else {
      msgs.push({
        urgency: 'low',
        label:   'DATA',
        text:    `Showing built-in static dataset · Upload an Excel file to load live survey data`,
      });
    }

    // ② Coverage summary
    const reached = records.length;
    const pct     = TICKER_TOTAL_PLANNED > 0 ? Math.round((reached / TICKER_TOTAL_PLANNED) * 100) : 0;
    msgs.push({
      urgency: pct < 50 ? 'high' : pct < 85 ? 'medium' : 'low',
      label:   'COVERAGE',
      text:    `${reached.toLocaleString()} / ${TICKER_TOTAL_PLANNED.toLocaleString()} HHs surveyed · ${pct}% of DCT planned target`,
    });

    // ③ State breakdown — active states + top performer
    const stateMap: Record<string, number> = {};
    records.forEach(r => { if (r.state) stateMap[r.state] = (stateMap[r.state] || 0) + 1; });
    const activeStates = Object.keys(stateMap).length;
    const sorted = Object.entries(stateMap).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topCode, topCount] = sorted[0];
      const topName = STATE_LABELS[topCode] || topCode;
      msgs.push({
        urgency: 'low',
        label:   'STATES',
        text:    `${activeStates} state${activeStates !== 1 ? 's' : ''} active · Top: ${topName} (${topCount.toLocaleString()} surveys) · ${sorted.length} / ${Object.keys(SAMPLE_PLANNED).filter(k => SAMPLE_PLANNED[k]).length} planned states`,
      });
    }

    // ④ Interviewer count from live records
    const interviewers = new Set(records.map(r => r.interviewer).filter(Boolean));
    if (interviewers.size > 0) {
      msgs.push({
        urgency: 'low',
        label:   'TEAM',
        text:    `${interviewers.size} data collector${interviewers.size !== 1 ? 's' : ''} active · ${records.length} total submissions across ${activeStates} state${activeStates !== 1 ? 's' : ''}`,
      });
    }

    // ⑤ Cycle deadline — always last
    msgs.push({
      urgency: 'high',
      label:   'DEADLINE',
      text:    `MMP Cycle 4 closes 10 Apr 2026 — all field teams must submit reports before end of day`,
    });

    return msgs;
  }, [dataSource, records]);

  const [phase, setPhase]   = useState<TickerPhase>('collapsed');
  const [msgIdx, setMsgIdx] = useState(0);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  const COLLAPSED_H = 4;
  const OPEN_H      = 52;
  const OPEN_MS     = 9000;
  const ANIM_MS     = 360;
  const PAUSE_MS    = 4000;

  const clear = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  const advance = useCallback((nextIdx: number) => {
    clear();
    const idx = nextIdx % messages.length;
    setMsgIdx(idx);
    setPhase('expanding');
    timerRef.current = setTimeout(() => {
      setPhase('open');
      timerRef.current = setTimeout(() => {
        setPhase('collapsing');
        timerRef.current = setTimeout(() => {
          setPhase('collapsed');
          timerRef.current = setTimeout(() => advance(idx + 1), PAUSE_MS);
        }, ANIM_MS);
      }, OPEN_MS);
    }, ANIM_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    timerRef.current = setTimeout(() => advance(0), PAUSE_MS);
    return clear;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance]);

  const dismiss = () => {
    clear();
    setPhase('collapsing');
    timerRef.current = setTimeout(() => {
      setPhase('collapsed');
      timerRef.current = setTimeout(() => advance(msgIdx + 1), PAUSE_MS);
    }, ANIM_MS);
  };

  const msg            = messages[Math.min(msgIdx, messages.length - 1)];
  const accentColor    = URGENCY_COLOR[msg.urgency];
  const isOpen         = phase === 'expanding' || phase === 'open' || phase === 'collapsing';
  const barHeight      = isOpen ? OPEN_H : COLLAPSED_H;
  const contentOpacity = phase === 'open' ? 1 : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: `${barHeight}px`,
        background: isOpen ? '#0F2041' : accentColor,
        borderTop: isOpen ? `1px solid ${accentColor}30` : 'none',
        boxShadow: isOpen ? `0 -6px 24px ${accentColor}25` : 'none',
        transition: `height ${ANIM_MS}ms cubic-bezier(0.34,1.56,0.64,1), background 220ms ease, box-shadow 220ms ease`,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          opacity: contentOpacity,
          transition: `opacity ${ANIM_MS * 0.55}ms ease`,
          overflow: 'hidden',
        }}
      >
        {/* PACT · label anchor */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            height: '100%',
            flexShrink: 0,
            borderRight: `1px solid ${accentColor}30`,
            background: '#08152e',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', color: '#f5c842' }}>PACT</span>
          <span style={{ width: 1, height: 12, background: accentColor, opacity: 0.45 }} />
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: accentColor }}>
            {msg.label}
          </span>
        </div>

        {/* Message text */}
        <div style={{ flex: 1, padding: '0 16px', overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {msg.text}
          </p>
        </div>

        {/* Counter + dismiss */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 12, flexShrink: 0, borderLeft: `1px solid ${accentColor}20` }}>
          <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace', paddingLeft: 10 }}>
            {Math.min(msgIdx, messages.length - 1) + 1}/{messages.length}
          </span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, display: 'inline-block' }} />
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748b', fontSize: 17, lineHeight: 1, padding: '2px 2px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function DCTPDMDashboard({ publicMode = false }: { publicMode?: boolean } = {}) {
  const { currentUser } = useSafeAppContext() ?? {};

  /**
   * Upload / edit access is granted only on the private route (/dct-pdm) and
   * only to users whose role is admin or super_admin.
   *
   * NOTE: We read the role from `currentUser.role` — NOT from `currentUserRole`
   * which exists as local state inside NotificationContext and is never
   * forwarded through the shared AppContext object. Using that undefined key
   * would silently hide all upload controls for every user regardless of role.
   */
  const userRole = currentUser?.role ?? '';

  /**
   * canUpload  — full data management (file upload, planned numbers).
   *              Restricted to admin / super_admin.
   *
   * canEditNotes — lighter edit right: Reason for Deviation + Remarks only.
   *               Extended to supervisor so field leads can annotate the
   *               table without touching raw planned numbers or uploading files.
   */
  const canUpload =
    !publicMode &&
    ['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin'].includes(userRole);

  const canEditNotes =
    !publicMode &&
    ['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin',
     'supervisor', 'Supervisor'].includes(userRole);

  const [records, setRecords] = useState<PDMRecord[]>(() => {
    // Fast sync init: localStorage cache → static fallback
    let base: PDMRecord[] = STATIC_DATA;
    try {
      const saved = localStorage.getItem('pact-pdm-uploaded-records');
      if (saved) {
        const parsed = JSON.parse(saved) as PDMRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) base = parsed;
      }
    } catch { /* invalid JSON — stay on static */ }
    try { return canonicaliseInterviewers(base); } catch { return base; }
  });
  const [dataSource, setDataSource] = useState<DataSource | null>(() => {
    try {
      const saved = localStorage.getItem('pact-pdm-datasource');
      if (saved) return JSON.parse(saved) as DataSource;
    } catch {}
    return null;
  });
  const [uploading, setUploading]   = useState(false);

  // On mount: always fetch latest upload from server (overrides localStorage/static)
  useEffect(() => {
    supabase
      .from('pdm_uploads')
      .select('filename, record_count, records, uploaded_at')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        const row = data[0];
        const parsed = row.records as PDMRecord[];
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        const ds: DataSource = {
          name: row.filename,
          uploadedAt: new Date(row.uploaded_at).toLocaleString(),
          count: row.record_count,
        };
        let canonicalised = parsed;
        try { canonicalised = canonicaliseInterviewers(parsed); } catch {}
        setRecords(canonicalised);
        setDataSource(ds);
        // Update local cache
        try {
          localStorage.setItem('pact-pdm-uploaded-records', JSON.stringify(parsed));
          localStorage.setItem('pact-pdm-datasource', JSON.stringify(ds));
        } catch {}
      });
  }, []);
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stateFilter,     setStateFilter]     = useState('all');
  const [sexFilter,       setSexFilter]       = useState('all');
  const [rcvFilter,       setRcvFilter]       = useState('all');
  const [collectorFilter, setCollectorFilter] = useState('all');

  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [feedbackPage, setFeedbackPage]     = useState(0);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [showAllInterviewers, setShowAllInterviewers] = useState(false);
  // Bump seed version whenever defaults change — existing manual edits are
  // preserved; only blank fields are filled from the new defaults.
  const SEED_VER = 'v10-green-only'; // v10: all localities corrected to green-row counts from DCT Sample Excel
  const [localityTargets, setLocalityTargets] = useState<Record<string, LocalityTarget>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pact-pdm-locality-targets') || '{}');
      const seeded = localStorage.getItem('pact-pdm-locality-seed-ver');
      if (seeded !== SEED_VER) {
        const fresh: Record<string, LocalityTarget> = {};
        Object.entries(SAMPLE_PLANNED).forEach(([code, planned]) => {
          const def = SAMPLE_DEFAULTS[code] ?? { locality: '', deviation: '', remarks: '' };
          fresh[code] = {
            planned,
            locality:  stored[code]?.locality  || def.locality,
            deviation: stored[code]?.deviation || def.deviation,
            remarks:   stored[code]?.remarks   || def.remarks,
          };
        });
        localStorage.setItem('pact-pdm-locality-seed-ver', SEED_VER);
        localStorage.setItem('pact-pdm-locality-targets', JSON.stringify(fresh));
        return fresh;
      }
      Object.entries(SAMPLE_PLANNED).forEach(([code, planned]) => {
        if (!stored[code]) {
          const def = SAMPLE_DEFAULTS[code] ?? { locality: '', deviation: '', remarks: '' };
          stored[code] = { planned, ...def };
        }
      });
      return stored;
    } catch {
      return Object.fromEntries(
        Object.entries(SAMPLE_PLANNED).map(([k, v]) => {
          const def = SAMPLE_DEFAULTS[k] ?? { locality: '', deviation: '', remarks: '' };
          return [k, { planned: v, ...def }];
        })
      );
    }
  });
  const updateTarget = (code: string, field: keyof LocalityTarget, val: string) => {
    setLocalityTargets(prev => {
      const next = { ...prev, [code]: { planned: '', locality: '', deviation: '', remarks: '', ...prev[code], [field]: val } };
      try { localStorage.setItem('pact-pdm-locality-targets', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Locality Rows (per-locality table data) ───────────────────────────────
  const [localityRows, setLocalityRows] = useState<LocalityRow[]>(() => {
    try {
      const stored = localStorage.getItem('pact-pdm-locality-rows');
      const ver    = localStorage.getItem('pact-pdm-locality-rows-ver');
      if (ver === LOCALITY_ROWS_VER && stored) return JSON.parse(stored);
      // Version changed — merge: preserve manual edits, fill empty fields from seed
      if (stored) {
        const prev: LocalityRow[] = JSON.parse(stored);
        const prevMap: Record<string, LocalityRow> = Object.fromEntries(prev.map(r => [r.id, r]));
        // Seed correction map: rows whose planned value changed → new green-only counts (v8).
        // "from" lists ALL known wrong stored values so stored manual edits that happened to
        // match an old wrong seed also get corrected automatically.
        const PLANNED_CORRECTIONS: Record<string, { from: string[]; to: string }> = {
          'SD01-0': { from: ['120','80'],              to: '100' }, // Bahri:     green=100
          'SD01-1': { from: ['170'],                   to: '150' }, // Sharg:     green=150
          'SD02-0': { from: ['139'],                   to: '150' }, // El Fasher: green=150
          'SD07-0': { from: ['147'],                   to: '150' }, // Kadugli:   green=150
          'SD07-1': { from: ['34'],                    to: '39'  }, // Habila:    green=39
          'SD07-2': { from: ['122'],                   to: '150' }, // Dilling:   green=150
          'SD09-0': { from: ['120','70','106','80'],   to: '100' }, // Rabak:     green=100
          'SD09-1': { from: ['117'],                   to: '100' }, // Kosti:     green=100
          'SD09-2': { from: ['60'],                    to: '50'  }, // Um Rimta:  green=50
          'SD13-0': { from: ['117'],                   to: '100' }, // Um Rawaba: green=100
          'SD13-1': { from: ['170'],                   to: '150' }, // Sheikan:   green=150
          'SD16-0': { from: ['170'],                   to: '150' }, // Shendi:    green=150
          'SD17-0': { from: ['170'],                   to: '150' }, // Al Golid:  green=150
          'SD18-0': { from: ['41'],                    to: '50'  }, // As Sunut:  green=50
          'SD18-1': { from: ['49'],                    to: '50'  }, // Al Lagowa: green=50
        };
        const merged = SEED_LOCALITY_ROWS_V2.map(seedRow => {
          const p = prevMap[seedRow.id];
          if (!p) return seedRow;
          const correction = PLANNED_CORRECTIONS[seedRow.id];
          const plannedVal =
            correction && correction.from.includes(p.planned)
              ? correction.to                        // stored = known old wrong value → fix
              : p.planned || seedRow.planned;        // stored = manual edit → preserve
          return {
            ...seedRow,
            locality:  p.locality  || seedRow.locality,
            planned:   plannedVal,
            deviation: p.deviation || seedRow.deviation, // keep manual text, fall back to seed
            remarks:   p.remarks   || seedRow.remarks,
          };
        });
        // Also keep any extra rows the user manually added (not in seed)
        const seedIds = new Set(SEED_LOCALITY_ROWS_V2.map(r => r.id));
        const extras  = prev.filter(r => !seedIds.has(r.id));
        const result  = [...merged, ...extras];
        localStorage.setItem('pact-pdm-locality-rows',     JSON.stringify(result));
        localStorage.setItem('pact-pdm-locality-rows-ver', LOCALITY_ROWS_VER);
        return result;
      }
      // No prior data — fresh seed
      localStorage.setItem('pact-pdm-locality-rows',     JSON.stringify(SEED_LOCALITY_ROWS_V2));
      localStorage.setItem('pact-pdm-locality-rows-ver', LOCALITY_ROWS_VER);
      return SEED_LOCALITY_ROWS_V2;
    } catch {
      return SEED_LOCALITY_ROWS_V2;
    }
  });

  const saveRows = (rows: LocalityRow[]) => {
    try { localStorage.setItem('pact-pdm-locality-rows', JSON.stringify(rows)); } catch {}
  };
  const addLocalityRow = (stateCode: string) => {
    const row: LocalityRow = { id: `${stateCode}-${Date.now()}`, stateCode, locality: '', planned: '', deviation: '', remarks: '' };
    setLocalityRows(prev => { const next = [...prev, row]; saveRows(next); return next; });
  };
  const updateLocalityRow = (id: string, field: keyof Omit<LocalityRow, 'id' | 'stateCode'>, val: string) => {
    setLocalityRows(prev => { const next = prev.map(r => r.id === id ? { ...r, [field]: val } : r); saveRows(next); return next; });
  };
  const removeLocalityRow = (id: string) => {
    setLocalityRows(prev => { const next = prev.filter(r => r.id !== id); saveRows(next); return next; });
  };

  // All-states rows — every state in SAMPLE_PLANNED with actual reached counts merged in.
  // Declared before groupedRows because groupedRows depends on it.
  const allStateRows = useMemo(() => {
    const reachedMap: Record<string, number> = {};
    records.forEach(r => { if (r.state) reachedMap[r.state] = (reachedMap[r.state] || 0) + 1; });
    return Object.keys(SAMPLE_PLANNED).map(code => ({
      code,
      name: STATE_LABELS[code] || code,
      reached: reachedMap[code] || 0,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  // Groups only PRINCIPAL states (those with non-empty planned values) alphabetically.
  // States with no planned data (empty SAMPLE_PLANNED entry) are excluded from both
  // the table and the export — they are not part of the active sample.
  const groupedRows = useMemo(() => {
    const reachedMap = Object.fromEntries(allStateRows.map(r => [r.code, r.reached]));
    return Object.keys(SAMPLE_PLANNED)
      .filter(code => SAMPLE_PLANNED[code] !== '')       // only states with active planned data
      .sort((a, b) => (STATE_LABELS[a] || a).localeCompare(STATE_LABELS[b] || b))
      .map(code => ({
        code,
        name: STATE_LABELS[code] || code,
        reached: reachedMap[code] || 0,
        rows: localityRows.filter(r => r.stateCode === code),
      }));
  }, [localityRows, allStateRows]);

  // Edit mode — table inputs only visible when toggled on
  const [isEditMode, setIsEditMode] = useState(false);

  // State-level Reason for Deviation — versioned so code changes deploy everywhere.
  // To update: edit SEED_STATE_DEVIATIONS above, bump DEVIATIONS_VER, push to GitHub.
  const [stateDeviations, setStateDeviations] = useState<Record<string, string>>(() => {
    try {
      const ver    = localStorage.getItem('pact-pdm-state-deviations-ver');
      const stored = localStorage.getItem('pact-pdm-state-deviations');
      if (ver === DEVIATIONS_VER && stored) return JSON.parse(stored);
    } catch {}
    // Version mismatch or fresh browser → write seed to localStorage and return it
    try {
      localStorage.setItem('pact-pdm-state-deviations', JSON.stringify(SEED_STATE_DEVIATIONS));
      localStorage.setItem('pact-pdm-state-deviations-ver', DEVIATIONS_VER);
    } catch {}
    return { ...SEED_STATE_DEVIATIONS };
  });

  const updateStateDeviation = (code: string, val: string) => {
    setStateDeviations(prev => {
      const next = { ...prev, [code]: val };
      try {
        localStorage.setItem('pact-pdm-state-deviations', JSON.stringify(next));
        localStorage.setItem('pact-pdm-state-deviations-ver', DEVIATIONS_VER);
      } catch {}
      return next;
    });
  };

  // State-level Remarks (one per state, merged cell — same pattern as stateDeviations)
  const [stateRemarks, setStateRemarks] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('pact-pdm-state-remarks');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  const updateStateRemarks = (code: string, val: string) => {
    setStateRemarks(prev => {
      const next = { ...prev, [code]: val };
      try { localStorage.setItem('pact-pdm-state-remarks', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setUploading(true);
    try {
      const XLSXLib = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb  = XLSXLib.read(buf, { type: 'array' });
      const parsed = processWorkbook(wb, XLSXLib);
      if (parsed.length === 0) {
        alert('No data rows found. Make sure this is the PDM exported data file (not the XLSform).');
        return;
      }
      const ds: DataSource = { name: file.name, uploadedAt: new Date().toLocaleString(), count: parsed.length };
      setStateFilter('all'); setSexFilter('all'); setRcvFilter('all'); setCollectorFilter('all');
      // Save to Supabase — server-side so ALL devices see the same data
      const { error: delErr } = await supabase
        .from('pdm_uploads')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) {
        alert(`⚠️ Server save failed (clear): ${delErr.message}\nData will only be visible on this browser.`);
      } else {
        const { error: insErr } = await supabase.from('pdm_uploads').insert({
          filename: file.name,
          record_count: parsed.length,
          records: parsed as any,
        });
        if (insErr) {
          alert(`⚠️ Server save failed (insert): ${insErr.message}\nData will only be visible on this browser.`);
        }
      }
      // Update local state and cache
      let canonicalised = parsed;
      try { canonicalised = canonicaliseInterviewers(parsed); } catch {}
      setRecords(canonicalised);
      setDataSource(ds);
      try {
        localStorage.setItem('pact-pdm-uploaded-records', JSON.stringify(parsed));
        localStorage.setItem('pact-pdm-datasource', JSON.stringify(ds));
      } catch { /* quota exceeded */ }
    } catch (err) {
      alert('Could not read the file. Please check it is a valid Excel export.');
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const resetToDefault = async () => {
    // Remove from Supabase so all devices revert to built-in data
    try {
      await supabase.from('pdm_uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {}
    try {
      localStorage.removeItem('pact-pdm-uploaded-records');
      localStorage.removeItem('pact-pdm-datasource');
    } catch {}
    let canon = STATIC_DATA;
    try { canon = canonicaliseInterviewers(STATIC_DATA); } catch {}
    setRecords(canon);
    setDataSource(null);
    setStateFilter('all'); setSexFilter('all'); setRcvFilter('all'); setCollectorFilter('all');
  };

  // Sorted unique data collector names for the filter dropdown
  const collectorOptions = useMemo(() =>
    Array.from(new Set(records.map(r => r.interviewer).filter(Boolean) as string[])).sort(),
  [records]);

  const filtered = useMemo(() => records.filter(r => {
    if (stateFilter     !== 'all' && r.state            !== stateFilter)            return false;
    if (sexFilter       !== 'all' && String(r.sex)      !== sexFilter)               return false;
    if (rcvFilter       !== 'all' && String(r.asstReceived) !== rcvFilter)           return false;
    if (collectorFilter === '__unassigned__' && r.interviewer) return false;
    if (collectorFilter !== 'all' && collectorFilter !== '__unassigned__' && r.interviewer !== collectorFilter) return false;
    return true;
  }), [records, stateFilter, sexFilter, rcvFilter, collectorFilter]);

  const total = filtered.length;
  const hasFilter = stateFilter !== 'all' || sexFilter !== 'all' || rcvFilter !== 'all' || collectorFilter !== 'all';

  // Per-locality reached counts — uses `filtered` so it stays in sync with
  // every other section (Top Interviewers, charts, KPIs) when filters are active.
  const localityReached = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const rowId = r.locality ? SUBCODE_TO_ROW_ID[r.locality as string] : undefined;
      if (rowId) map[rowId] = (map[rowId] || 0) + 1;
    });
    return map;
  }, [filtered]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const consentRate = PCT(filtered.filter(r => r.satisfaction != null).length, total);
  const avgSat      = AVG(filtered.filter(r => r.satisfaction).map(r => r.satisfaction!));
  const satPct      = PCT(filtered.filter(r => (r.satisfaction ?? 0) >= 4).length, total);
  const cfmPct      = PCT(filtered.filter(r => r.cfm === 1).length, total);
  const receivedPct = PCT(filtered.filter(r => r.asstReceived === 1).length, total);
  const avgHHSize   = AVG(filtered.filter(r => r.hhTotal).map(r => r.hhTotal!));
  const states      = [...new Set(filtered.filter(r => r.state).map(r => r.state))];

  // ── By State ─────────────────────────────────────────────────────────────
  const byState = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(r => { if (r.state) m[r.state] = (m[r.state] || 0) + 1; });
    return Object.entries(m).map(([s, n]) => ({ state: STATE_LABELS[s] || s, count: n, code: s }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // ── Submission Timeline ───────────────────────────────────────────────────
  const timeline = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(r => {
      if (r.submission) {
        const d = r.submission.slice(0, 10);
        m[d] = (m[d] || 0) + 1;
      }
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [filtered]);

  // ── Site-visit PDM coverage (preferred source) ───────────────────────────
  const { data: siteVisitPDMRows } = useQuery({
    queryKey: ['site_visits_pdm_coverage'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_visits')
        .select('completed_at, scheduled_date, mmp_id')
        .or('monitoring_type.ilike.%pdm%,visit_type.ilike.%pdm%,main_activity.ilike.%pdm%')
        .eq('status', 'completed')
        .order('completed_at');
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Coverage Over Time (cumulative, weekly) ───────────────────────────────
  // Prefer site_visits PDM data if available; fall back to uploaded Excel records
  const coverageOverTime = useMemo(() => {
    const useSiteVisits = (siteVisitPDMRows?.length ?? 0) > 0;
    const weekMap: Record<string, number> = {};
    if (useSiteVisits) {
      // Source: site_visits table filtered to PDM monitoring type
      siteVisitPDMRows!.forEach(sv => {
        const dateStr = (sv.completed_at ?? sv.scheduled_date ?? '').slice(0, 10);
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        weekMap[key] = (weekMap[key] || 0) + 1;
      });
    } else {
      // Fallback: uploaded PDM Excel survey records (no PDM visits in site_visits yet)
      records.forEach(r => {
        if (r.submission) {
          const d = new Date(r.submission.slice(0, 10));
          if (isNaN(d.getTime())) return;
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          const key = monday.toISOString().slice(0, 10);
          weekMap[key] = (weekMap[key] || 0) + 1;
        }
      });
    }
    const sorted = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b));
    const totalWeeks = sorted.length;
    let cumulative = 0;
    const rows = sorted.map(([weekStart, count], idx) => {
      cumulative += count;
      // Linear target: evenly spread TICKER_TOTAL_PLANNED over the cycle weeks
      const weeklyTarget = totalWeeks > 0 && TICKER_TOTAL_PLANNED > 0
        ? Math.round(((idx + 1) / totalWeeks) * TICKER_TOTAL_PLANNED)
        : 0;
      return {
        week: weekStart.slice(5),
        count,
        cumulative,
        weeklyTarget,
        pct: TICKER_TOTAL_PLANNED > 0 ? Math.round((cumulative / TICKER_TOTAL_PLANNED) * 100) : 0,
      };
    });
    return {
      data: rows,
      source: useSiteVisits ? 'site_visits' : 'survey_upload',
    };
  }, [records, siteVisitPDMRows]);

  // ── Demographics ──────────────────────────────────────────────────────────
  const sexData = useMemo(() => [
    { name: 'Female', value: filtered.filter(r => r.sex === 0).length, color: '#ec4899' },
    { name: 'Male',   value: filtered.filter(r => r.sex === 1).length, color: '#3b82f6' },
  ], [filtered]);

  const statusData = useMemo(() => [1, 2, 3].map((k, i) => ({
    name: STATUS_LABELS[k], value: filtered.filter(r => r.hhStatus === k).length, color: STATUS_COLORS[i],
  })).filter(d => d.value > 0), [filtered]);

  const hhSizeData = useMemo(() => {
    const bins = [1,2,3,4,5,6,7,8,9,10];
    return bins.map(n => ({
      size: n === 10 ? '10+' : String(n),
      count: filtered.filter(r => r.hhTotal != null && (n === 10 ? r.hhTotal >= 10 : r.hhTotal === n)).length,
    })).filter(b => b.count > 0);
  }, [filtered]);

  // ── Assistance ───────────────────────────────────────────────────────────
  const receivedData = useMemo(() => [
    { name: 'Fully Received', value: filtered.filter(r => r.asstReceived === 1).length, color: '#22c55e' },
    { name: 'Partially/Other',value: filtered.filter(r => r.asstReceived === 2).length, color: '#f97316' },
    { name: 'Not Received',   value: filtered.filter(r => r.asstReceived === 3).length, color: '#ef4444' },
  ].filter(d => d.value > 0), [filtered]);

  const modeData = useMemo(() => [
    { name: 'Bankak App',     value: filtered.filter(r => r.modeUsed === 1).length, color: '#0ea5e9' },
    { name: 'Cash Out',       value: filtered.filter(r => r.modeUsed === 2).length, color: '#8b5cf6' },
    { name: 'Both',           value: filtered.filter(r => r.modeUsed === 3).length, color: '#14b8a6' },
  ].filter(d => d.value > 0), [filtered]);

  const amountByState = useMemo(() => {
    const m: Record<string, { sumRec: number; sumExp: number; n: number }> = {};
    filtered.forEach(r => {
      if (!r.state || !r.asstAmtRec) return;
      if (!m[r.state]) m[r.state] = { sumRec: 0, sumExp: 0, n: 0 };
      m[r.state].sumRec += r.asstAmtRec;
      m[r.state].sumExp += (r.asstAmtExp || 0);
      m[r.state].n++;
    });
    return Object.entries(m).map(([s, v]) => ({
      state: STATE_LABELS[s] || s,
      avgReceived: Math.round(v.sumRec / v.n),
      avgExpected: v.sumExp ? Math.round(v.sumExp / v.n) : null,
    }));
  }, [filtered]);

  // ── Utilization ──────────────────────────────────────────────────────────
  const accessData = useMemo(() => [
    { category: 'Market Access', yes: filtered.filter(r => r.marketAccess === 1).length, no: filtered.filter(r => r.marketAccess === 0).length },
    { category: 'Food Available', yes: filtered.filter(r => r.foodAvailable === 1).length, no: filtered.filter(r => r.foodAvailable === 0).length },
    { category: 'Used Assistance', yes: filtered.filter(r => r.usedAssistance === 1).length, no: filtered.filter(r => r.usedAssistance === 0).length },
    { category: 'Faced Challenges', yes: filtered.filter(r => r.expChallenge === 1).length, no: filtered.filter(r => r.expChallenge === 0).length },
  ], [filtered]);

  const challengeData = useMemo(() => {
    const m: Record<number, number> = {};
    filtered.forEach(r => r.challenges.forEach(c => { m[c] = (m[c] || 0) + 1; }));
    return Object.entries(m)
      .map(([k, v]) => ({ name: CHALLENGE_LABELS[Number(k)] || 'Other', count: v }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const foodPropData = useMemo(() => {
    const bins = ['0-25', '26-50', '51-75', '76-100'];
    return bins.map(b => {
      const [lo, hi] = b.split('-').map(Number);
      return { range: b+'%', count: filtered.filter(r => r.propFood != null && r.propFood >= lo && r.propFood <= hi).length };
    });
  }, [filtered]);

  // ── Satisfaction ─────────────────────────────────────────────────────────
  const satData = useMemo(() => SATISFACTION_CFG.map(s => ({
    ...s, count: filtered.filter(r => r.satisfaction === s.key).length,
    pct: PCT(filtered.filter(r => r.satisfaction === s.key).length, total),
  })), [filtered, total]);

  // ── Interviewers ─────────────────────────────────────────────────────────
  const interviewerData = useMemo(() => {
    // Group by name — each unique collector name = one row.
    // Phase 1 fix ensures names are never overwritten, so this is now accurate.
    const m: Record<string, number> = {};
    filtered.forEach(r => {
      const key = r.interviewer?.trim() || '__unassigned__';
      m[key] = (m[key] || 0) + 1;
    });
    return Object.entries(m)
      .map(([name, count]) => ({
        name: name === '__unassigned__' ? '— Unassigned' : name,
        count,
        unassigned: name === '__unassigned__',
      }))
      .sort((a, b) => a.unassigned ? 1 : b.unassigned ? -1 : b.count - a.count);
  }, [filtered]);

  // ── State Progress Table ─────────────────────────────────────────────────
  const localityProgressData = useMemo(() => {
    const m: Record<string, number> = {};
    records.forEach(r => {
      if (!r.state) return;
      m[r.state] = (m[r.state] || 0) + 1;
    });
    return Object.entries(m).map(([code, count]) => ({
      code,
      name: STATE_LABELS[code] || code,
      reached: count,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const importProgressRef = useRef<HTMLInputElement>(null);

  const ARABIC_TO_CODE: Record<string, string> = {
    'حوش بانقا': 'SD16010', 'الكدرو': 'SD01003', 'العليفون': 'SD01004',
    'ام بدة': 'SD01002', 'ام درمان': 'SD01006', 'الحاج يوسف': 'SD01007',
    'الحاج يوسف الوحده مربع 7': 'SD01007', 'منتيقو': 'SD17018',
    'منتيقو ( شيخ اسماعيل )': 'SD17018', 'ناوا': 'SD17017',
    'كومي الجديده': 'SD17016', 'مربع 42': 'SD09047',
    'ود نمر الحي الخامس': 'SD09045', 'ربك مربع 48': 'SD09046',
  };
  const ENGLISH_TO_CODE: Record<string, string> = Object.fromEntries(
    Object.entries(LOCALITY_LABELS).map(([code, name]) => [name.toLowerCase(), code])
  );

  // DCT Sample file parser — reads PRINCIPAL (green) rows only, skips ALTERNATE (yellow),
  // counts planned HHs per (state, locality) and updates localityRows.
  const DCT_STATE_TO_CODE: Record<string, string> = {
    // English (lowercase)
    'khartoum': 'SD01', 'north darfur': 'SD02', 'south darfur': 'SD03',
    'west darfur': 'SD04', 'east darfur': 'SD05', 'central darfur': 'SD06',
    'south kordofan': 'SD07', 'blue nile': 'SD08', 'white nile': 'SD09',
    'red sea': 'SD10', 'kassala': 'SD11', 'gedaref': 'SD12',
    'north kordofan': 'SD13', 'sennar': 'SD14', 'aj jazirah': 'SD15',
    'river nile': 'SD16', 'northern': 'SD17', 'west kordofan': 'SD18',
    // Arabic
    'الخرطوم': 'SD01', 'شمال دارفور': 'SD02', 'جنوب دارفور': 'SD03',
    'غرب دارفور': 'SD04', 'شرق دارفور': 'SD05', 'وسط دارفور': 'SD06',
    'جنوب كردفان': 'SD07', 'النيل الأزرق': 'SD08', 'النيل الأبيض': 'SD09',
    'البحر الأحمر': 'SD10', 'كسلا': 'SD11', 'القضارف': 'SD12',
    'شمال كردفان': 'SD13', 'سنار': 'SD14', 'الجزيرة': 'SD15',
    'نهر النيل': 'SD16', 'الشمالية': 'SD17', 'غرب كردفان': 'SD18',
  };

  const handleImportProgress = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSXLib = await import('xlsx');
      const buf = await file.arrayBuffer();
      // cellStyles:true is required to read fill colours (green vs yellow rows)
      const wbImp = XLSXLib.read(buf, { type: 'array', cellStyles: true });

      // Arabic → English locality name aliases
      const LOC_ALIASES: Record<string, string> = {
        'بحري': 'Bahri', 'محلية بحري': 'Bahri',
        'شرق النيل': 'Sharg An Neel', 'شرق نيل': 'Sharg An Neel', 'شرق النيل ': 'Sharg An Neel',
        'ربك': 'Rabak', 'محلية ربك': 'Rabak',
        'كوستي': 'Kosti', 'محلية كوستي': 'Kosti',
        'أم رمتة': 'Um Rimta', 'ام رمتة': 'Um Rimta', 'محلية أم رمتة': 'Um Rimta',
        'شندي': 'Shendi', 'محلية شندي': 'Shendi',
        'الفاشر': 'El Fasher', 'محلية الفاشر': 'El Fasher',
        'كادقلي': 'Kadugli', 'محلية كادقلي': 'Kadugli',
        'هبيلا': 'Habila', 'محلية هبيلا': 'Habila',
        'الدلنج': 'Dilling', 'دلنج': 'Dilling',
        'بورسودان': 'Port Sudan', 'بور سودان': 'Port Sudan',
        'أم روابة': 'Um Rawaba', 'ام روابة': 'Um Rawaba',
        'الأبيض': 'Sheikan', 'الأبيض (شيكان)': 'Sheikan',
        'القولد': 'Al Golid', 'الجولد': 'Al Golid', 'قولد': 'Al Golid',
        'السنوط': 'As Sunut', 'سنوط': 'As Sunut',
        'اللقاوة': 'Al Lagowa', 'لقاوة': 'Al Lagowa',
      };
      const normLoc = (n: string) => LOC_ALIASES[n.trim()] || LOC_ALIASES[n.trim().toLowerCase()] || n.trim();

      // Green fill colours used in DCT Sample file for planned (PDM) rows
      const GREEN_FILLS = new Set(['00B050', '84E291', '92D050', '00B0F0']);

      const isGreenRow = (ws: ReturnType<typeof XLSXLib.utils.aoa_to_sheet>, rowIdx: number): boolean => {
        // Check column A (index 0) fill colour — green = PDM planned, yellow = backup
        const cellAddr = XLSXLib.utils.encode_cell({ r: rowIdx, c: 0 });
        const cell = ws[cellAddr];
        if (!cell || !cell.s) return true; // no style info → treat as planned
        const fg = cell.s.fgColor?.rgb || '';
        const patternType = cell.s.patternType || '';
        if (patternType === 'solid' && fg) {
          // Yellow (FFFF00) = backup/alternate → exclude
          if (fg === 'FFFF00' || fg === 'FFC000' || fg === 'FF0000') return false;
          // Known green shades → include
          if (GREEN_FILLS.has(fg)) return true;
          // Any other solid colour with no explicit green → exclude to be safe
          return false;
        }
        // No solid fill (no colour) → treat as planned
        return true;
      };

      // Count green (planned) HHs per stateCode → localityName across ALL sheets
      const plannedMap: Record<string, Record<string, number>> = {};
      let totalGreen = 0;
      let totalSkipped = 0;

      wbImp.SheetNames.forEach(sheetName => {
        const ws = wbImp.Sheets[sheetName];
        if (!ws || !ws['!ref']) return;
        const range = XLSXLib.utils.decode_range(ws['!ref']);
        if (range.e.r < 1) return; // no data rows

        // Find header row (row 0) to locate STATE and LOCALITY columns
        const headerRow: string[] = [];
        for (let c = 0; c <= range.e.c; c++) {
          const cell = ws[XLSXLib.utils.encode_cell({ r: 0, c })];
          headerRow.push(cell ? String(cell.v || '').trim().toUpperCase() : '');
        }
        const stateColIdx    = headerRow.findIndex(h => h === 'STATE' || h === 'ولاية' || h === 'GOVERNORATE');
        const localityColIdx = headerRow.findIndex(h => h === 'LOCALITY' || h === 'محلية' || h === 'DISTRICT');

        for (let r = 1; r <= range.e.r; r++) {
          // Only count green rows (planned/PDM) — skip yellow (backup/alternate)
          if (!isGreenRow(ws, r)) { totalSkipped++; continue; }

          const stateCell    = stateColIdx >= 0 ? ws[XLSXLib.utils.encode_cell({ r, c: stateColIdx })] : null;
          const localityCell = localityColIdx >= 0 ? ws[XLSXLib.utils.encode_cell({ r, c: localityColIdx })] : null;
          if (!stateCell && !localityCell) continue;

          const stateRaw = stateCell ? String(stateCell.v || '').trim() : '';
          const locRaw   = localityCell ? String(localityCell.v || '').trim() : '';
          if (!stateRaw && !locRaw) continue;

          const stateCode = DCT_STATE_TO_CODE[stateRaw.toLowerCase()]
            || DCT_STATE_TO_CODE[stateRaw]
            || Object.entries(STATE_LABELS).find(([, v]) => v.toLowerCase() === stateRaw.toLowerCase())?.[0];
          if (!stateCode) continue;

          const locName = normLoc(locRaw) || sheetName.replace(/^[A-Z]{2,3}\s+/i, '').trim();
          if (!locName) continue;

          if (!plannedMap[stateCode]) plannedMap[stateCode] = {};
          // For states where one sheet covers multiple sub-localities (e.g. ND El Fasher),
          // all green rows roll up into a single locality entry per state
          const canonicalLoc = normLoc(locRaw) || locName;
          // Group sub-localities of El Fasher (El Fasher, El Fasher Town, El Fasher Rural) → El Fasher
          const loc = canonicalLoc.toLowerCase().startsWith('el fasher') ? 'El Fasher' : canonicalLoc;
          plannedMap[stateCode][loc] = (plannedMap[stateCode][loc] || 0) + 1;
          totalGreen++;
        }
      });

      if (Object.keys(plannedMap).length === 0) {
        alert('No green-highlighted rows found. Make sure you are uploading the correct DCT Sample Excel file.');
        return;
      }

      // Update or create locality rows
      let newRows = [...localityRows];
      let updatedCount = 0;
      let addedCount = 0;
      const details: string[] = [];

      Object.entries(plannedMap).forEach(([stateCode, locMap]) => {
        const stateName = STATE_LABELS[stateCode] || stateCode;
        // Remove the existing blank placeholder row for this state (if only one blank row)
        const existingRows = newRows.filter(r => r.stateCode === stateCode);
        const isOnlyBlank = existingRows.length === 1 && !existingRows[0].locality && !existingRows[0].planned;
        if (isOnlyBlank) {
          newRows = newRows.filter(r => !(r.stateCode === stateCode && !r.locality));
        }

        Object.entries(locMap).forEach(([locName, count]) => {
          const existing = newRows.find(
            r => r.stateCode === stateCode && r.locality.toLowerCase() === locName.toLowerCase()
          );
          if (existing) {
            newRows = newRows.map(r => r.id === existing.id ? { ...r, planned: String(count) } : r);
            updatedCount++;
            details.push(`  ✓ ${stateName} / ${locName}: ${count} planned`);
          } else {
            const id = `${stateCode}-${locName.replace(/\s+/g, '').slice(0, 6)}-${Date.now().toString(36)}`;
            newRows.push({ id, stateCode, locality: locName, planned: String(count), deviation: '', remarks: '' });
            addedCount++;
            details.push(`  + ${stateName} / ${locName}: ${count} planned (new row added)`);
          }
        });
      });

      setLocalityRows(newRows);
      saveRows(newRows);
      localStorage.setItem('pact-pdm-locality-rows-ver', LOCALITY_ROWS_VER);
      alert(
        `DCT Sample imported successfully!\n\n` +
        details.join('\n') +
        `\n\n${totalGreen} green (planned) rows counted across all sheets.\n` +
        `${totalSkipped} yellow/backup rows excluded.\n` +
        (addedCount > 0 ? `Note: ${addedCount} new locality row(s) were added. If a name doesn't match an existing row, use Edit Table to correct it then re-upload.` : '')
      );
    } catch {
      alert('Could not read the file. Please upload a valid DCT Sample Excel file.');
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSXLib = await import('xlsx');
    const rows = allStateRows.map(r => ({
      'State': r.name,
      'Locality': localityTargets[r.code]?.locality || '',
      'Planned Number for PDM (Confirmed)': localityTargets[r.code]?.planned || '',
      'Reason for Deviation': '',
      'Remarks': '',
    }));
    const ws = XLSXLib.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 34 }, { wch: 30 }];
    const wbOut = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wbOut, ws, 'PDM State Targets');
    XLSXLib.writeFile(wbOut, 'pdm_state_template.xlsx');
  };

  const handleExportProgress = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator  = 'PACT Command Center Platform - ICT Unit';
      wb.company  = 'PACT';
      const ws = wb.addWorksheet('PDM Progress by State');

      // ── Column definitions ────────────────────────────────────────────────
      ws.columns = [
        { key: 'state',    width: 18 },
        { key: 'locality', width: 22 },
        { key: 'planned',  width: 28 },
        { key: 'reached',  width: 28 },
        { key: 'dev',      width: 14 },
        { key: 'pct',      width: 14 },
        { key: 'reason',   width: 40 },
        { key: 'remarks',  width: 34 },
      ];

      // ── Style helpers ─────────────────────────────────────────────────────
      const NAVY   = '0F2041';
      const NAVY2  = '1D3461';
      const WHITE  = 'FFFFFFFF';
      const GREY_H = 'FFE8EDF4';
      const EMERALD = 'FF059669';
      const BLUE    = 'FF2563EB';
      const AMBER   = 'FFD97706';
      const ORANGE  = 'FFEA580C';
      const RED     = 'FFDC2626';

      const pctColor = (pct: number | null) => {
        if (pct == null)  return null;
        if (pct >= 100)   return EMERALD;
        if (pct >= 90)    return BLUE;
        if (pct >= 75)    return AMBER;
        if (pct >= 50)    return ORANGE;
        return RED;
      };

      const applyBorder = (row: ExcelJS.Row, style: ExcelJS.BorderStyle = 'thin') => {
        row.eachCell({ includeEmpty: true }, cell => {
          cell.border = {
            top:    { style, color: { argb: 'FFD1D5DB' } },
            left:   { style, color: { argb: 'FFD1D5DB' } },
            bottom: { style, color: { argb: 'FFD1D5DB' } },
            right:  { style, color: { argb: 'FFD1D5DB' } },
          };
        });
      };

      // ── Title row ─────────────────────────────────────────────────────────
      ws.mergeCells('A1:H1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `DCT PDM Progress by State — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
      titleCell.font  = { bold: true, size: 13, color: { argb: WHITE } };
      titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 28;

      // ── Generated-by subtitle ─────────────────────────────────────────────
      ws.mergeCells('A2:H2');
      const genCell = ws.getCell('A2');
      genCell.value = 'Generated by PACT Command Center Platform — ICT Unit';
      genCell.font  = { italic: true, size: 9, color: { argb: 'FF374151' } };
      genCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      genCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 16;

      // ── Header row ────────────────────────────────────────────────────────
      const headers = ['State', 'Locality', 'Planned for PDM (PRINCIPAL)', 'Reached (up to date)', 'Deviation', '% Reached', 'Reason for Deviation', 'Remarks'];
      const hRow = ws.addRow(headers);
      hRow.height = 22;
      hRow.eachCell(cell => {
        cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY2}` } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border    = { bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } } };
      });
      // Green header for Planned column to signal PRINCIPAL rows
      const plannedHCell = hRow.getCell(3);
      plannedHCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

      // ── Data rows ─────────────────────────────────────────────────────────
      let totalPlanned = 0; let totalReached = 0;
      const allExportRows: ExcelJS.Row[] = [];

      groupedRows.forEach(group => {
        const deviation = stateDeviations[group.code] || '';
        const remarks   = stateRemarks[group.code] || '';
        const locRows   = group.rows.length > 0 ? group.rows : [null];
        let   statePlanned = 0; let stateReached = 0;
        const stateDataRows: ExcelJS.Row[] = [];

        locRows.forEach((row, ri) => {
          const reached = row ? (localityReached[row.id] ?? 0) : 0;
          const planned = row?.planned ? Number(row.planned) : null;
          const dev     = planned != null ? reached - planned : null;
          const devPct  = planned ? Math.round((reached / planned) * 100) : null;

          if (planned) statePlanned += planned;
          stateReached += reached;

          const isOdd = (ri % 2 === 0);
          const rowBg = isOdd ? 'FFFFFFFF' : GREY_H;

          const dataRow = ws.addRow([
            ri === 0 ? group.name : '',
            row?.locality || '—',
            planned ?? '',
            reached,
            dev != null ? dev : '',
            devPct != null ? `${devPct}%` : '0%',
            ri === 0 ? deviation : '',
            ri === 0 ? remarks   : '',
          ]);
          dataRow.height = 18;
          dataRow.eachCell({ includeEmpty: true }, cell => {
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            cell.font      = { size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: true };
          });

          // State column — bold
          dataRow.getCell(1).font = { bold: ri === 0, size: 10, color: { argb: `FF${NAVY}` } };
          dataRow.getCell(1).alignment = { vertical: 'top', wrapText: true };

          // Planned — green tint (PRINCIPAL indicator)
          if (planned) {
            dataRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            dataRow.getCell(3).font = { bold: true, size: 10, color: { argb: 'FF065F46' } };
          }
          dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
          dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

          // Deviation value — coloured
          const devCell = dataRow.getCell(5);
          devCell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (dev != null && dev < 0) devCell.font = { size: 10, color: { argb: 'FFDC2626' } };
          if (dev != null && dev >= 0) devCell.font = { size: 10, color: { argb: 'FF059669' } };

          // % Reached — coloured
          const pctCell = dataRow.getCell(6);
          pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
          const pc = pctColor(devPct);
          if (pc) pctCell.font = { bold: true, size: 10, color: { argb: pc } };

          applyBorder(dataRow);
          stateDataRows.push(dataRow);
          allExportRows.push(dataRow);
        });

        // Merge State column for this group
        if (stateDataRows.length > 1) {
          const startRow = stateDataRows[0].number;
          const endRow   = stateDataRows[stateDataRows.length - 1].number;
          ws.mergeCells(startRow, 1, endRow, 1);
          // Merge Reason for Deviation and Remarks columns too
          ws.mergeCells(startRow, 7, endRow, 7);
          ws.mergeCells(startRow, 8, endRow, 8);
        }

        // ── State subtotal row ────────────────────────────────────────────
        const stateDev    = statePlanned ? stateReached - statePlanned : null;
        const stateDevPct = statePlanned ? Math.round((stateReached / statePlanned) * 100) : null;
        const subRow = ws.addRow([
          '', 'State Subtotal', statePlanned || '', stateReached,
          stateDev != null ? stateDev : '',
          stateDevPct != null ? `${stateDevPct}%` : '0%',
          '', '',
        ]);
        subRow.height = 16;
        subRow.eachCell({ includeEmpty: true }, cell => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
          cell.font      = { bold: true, italic: true, size: 9, color: { argb: 'FF475569' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        subRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
        const subPctCell = subRow.getCell(6);
        const spc = pctColor(stateDevPct);
        if (spc) subPctCell.font = { bold: true, italic: true, size: 9, color: { argb: spc } };
        applyBorder(subRow);

        totalPlanned += statePlanned;
        totalReached += stateReached;
      });

      // ── TOTAL row ─────────────────────────────────────────────────────────
      // Reached = ALL surveys (matches dashboard badge), not just SUBCODE-mapped rows
      const exportTotalReached = records.length;
      const totalDev    = totalPlanned ? exportTotalReached - totalPlanned : null;
      const totalDevPct = totalPlanned ? Math.round((exportTotalReached / totalPlanned) * 100) : null;
      const totRow = ws.addRow([
        'TOTAL', '', totalPlanned || '', exportTotalReached,
        totalDev != null ? totalDev : '',
        totalDevPct != null ? `${totalDevPct}%` : '',
        '', '',
      ]);
      totRow.height = 22;
      totRow.eachCell({ includeEmpty: true }, cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
        cell.font      = { bold: true, size: 11, color: { argb: WHITE } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      totRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      const totPctCell = totRow.getCell(6);
      const tpc = pctColor(totalDevPct);
      if (tpc) totPctCell.font = { bold: true, size: 11, color: { argb: tpc } };
      applyBorder(totRow, 'medium');

      // ── Download ──────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob   = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `PDM_Progress_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
    } catch (err) {
      console.error('Progress export error:', err);
      alert('Export failed. Please try again.');
    }
  };

  // ── Beneficiary Feedback & Field Reports ──────────────────────────────────
  const trivialPhrases = ['لا', 'لا يوجد', 'شكرا', 'لا شيء', 'لاشيء', 'لايوجد', 'no', 'لا شي', 'شكرًا', 'شكراً', 'لا توجد'];
  const isTrivial = (s: string) => {
    const clean = s.trim().toLowerCase();
    return clean.length <= 4 || trivialPhrases.some(p => clean === p.toLowerCase());
  };
  const allFeedback = useMemo(() =>
    filtered
      .filter(r => r.freeResponse && String(r.freeResponse).trim().length > 1)
      .map(r => ({
        id: r.id,
        state: r.state ? (STATE_LABELS[r.state] || r.state) : '—',
        stateCode: r.state || '',
        interviewer: r.interviewer || '—',
        text: String(r.freeResponse!).trim(),
        satisfaction: r.satisfaction,
        trivial: isTrivial(String(r.freeResponse!)),
      })),
  [filtered]);

  const feedbackFiltered = useMemo(() => {
    let f = allFeedback;
    if (feedbackFilter === 'substantive') f = f.filter(r => !r.trivial);
    if (feedbackFilter === 'concerns')    f = f.filter(r => !r.trivial && (r.satisfaction ?? 5) <= 3);
    if (feedbackFilter !== 'all')         f = f.filter(r => !r.trivial);
    return f;
  }, [allFeedback, feedbackFilter]);

  const feedbackStats = useMemo(() => ({
    total: allFeedback.length,
    substantive: allFeedback.filter(r => !r.trivial).length,
    concerns: allFeedback.filter(r => !r.trivial && (r.satisfaction ?? 5) <= 3).length,
    positive: allFeedback.filter(r => !r.trivial && (r.satisfaction ?? 0) >= 4).length,
  }), [allFeedback]);

  const feedbackPagedData = useMemo(() => {
    const start = feedbackPage * FEEDBACK_PAGE_SIZE;
    return feedbackFiltered.slice(start, start + FEEDBACK_PAGE_SIZE);
  }, [feedbackFiltered, feedbackPage]);

  // ── Formatted Report Export ───────────────────────────────────────────────
  const handleExportReport = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'PACT Command Center Platform - ICT Unit';
      wb.company = 'PACT';
      const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const filterDesc = [
        stateFilter !== 'all' ? `State: ${STATE_LABELS[stateFilter] || stateFilter}` : null,
        sexFilter   !== 'all' ? `HH Head Sex: ${sexFilter === '0' ? 'Female' : 'Male'}` : null,
        rcvFilter   !== 'all' ? `Assistance: ${rcvFilter === '1' ? 'Received' : rcvFilter === '2' ? 'Partial' : 'Not Received'}` : null,
      ].filter(Boolean).join('  |  ') || 'None (All Records)';
      const marketAccessPct = PCT(filtered.filter(r => r.marketAccess === 1).length, total);

      // ── Shared style helpers ──────────────────────────────────────────────
      const C = {
        navy:   { argb: 'FF0F2041' },
        navy2:  { argb: 'FF1D3461' },
        altRow: { argb: 'FFEEF3FA' },
        white:  { argb: 'FFFFFFFF' },
        total:  { argb: 'FFFFF9C4' },
        green:  { argb: 'FF166534' },
        red:    { argb: 'FFB91C1C' },
        black:  { argb: 'FF1F2937' },
        gray:   { argb: 'FFF3F4F6' },
      };
      const border = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
      const borders = { top: border, left: border, bottom: border, right: border };

      const solidFill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

      const styleCell = (cell: any, bg?: string, fontOpts?: any, alignH: 'left'|'center'|'right' = 'left') => {
        if (bg) cell.fill = solidFill(bg);
        cell.font = { size: 10, color: C.black, ...fontOpts };
        cell.alignment = { vertical: 'middle', horizontal: alignH, wrapText: alignH === 'left' };
        cell.border = borders;
      };

      const addBanner = (ws: any, text: string, span: number) => {
        const row = ws.addRow([text]);
        row.height = 22;
        const rn = row.number;
        if (span > 1) ws.mergeCells(rn, 1, rn, span);
        const cell = ws.getCell(rn, 1);
        cell.fill = solidFill(C.navy.argb);
        cell.font = { bold: true, size: 11, color: C.white };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        return row;
      };

      const addColHdr = (ws: any, headers: string[]) => {
        const row = ws.addRow(headers);
        row.height = 18;
        row.eachCell((cell: any) => {
          cell.fill = solidFill(C.navy2.argb);
          cell.font = { bold: true, size: 10, color: C.white };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = borders;
        });
        return row;
      };

      const addData = (ws: any, values: any[], alt: boolean, opts?: { bold?: boolean; bg?: string; cols?: Array<'left'|'center'|'right'> }) => {
        const row = ws.addRow(values);
        row.height = 16;
        row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
          const align = opts?.cols?.[c - 1] ?? (c === 1 ? 'left' : 'center');
          styleCell(cell, opts?.bg ?? (alt ? C.altRow.argb : C.white.argb), { bold: opts?.bold ?? false }, align);
        });
        return row;
      };

      // ── Sheet 1: Dashboard Summary ────────────────────────────────────────
      const ws1 = wb.addWorksheet('Dashboard Summary');
      ws1.columns = [
        { width: 32 }, { width: 22 }, { width: 30 }, { width: 14 },
        { width: 12 }, { width: 36 }, { width: 30 },
      ];

      // Title
      const titleRow = ws1.addRow(['2026 DCT PDM Dashboard — Post-Distribution Monitoring Report']);
      titleRow.height = 32;
      ws1.mergeCells(titleRow.number, 1, titleRow.number, 7);
      const tc = ws1.getCell(titleRow.number, 1);
      tc.fill = solidFill(C.navy.argb);
      tc.font = { bold: true, size: 15, color: C.white };
      tc.alignment = { vertical: 'middle', horizontal: 'center' };

      // Subtitle — generated by + date + filters
      const subRow = ws1.addRow([`Generated: ${now}    |    Filters: ${filterDesc}    |    Generated by PACT Command Center Platform — ICT Unit`]);
      subRow.height = 18;
      ws1.mergeCells(subRow.number, 1, subRow.number, 7);
      const sc2 = ws1.getCell(subRow.number, 1);
      sc2.fill = solidFill(C.gray.argb);
      sc2.font = { italic: true, size: 10, color: { argb: 'FF374151' } };
      sc2.alignment = { vertical: 'middle', horizontal: 'center' };

      ws1.addRow([]);

      // KPI section
      addBanner(ws1, 'KEY PERFORMANCE INDICATORS', 3);
      addColHdr(ws1, ['Indicator', 'Value', 'Detail']);
      const kpis = [
        ['Total Surveys', total, `${states.length} state${states.length !== 1 ? 's' : ''} covered`],
        ['Assistance Received', `${receivedPct}%`, `${filtered.filter(r => r.asstReceived === 1).length} of ${total} households`],
        ['Satisfaction Score', `${avgSat.toFixed(1)} / 5`, `${satPct}% rated Good or Excellent`],
        ['CFM Awareness', `${cfmPct}%`, `${filtered.filter(r => r.cfm === 1).length} aware of complaint mechanism`],
        ['Avg Household Size', avgHHSize.toFixed(1), 'members per household'],
        ['Market Access', `${marketAccessPct}%`, `${filtered.filter(r => r.marketAccess === 1).length} households can access market`],
      ];
      kpis.forEach((kpi, i) => addData(ws1, kpi, i % 2 === 1, { cols: ['left', 'center', 'left'] }));

      ws1.addRow([]);

      // PDM Progress section
      addBanner(ws1, 'PDM PROGRESS BY STATE', 8);
      addColHdr(ws1, ['State', 'Locality', 'Planned (Confirmed)', 'Reached (up to date)', 'Deviation', '% Reached', 'Reason for Deviation', 'Remarks']);

      // Only include PRINCIPAL states (those with non-empty planned data)
      const principalStateRows = allStateRows.filter(r => SAMPLE_PLANNED[r.code] !== '');
      const tpTot = principalStateRows.reduce((s, r) => s + (localityTargets[r.code]?.planned ? Number(localityTargets[r.code].planned) : 0), 0);
      const trTot = records.length; // ALL surveys, not just PRINCIPAL states

      principalStateRows.forEach((lr, i) => {
        const t = localityTargets[lr.code];
        const planned = t?.planned ? Number(t.planned) : null;
        const dev = planned != null ? lr.reached - planned : null;
        const pct = planned ? Math.round((lr.reached / planned) * 100) : null;
        const row = addData(ws1, [lr.name, t?.locality || '—', planned ?? '—', lr.reached, dev != null ? dev : '—', pct != null ? `${pct}%` : '—', t?.deviation || '—', t?.remarks || '—'], i % 2 === 1);
        if (dev != null) {
          const clr = dev >= 0 ? C.green : C.red;
          row.getCell(5).font = { bold: true, size: 10, color: clr };
          row.getCell(6).font = { bold: true, size: 10, color: clr };
        }
      });

      const totalDev2 = tpTot ? trTot - tpTot : null;
      const totalPct2 = tpTot ? Math.round((trTot / tpTot) * 100) : null;
      const totRow = addData(ws1, ['TOTAL', '', tpTot || '—', trTot, totalDev2 != null ? totalDev2 : '—', totalPct2 != null ? `${totalPct2}%` : '—', '', ''], false, { bold: true, bg: C.total.argb });
      if (totalDev2 != null) {
        const clr = totalDev2 >= 0 ? C.green : C.red;
        totRow.getCell(5).font = { bold: true, size: 10, color: clr };
        totRow.getCell(6).font = { bold: true, size: 10, color: clr };
      }

      ws1.addRow([]);

      // By State section
      addBanner(ws1, 'SURVEY SUBMISSIONS BY STATE', 3);
      addColHdr(ws1, ['State', 'Submissions', '% of Total']);
      byState.forEach((s, i) => addData(ws1, [s.state, s.count, `${PCT(s.count, total)}%`], i % 2 === 1));

      ws1.addRow([]);

      // Timeline section
      addBanner(ws1, 'SUBMISSION TIMELINE', 2);
      addColHdr(ws1, ['Date', 'Submissions']);
      timeline.forEach((t, i) => addData(ws1, [t.date, t.count], i % 2 === 1));

      ws1.views = [{ state: 'frozen', ySplit: 2 }];

      // ── Sheet 2: Demographics ─────────────────────────────────────────────
      const ws2 = wb.addWorksheet('Demographics');
      ws2.columns = [{ width: 28 }, { width: 14 }, { width: 16 }];

      addBanner(ws2, 'HH HEAD SEX', 3);
      addColHdr(ws2, ['Sex', 'Count', '% of Total']);
      sexData.forEach((d, i) => addData(ws2, [d.name, d.value, `${PCT(d.value, total)}%`], i % 2 === 1));
      ws2.addRow([]);

      addBanner(ws2, 'HH HEAD STATUS', 3);
      addColHdr(ws2, ['Status', 'Count', '% of Total']);
      statusData.forEach((d, i) => addData(ws2, [d.name, d.value, `${PCT(d.value, total)}%`], i % 2 === 1));
      ws2.addRow([]);

      addBanner(ws2, 'HOUSEHOLD SIZE DISTRIBUTION', 3);
      addColHdr(ws2, ['HH Size', 'Count', '% of Total']);
      hhSizeData.forEach((d, i) => addData(ws2, [d.size, d.count, `${PCT(d.count, total)}%`], i % 2 === 1));

      // ── Sheet 3: Assistance & Utilization ────────────────────────────────
      const ws3 = wb.addWorksheet('Assistance & Utilization');
      ws3.columns = [{ width: 30 }, { width: 26 }, { width: 22 }, { width: 12 }];
      const asstRecs = filtered.filter(r => r.asstAmtRec != null && r.asstAmtRec > 0);
      const avgAmt = asstRecs.length ? Math.round(asstRecs.reduce((s, r) => s + (r.asstAmtRec ?? 0), 0) / asstRecs.length) : 0;

      addBanner(ws3, 'RECEIPT STATUS', 3);
      addColHdr(ws3, ['Status', 'Count', '% of Total']);
      receivedData.forEach((d, i) => addData(ws3, [d.name, d.value, `${PCT(d.value, total)}%`], i % 2 === 1));
      ws3.addRow([]);

      addBanner(ws3, 'MODE OF DELIVERY (DIGITAL CASH)', 3);
      addColHdr(ws3, ['Mode', 'Count', '% of Total']);
      modeData.forEach((d, i) => addData(ws3, [d.name, d.value, `${PCT(d.value, total)}%`], i % 2 === 1));
      ws3.addRow([]);

      addBanner(ws3, 'AMOUNT RECEIVED BY STATE (avg SDG)', 3);
      addColHdr(ws3, ['State', 'Avg Amount Received (SDG)', 'Avg Expected (SDG)']);
      amountByState.forEach((d, i) => addData(ws3, [d.state, d.avgReceived, d.avgExpected ?? '—'], i % 2 === 1));
      addData(ws3, ['Overall Average', avgAmt, ''], false, { bold: true, bg: C.total.argb });
      ws3.addRow([]);

      addBanner(ws3, 'UTILIZATION INDICATORS', 4);
      addColHdr(ws3, ['Indicator', 'Yes', 'No', '% Yes']);
      accessData.forEach((d, i) => addData(ws3, [d.category, d.yes, d.no, `${PCT(d.yes, d.yes + d.no)}%`], i % 2 === 1));

      // ── Sheet 4: Challenges & Food Security ──────────────────────────────
      const ws4 = wb.addWorksheet('Challenges & Food Security');
      ws4.columns = [{ width: 38 }, { width: 10 }, { width: 20 }];
      const foodBins = [
        { range: '0–25%', lo: 0, hi: 25 }, { range: '26–50%', lo: 26, hi: 50 },
        { range: '51–75%', lo: 51, hi: 75 }, { range: '76–100%', lo: 76, hi: 100 },
      ];

      addBanner(ws4, 'TOP CHALLENGES REPORTED', 3);
      addColHdr(ws4, ['Challenge', 'Count', '% of Total']);
      challengeData.forEach((d, i) => addData(ws4, [d.name, d.count, `${PCT(d.count, total)}%`], i % 2 === 1));
      ws4.addRow([]);

      addBanner(ws4, 'PROPORTION OF AID SPENT ON FOOD', 3);
      addColHdr(ws4, ['Range', 'Count', '% of Respondents']);
      foodBins.forEach((b, i) => {
        const cnt = filtered.filter(r => r.propFood != null && r.propFood >= b.lo && r.propFood <= b.hi).length;
        addData(ws4, [b.range, cnt, `${PCT(cnt, total)}%`], i % 2 === 1);
      });

      // ── Sheet 5: Satisfaction & CFM ───────────────────────────────────────
      const ws5 = wb.addWorksheet('Satisfaction & CFM');
      ws5.columns = [{ width: 36 }, { width: 22 }, { width: 14 }, { width: 20 }];

      addBanner(ws5, 'SATISFACTION RATING DISTRIBUTION', 4);
      addColHdr(ws5, ['Rating', 'Label', 'Count', '% of Respondents']);
      satData.forEach((d, i) => addData(ws5, [d.key, d.label, d.count, `${d.pct}%`], i % 2 === 1));
      addData(ws5, ['Overall Average Score', avgSat.toFixed(2), '', ''], false, { bold: true, bg: C.total.argb });
      addData(ws5, ['Good or Excellent (≥4)', `${satPct}%`, `${filtered.filter(r => (r.satisfaction ?? 0) >= 4).length} respondents`, ''], false, { bold: true, bg: C.total.argb });
      ws5.addRow([]);

      addBanner(ws5, 'CFM AWARENESS', 3);
      addColHdr(ws5, ['Indicator', 'Count', '% of Total']);
      addData(ws5, ['Aware of Complaint Mechanism', filtered.filter(r => r.cfm === 1).length, `${cfmPct}%`], false);
      addData(ws5, ['Not Aware', filtered.filter(r => r.cfm === 0).length, `${PCT(filtered.filter(r => r.cfm === 0).length, total)}%`], true);

      // ── Sheet 6: Interviewers ─────────────────────────────────────────────
      const ws6 = wb.addWorksheet('Interviewers');
      ws6.columns = [{ width: 8 }, { width: 32 }, { width: 16 }, { width: 16 }];
      addBanner(ws6, 'INTERVIEWER SUBMISSIONS', 4);
      addColHdr(ws6, ['Rank', 'Interviewer', 'Submissions', '% of Total']);
      interviewerData.forEach((d, i) => addData(ws6, [i + 1, d.name, d.count, `${PCT(d.count, total)}%`], i % 2 === 1));

      // ── Sheet 7: Raw Survey Data ──────────────────────────────────────────
      const ws7 = wb.addWorksheet('Raw Survey Data');
      ws7.columns = [
        { width: 16 }, { width: 14 }, { width: 18 }, { width: 8 }, { width: 18 },
        { width: 16 }, { width: 20 }, { width: 22 }, { width: 16 }, { width: 12 },
        { width: 14 }, { width: 22 }, { width: 16 },
      ];
      const rawHdrs = ['Household ID','State','Locality','Sex','HH Head Status','HH Total','Assistance Received','Amount Received (SDG)','Satisfaction (1–5)','CFM Aware','Market Access','Interviewer','Submission Date'];
      addColHdr(ws7, rawHdrs);
      filtered.forEach((rec, i) => {
        addData(ws7, [
          rec.hhid, rec.state ? (STATE_LABELS[rec.state] || rec.state) : '', rec.locality,
          rec.sex === 0 ? 'Female' : 'Male', rec.hhStatus ? STATUS_LABELS[rec.hhStatus] : '',
          rec.hhTotal, rec.asstReceived === 1 ? 'Yes' : rec.asstReceived === 2 ? 'Partial' : 'No',
          rec.asstAmtRec, rec.satisfaction ?? '', rec.cfm === 1 ? 'Yes' : 'No',
          rec.marketAccess === 1 ? 'Yes' : rec.marketAccess === 0 ? 'No' : '',
          rec.interviewer ?? '', rec.submission ? String(rec.submission).slice(0, 10) : '',
        ], i % 2 === 1);
      });
      ws7.views = [{ state: 'frozen', ySplit: 1 }];

      // ── Chart drawing helpers ─────────────────────────────────────────────
      const px = (n: number) => Math.round(n);
      const b64 = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/png').split(',')[1];

      const drawVBar = (data: { label: string; value: number; color?: string }[], title: string): string => {
        const W = 640, H = 360, PL = 50, PR = 20, PT = 48, PB = 80;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0F2041'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText(title, W / 2, 30);
        const cW = W - PL - PR, cH = H - PT - PB;
        const maxV = Math.max(...data.map(d => d.value), 1);
        const bW = (cW / data.length) * 0.65, gap = cW / data.length;
        // grid
        for (let i = 0; i <= 4; i++) {
          const y = PT + cH - (cH * i / 4);
          ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
          ctx.fillStyle = '#6B7280'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
          ctx.fillText(String(px(maxV * i / 4)), PL - 5, y + 4);
        }
        data.forEach((d, i) => {
          const bH = (d.value / maxV) * cH;
          const x = PL + gap * i + (gap - bW) / 2, y = PT + cH - bH;
          ctx.fillStyle = d.color || '#1D3461';
          ctx.fillRect(px(x), px(y), px(bW), px(bH));
          ctx.fillStyle = '#111827'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
          if (d.value > 0) ctx.fillText(String(d.value), px(x + bW / 2), px(y - 5));
          ctx.fillStyle = '#374151'; ctx.font = '10px Arial';
          const lbl = d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label;
          ctx.fillText(lbl, px(x + bW / 2), PT + cH + 20);
        });
        ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(PL, PT); ctx.lineTo(PL, PT + cH); ctx.lineTo(W - PR, PT + cH); ctx.stroke();
        return b64(canvas);
      };

      const drawHBar = (data: { label: string; value: number; color?: string }[], title: string): string => {
        const BAR = 26, GAP = 10, PL = 210, PR = 70, PT = 50;
        const W = 640, H = PT + data.length * (BAR + GAP) + 30;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0F2041'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText(title, W / 2, 30);
        const maxV = Math.max(...data.map(d => d.value), 1), cW = W - PL - PR;
        data.forEach((d, i) => {
          const y = PT + i * (BAR + GAP);
          if (i % 2 === 1) { ctx.fillStyle = '#F9FAFB'; ctx.fillRect(0, y - 2, W, BAR + 4); }
          ctx.fillStyle = '#374151'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
          const lbl = d.label.length > 26 ? d.label.slice(0, 25) + '…' : d.label;
          ctx.fillText(lbl, PL - 8, y + BAR / 2 + 4);
          const bW = (d.value / maxV) * cW;
          ctx.fillStyle = d.color || '#1D3461';
          ctx.fillRect(PL, y, px(bW), BAR);
          ctx.fillStyle = '#111827'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left';
          ctx.fillText(String(d.value), PL + px(bW) + 5, y + BAR / 2 + 4);
        });
        return b64(canvas);
      };

      const drawPie = (data: { name: string; value: number; color: string }[], title: string): string => {
        const W = 640, H = 360;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0F2041'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText(title, W / 2, 30);
        const tot = data.reduce((s, d) => s + d.value, 0);
        if (tot === 0) return b64(canvas);
        const cx = 210, cy = 200, r = 140;
        let angle = -Math.PI / 2;
        data.forEach(d => {
          const slice = (d.value / tot) * 2 * Math.PI;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, angle + slice); ctx.closePath();
          ctx.fillStyle = d.color; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          const mid = angle + slice / 2, pct = Math.round((d.value / tot) * 100);
          if (pct >= 5) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
            ctx.fillText(`${pct}%`, cx + r * 0.65 * Math.cos(mid), cy + r * 0.65 * Math.sin(mid) + 5);
          }
          angle += slice;
        });
        let ly = 70;
        data.forEach(d => {
          const pct = Math.round((d.value / tot) * 100);
          ctx.fillStyle = d.color; ctx.fillRect(420, ly - 11, 14, 14);
          ctx.fillStyle = '#374151'; ctx.font = '11px Arial'; ctx.textAlign = 'left';
          ctx.fillText(`${d.name}  (${d.value} · ${pct}%)`, 440, ly + 2);
          ly += 28;
        });
        return b64(canvas);
      };

      const drawGroupedBar = (data: { category: string; yes: number; no: number }[], title: string): string => {
        const W = 640, H = 360, PL = 60, PR = 20, PT = 48, PB = 80;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0F2041'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText(title, W / 2, 30);
        const cW = W - PL - PR, cH = H - PT - PB;
        const maxV = Math.max(...data.flatMap(d => [d.yes, d.no]), 1);
        const grpW = cW / data.length, bW = grpW * 0.38;
        for (let i = 0; i <= 4; i++) {
          const y = PT + cH - (cH * i / 4);
          ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
          ctx.fillStyle = '#6B7280'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
          ctx.fillText(String(px(maxV * i / 4)), PL - 5, y + 4);
        }
        data.forEach((d, i) => {
          const gx = PL + grpW * i;
          const bYes = (d.yes / maxV) * cH, bNo = (d.no / maxV) * cH;
          ctx.fillStyle = '#22c55e'; ctx.fillRect(px(gx + 3), px(PT + cH - bYes), px(bW), px(bYes));
          ctx.fillStyle = '#ef4444'; ctx.fillRect(px(gx + bW + 6), px(PT + cH - bNo), px(bW), px(bNo));
          ctx.fillStyle = '#374151'; ctx.font = '9px Arial'; ctx.textAlign = 'center';
          const lbl = d.category.length > 14 ? d.category.slice(0, 13) + '…' : d.category;
          ctx.fillText(lbl, px(gx + grpW / 2), PT + cH + 20);
        });
        // legend
        ctx.fillStyle = '#22c55e'; ctx.fillRect(PL, PT + cH + 38, 12, 12);
        ctx.fillStyle = '#374151'; ctx.font = '11px Arial'; ctx.textAlign = 'left'; ctx.fillText('Yes', PL + 16, PT + cH + 49);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(PL + 60, PT + cH + 38, 12, 12);
        ctx.fillText('No', PL + 76, PT + cH + 49);
        return b64(canvas);
      };

      // Helper to add an image to a worksheet
      const addImg = (ws: any, base64: string, col: number, row: number, w: number, h: number) => {
        const id = wb.addImage({ base64, extension: 'png' });
        ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } });
      };

      // ── Sheet 0 (inserted first): Charts ──────────────────────────────────
      const wsC = wb.addWorksheet('Charts', { properties: { tabColor: { argb: 'FF0F2041' } } });
      wsC.properties.defaultColWidth = 11;
      wsC.properties.defaultRowHeight = 20;

      // Generate all chart images
      const chartByState  = drawHBar(byState.map(s => ({ label: s.state, value: s.count, color: '#1D3461' })), 'Surveys by State');
      const chartTimeline = drawVBar(timeline.map(t => ({ label: t.date, value: t.count, color: '#3b82f6' })), 'Submission Timeline');
      const chartSex      = drawPie(sexData, 'HH Head Sex');
      const chartStatus   = drawPie(statusData.map(d => ({ ...d, color: d.color })), 'HH Head Status');
      const chartHHSize   = drawVBar(hhSizeData.map(d => ({ label: d.size + ' members', value: d.count, color: '#8b5cf6' })), 'Household Size Distribution');
      const chartReceived = drawPie(receivedData, 'Assistance Receipt Status');
      const chartMode     = drawPie(modeData, 'Mode of Digital Cash Delivery');
      const chartSat      = drawVBar(satData.map(d => ({ label: d.label, value: d.count, color: d.color })), 'Satisfaction Rating Distribution');
      const chartChal     = drawHBar(challengeData.slice(0, 8).map(d => ({ label: d.name, value: d.count, color: '#f97316' })), 'Top Challenges Reported');
      const chartUtil     = drawGroupedBar(accessData, 'Utilization Indicators (Yes vs No)');

      // Layout: 2 charts per row, each 640×360px
      // At col-width=11 (~75px), 640px ≈ 8.5 cols → right chart starts at col 9
      // At row-height=20px, 360px = 18 rows → next row starts 20 rows down (18 + 2 gap)
      const charts = [chartByState, chartTimeline, chartSex, chartStatus, chartHHSize, chartReceived, chartMode, chartSat, chartChal, chartUtil];
      charts.forEach((img, i) => {
        const col = (i % 2 === 0) ? 0 : 9;
        const row = Math.floor(i / 2) * 20;
        addImg(wsC, img, col, row, 640, 360);
      });

      // ── Download ─────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PDM_Report_${now.replace(/ /g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Report export error:', err);
      alert('Could not generate report. Please try again.');
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'PACT Command Center Platform - ICT Unit';
      wb.company = 'PACT';
      const ws = wb.addWorksheet('PDM Survey Data');

      const NAVY  = '0F2041';
      const NAVY2 = '1D3461';
      const WHITE = 'FFFFFFFF';

      ws.columns = [
        { key: 'hhid',    width: 16 },
        { key: 'state',   width: 18 },
        { key: 'loc',     width: 20 },
        { key: 'sex',     width: 10 },
        { key: 'status',  width: 20 },
        { key: 'hhtotal', width: 16 },
        { key: 'asst',    width: 22 },
        { key: 'amt',     width: 22 },
        { key: 'sat',     width: 18 },
        { key: 'cfm',     width: 14 },
        { key: 'mkt',     width: 16 },
        { key: 'free',    width: 44 },
        { key: 'intvr',   width: 22 },
      ];

      // Title row
      ws.mergeCells('A1:M1');
      const tc = ws.getCell('A1');
      tc.value = `DCT PDM Survey Data Export — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  |  ${filtered.length} records`;
      tc.font  = { bold: true, size: 12, color: { argb: WHITE } };
      tc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
      tc.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // Generated-by subtitle
      ws.mergeCells('A2:M2');
      const gc = ws.getCell('A2');
      gc.value = 'Generated by PACT Command Center Platform — ICT Unit';
      gc.font  = { italic: true, size: 9, color: { argb: 'FF374151' } };
      gc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      gc.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 16;

      // Header row
      const cols = ['Household ID', 'State', 'Locality', 'Sex', 'HH Head Status', 'HH Total Members',
                    'Assistance Received', 'Amount Received (SDG)', 'Satisfaction (1–5)', 'CFM Aware',
                    'Market Access', 'Free Response', 'Interviewer'];
      const hRow = ws.addRow(cols);
      hRow.height = 20;
      hRow.eachCell(cell => {
        cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY2}` } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border    = { bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } } };
      });

      // Data rows
      filtered.forEach((r, i) => {
        const row = ws.addRow([
          r.hhid ?? '',
          r.state ? (STATE_LABELS[r.state] || r.state) : '',
          r.locality ?? '',
          r.sex === 0 ? 'Female' : 'Male',
          r.hhStatus ? STATUS_LABELS[r.hhStatus] : '',
          r.hhTotal ?? '',
          r.asstReceived === 1 ? 'Yes' : r.asstReceived === 2 ? 'Partial' : 'No',
          r.asstAmtRec ?? '',
          r.satisfaction ?? '',
          r.cfm === 1 ? 'Yes' : 'No',
          r.marketAccess === 1 ? 'Yes' : r.marketAccess === 2 ? 'Partial' : r.marketAccess === 0 ? 'No' : '',
          r.freeResponse ?? '',
          r.interviewer ?? '',
        ]);
        row.height = 16;
        const isOdd = i % 2 === 0;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? 'FFFFFFFF' : 'FFF0F4F8' } };
          cell.font      = { size: 9 };
          cell.alignment = { vertical: 'middle', wrapText: false };
          cell.border    = {
            top:    { style: 'hair', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
            left:   { style: 'hair', color: { argb: 'FFE5E7EB' } },
            right:  { style: 'hair', color: { argb: 'FFE5E7EB' } },
          };
        });
        // Colour-code assistance received
        const asstCell = row.getCell(7);
        if (r.asstReceived === 1) asstCell.font = { size: 9, color: { argb: 'FF059669' } };
        if (r.asstReceived !== 1) asstCell.font = { size: 9, color: { argb: 'FFDC2626' } };
        // Colour-code satisfaction
        const satCell = row.getCell(9);
        if (r.satisfaction != null) {
          satCell.font = { size: 9, color: { argb: r.satisfaction >= 4 ? 'FF059669' : r.satisfaction <= 2 ? 'FFDC2626' : 'FFD97706' } };
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob   = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `PDM_Survey_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please try again.');
    }
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold" style={{ fontSize: 10, fontWeight: 700 }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const pctColor = (pct: number | null): string =>
    pct == null    ? 'text-muted-foreground' :
    pct >= 100     ? 'text-emerald-700 dark:text-emerald-400' :
    pct >= 90      ? 'text-blue-700 dark:text-blue-400'       :
    pct >= 75      ? 'text-amber-700 dark:text-amber-400'     :
    pct >= 50      ? 'text-orange-600 dark:text-orange-400'   :
                     'text-red-600 dark:text-red-400';

  const pctBadge = (pct: number | null) => {
    if (pct == null) return <span className="text-muted-foreground text-[12px]">—</span>;
    const [bg, text] =
      pct >= 100 ? ['bg-emerald-100 dark:bg-emerald-900/40', 'text-emerald-700 dark:text-emerald-300'] :
      pct >= 90  ? ['bg-blue-100 dark:bg-blue-900/40',    'text-blue-700 dark:text-blue-300']    :
      pct >= 75  ? ['bg-amber-100 dark:bg-amber-900/40',  'text-amber-700 dark:text-amber-300']  :
      pct >= 50  ? ['bg-orange-100 dark:bg-orange-900/40','text-orange-700 dark:text-orange-300']:
                   ['bg-red-100 dark:bg-red-900/40',      'text-red-700 dark:text-red-300'];
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${bg} ${text}`}>
        {pct}%
      </span>
    );
  };

  return (
    <div className="p-4 pb-8 space-y-5 max-w-[1400px] mx-auto">
      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onFileInput}
        data-testid="input-pdm-upload"
      />

      {/* ── Header ── */}
      <div
        className={`flex items-start justify-between gap-4 flex-wrap rounded-xl p-3 transition-colors ${dragOver ? 'bg-blue-50 border-2 border-dashed border-blue-400 dark:bg-blue-900/20' : 'bg-transparent'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#0F2041] flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-foreground">2026 DCT PDM Dashboard</h1>
            <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-900/30">
              Digital Cash Transfer
            </Badge>
          </div>
          <div className="flex items-center gap-2 ml-10 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Post-Distribution Monitoring · {records.length} submissions
            </p>
            {dataSource ? (
              <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Upload className="h-2.5 w-2.5" />
                {dataSource.name} · {dataSource.count} records · {dataSource.uploadedAt}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                Built-in dataset (Apr 2026)
              </Badge>
            )}
            {dataSource && !publicMode && (
              <button onClick={resetToDefault} className="text-[10px] text-muted-foreground hover:text-foreground underline">
                reset to default
              </button>
            )}
          </div>
          {dragOver && (
            <p className="text-xs font-semibold text-blue-600 mt-1 ml-10 animate-pulse">
              Drop your Excel export here…
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasFilter && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={() => { setStateFilter('all'); setSexFilter('all'); setRcvFilter('all'); }}>
              <X className="h-3.5 w-3.5" />Clear filters
            </Button>
          )}
          {canUpload && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="button-upload-pdm"
            >
              {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Processing…' : 'Upload New Data'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />Export Data
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={handleExportReport} data-testid="button-export-report">
            <FileSpreadsheet className="h-3.5 w-3.5" />Export Report
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-muted/40 border">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground mr-1">Filter:</span>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="h-8 w-auto text-xs gap-1.5 min-w-[130px]" data-testid="filter-state">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All States</SelectItem>
            {Object.entries(STATE_LABELS).filter(([k]) => records.some(r => r.state === k)).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sexFilter} onValueChange={setSexFilter}>
          <SelectTrigger className="h-8 w-auto text-xs gap-1.5 min-w-[110px]" data-testid="filter-sex">
            <Users className="h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="All HH Head" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All — HH Head Sex</SelectItem>
            <SelectItem value="0" className="text-xs">Female headed</SelectItem>
            <SelectItem value="1" className="text-xs">Male headed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={rcvFilter} onValueChange={setRcvFilter}>
          <SelectTrigger className="h-8 w-auto text-xs gap-1.5 min-w-[140px]" data-testid="filter-received">
            <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="All Receipts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All — Assistance</SelectItem>
            <SelectItem value="1" className="text-xs">Fully Received</SelectItem>
            <SelectItem value="2" className="text-xs">Partial / Other</SelectItem>
            <SelectItem value="3" className="text-xs">Not Received</SelectItem>
          </SelectContent>
        </Select>
        <Select value={collectorFilter} onValueChange={setCollectorFilter}>
          <SelectTrigger className="h-8 w-auto text-xs gap-1.5 min-w-[160px]" data-testid="filter-collector">
            <Users className="h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="All Data Collectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All — Data Collectors</SelectItem>
            {collectorOptions.map(name => (
              <SelectItem key={name} value={name} className="text-xs" dir="auto">{name}</SelectItem>
            ))}
            <SelectItem value="__unassigned__" className="text-xs text-muted-foreground">— Unassigned (no name)</SelectItem>
          </SelectContent>
        </Select>
        {hasFilter && (
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {total} / {records.length} records
          </Badge>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Surveys"  value={fmt(total)} sub={`${states.length} states`} icon={FileSpreadsheet} accent="bg-[#1D3461]" />
        <KpiCard label="Received Aid"   value={`${receivedPct}%`} sub={`${filtered.filter(r => r.asstReceived === 1).length} HHs`} icon={CheckCircle2} accent="bg-emerald-600" trend={{ val: receivedPct >= 80 ? '✓ On target' : '↓ Below target', good: receivedPct >= 80 }} />
        <KpiCard label="Satisfaction"   value={`${satPct}%`} sub={`Avg: ${avgSat.toFixed(1)} / 5`} icon={ThumbsUp} accent="bg-blue-600" trend={{ val: satPct >= 75 ? '✓ Good' : '↓ Needs attention', good: satPct >= 75 }} />
        <KpiCard label="CFM Awareness"  value={`${cfmPct}%`} sub="Know complaint channel" icon={Phone} accent="bg-amber-500" trend={{ val: cfmPct < 30 ? '⚠ Very low' : '✓ OK', good: cfmPct >= 30 }} />
        <KpiCard label="Avg HH Size"    value={avgHHSize.toFixed(1)} sub="members / household" icon={Users} accent="bg-purple-600" />
        <KpiCard label="Market Access"  value={`${PCT(filtered.filter(r => r.marketAccess === 1).length, total)}%`} sub="Can access market" icon={ShoppingCart} accent="bg-teal-600" />
      </div>

      {/* ── PDM Progress by Locality ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <MapPin className="h-4 w-4 text-[#1D3461]" />
                <h3 className="text-sm font-bold text-foreground">PDM Progress by State</h3>
                <Badge variant="outline" className="text-[10px]">{localityRows.filter(r => r.locality || r.planned).length} localities · {groupedRows.filter(g => g.rows.some(r => r.locality || r.planned)).length} states</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isEditMode
                  ? 'Edit mode — click any cell to update values, then click Done when finished'
                  : 'Read-only view · click Edit Table to make changes, or upload a file to update planned counts'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(canUpload || canEditNotes) && (
                <Button
                  variant={isEditMode ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 text-xs gap-1.5 ${isEditMode ? 'bg-[#1D3461] hover:bg-[#0F2041] text-white' : ''}`}
                  onClick={() => setIsEditMode(v => !v)}
                  data-testid="button-toggle-edit-mode"
                >
                  {isEditMode ? <><Check className="h-3.5 w-3.5" />Done</> : <><Pencil className="h-3.5 w-3.5" />Edit Table</>}
                </Button>
              )}
              {canUpload && (
                <>
                  <input
                    ref={importProgressRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportProgress}
                    data-testid="input-import-progress"
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => importProgressRef.current?.click()} data-testid="button-import-progress" title="Upload the DCT Sample Excel file to auto-populate Planned counts (green/PRINCIPAL rows only)">
                    <Upload className="h-3.5 w-3.5" />Upload DCT Sample
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={handleDownloadTemplate} data-testid="button-download-template">
                    <FileDown className="h-3.5 w-3.5" />Get Template
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExportProgress} data-testid="button-export-progress">
                <Download className="h-3.5 w-3.5" />Export to Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#0F2041] text-white">
                  <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">State</th>
                  <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">Locality</th>
                  <th className="text-center px-4 py-2.5 font-semibold">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>Planned for PDM</span>
                      <div className="flex items-center gap-1 text-[9px] font-normal opacity-80">
                        <span className="bg-green-500 rounded-full px-1.5 py-0 text-white">● confirmed</span>
                      </div>
                    </div>
                  </th>
                  <th className="text-center px-4 py-2.5 font-semibold whitespace-nowrap">Reached (up to date)</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Deviation</th>
                  <th className="text-center px-4 py-2.5 font-semibold whitespace-nowrap">% Reached</th>
                  <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">Reason for Deviation</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Remarks</th>
                  {canUpload && isEditMode && <th className="px-2 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {groupedRows.filter(g => g.rows.some(r => r.locality || r.planned)).map((group, gi) => {
                  const hasRows = group.rows.length > 0;
                  const showSubtotal = group.rows.length >= 1;
                  const addRowSpan = canUpload && isEditMode ? 1 : 0;
                  const subtotalSpan = showSubtotal ? 1 : 0;
                  const stateRowSpan = hasRows ? group.rows.length + addRowSpan + subtotalSpan : 1;
                  const rowBg = gi % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20';
                  const extraCols = canUpload && isEditMode ? 8 : 7;

                  if (!hasRows) {
                    return (
                      <tr key={group.code} className={`border-b ${rowBg}`}>
                        <td className="px-4 py-2.5 font-bold text-[#1D3461] whitespace-nowrap text-[13px] border-r border-border/30">{group.name}</td>
                        <td colSpan={extraCols} className="px-4 py-2 text-center">
                          {canUpload && isEditMode ? (
                            <button
                              onClick={() => addLocalityRow(group.code)}
                              className="text-[11px] text-[#1D3461]/50 hover:text-[#1D3461] flex items-center gap-1 mx-auto"
                              data-testid={`btn-add-locality-${group.code}`}
                            >
                              <Plus className="h-3 w-3" />Add locality
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">No localities defined</span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <Fragment key={group.code}>
                      {group.rows.map((row, ri) => {
                        const rowReached = localityReached[row.id] ?? 0;
                        const planned    = row.planned ? Number(row.planned) : null;
                        const dev        = planned != null ? rowReached - planned : null;
                        const devPct     = planned ? Math.round((rowReached / planned) * 100) : null;
                        const isFirst    = ri === 0;

                        // Left-border colour = progress traffic light
                        const rowBorder =
                          devPct == null   ? 'border-l-4 border-l-slate-200 dark:border-l-slate-700' :
                          devPct >= 100    ? 'border-l-4 border-l-emerald-500' :
                          devPct >= 90     ? 'border-l-4 border-l-blue-400'    :
                          devPct >= 75     ? 'border-l-4 border-l-amber-400'   :
                          devPct >= 50     ? 'border-l-4 border-l-orange-400'  :
                          devPct > 0       ? 'border-l-4 border-l-red-400'     :
                                             'border-l-4 border-l-red-300';

                        return (
                          <tr key={row.id} className={`border-b ${rowBg} ${rowBorder}`}>
                            {isFirst && (
                              <td
                                rowSpan={stateRowSpan}
                                className="px-4 py-2.5 font-bold text-black dark:text-foreground whitespace-nowrap text-[13px] border-r border-border/30 align-top"
                              >
                                {group.name}
                              </td>
                            )}

                            {/* Locality */}
                            <td className="px-4 py-2">
                              {canUpload && isEditMode ? (
                                <input
                                  type="text"
                                  className="w-full min-w-[140px] text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                                  value={row.locality}
                                  placeholder="Enter locality…"
                                  onChange={e => updateLocalityRow(row.id, 'locality', e.target.value)}
                                  data-testid={`input-locality-${row.id}`}
                                />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {planned != null && (
                                    <span
                                      title="PRINCIPAL (green) sample target"
                                      className="flex-shrink-0 h-2 w-2 rounded-full bg-emerald-500"
                                    />
                                  )}
                                  <span className="font-bold text-black dark:text-foreground">{row.locality || '—'}</span>
                                </div>
                              )}
                            </td>

                            {/* Planned — green tint = PRINCIPAL sample rows */}
                            <td className={`px-4 py-2 text-center ${planned ? 'bg-emerald-50/70 dark:bg-emerald-900/10' : ''}`}>
                              {canUpload && isEditMode ? (
                                <input
                                  type="number"
                                  min={0}
                                  className="w-20 text-center text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                                  value={row.planned}
                                  placeholder="—"
                                  onChange={e => updateLocalityRow(row.id, 'planned', e.target.value)}
                                  data-testid={`input-planned-${row.id}`}
                                />
                              ) : (
                                <span className="font-semibold">{planned ?? '—'}</span>
                              )}
                            </td>

                            {/* Reached — per-locality count from survey sub-code mapping */}
                            <td className="px-4 py-2 text-center">
                              <span className={`font-bold ${pctColor(devPct)}`}>
                                {rowReached > 0 ? rowReached : <span className="text-muted-foreground font-normal">0</span>}
                              </span>
                            </td>

                            {/* Deviation */}
                            <td className="px-4 py-2 text-center">
                              {dev == null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="font-bold">{dev > 0 ? `+${dev}` : dev}</span>
                              )}
                            </td>

                            {/* % Reached */}
                            <td className="px-4 py-2 text-center">{pctBadge(devPct)}</td>

                            {/* Reason for Deviation — merged cell per state, only in first row */}
                            {isFirst && (
                              <td
                                rowSpan={group.rows.length + subtotalSpan}
                                className="px-4 py-2 align-top border-l border-border/20"
                              >
                                {canEditNotes && isEditMode ? (
                                  <textarea
                                    className="w-full min-w-[200px] text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461] resize-y"
                                    rows={Math.max(3, group.rows.length * 2)}
                                    value={stateDeviations[group.code] || ''}
                                    placeholder="Enter reason for deviation (applies to whole state)…"
                                    onChange={e => updateStateDeviation(group.code, e.target.value)}
                                    data-testid={`textarea-deviation-${group.code}`}
                                  />
                                ) : (
                                  (() => {
                                    const raw = stateDeviations[group.code] || '';
                                    if (!raw.trim()) return <span className="text-[13px] font-bold text-foreground">—</span>;
                                    const points = raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
                                    if (points.length <= 1) {
                                      return <span className="text-[13px] font-bold text-foreground whitespace-pre-wrap leading-relaxed">{raw}</span>;
                                    }
                                    return (
                                      <ul className="list-disc list-outside pl-4 space-y-1">
                                        {points.map((pt, i) => (
                                          <li key={i} className="text-[12px] font-bold text-foreground leading-snug">{pt}</li>
                                        ))}
                                      </ul>
                                    );
                                  })()
                                )}
                              </td>
                            )}

                            {/* Remarks — merged per state, only in first row */}
                            {isFirst && (
                              <td
                                rowSpan={group.rows.length + subtotalSpan}
                                className="px-4 py-2 align-top border-l border-border/20"
                              >
                                {canEditNotes && isEditMode ? (
                                  <textarea
                                    className="w-full min-w-[140px] text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461] resize-y"
                                    rows={Math.max(3, group.rows.length * 2)}
                                    value={stateRemarks[group.code] || ''}
                                    placeholder="Add remarks…"
                                    onChange={e => updateStateRemarks(group.code, e.target.value)}
                                    data-testid={`textarea-remarks-${group.code}`}
                                  />
                                ) : (
                                  <span className="text-[13px] font-bold text-foreground whitespace-pre-wrap leading-relaxed">
                                    {stateRemarks[group.code] || '—'}
                                  </span>
                                )}
                              </td>
                            )}

                            {/* Delete row — edit mode only */}
                            {canUpload && isEditMode && (
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => removeLocalityRow(row.id)}
                                  className="text-red-400 hover:text-red-600 text-base leading-none font-bold"
                                  title="Remove locality row"
                                  data-testid={`btn-remove-locality-${row.id}`}
                                >×</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}

                      {/* State subtotal row — only when multiple localities */}
                      {showSubtotal && (() => {
                        const subPlanned = group.rows.reduce((s, r) => s + (r.planned ? Number(r.planned) : 0), 0);
                        const subReached = group.reached;
                        const subDev     = subPlanned > 0 ? subReached - subPlanned : null;
                        const subPct     = subPlanned > 0 ? Math.round((subReached / subPlanned) * 100) : null;
                        return (
                          <tr className="border-b border-[#1D3461]/15 bg-[#0F2041]/[0.04] dark:bg-[#1D3461]/10">
                            <td className="px-4 py-1.5 text-[11px] font-semibold text-[#1D3461]/70 italic whitespace-nowrap">
                              State Subtotal
                            </td>
                            <td className="px-4 py-1.5 text-center text-[12px] font-bold text-[#1D3461]">
                              {subPlanned || '—'}
                            </td>
                            <td className="px-4 py-1.5 text-center">
                              <span className={`font-bold text-[12px] ${pctColor(subPct)}`}>{subReached}</span>
                            </td>
                            <td className="px-4 py-1.5 text-center">
                              {subDev == null ? (
                                <span className="text-muted-foreground text-[12px]">—</span>
                              ) : (
                                <span className="font-bold text-[12px]">{subDev > 0 ? `+${subDev}` : subDev}</span>
                              )}
                            </td>
                            {/* % Reached */}
                            <td className="px-4 py-1.5 text-center">{pctBadge(subPct)}</td>
                            {/* reason + remarks both covered by rowspan from first locality row */}
                            {canUpload && isEditMode && <td className="px-2 py-1.5" />}
                          </tr>
                        );
                      })()}

                      {/* Add-locality button row (edit mode only) */}
                      {canUpload && isEditMode && (
                        <tr className={`border-b ${rowBg}`}>
                          <td colSpan={extraCols} className="px-4 py-1">
                            <button
                              onClick={() => addLocalityRow(group.code)}
                              className="text-[11px] text-[#1D3461]/50 hover:text-[#1D3461] flex items-center gap-1"
                              data-testid={`btn-add-locality-${group.code}`}
                            >
                              <Plus className="h-3 w-3" />Add locality
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  // Planned: PRINCIPAL localities only
                  const totalPlanned = groupedRows.reduce((s, g) => s + g.rows.reduce((rs, r) => rs + (r.planned ? Number(r.planned) : 0), 0), 0);
                  // Reached: ALL surveys completed (matches the card badges above the table)
                  const totalReached = records.length;
                  const dev = totalPlanned > 0 ? totalReached - totalPlanned : null;
                  const totalPct = totalPlanned > 0 ? Math.round((totalReached / totalPlanned) * 100) : null;
                  return (
                    <tr className="bg-muted/50 border-t-2 border-border font-bold">
                      <td className="px-4 py-2.5 text-[11px] font-bold">TOTAL</td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5 text-center text-[12px]">{totalPlanned || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-[12px]">
                        <span className={`font-bold ${pctColor(totalPct)}`}>{totalReached}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-[12px]">
                        {dev != null
                          ? <span className="font-bold">{dev > 0 ? `+${dev}` : dev}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">{pctBadge(totalPct)}</td>
                      <td colSpan={canUpload && isEditMode ? 3 : 2} />
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Coverage Over Time ── */}
      {coverageOverTime.data.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle
              title="Coverage Over Time"
              sub={`Weekly cumulative HHs vs. target ${TICKER_TOTAL_PLANNED.toLocaleString()} — source: ${coverageOverTime.source === 'site_visits' ? 'site visits (PDM type)' : 'uploaded PDM survey data'}`}
              count={records.length}
            />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={coverageOverTime.data} margin={{ left: 0, right: 16, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} label={{ value: 'Week starting (MM-DD)', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: any, name: string) =>
                    name === 'Coverage %' ? [`${value}%`, 'Coverage %'] :
                    name === 'This Week' ? [value.toLocaleString(), 'This Week'] :
                    name === 'Linear Target' ? [value.toLocaleString(), 'Linear Target (HHs)'] :
                    [value.toLocaleString(), name]}
                />
                <ReferenceLine yAxisId="left" y={TICKER_TOTAL_PLANNED} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'Total Target', position: 'insideTopRight', fontSize: 9, fill: '#64748b' }} />
                <Line yAxisId="left" type="linear" dataKey="weeklyTarget" name="Linear Target" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                <Line yAxisId="left" type="monotone" dataKey="cumulative" name="Actual HHs" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="pct" name="Coverage %" stroke="#1D3461" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Row 1: Geographic + Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Surveys by State" sub="Number of PDM interviews completed" count={total} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byState} layout="vertical" margin={{ left: 8, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Surveys" radius={[0, 4, 4, 0]}>
                  {byState.map((_, i) => <Cell key={i} fill={STATE_COLORS[i % STATE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Submission Timeline" sub="Daily survey submissions" count={total} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="timeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D3461" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1D3461" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Surveys" stroke="#1D3461" fill="url(#timeGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Demographics ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="HH Head Sex" sub="Gender of household head" count={sexData.reduce((a, b) => a + b.value, 0)} />
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={sexData} cx="50%" cy="50%" outerRadius={65} dataKey="value" labelLine={false} label={renderCustomLabel}>
                  {sexData.map((s, i) => <Cell key={i} fill={SEX_COLORS[i]} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Residence Status" sub="IDP / Refugee / Host" count={statusData.reduce((a, b) => a + b.value, 0)} />
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={65} dataKey="value" labelLine={false} label={renderCustomLabel}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Household Size" sub="Distribution of members per HH" count={hhSizeData.reduce((a, b) => a + b.count, 0)} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hhSizeData} margin={{ left: -10, right: 5, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="size" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="HHs" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Assistance ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Assistance Receipt" sub="Did household receive WFP transfer?" count={receivedData.reduce((a, b) => a + b.value, 0)} />
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={receivedData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" labelLine={false} label={renderCustomLabel}>
                  {receivedData.map((d, i) => <Cell key={i} fill={RECEIPT_COLORS[i]} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Avg Amount by State" sub="Received vs Expected (SDG)" count={amountByState.reduce((a, b) => a + b.n, 0)} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={amountByState} margin={{ left: -10, right: 5, top: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="state" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={fmtK} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} formatter={(v) => <span className="text-[10px]">{v}</span>} />
                <Bar dataKey="avgReceived" name="Received" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="avgExpected" name="Expected" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Payment Mode Used" sub="How transfer was accessed" count={modeData.reduce((a, b) => a + b.value, 0)} />
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={modeData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" labelLine={false} label={renderCustomLabel}>
                  {modeData.map((d, i) => <Cell key={i} fill={MODE_COLORS[i]} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Utilization ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Access & Utilization" sub="Key utilization indicators (Yes vs No)" count={total} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={accessData} layout="vertical" margin={{ left: 12, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} formatter={(v) => <span className="text-[10px]">{v}</span>} />
                <Bar dataKey="yes" name="Yes" fill="#22c55e" radius={[0, 3, 3, 0]} stackId="a" />
                <Bar dataKey="no"  name="No"  fill="#ef4444" radius={[0, 3, 3, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Challenges Faced" sub={`${filtered.filter(r => r.expChallenge === 1).length} HHs reported challenges`} count={total} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {challengeData.length === 0 ? (
              <div className="flex items-center justify-center h-[190px] text-sm text-muted-foreground">No challenges reported</div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={challengeData.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 30, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="HHs" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <SectionTitle title="Food Expenditure %" sub="Proportion of transfer spent on food" count={foodPropData.reduce((a, b) => a + b.count, 0)} />
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={foodPropData} margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="HHs" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: Satisfaction + CFM + Sharing ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <SectionTitle title="Satisfaction with WFP Assistance" sub={`${satPct}% satisfied or very satisfied (scores 4–5)`} count={satData.reduce((a, b) => a + b.count, 0)} />
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            {satData.map(s => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="text-[11px] w-36 font-medium text-muted-foreground shrink-0">{s.label}</span>
                <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                    style={{ width: `${Math.max(s.pct, 3)}%`, backgroundColor: s.color }}>
                    {s.pct > 5 && <span className="text-[10px] font-bold text-white">{s.pct}%</span>}
                  </div>
                </div>
                <span className="text-[11px] font-bold w-10 text-right">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionTitle title="CFM Awareness" sub="Knows WFP complaint channel" count={filtered.filter(r => r.cfm !== null).length} />
            </CardHeader>
            <CardContent className="pb-4">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={[
                    { name: 'Aware', value: filtered.filter(r => r.cfm === 1).length, color: '#22c55e' },
                    { name: 'Unaware', value: filtered.filter(r => r.cfm === 0).length, color: '#e2e8f0' },
                  ]} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" labelLine={false} label={renderCustomLabel}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                  <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-[11px] text-amber-600 font-semibold mt-1">
                ⚠ {100 - cfmPct}% unaware of CFM
              </p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionTitle title="Transfer Sharing" sub="Shared entitlement outside HH" count={filtered.filter(r => r.sharing !== null).length} />
            </CardHeader>
            <CardContent className="pb-4">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={[
                    { name: 'Did Not Share', value: filtered.filter(r => r.sharing === 0).length, color: '#1D3461' },
                    { name: 'Shared',         value: filtered.filter(r => r.sharing === 1).length, color: '#f97316' },
                  ]} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" labelLine={false} label={renderCustomLabel}>
                    <Cell fill="#1D3461" />
                    <Cell fill="#f97316" />
                  </Pie>
                  <Legend iconSize={10} iconType="circle" formatter={(v) => <span className="text-[11px]">{v}</span>} />
                  <Tooltip formatter={(v) => [`${v} (${PCT(Number(v), total)}%)`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Row 6: Interviewers Table ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle title="Data Collectors" sub="Surveys submitted per data collector" count={interviewerData.length} />
            {interviewerData.length > 10 && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0"
                onClick={() => setShowAllInterviewers(v => !v)}>
                {showAllInterviewers
                  ? <><ChevronUp className="h-3.5 w-3.5" />Show Top 10</>
                  : <><ChevronDown className="h-3.5 w-3.5" />Show All {interviewerData.length}</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(showAllInterviewers ? interviewerData : interviewerData.slice(0, 10)).map((d, i) => (
              <div key={i} className={`flex items-center gap-3 py-1.5 ${d.unassigned ? 'opacity-60' : ''}`}>
                <span className="text-[10px] font-bold text-muted-foreground w-5 text-right">
                  {d.unassigned ? '–' : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs truncate ${d.unassigned ? 'italic text-muted-foreground' : 'font-medium'}`}>{d.name}</span>
                    <span className={`text-[11px] font-bold ml-2 shrink-0 ${d.unassigned ? 'text-muted-foreground' : 'text-[#1D3461]'}`}>{d.count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className={`h-full rounded-full ${d.unassigned ? 'bg-muted-foreground/40' : 'bg-[#1D3461]'}`}
                      style={{ width: `${PCT(d.count, interviewerData.filter(x => !x.unassigned)[0]?.count || 1)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!showAllInterviewers && interviewerData.length > 10 && (
            <p className="text-center text-[11px] text-muted-foreground mt-3">
              Showing top 10 of {interviewerData.length} collectors —{' '}
              <button className="text-[#1D3461] font-semibold underline underline-offset-2"
                onClick={() => setShowAllInterviewers(true)}>
                show all
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Row 7: Beneficiary Feedback & Field Reports ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-0 pt-4 px-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <MessageSquare className="h-4 w-4 text-[#1D3461]" />
                <h3 className="text-sm font-bold text-foreground">Beneficiary Feedback & Field Reports</h3>
              </div>
              <p className="text-[11px] text-muted-foreground">Open-ended responses and compliance issues from Section 6.3</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  <span className="text-muted-foreground">Total responses:</span>
                  <span className="font-bold">{feedbackStats.total}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-muted-foreground">Substantive:</span>
                  <span className="font-bold">{feedbackStats.substantive}</span>
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-muted-foreground">Concerns:</span>
                  <span className="font-bold text-amber-600">{feedbackStats.concerns}</span>
                </span>
              </div>
              <Select value={feedbackFilter} onValueChange={v => { setFeedbackFilter(v); setFeedbackPage(0); }}>
                <SelectTrigger className="h-7 text-[11px] w-36" data-testid="select-feedback-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All responses</SelectItem>
                  <SelectItem value="substantive">Substantive only</SelectItem>
                  <SelectItem value="concerns">Issues & Concerns</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setFeedbackExpanded(v => !v)}
                className="flex items-center gap-1 text-[11px] text-[#1D3461] font-semibold hover:underline"
                data-testid="button-feedback-expand"
              >
                {feedbackExpanded ? <><ChevronUp className="h-3.5 w-3.5" />Collapse</> : <><ChevronDown className="h-3.5 w-3.5" />Expand</>}
              </button>
            </div>
          </div>
        </CardHeader>

        {feedbackExpanded && (
          <CardContent className="px-5 pb-4 mt-3">
            {feedbackFiltered.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                No responses found for the selected filter.
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-28">State</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-36">Data Collector</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Beneficiary Comment</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-24 text-center">Satisfaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedbackPagedData.map((fb, i) => (
                        <tr key={fb.id ?? i} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-[#1D3461]">{fb.state}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]" dir="rtl">{fb.interviewer}</td>
                          <td className="px-3 py-2" dir="rtl" style={{ textAlign: 'right', fontFamily: 'sans-serif', lineHeight: '1.6' }}>
                            {fb.text}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {fb.satisfaction ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                fb.satisfaction >= 4 ? 'bg-emerald-100 text-emerald-700' :
                                fb.satisfaction === 3 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {SATISFACTION_CFG.find(s => s.key === fb.satisfaction)?.label ?? fb.satisfaction}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {feedbackFiltered.length > FEEDBACK_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[11px] text-muted-foreground">
                      Showing {feedbackPage * FEEDBACK_PAGE_SIZE + 1}–{Math.min((feedbackPage + 1) * FEEDBACK_PAGE_SIZE, feedbackFiltered.length)} of {feedbackFiltered.length}
                    </span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFeedbackPage(p => Math.max(0, p - 1))} disabled={feedbackPage === 0}>
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFeedbackPage(p => p + 1)} disabled={(feedbackPage + 1) * FEEDBACK_PAGE_SIZE >= feedbackFiltered.length}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}

        {!feedbackExpanded && (
          <CardContent className="px-5 py-3">
            <div className="flex gap-4 flex-wrap">
              {allFeedback.filter(f => !f.trivial).slice(0, 3).map((fb, i) => (
                <div key={i} className="flex-1 min-w-[200px] bg-muted/30 rounded-lg p-3 border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-[#1D3461]">{fb.state}</span>
                    {fb.satisfaction && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${fb.satisfaction >= 4 ? 'bg-emerald-100 text-emerald-700' : fb.satisfaction === 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                        {fb.satisfaction}/5
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-foreground leading-relaxed line-clamp-2" dir="rtl" style={{ textAlign: 'right' }}>{fb.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5" dir="rtl">{fb.interviewer}</p>
                </div>
              ))}
              <div className="flex items-center justify-center min-w-[120px] text-[11px] text-muted-foreground">
                +{Math.max(0, feedbackStats.substantive - 3)} more → click Expand
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Footer note ── */}
      <div className="text-center pb-4 space-y-1">
        <p className="text-[10px] text-muted-foreground">
          Data source: {dataSource ? dataSource.name : '2026 DCT PDM Survey'} · {records.length} records · Generated {new Date().toLocaleDateString()}
        </p>
        <p className="text-[11px] font-semibold text-[#1D3461]">
          © {new Date().getFullYear()} PACT — All rights reserved.
        </p>
      </div>

      {/* ── Heartbeat Ticker — internal staff view only ── */}
      {!publicMode && <PDMHeartbeatTicker dataSource={dataSource} records={records} />}
    </div>
  );
}
