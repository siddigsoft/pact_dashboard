import { describe, expect, it } from 'vitest';
import { buildFieldPaymentsWorkbook } from '../fieldPaymentsExcel';

const baseOptions = {
  title: 'Transport Advances Report',
  sheetName: 'Transport Advances',
  filenamePrefix: 'field-payments-transport-advances',
  filters: ['State: Khartoum', 'Enumerator: Amina Ahmed'],
  summary: [
    { label: 'Records', value: 1 },
    { label: 'Paid', value: 'SDG 5,000' },
  ],
  columns: [
    { key: 'number', header: '#', width: 7, format: 'integer' as const },
    { key: 'enumerator', header: 'Enumerator', width: 24 },
    { key: 'paid', header: 'Paid Amount', width: 18, format: 'currency' as const, total: true },
    { key: 'paidDate', header: 'Paid Date', width: 16, format: 'date' as const },
    { key: 'status', header: 'Status', width: 16, format: 'status' as const },
  ],
};

describe('field payments Excel report', () => {
  it('builds a branded, filter-aware workbook with formatted rows and totals', () => {
    const { worksheet, filename, headerRowNumber } = buildFieldPaymentsWorkbook({
      ...baseOptions,
      rows: [{
        number: 1,
        enumerator: 'Amina Ahmed',
        paid: 5000,
        paidDate: '2026-08-19T08:00:00.000Z',
        status: 'Paid',
      }],
    });

    expect(worksheet.name).toBe('Transport Advances');
    expect(worksheet.getCell('A1').value).toBe('PACT Command Center');
    expect(worksheet.getCell('A2').value).toBe('Transport Advances Report');
    expect(worksheet.getCell('A4').value).toContain('State: Khartoum');
    expect(worksheet.getCell('A4').value).toContain('Enumerator: Amina Ahmed');
    expect(worksheet.getRow(headerRowNumber).values).toContain('Paid Amount');

    const dataRow = worksheet.getRow(headerRowNumber + 1);
    expect(dataRow.getCell(2).value).toBe('Amina Ahmed');
    expect(dataRow.getCell(3).value).toBe(5000);
    expect(dataRow.getCell(3).numFmt).toContain('SDG');
    expect(dataRow.getCell(4).value).toBeInstanceOf(Date);

    const totalRow = worksheet.getRow(headerRowNumber + 2);
    expect(totalRow.getCell(1).value).toBe('TOTAL');
    expect(totalRow.getCell(3).value).toBe(5000);
    expect(worksheet.views[0]).toMatchObject({ state: 'frozen', ySplit: headerRowNumber });
    expect(worksheet.autoFilter).toBeTruthy();
    expect(filename).toMatch(/^field-payments-transport-advances-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('creates a valid formatted report when no records match', () => {
    const { worksheet, headerRowNumber } = buildFieldPaymentsWorkbook({
      ...baseOptions,
      rows: [],
    });

    expect(worksheet.getRow(headerRowNumber + 1).getCell(1).value)
      .toBe('No records match the selected filters.');
    expect(worksheet.getRow(headerRowNumber).getCell(1).value).toBe('#');
    expect(worksheet.getRow(headerRowNumber).getCell(5).value).toBe('Status');
  });
});