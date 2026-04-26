export const ACCT_FUNCTIONAL_CCY = 'SDG';

export function formatMoney(amount: number | string | null | undefined, currency = ACCT_FUNCTIONAL_CCY): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ${currency}`;
}

export function formatNumber(amount: number | string | null | undefined, fractionDigits = 2): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

export function bilingual(en: string | null | undefined, ar: string | null | undefined): string {
  const e = (en ?? '').trim();
  const a = (ar ?? '').trim();
  if (e && a) return `${e} · ${a}`;
  return e || a || '—';
}

export const ACCT_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  asset:     { en: 'Asset',     ar: 'أصل' },
  liability: { en: 'Liability', ar: 'التزام' },
  equity:    { en: 'Equity',    ar: 'حقوق ملكية' },
  revenue:   { en: 'Revenue',   ar: 'إيراد' },
  expense:   { en: 'Expense',   ar: 'مصروف' },
};

export const ACCT_STATUS_TONE: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-amber-100 text-amber-800 border-amber-200',
  posted:           'bg-emerald-100 text-emerald-800 border-emerald-200',
  reversed:         'bg-rose-100 text-rose-800 border-rose-200',
  rejected:         'bg-rose-100 text-rose-800 border-rose-200',
  open:             'bg-sky-100 text-sky-800 border-sky-200',
  soft_closed:      'bg-amber-100 text-amber-800 border-amber-200',
  hard_closed:      'bg-slate-200 text-slate-800 border-slate-300',
  locked:           'bg-zinc-200 text-zinc-800 border-zinc-300',
};

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
