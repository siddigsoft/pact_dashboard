import { describe, expect, it } from 'vitest';
import type { DownPaymentRequest } from '@/types/down-payment';
import { filterDownPayments, getDownPaymentStats } from './downPaymentExport';

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
  it('uses immutable evidence when an evidence map is provided', () => {
    const row = requestAt('2026-09-14T00:00:00');
    row.status = 'paid';
    row.approvedAmount = 100;
    row.totalPaidAmount = 95;
    const stats = getDownPaymentStats([row], undefined, new Map([
      [row.id, [{ paymentAmount: 25, historyStatus: 'active' }]],
    ]));
    expect(stats.amounts).toMatchObject({
      totalApproved: 100,
      totalPaid: 25,
      totalRemaining: 75,
    });
  });
});