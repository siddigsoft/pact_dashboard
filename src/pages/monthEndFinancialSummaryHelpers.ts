export type CurrencyTotals = Record<string, number>;

export const MONTH_END_REPORT_BASIS = 'Receivables are items currently outstanding and due in the selected month; historical selections are current-status views, not as-of snapshots. Payroll runs are assigned to the month containing their period end date. Subscriptions are current active monthly estimates. Pre-Fund available balance is current, not a historical closing balance.';

export function normalizeReportCurrency(currency: string | null | undefined): string {
  return currency ?? 'MISSING';
}

export interface PreFundCurrencySummaryInput {
  currency: string;
  received: number;
  paid: number;
  committed: number;
  net: number;
  available: number;
}

export function buildPreFundCurrencySummaryRows(rows: PreFundCurrencySummaryInput[]): Array<{
  label: string;
  amount: number;
  currency: string;
  note: string;
}> {
  return rows.flatMap(row => [
    { label: `Pre-Fund Received (${row.currency})`, amount: row.received, currency: row.currency, note: 'Verified period inflows; no FX conversion' },
    { label: `Pre-Fund Paid Out (${row.currency})`, amount: row.paid, currency: row.currency, note: 'Net payment/return activity; no FX conversion' },
    { label: `Pre-Fund Committed (${row.currency})`, amount: row.committed, currency: row.currency, note: 'Net commitment activity; no FX conversion' },
    { label: `Pre-Fund Net Activity (${row.currency})`, amount: row.net, currency: row.currency, note: 'Period movement; excludes opening balance; no FX conversion' },
    { label: `Pre-Fund Available Balance (${row.currency})`, amount: row.available, currency: row.currency, note: 'Current balance; no FX conversion' },
  ]);
}

export interface PayrollLike {
  id: string;
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status?: string | null;
  country_id?: string | null;
}

export function addCurrency(total: CurrencyTotals, currency: string | null | undefined, amount: number): void {
  if (!currency || !Number.isFinite(amount)) return;
  total[currency] = (total[currency] ?? 0) + amount;
}

export function calculateOutlookByCurrency(
  sections: Array<{ totals: CurrencyTotals; sign: 1 | -1 }>,
): CurrencyTotals {
  const result: CurrencyTotals = {};
  sections.forEach(section => Object.entries(section.totals).forEach(([currency, amount]) => {
    result[currency] = (result[currency] ?? 0) + section.sign * amount;
  }));
  return result;
}

export function aggregateCurrency<T>(
  rows: T[],
  currency: (row: T) => string | null | undefined,
  amount: (row: T) => number,
): { totals: CurrencyTotals; nullCurrencyCount: number } {
  const totals: CurrencyTotals = {};
  let nullCurrencyCount = 0;
  rows.forEach(row => {
    const c = currency(row);
    const n = amount(row);
    if (!c) nullCurrencyCount++;
    else addCurrency(totals, c, n);
  });
  return { totals, nullCurrencyCount };
}

export function selectFinalizedPayrollRuns<T extends PayrollLike>(
  runs: T[],
  start: Date,
  end: Date,
): { runs: T[]; duplicateCount: number; ambiguousDuplicateCount: number; undatedCount: number } {
  const undatedCount = runs.filter(r =>
    (r.status === 'approved' || r.status === 'locked') && (!r.period_start || !r.period_end),
  ).length;
  const eligible = runs.filter(r =>
    (r.status === 'approved' || r.status === 'locked')
    && !!r.period_start && !!r.period_end
    && new Date(r.period_end as string) >= start
    && new Date(r.period_end as string) <= end,
  );
  const groups: T[][] = [];
  eligible.forEach(r => {
    const matching = groups.find(group => group.some(existing =>
      r.country_id === existing.country_id && (
        (!!r.period_label && r.period_label === existing.period_label)
        || (r.period_start === existing.period_start && r.period_end === existing.period_end))));
    if (matching) matching.push(r); else groups.push([r]);
  });
  const selected: T[] = [];
  let duplicateCount = 0;
  let ambiguousDuplicateCount = 0;
  groups.forEach(group => {
    group.sort((a, b) =>
      Number(b.status === 'locked') - Number(a.status === 'locked')
      || String(b.id).localeCompare(String(a.id)),
    );
    selected.push(group[0]);
    duplicateCount += group.length - 1;
    if (group.length > 1) ambiguousDuplicateCount += group.length - 1;
  });
  return { runs: selected, duplicateCount, ambiguousDuplicateCount, undatedCount };
}

export interface LedgerEventLike {
  id: string;
  transaction_type?: string | null;
  amount?: number | null;
  currency?: string | null;
  reversal_of_id?: string | null;
  event_reason?: string | null;
  event_metadata?: Record<string, unknown> | null;
}

export function aggregatePreFund(
  events: LedgerEventLike[],
  includedEventIds?: Set<string>,
  currency = 'SDG',
): {
  received: number; paid: number; committed: number; counts: Record<string, number>;
  nullCurrencyCount: number;
} {
  const byId = new Map(events.map(e => [e.id, e]));
  let received = 0; let paid = 0; let committed = 0; let nullCurrencyCount = 0;
  const counts: Record<string, number> = {};
  const included = includedEventIds
    ? events.filter(event => includedEventIds.has(event.id))
    : events;
  const currencyEvents = included.filter(e => e.currency === currency);
  included.forEach(e => { if (!e.currency) nullCurrencyCount++; });
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  currencyEvents.forEach(e => {
    const amount = Number(e.amount) || 0;
    const original = e.reversal_of_id ? byId.get(e.reversal_of_id) : undefined;
    if (e.transaction_type === 'receipt') { received += amount; count('receipt'); }
    else if (e.transaction_type === 'commitment') { committed += amount; count('commitment'); }
    else if (e.transaction_type === 'payment') { paid += amount; count('payment'); }
    else if (e.transaction_type === 'return') { paid -= amount; count('return'); }
    else if (e.transaction_type === 'reversal' && original?.transaction_type === 'payment') { paid -= amount; count('payment_reversal'); }
    else if (e.transaction_type === 'reversal' && original?.transaction_type === 'return') { paid += amount; count('return_reversal'); }
    else if (e.transaction_type === 'reversal' && original?.transaction_type === 'receipt') { received -= amount; count('receipt_reversal'); }
    else if (e.transaction_type === 'reversal' && original?.transaction_type === 'commitment') { committed -= amount; count('commitment_reversal'); }
  });
  return { received, paid, committed, counts, nullCurrencyCount };
}