import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { analyzeTransactionDuplicates } from './transactionDuplicates';
import { appendScannerDuplicateSheets } from './scannerDuplicateSheets';

describe('transaction duplicate exports', () => {
  const rows = [
    { transaction_id: '001', amount: '1,000.25', from_account: '0001', to_account: '0002' },
    { transaction_id: '001', amount: '1,000.25', from_account: '0001', to_account: '0002' },
    { transaction_id: '002', amount: 20, to_account: '0002' },
  ];
  it('counts one original per repeated ID and retains all evidence', () => {
    const audit = analyzeTransactionDuplicates(rows);
    expect(audit).toMatchObject({
      total: 2020.5, uniqueTotal: 1020.25, duplicateAmount: 1000.25,
      extraRows: 1, duplicateGroups: 1, duplicateRows: 2, uniqueCount: 2, conflictGroups: 0,
    });
    expect(audit.details.map(item => item.extra)).toEqual([false, true, false]);
  });
  it('flags conflicting amounts/accounts instead of claiming a definitive total', () => {
    const audit = analyzeTransactionDuplicates([rows[0], { ...rows[0], amount: 10, to_account: '0003' }]);
    expect(audit.conflictGroups).toBe(1);
    expect(audit.uniqueTotal).toBe(1000.25);
    expect(audit.details.every(item => item.status.includes('CONFLICT'))).toBe(true);
  });
  it('does not merge missing IDs or different transactions for the same account', () => {
    const audit = analyzeTransactionDuplicates([
      { amount: 10 }, { transaction_id: '', amount: 10 }, { transaction_id: 'N/A', amount: 10 },
      { transaction_id: 'a', amount: 10 }, { transaction_id: 'b', amount: 10 },
    ]);
    expect(audit.extraRows).toBe(0);
    expect(audit.uniqueTotal).toBe(50);
  });
  it('handles three occurrences and empty/no-duplicate exports', () => {
    expect(analyzeTransactionDuplicates([rows[0], rows[0], rows[0]]).extraRows).toBe(2);
    expect(analyzeTransactionDuplicates([]).total).toBe(0);
    expect(analyzeTransactionDuplicates([rows[0]]).extraRows).toBe(0);
  });
  it('writes numeric summary totals, full account strings, and highlighted details', () => {
    const wb = XLSX.utils.book_new();
    appendScannerDuplicateSheets(wb, rows);
    expect(wb.SheetNames).toEqual(['Duplicate Summary', 'Duplicate Details']);
    expect(wb.Sheets['Duplicate Summary'].B12.v).toBe(1020.25);
    expect(wb.Sheets['Duplicate Details'].F2.v).toBe('0002');
    expect(wb.Sheets['Duplicate Details'].F2.t).toBe('s');
    expect(wb.Sheets['Duplicate Details'].F2.s.fill.fgColor.rgb).toBe('FFF2CC');
    const roundtrip = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(roundtrip.Sheets['Duplicate Summary'].B12.v).toBe(1020.25);
    expect(roundtrip.Sheets['Duplicate Details'].F2.v).toBe('0002');
  });
  it('account totals reconcile globally even with conflicting account IDs', () => {
    const wb = XLSX.utils.book_new();
    appendScannerDuplicateSheets(wb, [rows[0], { ...rows[0], to_account: '0003' }]);
    const values = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Duplicate Summary'], { header: 1 });
    expect(values[14][6] + values[15][6]).toBe(1000.25);
  });
});
