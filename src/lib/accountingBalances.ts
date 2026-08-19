export type AccountBalanceTransaction = {
  debit_credit: 'DR' | 'CR';
  functional_amount: number;
  posting_date?: string;
  entry_date?: string;
  entry_no?: number;
  line_no?: number;
  id?: string;
};

/**
 * Assets and expenses carry their normal balance on the debit side. Every
 * other chart-of-accounts type carries it on the credit side.
 */
export function isDebitNormalAccount(accountType?: string | null): boolean {
  return accountType === 'asset' || accountType === 'expense';
}

/**
 * Converts a debit-minus-credit aggregate (the accounting data convention)
 * to the balance in an account's normal direction.
 */
export function normalBalanceFromLedgerNet(
  ledgerNet: number,
  accountType?: string | null
): number {
  return isDebitNormalAccount(accountType) ? ledgerNet : -ledgerNet;
}

/**
 * Returns the signed movement in an account's normal direction.
 */
export function normalBalanceDelta(
  accountType: string | null | undefined,
  debitCredit: 'DR' | 'CR',
  amount: number
): number {
  const increasesBalance = isDebitNormalAccount(accountType)
    ? debitCredit === 'DR'
    : debitCredit === 'CR';
  return increasesBalance ? amount : -amount;
}

/**
 * Orders journal lines oldest-first before computing a running balance. Entry
 * number and line number make same-day journal entries deterministic.
 */
export function sortAccountTransactionsChronologically<T extends AccountBalanceTransaction>(
  transactions: readonly T[]
): T[] {
  return [...transactions].sort((a, b) => {
    const dateA = a.posting_date ?? a.entry_date ?? '';
    const dateB = b.posting_date ?? b.entry_date ?? '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const entryA = a.entry_no ?? 0;
    const entryB = b.entry_no ?? 0;
    if (entryA !== entryB) return entryA - entryB;

    const lineA = a.line_no ?? 0;
    const lineB = b.line_no ?? 0;
    if (lineA !== lineB) return lineA - lineB;

    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

/**
 * Builds normal-direction running balances from a raw opening balance that is
 * already expressed in the account's normal direction.
 */
export function calculateAccountRunningBalances<T extends AccountBalanceTransaction>(
  transactions: readonly T[],
  accountType: string | null | undefined,
  openingBalance: number | null
): Array<T & { runningBalance: number | null }> {
  let runningBalance = openingBalance;

  return sortAccountTransactionsChronologically(transactions).map((transaction) => {
    if (runningBalance !== null) {
      runningBalance += normalBalanceDelta(
        accountType,
        transaction.debit_credit,
        transaction.functional_amount
      );
    }
    return { ...transaction, runningBalance };
  });
}