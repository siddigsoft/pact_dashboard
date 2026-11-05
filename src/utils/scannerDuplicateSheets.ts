import * as XLSX from 'xlsx-js-style';
import { analyzeTransactionDuplicates, type DuplicateTransaction } from './transactionDuplicates';

/** Shared by all Excel entry points, including saved sessions/account subsets. */
export function appendScannerDuplicateSheets(wb: XLSX.WorkBook, rows: DuplicateTransaction[]) {
  const audit = analyzeTransactionDuplicates(rows);
  const summary = [
    ['Duplicate Review — SDG'],
    ['Basis', 'Repeated non-empty transaction ID; first input occurrence counted once.'],
    ['Important', 'Conflicting amounts/accounts require review. No rows are deleted.'],
    ['Rows including duplicates', rows.length],
    ['Transactions counted once', audit.uniqueCount],
    ['Repeated transaction IDs', audit.duplicateGroups],
    ['Rows in repeated groups (includes first occurrence)', audit.duplicateRows],
    ['Extra duplicate rows excluded from count-once total', audit.extraRows],
    ['Conflicting repeated IDs — review required', audit.conflictGroups],
    ['Total INCLUDING duplicates', audit.total],
    ['Extra duplicate amount', audit.duplicateAmount],
    ['Total WITHOUT extra duplicates (count once)', audit.uniqueTotal],
    [],
    ['To Account', 'Recipient', 'Rows', 'Extra duplicate rows', 'Including duplicates (SDG)', 'Extra duplicate amount (SDG)', 'Count once (SDG)', 'Repeated transaction IDs'],
  ] as (string | number)[][];
  const accounts = new Map<string, typeof audit.details>();
  audit.details.forEach(item => {
    const account = item.row.to_account?.trim() || '(Missing account)';
    accounts.set(account, [...(accounts.get(account) ?? []), item]);
  });
  accounts.forEach((items, account) => {
    const subset = analyzeTransactionDuplicates(items.map(item => item.row));
    // Exclusions must use the global decision, even for conflicting accounts.
    const excluded = items.filter(item => item.extra).reduce((sum, item) =>
      sum + Math.round(Number(String(item.row.amount ?? 0).replace(/,/g, '')) * 100), 0) / 100;
    summary.push([account, [...new Set(items.map(item => item.row.recipient_name || ''))].join(' / '),
      items.length, items.filter(item => item.extra).length, subset.total, excluded,
      Math.round((subset.total - excluded) * 100) / 100,
      [...new Set(items.filter(item => item.occurrences > 1).map(item => item.id))].join(', ')]);
  });
  const review = [
    ['Input row', 'Transaction ID', 'Status', 'Occurrences', 'From Account', 'To Account', 'Recipient', 'Amount (SDG)'],
    ...audit.details.filter(item => item.occurrences > 1).map(item => [
      rows.indexOf(item.row) + 1, item.id, item.status, item.occurrences,
      item.row.from_account || '', item.row.to_account || '', item.row.recipient_name || '',
      Number(String(item.row.amount ?? 0).replace(/,/g, '')),
    ]),
  ];
  for (const [name, values] of [['Duplicate Summary', summary], ['Duplicate Details', review]] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(values as any[][]);
    sheet['!cols'] = [{ wch: 52 }, { wch: 65 }, ...Array(6).fill({ wch: 26 })];
    Object.entries(sheet).forEach(([address, cell]) => {
      if (address.startsWith('!')) return;
      (cell as XLSX.CellObject).s = {
        fill: { patternType: 'solid', fgColor: { rgb: name === 'Duplicate Details' ? 'FFF2CC' : 'F2F6FF' } },
        alignment: { wrapText: true, vertical: 'top' },
        ...(typeof (cell as XLSX.CellObject).v === 'number' ? { numFmt: '#,##0.00' } : {}),
      };
    });
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  return audit;
}
