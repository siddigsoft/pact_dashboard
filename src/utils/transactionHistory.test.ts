import { describe, expect, it, vi } from 'vitest';
import {
  analyzeTransactionDuplicates, compareHistoricalTransactions, lookupHistoricalTransactions,
  type HistoricalTransactionMatch,
} from './transactionDuplicates';

const row = { transaction_id: ' TX1 ', from_account: '111', to_account: '222', amount: '1,000.00', recipient_name: 'Recipient' };
const match: HistoricalTransactionMatch = {
  ...row, transaction_id: 'TX1', amount: 1000,
  session_id: 'session-a', session_name: 'Earlier scan', scanned_at: '2026-11-01', receipt_ordinal: 1,
};

describe('saved scan duplicate evidence', () => {
  it('keeps overlapping sessions and repeated receipts as independent evidence', () => {
    const evidence = compareHistoricalTransactions(row, [
      match, { ...match, receipt_ordinal: 2 }, { ...match, session_id: 'session-b' },
    ]);
    expect(evidence).toHaveLength(3);
    expect(evidence.every(item => !item.conflict)).toBe(true);
    const current = [row, { ...row }];
    expect(analyzeTransactionDuplicates(current).uniqueTotal).toBe(1000);
    expect(current).toHaveLength(2);
  });
  it('distinguishes account, amount and OCR conflicts without silently removing rows', () => {
    expect(compareHistoricalTransactions(row, [{
      ...match, from_account: '333', to_account: '444', amount: 20, recipient_name: 'Other',
    }])[0].differences).toEqual(['amount', 'from account', 'to account', 'recipient OCR']);
  });
  it('never matches missing IDs or a different transaction by amount alone', () => {
    for (const id of ['', 'N/A', 'unknown', '-', 'another']) {
      expect(compareHistoricalTransactions({ ...row, transaction_id: id }, [match])).toEqual([]);
    }
  });
  it('does not treat unresolved amount OCR as zero and flags differing date/time OCR', () => {
    const evidence = compareHistoricalTransactions(
      { ...row, amount: 'unreadable', transaction_date: '2026-11-02', transaction_time: '10:00' },
      [{ ...match, amount: 0, transaction_date: '2026-11-01', transaction_time: '11:00' }],
    );
    expect(evidence[0].differences).toEqual(['amount', 'date OCR', 'time OCR']);
  });
  it('batches unique IDs, limits evidence and explicitly signals truncation', async () => {
    const lookup = vi.fn(async (ids: string[]) => ids.flatMap(transaction_id =>
      Array.from({ length: 21 }, (_, i) => ({ ...match, transaction_id, receipt_ordinal: i + 1 }))));
    const ids = Array.from({ length: 52 }, (_, i) => `TX${i}`);
    const result = await lookupHistoricalTransactions([...ids, ' TX1 ', '', 'N/A'], lookup);
    expect(lookup.mock.calls.map(call => call[0].length)).toEqual([25, 25, 2]);
    expect(result.matches).toHaveLength(52 * 20);
    expect(result.limitedIds).toEqual(ids);
  });
  it('does not infer inaccessible sessions or manufacture matches when server returns none', async () => {
    expect(await lookupHistoricalTransactions(['TX1'], async () => [])).toEqual({ matches: [], limitedIds: [] });
  });
  it('fails explicitly rather than publishing partial results', async () => {
    let call = 0;
    await expect(lookupHistoricalTransactions(
      Array.from({ length: 26 }, (_, i) => `TX${i}`),
      async () => { if (++call === 2) throw new Error('denied'); return [match]; },
    )).rejects.toThrow('denied');
  });
});
