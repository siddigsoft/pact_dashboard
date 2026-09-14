import { describe, expect, it, vi } from 'vitest';
import type { DownPaymentRequest } from '@/types/down-payment';
import { exportToExcel, filterDownPayments, getDownPaymentStats, matchesDownPaymentHub } from './downPaymentExport';

const { exportStandardExcelMock } = vi.hoisted(() => ({
  exportStandardExcelMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/standardExcelExport', () => ({
  exportStandardExcel: exportStandardExcelMock,
}));

function requestAt(requestedAt: string): DownPaymentRequest {
  return {
    id: requestedAt,
    status: 'approved',
    siteName: 'Test site',
    requestedAt,
    requestedAmount: 100,
  } as DownPaymentRequest;
}

describe('filterDownPayments', () => {
  it('keeps an Al Gezira request under Kassala Hub when its copied request hub is stale', () => {
    expect(matchesDownPaymentHub({
      hubId: 'stale-hub',
      hubName: 'Old Hub Name',
      stateName: 'Al Gezira',
    }, 'Kassala Hub')).toBe(true);
  });

  it('includes the entire selected end date', () => {
    const requests = [
      requestAt('2026-09-14T00:00:00'),
      requestAt('2026-09-14T18:30:00'),
      requestAt('2026-09-15T00:00:00'),
    ];

    expect(filterDownPayments(requests, { dateTo: '2026-09-14' }).map(request => request.id)).toEqual([
      '2026-09-14T00:00:00',
      '2026-09-14T18:30:00',
    ]);
  });
});

describe('getDownPaymentStats', () => {
  it('includes recorded waiting-confirmation payments when evidence is provided', () => {
    const row = requestAt('2026-09-14T00:00:00');
    row.status = 'paid';
    row.approvedAmount = 100;
    row.totalPaidAmount = 95;
    const stats = getDownPaymentStats([row], undefined, new Map([
      [row.id, [{ paymentAmount: 25, historyStatus: 'active' }]],
    ]));
    expect(stats.amounts).toMatchObject({
      totalApproved: 100,
      totalPaid: 95,
      totalRemaining: 5,
    });
  });
});

describe('exportToExcel', () => {
  it('lists approved unpaid requests and breaks them down by state and site status', async () => {
    exportStandardExcelMock.mockClear();
    const row = requestAt('2026-09-14T00:00:00');
    Object.assign(row, {
      id: 'approved-kassala',
      stateName: 'Kassala',
      siteCompletionStatus: 'completed',
      totalTransportationBudget: 100,
      approvedAmount: 100,
      totalPaidAmount: 0,
      paymentType: 'full_advance',
    });

    await exportToExcel([row], 'down-payments', 'All');

    const report = exportStandardExcelMock.mock.calls[0][0];
    const remainingIndex = report.mainSheet.headers.indexOf('Remaining (SDG)');
    const explanationIndex = report.mainSheet.headers.indexOf('Remaining Includes');
    const coverageIndex = report.mainSheet.headers.indexOf('Site Coverage');
    expect(report.mainSheet.rows).toHaveLength(1);
    expect(report.mainSheet.rows[0][remainingIndex]).toBe(100);
    expect(report.mainSheet.rows[0][explanationIndex]).toContain('Approved but unpaid');
    expect(report.mainSheet.rows[0][coverageIndex]).toBe('Covered / Completed');

    const stateSheet = report.breakdownSheets.find((sheet: { sheetName: string }) => sheet.sheetName === 'By State & Status');
    expect(stateSheet.rows).toContainEqual(['Kassala', 'Approved', 1, 100, 100, 0, 100]);

    const siteSheet = report.breakdownSheets.find((sheet: { sheetName: string }) => sheet.sheetName === 'By Site Status');
    expect(siteSheet.rows).toContainEqual(['Kassala', 'Covered / Completed', 'Completed', 1, 100, 100, 0, 100]);
  });
});