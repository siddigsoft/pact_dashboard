import { describe, expect, it } from 'vitest';
import {
  calculateAccountRunningBalances,
  normalBalanceFromLedgerNet,
} from '../accountingBalances';

describe('account running balances', () => {
  it('increases debit-normal accounts on debits and decreases them on credits', () => {
    const balances = calculateAccountRunningBalances(
      [
        { id: 'credit', posting_date: '2026-08-03', debit_credit: 'CR', functional_amount: 25 },
        { id: 'debit', posting_date: '2026-08-01', debit_credit: 'DR', functional_amount: 100 },
      ],
      'asset',
      normalBalanceFromLedgerNet(50, 'asset')
    );

    expect(balances.map((line) => line.id)).toEqual(['debit', 'credit']);
    expect(balances.map((line) => line.runningBalance)).toEqual([150, 125]);
  });

  it('increases credit-normal accounts on credits and decreases them on debits', () => {
    const balances = calculateAccountRunningBalances(
      [
        { id: 'debit', posting_date: '2026-08-03', debit_credit: 'DR', functional_amount: 25 },
        { id: 'credit', posting_date: '2026-08-01', debit_credit: 'CR', functional_amount: 100 },
      ],
      'liability',
      normalBalanceFromLedgerNet(-50, 'liability')
    );

    expect(balances.map((line) => line.id)).toEqual(['credit', 'debit']);
    expect(balances.map((line) => line.runningBalance)).toEqual([150, 125]);
  });

  it('uses entry and line order for transactions posted on the same day', () => {
    const balances = calculateAccountRunningBalances(
      [
        { id: 'later-line', posting_date: '2026-08-01', entry_no: 2, line_no: 2, debit_credit: 'DR', functional_amount: 10 },
        { id: 'first-entry', posting_date: '2026-08-01', entry_no: 1, line_no: 1, debit_credit: 'DR', functional_amount: 20 },
        { id: 'earlier-line', posting_date: '2026-08-01', entry_no: 2, line_no: 1, debit_credit: 'CR', functional_amount: 5 },
      ],
      'expense',
      0
    );

    expect(balances.map((line) => line.id)).toEqual(['first-entry', 'earlier-line', 'later-line']);
    expect(balances.map((line) => line.runningBalance)).toEqual([20, 15, 25]);
  });
});