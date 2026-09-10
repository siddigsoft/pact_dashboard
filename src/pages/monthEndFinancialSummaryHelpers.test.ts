import { describe, expect, it } from 'vitest';
import {
  aggregateCurrency,
  aggregatePreFund,
  buildPreFundCurrencySummaryRows,
  calculateOutlookByCurrency,
  MONTH_END_REPORT_BASIS,
  normalizeReportCurrency,
  selectFinalizedPayrollRuns,
} from './monthEndFinancialSummaryHelpers';

describe('month-end aggregation', () => {
  it('keeps currencies separate and reports null currency', () => {
    expect(aggregateCurrency([{ c: 'SDG', n: 2 }, { c: 'USD', n: 3 }, { c: null, n: 9 }],
      r => r.c, r => r.n)).toEqual({ totals: { SDG: 2, USD: 3 }, nullCurrencyCount: 1 });
  });
  it('assigns finalized payroll to the month containing period end and de-duplicates locked runs', () => {
    const result = selectFinalizedPayrollRuns([
      { id: 'a', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'draft' },
      { id: 'b', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'approved' },
      { id: 'c', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'locked' },
      { id: 'd', period_label: 'Cross-month', period_start: '2024-05-20', period_end: '2024-06-05', status: 'locked' },
    ], new Date('2024-05-01'), new Date('2024-05-31'));
    expect(result.runs.map(r => r.id)).toEqual(['c']);
    expect(result.duplicateCount).toBe(1);
  });
  it('does not merge different-country payroll runs and flags same-country duplicates', () => {
    const result = selectFinalizedPayrollRuns([
      { id: 'a', country_id: 'SD', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'approved' },
      { id: 'b', country_id: 'KE', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'approved' },
      { id: 'c', country_id: 'SD', period_label: 'May', period_start: '2024-05-01', period_end: '2024-05-31', status: 'locked' },
    ], new Date('2024-05-01'), new Date('2024-05-31'));
    expect(result.runs).toHaveLength(2);
    expect(result.ambiguousDuplicateCount).toBe(1);
  });
  it('includes paid operational expenses by caller-provided amount', () => {
    expect(aggregateCurrency([{ currency: 'SDG', cents: 1250, status: 'paid' }],
      r => r.currency, r => r.cents / 100).totals.SDG).toBe(12.5);
  });
  it('calculates outlook independently per currency', () => {
    expect(calculateOutlookByCurrency([
      { totals: { SDG: 100, USD: 5 }, sign: 1 },
      { totals: { SDG: 40, USD: 2 }, sign: -1 },
    ])).toEqual({ SDG: 60, USD: 3 });
  });
  it('nets receipt, payment, return and each reversal direction, excluding carry forward', () => {
    expect(aggregatePreFund([
      { id: 'r', transaction_type: 'receipt', amount: 100, currency: 'SDG' },
      { id: 'rr', transaction_type: 'reversal', amount: 10, currency: 'SDG', reversal_of_id: 'r' },
      { id: 'p', transaction_type: 'payment', amount: 50, currency: 'SDG' },
      { id: 'pr', transaction_type: 'reversal', amount: 5, currency: 'SDG', reversal_of_id: 'p' },
      { id: 'ret', transaction_type: 'return', amount: 8, currency: 'SDG' },
      { id: 'retr', transaction_type: 'reversal', amount: 3, currency: 'SDG', reversal_of_id: 'ret' },
      { id: 'cf', transaction_type: 'carry_forward', amount: 1000, currency: 'SDG' },
      { id: 'c', transaction_type: 'commitment', amount: 20, currency: 'SDG' },
      { id: 'cr', transaction_type: 'reversal', amount: 7, currency: 'SDG', reversal_of_id: 'c' },
    ])).toMatchObject({ received: 90, paid: 40 });
    expect(aggregatePreFund([
      { id: 'c', transaction_type: 'commitment', amount: 20, currency: 'SDG' },
      { id: 'cr', transaction_type: 'reversal', amount: 7, currency: 'SDG', reversal_of_id: 'c' },
    ]).committed).toBe(13);
  });
  it('uses an earlier-month original only as reversal context', () => {
    const events = [
      { id: 'old-payment', transaction_type: 'payment', amount: 50, currency: 'SDG' },
      { id: 'current-reversal', transaction_type: 'reversal', amount: 50, currency: 'SDG', reversal_of_id: 'old-payment' },
    ];
    expect(aggregatePreFund(events, new Set(['current-reversal']))).toMatchObject({
      received: 0,
      paid: -50,
    });
  });
  it('nets Pre-Fund activity independently by currency', () => {
    const events = [
      { id: 'sdg-receipt', transaction_type: 'receipt', amount: 100, currency: 'SDG' },
      { id: 'usd-receipt', transaction_type: 'receipt', amount: 20, currency: 'USD' },
      { id: 'usd-payment', transaction_type: 'payment', amount: 5, currency: 'USD' },
    ];
    expect(aggregatePreFund(events)).toMatchObject({ received: 100, paid: 0 });
    expect(aggregatePreFund(events, undefined, 'USD')).toMatchObject({ received: 20, paid: 5 });
  });
  it('keeps payroll assignment and current-state limits in the shared report basis', () => {
    expect(MONTH_END_REPORT_BASIS).toContain('period end date');
    expect(MONTH_END_REPORT_BASIS).toContain('not as-of snapshots');
    expect(MONTH_END_REPORT_BASIS).toContain('not a historical closing balance');
  });
  it('builds complete non-SDG Pre-Fund summary rows and normalizes missing currency', () => {
    const rows = buildPreFundCurrencySummaryRows([
      { currency: 'USD', received: 20, paid: 5, committed: 2, net: 13, available: 40 },
    ]);
    expect(rows.map(row => row.label)).toEqual([
      'Pre-Fund Received (USD)',
      'Pre-Fund Paid Out (USD)',
      'Pre-Fund Committed (USD)',
      'Pre-Fund Net Activity (USD)',
      'Pre-Fund Available Balance (USD)',
    ]);
    expect(normalizeReportCurrency(null)).toBe('MISSING');
  });
});