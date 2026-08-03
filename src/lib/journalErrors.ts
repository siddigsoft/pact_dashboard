/**
 * parseJournalError
 * Maps known Postgres trigger error codes raised by journal posting triggers
 * (UNBALANCED_ENTRY, EMPTY_ENTRY, IMMUTABLE_ENTRY, ORPHAN_LINE) to
 * clean, actionable messages for the UI.
 *
 * Falls back to the raw error message when the code is unrecognised.
 */
export function parseJournalError(err: unknown): string {
  const msg: string =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);

  if (msg.includes('UNBALANCED_ENTRY')) {
    // Try to extract debit/credit totals from the message, e.g.:
    // "UNBALANCED_ENTRY: debits=1000 credits=900"
    const debitMatch  = msg.match(/debits?[=:\s]+([0-9.,]+)/i);
    const creditMatch = msg.match(/credits?[=:\s]+([0-9.,]+)/i);

    if (debitMatch && creditMatch) {
      const debits  = parseFloat(debitMatch[1].replace(',', ''));
      const credits = parseFloat(creditMatch[1].replace(',', ''));
      const diff    = Math.abs(debits - credits).toFixed(2);
      return (
        `Journal is out of balance — debits total ${debits.toFixed(2)}, ` +
        `credits total ${credits.toFixed(2)} (difference ${diff}). ` +
        `Adjust the lines to balance before posting.`
      );
    }

    return (
      'Journal is out of balance — debits and credits do not match. ' +
      'Adjust the lines to balance before posting.'
    );
  }

  if (msg.includes('EMPTY_ENTRY')) {
    return 'Journal has no lines. Add at least one debit and one credit line.';
  }

  if (msg.includes('IMMUTABLE_ENTRY')) {
    return 'This entry is already posted. Create a reversal to correct it.';
  }

  if (msg.includes('ORPHAN_LINE')) {
    return (
      'One or more journal lines reference an account or fund that does not exist. ' +
      'Check that all accounts and funds are valid before posting.'
    );
  }

  // Unknown error — return the raw message so nothing is silently swallowed.
  return msg;
}
