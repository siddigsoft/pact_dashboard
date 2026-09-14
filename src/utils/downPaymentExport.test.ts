import { describe, expect, it } from 'vitest';
import type { DownPaymentRequest } from '@/types/down-payment';
import { filterDownPayments } from './downPaymentExport';

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