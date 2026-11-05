import { describe, expect, it } from 'vitest';
import { createScannerQueue, restoreScannerRows, scannerSavedTotal, serializeScannerRows } from './scannerSession';
import { providerRetrySeconds } from '../../supabase/functions/_shared/ocr-retry';

describe('scanner saved snapshots', () => {
  const row = {
    id: 'receipt-1', fileName: 'receipt.jpg', status: 'done', transaction_id: '000123',
    from_account: '000001', to_account: '000002', recipient_name: 'Recipient',
    amount: '1,000.25', amount_confidence: 87, note: 'Check receipt', verified: true,
    transaction_date: '2026-11-05', transaction_time: '13:00:00',
    mobile_number: '00123', comment: 'Payment',
  };
  it('round-trips every field without losing notes, flags, confidence or duplicate evidence', () => {
    const rows = [row, { ...row, id: 'receipt-2', verified: false }];
    const restored = restoreScannerRows(serializeScannerRows(rows));
    expect(restored).toEqual(rows);
    expect(restored[0].to_account).toBe('000002');
    expect(scannerSavedTotal(restored)).toBe(2000.5);
  });
  it('restores old records without metadata compatibly', () => {
    const restored = restoreScannerRows([{ amount: 12, transaction_id: 'a' }])[0];
    expect(restored).toMatchObject({ status: 'done', fileName: '', amount: 12 });
    expect(restored.id).toBeTruthy();
  });
  it('preserves failures and marks incomplete work for reupload rather than hanging', () => {
    const restored = restoreScannerRows([
      { ...row, status: 'pending' }, { ...row, id: 'b', status: 'processing' },
      { ...row, id: 'c', status: 'error', error: 'Provider unavailable' },
    ]);
    expect(restored.every(item => item.status === 'error')).toBe(true);
    expect(restored[0].error).toContain('Re-upload');
    expect(restored[2].error).toBe('Provider unavailable');
    expect(scannerSavedTotal(restored)).toBe(0);
  });
});

describe('scanner paced queue', () => {
  it('does not add an 8 second pause after a slow successful request', async () => {
    let clock = 0;
    const waits: number[] = [];
    const enqueue = createScannerQueue(8000, () => clock, async ms => { waits.push(ms); clock += ms; });
    await enqueue(async () => { clock += 12000; });
    await enqueue(async () => {});
    expect(waits).toEqual([]);
  });
  it('spaces fast requests and serializes all entry points', async () => {
    let clock = 0;
    const starts: number[] = [];
    const enqueue = createScannerQueue(8000, () => clock, async ms => { clock += ms; });
    const task = () => enqueue(async () => { starts.push(clock); clock += 2000; });
    await Promise.all([task(), task(), task()]);
    expect(starts).toEqual([0, 8000, 16000]);
  });
  it('does not break the queue after a failed request', async () => {
    const enqueue = createScannerQueue(0);
    await expect(enqueue(async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    await expect(enqueue(async () => 'next')).resolves.toBe('next');
  });
});

describe('provider cooldowns', () => {
  it('preserves a provider wait longer than the automatic retry window', () => {
    expect(providerRetrySeconds(new Headers({ 'Retry-After': '120' }), '')).toBe(120);
  });
  it('parses provider waits and defaults safely', () => {
    expect(providerRetrySeconds(new Headers(), 'retry in 12.3s')).toBe(13);
    expect(providerRetrySeconds(new Headers(), 'try again in 9s')).toBe(9);
    expect(providerRetrySeconds(new Headers(), '')).toBe(15);
  });
});
