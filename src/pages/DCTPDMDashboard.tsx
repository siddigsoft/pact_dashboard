import { useState, useMemo, useRef, useCallback } from 'react';
import rawData from '@/data/pdm_data.json';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart,
} from 'recharts';
import {
  Users, MapPin, CheckCircle2, TrendingUp,
  Download, Filter, BarChart3, ShoppingCart,
  Phone, ThumbsUp, X, FileSpreadsheet, Upload, FileDown, RefreshCw,
  MessageSquare, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/context/AppContext';

// ── Types & Config ──────────────────────────────────────────────────────────

interface PDMRecord {
  id: number | null;
  date: number | string | null;
  state: string | null;
  locality: string | null;
  location: string | null;
  interviewer: string | null;
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

function processWorkbook(wb: any, XLSXLib: any): PDMRecord[] {
  const sheetName = (wb.SheetNames as string[]).find((n: string) => n.toLowerCase() === 'data') || wb.SheetNames[0];
  const rows = XLSXLib.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null }) as any[][];
  if (rows.length < 3) return [];
  const headers: string[] = rows[0] as string[];
  const idx = (col: string) => headers.indexOf(col);
  const chalNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 999];
  return (rows.slice(2) as any[][]).map((row) => ({
    id:             toNum(row[idx('_id')]),
    date:           row[idx('general_info/a_date')],
    state:          toStr(row[idx('general_info/a_state')]),
    locality:       toStr(row[idx('general_info/locality')]),
    location:       toStr(row[idx('general_info/location')]),
    interviewer:    toStr(row[idx('identification/a_interviewer')]),
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

export default function DCTPDMDashboard({ publicMode = false }: { publicMode?: boolean } = {}) {
  const { currentUserRole } = useAppContext();
  const canUpload = !publicMode && ['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin'].includes(currentUserRole ?? '');

  const [records, setRecords]       = useState<PDMRecord[]>(STATIC_DATA);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stateFilter, setStateFilter] = useState('all');
  const [sexFilter,   setSexFilter]   = useState('all');
  const [rcvFilter,   setRcvFilter]   = useState('all');

  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [feedbackPage, setFeedbackPage]     = useState(0);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const FEEDBACK_PAGE_SIZE = 10;

  interface LocalityTarget { planned: string; deviation: string; remarks: string; }

  // State-level planned counts from WFP DCT sample file (green=confirmed, yellow=backup)
  // SD01=Khartoum (KRT Bahri+ShargAnNeel), SD09=WhiteNile (Rabak+Kosti+UmRimta),
  // SD16=RiverNile (Shendi), SD17=Northern (Al Golid)
  const SAMPLE_PLANNED: Record<string, string> = {
    SD01: '250', // Khartoum     — 250 confirmed HHs
    SD09: '250', // White Nile   — 250 confirmed HHs
    SD16: '150', // River Nile   — 150 confirmed HHs
    SD17: '150', // Northern     — 150 confirmed HHs
  };
  const SAMPLE_BACKUP: Record<string, number> = {
    SD01: 40, SD09: 50, SD16: 20, SD17: 20,
  };

  const SEED_VER = 'v4-state-level';
  const [localityTargets, setLocalityTargets] = useState<Record<string, LocalityTarget>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pact-pdm-locality-targets') || '{}');
      const seeded = localStorage.getItem('pact-pdm-locality-seed-ver');
      if (seeded !== SEED_VER) {
        const fresh: Record<string, LocalityTarget> = {};
        Object.entries(SAMPLE_PLANNED).forEach(([code, planned]) => {
          fresh[code] = { planned, deviation: stored[code]?.deviation || '', remarks: stored[code]?.remarks || '' };
        });
        localStorage.setItem('pact-pdm-locality-seed-ver', SEED_VER);
        localStorage.setItem('pact-pdm-locality-targets', JSON.stringify(fresh));
        return fresh;
      }
      Object.entries(SAMPLE_PLANNED).forEach(([code, planned]) => {
        if (!stored[code]) stored[code] = { planned, deviation: '', remarks: '' };
      });
      return stored;
    } catch { return Object.fromEntries(Object.entries(SAMPLE_PLANNED).map(([k, v]) => [k, { planned: v, deviation: '', remarks: '' }])); }
  });
  const updateTarget = (code: string, field: keyof LocalityTarget, val: string) => {
    setLocalityTargets(prev => {
      const next = { ...prev, [code]: { planned: '', deviation: '', remarks: '', ...prev[code], [field]: val } };
      try { localStorage.setItem('pact-pdm-locality-targets', JSON.stringify(next)); } catch {}
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
      setRecords(parsed);
      setDataSource({ name: file.name, uploadedAt: new Date().toLocaleString(), count: parsed.length });
      setStateFilter('all'); setSexFilter('all'); setRcvFilter('all');
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

  const resetToDefault = () => {
    setRecords(STATIC_DATA); setDataSource(null);
    setStateFilter('all'); setSexFilter('all'); setRcvFilter('all');
  };

  const filtered = useMemo(() => records.filter(r => {
    if (stateFilter !== 'all' && r.state !== stateFilter) return false;
    if (sexFilter   !== 'all' && String(r.sex)   !== sexFilter)   return false;
    if (rcvFilter   !== 'all' && String(r.asstReceived) !== rcvFilter) return false;
    return true;
  }), [records, stateFilter, sexFilter, rcvFilter]);

  const total = filtered.length;
  const hasFilter = stateFilter !== 'all' || sexFilter !== 'all' || rcvFilter !== 'all';

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
    const m: Record<string, number> = {};
    filtered.forEach(r => { if (r.interviewer) m[r.interviewer] = (m[r.interviewer] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
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

  const handleImportProgress = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSXLib = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wbImp = XLSXLib.read(buf, { type: 'array' });
      const ws = wbImp.Sheets[wbImp.SheetNames[0]];
      const rows: Record<string, string>[] = XLSXLib.utils.sheet_to_json(ws, { defval: '' });
      const updated: Record<string, LocalityTarget> = { ...localityTargets };
      let matched = 0;
      rows.forEach(row => {
        const getCol = (...candidates: string[]) => {
          for (const c of candidates) {
            const k = Object.keys(row).find(k2 => k2.toLowerCase().includes(c));
            if (k) return String(row[k]).trim();
          }
          return '';
        };
        const stateRaw = getCol('state', 'ولاية');
        const planned  = getCol('planned', 'مخطط', 'target', 'confirmed');
        const deviation = getCol('reason', 'deviation', 'سبب', 'انحراف');
        const remarks  = getCol('remark', 'ملاحظ', 'note', 'comment');
        if (!stateRaw) return;
        const code = localityProgressData.find(r => r.name.toLowerCase() === stateRaw.toLowerCase())?.code
          || Object.entries(STATE_LABELS).find(([, v]) => v.toLowerCase() === stateRaw.toLowerCase())?.[0];
        if (!code) return;
        updated[code] = {
          planned: planned || updated[code]?.planned || '',
          deviation: deviation || updated[code]?.deviation || '',
          remarks: remarks || updated[code]?.remarks || '',
        };
        matched++;
      });
      setLocalityTargets(updated);
      try { localStorage.setItem('pact-pdm-locality-targets', JSON.stringify(updated)); } catch {}
      alert(`Imported data for ${matched} state(s) successfully.`);
    } catch {
      alert('Could not read the file. Please use the Excel template format.');
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSXLib = await import('xlsx');
    const rows = localityProgressData.map(r => ({
      'State': r.name,
      'Planned Number for PDM (Confirmed)': localityTargets[r.code]?.planned || '',
      'Reason for Deviation': '',
      'Remarks': '',
    }));
    const ws = XLSXLib.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 34 }, { wch: 30 }];
    const wbOut = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wbOut, ws, 'PDM State Targets');
    XLSXLib.writeFile(wbOut, 'pdm_state_template.xlsx');
  };

  const handleExportProgress = async () => {
    const XLSXLib = await import('xlsx');
    const rows = localityProgressData.map(r => {
      const t = localityTargets[r.code];
      const planned = t?.planned ? Number(t.planned) : null;
      const backup = SAMPLE_BACKUP[r.code] ?? 0;
      const dev = planned != null ? r.reached - planned : null;
      return {
        'State': r.name,
        'Planned Number for PDM (Confirmed)': planned ?? '',
        'Backup Sample': backup || '',
        'Number Reached by PDM (up to date)': r.reached,
        'Deviation': dev != null ? dev : '',
        'Reason for Deviation (if any)': t?.deviation || '',
        'Remarks': t?.remarks || '',
      };
    });
    const ws = XLSXLib.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 34 }, { wch: 30 }];
    const wb = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb, ws, 'PDM Progress');
    XLSXLib.writeFile(wb, 'pdm_progress_by_state.xlsx');
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

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) { alert('Export not available'); return; }
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Household ID': r.hhid,
      'State': r.state ? (STATE_LABELS[r.state] || r.state) : '',
      'Locality': r.locality,
      'Sex': r.sex === 0 ? 'Female' : 'Male',
      'HH Status': r.hhStatus ? STATUS_LABELS[r.hhStatus] : '',
      'HH Total': r.hhTotal,
      'Asst Received': r.asstReceived === 1 ? 'Yes' : r.asstReceived === 2 ? 'Partial' : 'No',
      'Amount Received (SDG)': r.asstAmtRec,
      'Satisfaction': r.satisfaction ? SATISFACTION_CFG.find(s => s.key === r.satisfaction)?.label : '',
      'CFM Aware': r.cfm === 1 ? 'Yes' : 'No',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PDM Data');
    XLSX.writeFile(wb, 'dct_pdm_export.xlsx');
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

  return (
    <div className="p-4 space-y-5 max-w-[1400px] mx-auto">
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
            {dataSource && (
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
            <Download className="h-3.5 w-3.5" />Export
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
                <Badge variant="outline" className="text-[10px]">{localityProgressData.length} states</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Planned vs. actual PDM coverage per state · {canUpload ? 'Click any cell to edit, or import from file' : 'Read-only view'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => importProgressRef.current?.click()} data-testid="button-import-progress">
                    <Upload className="h-3.5 w-3.5" />Import from File
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
                  <th className="text-left px-4 py-2.5 font-semibold">State</th>
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
                  <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">Reason for Deviation</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {localityProgressData.map((row, i) => {
                  const t = localityTargets[row.code];
                  const planned = t?.planned ? Number(t.planned) : null;
                  const dev = planned != null ? row.reached - planned : null;
                  const devPct = planned ? Math.round((row.reached / planned) * 100) : null;
                  const devColor = dev == null ? '' : dev >= 0 ? 'text-emerald-600' : 'text-red-500';
                  return (
                    <tr key={row.code} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>
                      <td className="px-4 py-2.5 font-bold text-[#1D3461] whitespace-nowrap text-[13px]">{row.name}</td>

                      <td className="px-4 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {canUpload ? (
                            <input
                              type="number"
                              min={0}
                              className="w-20 text-center text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                              value={t?.planned ?? ''}
                              placeholder="—"
                              onChange={e => updateTarget(row.code, 'planned', e.target.value)}
                              data-testid={`input-planned-${row.code}`}
                            />
                          ) : (
                            <span className="font-medium">{planned ?? '—'}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-2 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-[#1D3461]">
                          {row.reached}
                          {devPct != null && (
                            <span className={`text-[10px] font-normal ${devColor}`}>({devPct}%)</span>
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-2 text-center">
                        {dev == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={`font-bold ${devColor}`}>
                            {dev > 0 ? `+${dev}` : dev}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2">
                        {canUpload ? (
                          <input
                            type="text"
                            className="w-full min-w-[140px] text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                            value={t?.deviation ?? ''}
                            placeholder="Enter reason…"
                            onChange={e => updateTarget(row.code, 'deviation', e.target.value)}
                            data-testid={`input-deviation-${row.code}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">{t?.deviation || '—'}</span>
                        )}
                      </td>

                      <td className="px-4 py-2">
                        {canUpload ? (
                          <input
                            type="text"
                            className="w-full min-w-[140px] text-[12px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-[#1D3461]"
                            value={t?.remarks ?? ''}
                            placeholder="Add remarks…"
                            onChange={e => updateTarget(row.code, 'remarks', e.target.value)}
                            data-testid={`input-remarks-${row.code}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">{t?.remarks || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 border-t-2 border-border font-bold">
                  <td className="px-4 py-2.5 text-[11px] font-bold">TOTAL</td>
                  <td className="px-4 py-2.5 text-center text-[12px]">
                    {localityProgressData.reduce((s, r) => {
                      const p = localityTargets[r.code]?.planned;
                      return s + (p ? Number(p) : 0);
                    }, 0) || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-[12px] text-[#1D3461]">{records.length}</td>
                  <td className="px-4 py-2.5 text-center text-[12px]">
                    {(() => {
                      const totalPlanned = localityProgressData.reduce((s, r) => s + (localityTargets[r.code]?.planned ? Number(localityTargets[r.code].planned) : 0), 0);
                      const dev = totalPlanned ? records.length - totalPlanned : null;
                      return dev != null ? <span className={dev >= 0 ? 'text-emerald-600' : 'text-red-500'}>{dev > 0 ? `+${dev}` : dev}</span> : '—';
                    })()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

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
          <SectionTitle title="Top Interviewers" sub="Surveys submitted per data collector" count={total} />
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {interviewerData.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="text-[10px] font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium truncate">{d.name}</span>
                    <span className="text-[11px] font-bold text-[#1D3461] ml-2 shrink-0">{d.count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="h-full rounded-full bg-[#1D3461]"
                      style={{ width: `${PCT(d.count, interviewerData[0]?.count || 1)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
      <p className="text-center text-[10px] text-muted-foreground pb-2">
        Data source: {dataSource ? dataSource.name : '2026 DCT PDM Survey'} · {records.length} records · Generated {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
