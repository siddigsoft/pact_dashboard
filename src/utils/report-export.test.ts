import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { exportToExcel } from './report-export';
vi.mock('xlsx', async importOriginal => ({ ...await importOriginal<typeof import('xlsx')>(), writeFile: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe('mixed-row Excel exports', () => {
  it('preserves task and contribution columns introduced after the summary', () => {
    exportToExcel([
      { Project: 'P', 'Record type': 'Summary', Details: 'Period totals' },
      { Project: 'P', 'Record type': 'Task', Task: 'Visit', Status: 'done', Hours: 12 },
      { Project: 'P', 'Record type': 'Contribution', Person: 'Member', Contribution: 'Verified output' },
    ], 'Progress', 'report.xlsx');
    const workbook = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Progress, { header: 1 });
    expect(rows[3]).toEqual(['Project', 'Record type', 'Details', 'Task', 'Status', 'Hours', 'Person', 'Contribution']);
    expect(rows[4 + 1][rows[3].indexOf('Hours')]).toBe(12);
    expect(rows[4 + 2][rows[3].indexOf('Contribution')]).toBe('Verified output');
  });
  it('keeps empty and homogeneous exports working', () => {
    exportToExcel([], 'Empty', 'empty.xlsx');
    exportToExcel([{ Name: 'A', Amount: 0 }, { Name: 'B', Amount: 5 }], 'Rows', 'rows.xlsx');
    expect(XLSX.writeFile).toHaveBeenCalledTimes(2);
    const book = vi.mocked(XLSX.writeFile).mock.calls[1][0];
    const rows = XLSX.utils.sheet_to_json<any[]>(book.Sheets.Rows, { header: 1 });
    expect(rows[3]).toEqual(['Name', 'Amount']);
    expect(rows[4]).toEqual(['A', 0]);
  });
});
