import { describe, expect, it } from 'vitest';
import {
  buildAutomaticRedirectAllocations,
  buildRedirectAllocationTrace,
  buildRedirectPaymentTrace,
  canReassignToTarget,
  getRedirectSettlement,
  isCoveredRedirectTarget,
  resolveFeeAdvanceDeduction,
  summarizeRedirectAllocations,
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

  it('fully settles one site and partially settles a second site', () => {
    const targets = [
      { ...coveredTarget, siteName: 'Site A', sameEnumerator: true },
      {
        ...coveredTarget,
        id: 'covered-site-b',
        siteName: 'Site B',
        enumeratorFee: 50_000,
        sameEnumerator: true,
      },
    ];
    const allocations = buildAutomaticRedirectAllocations('source-site', targets, 80_000);
    const summary = summarizeRedirectAllocations('source-site', targets, allocations, 80_000);

    expect(allocations).toEqual([
      expect.objectContaining({ targetSiteId: 'covered-site', amount: 70_000 }),
      expect.objectContaining({ targetSiteId: 'covered-site-b', amount: 10_000 }),
    ]);
    expect(summary.isComplete).toBe(true);
    expect(summary.allocations).toEqual([
      expect.objectContaining({ status: 'paid', remainingFee: 0 }),
      expect.objectContaining({ status: 'partially_paid', remainingFee: 40_000 }),
    ]);
  });

  it('rejects duplicate, over-capacity, and over-total allocations', () => {
    expect(summarizeRedirectAllocations('source-site', [coveredTarget], [
      { targetSiteId: 'covered-site', amount: 40_000 },
      { targetSiteId: 'covered-site', amount: 40_000 },
    ], 80_000).isComplete).toBe(false);

    const overCapacity = summarizeRedirectAllocations('source-site', [coveredTarget], [
      { targetSiteId: 'covered-site', amount: 70_001 },
    ], 70_001);
    expect(overCapacity.errors.join(' ')).toContain('exceeds the remaining fee');

    const overTotal = summarizeRedirectAllocations('source-site', [coveredTarget], [
      { targetSiteId: 'covered-site', amount: 70_000 },
    ], 60_000);
    expect(overTotal.errors.join(' ')).toContain('exceed the paid advance');
  });

  it('keeps every target and original payment reference in the allocation trace', () => {
    const targets = [
      { ...coveredTarget, siteName: 'Site A', sameEnumerator: true },
      { ...coveredTarget, id: 'covered-site-b', siteName: 'Site B', sameEnumerator: false },
    ];
    const summary = summarizeRedirectAllocations('source-site', targets, [
      { targetSiteId: 'covered-site', amount: 70_000 },
      { targetSiteId: 'covered-site-b', amount: 1_000 },
    ], 71_000);
    const trace = buildRedirectAllocationTrace({
      advanceId: 'advance-1',
      paymentReferences: ['wallet-1'],
      allocations: summary.allocations,
      journalEntryId: 'journal-1',
    });

    expect(trace.originalPaymentReferences).toEqual(['wallet-1']);
    expect(trace.totalAllocatedAmount).toBe(71_000);
    expect(trace.allocations).toHaveLength(2);
    expect(summary.hasCrossEnumerator).toBe(true);
  });

  it('does not blend a target-site advance into an already-posted redirect offset', () => {
    expect(resolveFeeAdvanceDeduction({
      grossFee: 50_000,
      activeTargetAdvance: 20_000,
      recordedAdvanceOffset: 10_000,
      hasRedirectAllocation: true,
    })).toBe(10_000);

    expect(resolveFeeAdvanceDeduction({
      grossFee: 50_000,
      activeTargetAdvance: 20_000,
      recordedAdvanceOffset: 0,
      hasRedirectAllocation: false,
    })).toBe(20_000);
  });
});