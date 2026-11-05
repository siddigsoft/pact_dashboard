export interface DuplicateTransaction {
  transaction_id?: string;
  amount?: number | string;
  from_account?: string;
  to_account?: string;
  recipient_name?: string;
}

const cents = (value: number | string | undefined) => {
  const number = Number(typeof value === 'string' ? value.replace(/,/g, '') : value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
const key = (row: DuplicateTransaction) => {
  const id = String(row.transaction_id ?? '').trim();
  return !id || /^(n\/a|unknown|-)$/i.test(id) ? '' : id;
};

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
