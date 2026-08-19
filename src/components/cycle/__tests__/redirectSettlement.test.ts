import { describe, expect, it } from 'vitest';
import {
  buildRedirectPaymentTrace,
  canReassignToTarget,
  getRedirectSettlement,
  isCoveredRedirectTarget,
} from '../redirectSettlement';

describe('Cycle Close redirect fee settlement', () => {
  const coveredTarget = {
    id: 'covered-site',
    status: 'covered',
    enumeratorFee: 70_000,
    transportFee: 0,
    settledFeeAmount: 0,
  };

  it('records a smaller advance as a partial fee settlement', () => {
    expect(getRedirectSettlement(coveredTarget, 1_000)).toEqual({
      grossFee: 70_000,
      priorSettled: 0,
      appliedAmount: 1_000,
      remainingFee: 69_000,
      status: 'partially_paid',
    });
  });

  it('marks an exact settlement as fully paid', () => {
    expect(getRedirectSettlement(coveredTarget, 70_000)).toMatchObject({
      appliedAmount: 70_000,
      remainingFee: 0,
      status: 'paid',
    });
  });

  it('does not allow an advance to over-credit the eligible fee', () => {
    expect(isCoveredRedirectTarget('source-site', coveredTarget, 70_001)).toBe(false);
    expect(getRedirectSettlement(coveredTarget, 70_001).appliedAmount).toBe(70_000);
  });

  it('excludes the not-covered source and every not-covered target', () => {
    expect(isCoveredRedirectTarget('covered-site', coveredTarget, 1_000)).toBe(false);
    expect(isCoveredRedirectTarget('source-site', {
      ...coveredTarget,
      id: 'not-covered-site',
      status: 'not_covered',
    }, 1_000)).toBe(false);
  });

  it('only allows reassignment to a different covered target', () => {
    expect(canReassignToTarget('source-site', coveredTarget)).toBe(true);
    expect(canReassignToTarget('source-site', { id: 'source-site', status: 'covered' })).toBe(false);
    expect(canReassignToTarget('source-site', { id: 'other-site', status: 'not_covered' })).toBe(false);
  });

  it('keeps the original payment references in the redirect trace', () => {
    const settlement = getRedirectSettlement(coveredTarget, 1_000);
    expect(buildRedirectPaymentTrace({
      advanceId: 'advance-1',
      paymentReferences: ['wallet-transaction-1'],
      targetSiteId: 'covered-site',
      settlement,
      journalEntryId: 'journal-1',
    })).toMatchObject({
      sourceAdvanceId: 'advance-1',
      originalPaymentReferences: ['wallet-transaction-1'],
      targetSiteId: 'covered-site',
      feeRemainingAmount: 69_000,
      journalEntryId: 'journal-1',
    });
  });
});