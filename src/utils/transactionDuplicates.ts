export interface DuplicateTransaction {
  transaction_id?: string;
  amount?: number | string;
  from_account?: string;
  to_account?: string;
  recipient_name?: string;
  transaction_date?: string;
  transaction_time?: string;
}

const cents = (value: number | string | undefined) => {
  const number = Number(typeof value === 'string' ? value.replace(/,/g, '') : value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
export const transactionDuplicateKey = (row: DuplicateTransaction) => {
  const id = String(row.transaction_id ?? '').trim();
  return !id || /^(n\/a|unknown|-)$/i.test(id) ? '' : id;
};
const key = transactionDuplicateKey;

export interface HistoricalTransactionMatch extends DuplicateTransaction {
  session_id: string;
  session_name: string | null;
  scanned_at: string;
  receipt_ordinal: number;
}

/** Historical evidence is advisory: never subtract it from the current export. */
export function compareHistoricalTransactions(row: DuplicateTransaction, matches: HistoricalTransactionMatch[]) {
  const id = key(row);
  return matches.filter(match => id && key(match) === id).map(match => {
    const differences: string[] = [];
    const text = (value?: string) => String(value ?? '').trim();
    const amountEvidence = (value: DuplicateTransaction['amount']) => {
      const raw = String(value ?? '').trim().replace(/,/g, '');
      return raw && Number.isFinite(Number(raw)) ? cents(value) : `unresolved:${raw}`;
    };
    if (amountEvidence(row.amount) !== amountEvidence(match.amount)) differences.push('amount');
    if (text(row.from_account) !== text(match.from_account)) differences.push('from account');
    if (text(row.to_account) !== text(match.to_account)) differences.push('to account');
    if (text(row.recipient_name) !== text(match.recipient_name)) differences.push('recipient OCR');
    if (text(row.transaction_date) !== text(match.transaction_date)) differences.push('date OCR');
    if (text(row.transaction_time) !== text(match.transaction_time)) differences.push('time OCR');
    return { match, differences, conflict: differences.length > 0 };
  });
}

export const HISTORY_ID_BATCH_SIZE = 25;
export const HISTORY_MATCH_LIMIT = 20;

/** Sequential bounded requests; publish only a complete result, never a partial success. */
export async function lookupHistoricalTransactions(
  ids: string[],
  lookup: (batch: string[]) => Promise<HistoricalTransactionMatch[]>,
) {
  const unique = [...new Set(ids.map(transaction_id => key({ transaction_id })).filter(Boolean))];
  const matches: HistoricalTransactionMatch[] = [];
  const limitedIds: string[] = [];
  for (let offset = 0; offset < unique.length; offset += HISTORY_ID_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + HISTORY_ID_BATCH_SIZE);
    const result = await lookup(batch);
    for (const id of batch) {
      const evidence = result.filter(match => key(match) === id);
      if (evidence.length > HISTORY_MATCH_LIMIT) limitedIds.push(id);
      matches.push(...evidence.slice(0, HISTORY_MATCH_LIMIT));
    }
  }
  return { matches, limitedIds };
}

/** Keep the first input occurrence, never infer duplicates from account/amount. */
export function analyzeTransactionDuplicates<T extends DuplicateTransaction>(rows: T[]) {
  const groups = new Map<string, T[]>();
  rows.forEach(row => {
    const id = key(row);
    if (id) groups.set(id, [...(groups.get(id) ?? []), row]);
  });
  const seen = new Set<string>();
  const details = rows.map(row => {
    const id = key(row);
    const occurrences = id ? groups.get(id)!.length : 1;
    const extra = !!id && seen.has(id);
    if (id) seen.add(id);
    const conflict = occurrences > 1 && new Set(groups.get(id)!.map(item =>
      JSON.stringify([cents(item.amount), item.from_account?.trim(), item.to_account?.trim()]),
    )).size > 1;
    return {
      row, id, occurrences, extra, conflict,
      status: occurrences > 1
        ? `${extra ? 'Duplicate — excluded' : 'Repeated ID — counted once'}${conflict ? ' — CONFLICT: review' : ''}`
        : id ? 'Unique' : 'Missing ID — not deduplicated',
    };
  });
  const totalCents = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  const extraCents = details.filter(item => item.extra).reduce((sum, item) => sum + cents(item.row.amount), 0);
  return {
    details,
    duplicateGroups: [...groups.values()].filter(group => group.length > 1).length,
    duplicateRows: details.filter(item => item.occurrences > 1).length,
    extraRows: details.filter(item => item.extra).length,
    conflictGroups: [...groups.values()].filter(group =>
      details.find(item => item.row === group[0])?.conflict).length,
    total: totalCents / 100, duplicateAmount: extraCents / 100,
    uniqueTotal: (totalCents - extraCents) / 100,
    uniqueCount: rows.length - details.filter(item => item.extra).length,
  };
}
