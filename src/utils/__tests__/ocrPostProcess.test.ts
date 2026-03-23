import { describe, it, expect } from 'vitest';
import { ocrPostProcess } from '../ocrPostProcess';

const makeReceipt = (overrides = {}) => ({
  transaction_id: '20024933620',
  date_time: '04-Mar-2026 19:13:16',
  from_account: '08131231711700001',
  to_account: '03431595497500001',
  recipient_name: 'محمد بابكر',
  mobile_number: 'N/A',
  comment: 'N/A',
  amount: 3000000,
  ...overrides,
});

describe('ocrPostProcess', () => {
  it('returns valid JSON for a well-formed single-item array', () => {
    const input = JSON.stringify([makeReceipt()]);
    const result = ocrPostProcess(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('strips spaces from from_account', () => {
    const input = JSON.stringify([makeReceipt({ from_account: '0813 1231 7117 00001' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result[0].from_account).toBe('08131231711700001');
  });

  it('strips spaces from to_account', () => {
    const input = JSON.stringify([makeReceipt({ to_account: '0343 1595 4975 00001' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result[0].to_account).toBe('03431595497500001');
  });

  it('parses amount with commas to a float', () => {
    const input = JSON.stringify([makeReceipt({ amount: '3,000,000.00' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result[0].amount).toBe(3000000);
  });

  it('sets amount to 0 when the value is not numeric', () => {
    const input = JSON.stringify([makeReceipt({ amount: 'N/A' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result[0].amount).toBe(0);
  });

  it('handles a batch of multiple receipts', () => {
    const input = JSON.stringify([makeReceipt(), makeReceipt({ amount: '1,500,000' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result).toHaveLength(2);
    expect(result[1].amount).toBe(1500000);
  });

  it('returns the original string unchanged when input is not a JSON array', () => {
    const garbage = 'not json at all';
    expect(ocrPostProcess(garbage)).toBe(garbage);
  });

  it('returns the original string when JSON is an object, not an array', () => {
    const obj = JSON.stringify({ transaction_id: '123' });
    expect(ocrPostProcess(obj)).toBe(obj);
  });

  it('preserves fields it does not process (recipient_name, comment, etc.)', () => {
    const input = JSON.stringify([makeReceipt({ recipient_name: 'أحمد', comment: 'دفعة' })]);
    const result = JSON.parse(ocrPostProcess(input));
    expect(result[0].recipient_name).toBe('أحمد');
    expect(result[0].comment).toBe('دفعة');
  });
});
