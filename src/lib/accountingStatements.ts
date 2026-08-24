export interface StatementBalanceRow {
  account_id: string;
  debit_total: number;
  credit_total: number;
}

export interface StatementAccountMeta {
  account_type: string;
}

export function statementNetBalance(row: StatementBalanceRow, accountType: string): number {
  const debit = Number(row.debit_total) || 0;
  const credit = Number(row.credit_total) || 0;
  return accountType === 'asset' || accountType === 'expense'
    ? debit - credit
    : credit - debit;
}

/**
 * Builds a balance sheet from already-filtered, posted as-of balances. Revenue
 * and expense balances are retained only to calculate cumulative unclosed
 * earnings so an open period still satisfies the accounting equation.
 */
export function calculateBalanceSheet<T extends StatementBalanceRow>(
  rows: T[],
  accounts: Record<string, StatementAccountMeta>,
) {
  const assets: T[] = [];
  const liabilities: T[] = [];
  const equity: T[] = [];
  const revenue: T[] = [];
  const expenses: T[] = [];

  for (const row of rows) {
    const accountType = accounts[row.account_id]?.account_type;
    if (accountType === 'asset') assets.push(row);
    else if (accountType === 'liability') liabilities.push(row);
    else if (accountType === 'equity') equity.push(row);
    else if (accountType === 'revenue') revenue.push(row);
    else if (accountType === 'expense') expenses.push(row);
  }

  const total = (items: T[], accountType: string) =>
    items.reduce((sum, row) => sum + statementNetBalance(row, accountType), 0);

  const totalAssets = total(assets, 'asset');
  const totalLiabilities = total(liabilities, 'liability');
  const totalEquity = total(equity, 'equity');
  const cumulativeEarnings = total(revenue, 'revenue') - total(expenses, 'expense');
  const totalNetAssets = totalEquity + cumulativeEarnings;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cumulativeEarnings,
    totalNetAssets,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalNetAssets)) < 0.01,
  };
}