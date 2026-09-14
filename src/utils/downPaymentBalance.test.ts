import { describe, expect, it } from 'vitest';
import type { DownPaymentRequest } from '@/types/down-payment';
import {
  classifyDownPaymentStatus,
  getCanonicalDownPaymentStatus,
  getDownPaymentBalance,
  isDownPaymentClosedStatus,
  isDownPaymentSettledStatus,
} from './downPaymentBalance';

function request(status: string, values: Partial<DownPaymentRequest> = {}): DownPaymentRequest {
  return {
    id: status,
    status: status as DownPaymentRequest['status'],
    requestedAmount: 100,
    approvedAmount: 100,
    totalPaidAmount: 0,
    ...values,
  } as DownPaymentRequest;
}

describe('down-payment balance policy', () => {
  it.each([
    ['pending_supervisor', 'pending'],
    ['pending_admin', 'pending'],
    ['approved', 'approved'],
    ['partially_paid', 'approved'],
    ['fully_paid', 'settled'],
    ['paid', 'settled'],
    ['reconciled', 'settled'],
    ['completed', 'settled'],
    ['closed', 'settled'],
    ['rejected', 'closed'],
    ['cancelled', 'closed'],
    ['deleted', 'deleted'],
    ['something_new', 'unknown'],
  ])('classifies %s as %s', (status, classification) => {
    expect(classifyDownPaymentStatus(status)).toBe(classification);
  });

  it('retains every legacy status in canonical normalization', () => {
    expect(getCanonicalDownPaymentStatus('deleted')).toBe('deleted');
    expect(getCanonicalDownPaymentStatus('paid')).toBe('paid');
    expect(getCanonicalDownPaymentStatus('not_a_status')).toBe('unknown');
    expect(['fully_paid', 'paid', 'reconciled', 'completed', 'closed'].every(isDownPaymentSettledStatus)).toBe(true);
    expect(isDownPaymentClosedStatus('rejected')).toBe(true);
    expect(isDownPaymentClosedStatus('cancelled')).toBe(true);
    expect(isDownPaymentClosedStatus('closed')).toBe(false);
  });

  it('clamps remaining per row, including an overpaid row', () => {
    expect(getDownPaymentBalance(request('partially_paid', {
      approvedAmount: 50,
      totalPaidAmount: 80,
    }))).toMatchObject({ approved: 50, paid: 80, remaining: 0 });
  });

  it.each(['rejected', 'cancelled', 'deleted'])('excludes %s from financial totals', status => {
    expect(getDownPaymentBalance(request(status, {
      approvedAmount: 90,
      totalPaidAmount: 80,
    }))).toMatchObject({ approved: 0, paid: 0, remaining: 0 });
  });

  it('includes waiting-confirmation payments when confirmed immutable links are lower', () => {
    const balance = getDownPaymentBalance(
      request('paid', { totalPaidAmount: 999 }),
      [
        { paymentAmount: 40, historyStatus: 'active' },
        { paymentAmount: 20, historyStatus: 'reversed' },
      ],
    );
    expect(balance).toMatchObject({
      approved: 100,
      paid: 999,
      remaining: 0,
      paymentBasis: 'legacy_source_total',
      reconciliationRequired: false,
    });
  });

  it('retains an active-link basis on enriched rows used by grouped/export views', () => {
    expect(getDownPaymentBalance(request('paid', {
      totalPaidAmount: 40,
      paymentEvidenceSource: 'active_immutable_links',
    }))).toMatchObject({
      paid: 40,
      paymentBasis: 'legacy_source_total',
      reconciliationRequired: false,
    });
  });

  it('accepts recorded payments without confirmation evidence but flags an unpaid settled row', () => {
    expect(getDownPaymentBalance(request('approved', { totalPaidAmount: 20 }))).toMatchObject({
      paymentBasis: 'legacy_source_total',
      reconciliationRequired: false,
    });
    expect(getDownPaymentBalance(request('completed'))).toMatchObject({
      paymentBasis: 'no_payment_evidence',
      reconciliationRequired: true,
    });
  });

  it('keeps an approved unpaid entitlement fully outstanding', () => {
    expect(getDownPaymentBalance(request('approved', {
      approvedAmount: 75,
      totalPaidAmount: 0,
    }))).toMatchObject({ approved: 75, paid: 0, remaining: 75 });
  });

  it('counts all recorded payments regardless of confirmation evidence', () => {
    expect(getDownPaymentBalance(request('partially_paid', {
      approvedAmount: 100,
      totalPaidAmount: 99,
    }), [{ paymentAmount: 35, historyStatus: 'active' }]))
      .toMatchObject({ approved: 100, paid: 99, remaining: 1, reconciliationRequired: false });
  });

  it('shows zero remaining when a settled legacy total equals the approved amount', () => {
    expect(getDownPaymentBalance(request('fully_paid', {
      approvedAmount: 100,
      totalPaidAmount: 100,
    }))).toMatchObject({ approved: 100, paid: 100, remaining: 0, paymentBasis: 'legacy_source_total' });
  });

  it('does not let a settled status hide an unpaid recorded balance', () => {
    expect(getDownPaymentBalance(request('fully_paid', {
      approvedAmount: 100,
      totalPaidAmount: 0,
    }))).toMatchObject({
      approved: 100,
      paid: 0,
      remaining: 100,
      paymentBasis: 'no_payment_evidence',
      reconciliationRequired: true,
    });
  });

  it('uses immutable evidence when an older row has no recorded payment total', () => {
    expect(getDownPaymentBalance(request('fully_paid', {
      approvedAmount: 100,
    }), [{ paymentAmount: 80, historyStatus: 'active' }]))
      .toMatchObject({ approved: 100, paid: 80, remaining: 20, reconciliationRequired: false });
  });

  it('matches the screenshot invariant of two approved and 41 settled rows', () => {
    const rows = [
      request('approved', { requestedAmount: 75_000, approvedAmount: 75_000, totalPaidAmount: 0 }),
      request('approved', { requestedAmount: 75_000, approvedAmount: 75_000, totalPaidAmount: 0 }),
      ...Array.from({ length: 41 }, (_, index) => request('completed', {
        id: `settled-${index}`,
        requestedAmount: 3_020_000 / 41,
        approvedAmount: 3_020_000 / 41,
        totalPaidAmount: 3_020_000 / 41,
      })),
    ];
    const balances = rows.map(row => getDownPaymentBalance(row));
    expect(rows).toHaveLength(43);
    expect(rows.filter(row => row.status === 'approved')).toHaveLength(2);
    expect(rows.filter(row => isDownPaymentSettledStatus(row.status))).toHaveLength(41);
    expect(balances.reduce((sum, row) => sum + row.approved, 0)).toBeCloseTo(3_170_000);
    expect(balances.reduce((sum, row) => sum + row.paid, 0)).toBeCloseTo(3_020_000);
    expect(balances.reduce((sum, row) => sum + row.remaining, 0)).toBeCloseTo(150_000);
  });
});