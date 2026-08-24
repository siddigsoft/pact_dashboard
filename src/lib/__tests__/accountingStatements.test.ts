import { describe, expect, it } from 'vitest';
import { calculateBalanceSheet } from '@/lib/accountingStatements';

describe('calculateBalanceSheet', () => {
  it('carries forward prior-period balances and includes current unclosed earnings', () => {
    const accounts = {
      cash: { account_type: 'asset' },
      retained: { account_type: 'equity' },
      programmeRevenue: { account_type: 'revenue' },
    };

    // The RPC supplies balances through the requested period end: opening cash
    // and retained earnings are from a prior period; current revenue has not
    // yet been closed into retained earnings.
    const result = calculateBalanceSheet([
      { account_id: 'cash', debit_total: 160, credit_total: 0 },
      { account_id: 'retained', debit_total: 0, credit_total: 100 },
      { account_id: 'programmeRevenue', debit_total: 0, credit_total: 60 },
    ], accounts);

    expect(result.totalAssets).toBe(160);
    expect(result.totalEquity).toBe(100);
    expect(result.cumulativeEarnings).toBe(60);
    expect(result.totalNetAssets).toBe(160);
    expect(result.isBalanced).toBe(true);
  });

  it('reports an imbalance instead of masking it', () => {
    const result = calculateBalanceSheet(
      [{ account_id: 'cash', debit_total: 100, credit_total: 0 }],
      { cash: { account_type: 'asset' } },
    );

    expect(result.isBalanced).toBe(false);
  });
});