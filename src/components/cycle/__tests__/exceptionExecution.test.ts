import { describe, expect, it } from 'vitest';
import type { ExceptionDecision } from '../CycleCloseWizard';
import {
  allExceptionActionsExecuted,
  canExecuteExceptionDecision,
  getAvailableExceptionDecisionValues,
  getExceptionDecisionKey,
  isExceptionDecisionDraftValid,
} from '../exceptionExecution';

const site = { advancePaid: 1_000, requestedAmount: 1_200 };

const valid = (decision: ExceptionDecision) =>
  isExceptionDecisionDraftValid(site, decision);

describe('isExceptionDecisionDraftValid', () => {
  it('requires actual recovery evidence for Return', () => {
    const decision: ExceptionDecision = {
      decision: 'return',
      amount: 1_000,
      justification: 'Cash received and counted by Finance.',
      receiptReference: 'RCT-100',
      returnMethod: 'cash',
      recoveryDate: '2026-08-19',
    };

    expect(valid(decision)).toBe(true);
    expect(valid({ ...decision, receiptReference: '' })).toBe(false);
    expect(valid({ ...decision, amount: 999 })).toBe(false);
  });

  it('requires a full amount and justification for write-off', () => {
    expect(valid({ decision: 'writeoff', amount: 1_000, justification: 'Approved resolution.' })).toBe(true);
    expect(valid({ decision: 'writeoff', amount: 500, justification: 'Partial.' })).toBe(false);
    expect(valid({ decision: 'writeoff', amount: 1_000, justification: ' ' })).toBe(false);
  });

  it('requires an eligible target as well as the full advance for a redirect', () => {
    expect(valid({
      decision: 'redirect',
      amount: 1_000,
      targetSiteId: 'covered-site',
      justification: 'Confirmed work on the covered site.',
    })).toBe(true);
    expect(valid({
      decision: 'redirect',
      amount: 1_000,
      justification: 'No target.',
    })).toBe(false);
    expect(valid({
      decision: 'redirect',
      amount: 500,
      targetSiteId: 'covered-site',
      justification: 'Partial advance is not fully resolved.',
    })).toBe(false);
  });

  it.each(['writeoff'] as const)(
    'requires a full amount and justification for %s',
    decision => {
      expect(valid({ decision, amount: 1_000, justification: 'Approved resolution.' })).toBe(true);
      expect(valid({ decision, amount: 500, justification: 'Partial.' })).toBe(false);
      expect(valid({ decision, amount: 1_000, justification: ' ' })).toBe(false);
    },
  );

  it.each(['roll', 'hold'] as const)(
    'requires a target cycle, target site, and justification for %s',
    decision => {
      const complete: ExceptionDecision = {
        decision,
        targetMmpId: 'target-mmp',
        targetSiteId: 'target-site',
        justification: 'Move to the confirmed next-cycle assignment.',
      };
      expect(valid(complete)).toBe(true);
      expect(valid({ ...complete, targetSiteId: undefined })).toBe(false);
    },
  );

  it('validates Cancel, Reduce, and Reassign details', () => {
    expect(valid({ decision: 'cancel', justification: 'No disbursement was made.' })).toBe(true);
    expect(valid({ decision: 'cancel', justification: '' })).toBe(false);

    expect(valid({ decision: 'reduce', amount: 800 })).toBe(true);
    expect(valid({ decision: 'reduce', amount: 1_200 })).toBe(false);
    expect(valid({ decision: 'reduce', amount: 0 })).toBe(false);

    expect(valid({ decision: 'reassign', targetSiteId: 'covered-site' })).toBe(true);
    expect(valid({ decision: 'reassign' })).toBe(false);
  });
});

describe('exception execution roles', () => {
  it('gives FOM, Admin, and Super Admin every action', () => {
    const decisions: ExceptionDecision['decision'][] = [
      'roll', 'return', 'writeoff', 'redirect',
      'cancel', 'hold', 'reassign', 'reduce',
    ];

    for (const decision of decisions) {
      expect(canExecuteExceptionDecision({ isFOM: true }, decision)).toBe(true);
      expect(canExecuteExceptionDecision({ isAdmin: true }, decision)).toBe(true);
      expect(canExecuteExceptionDecision({ isSuperAdmin: true }, decision)).toBe(true);
    }
  });

  it('limits Finance to Return and Redirect', () => {
    expect(canExecuteExceptionDecision({ isFinance: true }, 'return')).toBe(true);
    expect(canExecuteExceptionDecision({ isFinance: true }, 'redirect')).toBe(true);
    expect(canExecuteExceptionDecision({ isFinance: true }, 'writeoff')).toBe(false);
    expect(canExecuteExceptionDecision({ isFinance: true }, 'roll')).toBe(false);
    expect(canExecuteExceptionDecision({ isFinance: true }, 'cancel')).toBe(false);
  });
});

describe('allExceptionActionsExecuted', () => {
  it('blocks when any decision is only selected or has failed', () => {
    expect(allExceptionActionsExecuted({
      a: { decision: 'cancel', executed: true },
      b: { decision: 'return', executed: false, executionError: 'GL account missing' },
    })).toBe(false);
  });

  it('passes only when every action succeeded', () => {
    expect(allExceptionActionsExecuted({
      a: { decision: 'cancel', executed: true },
      b: { decision: 'return', executed: true, journalEntryId: 'journal-id' },
    })).toBe(true);
  });
});

describe('advance-scoped exception identity and choices', () => {
  it('keeps two active advances on one site independently keyed', () => {
    const first = { siteId: 'same-site', advanceId: 'advance-1' };
    const second = { siteId: 'same-site', advanceId: 'advance-2' };

    expect(getExceptionDecisionKey(first)).toBe('advance-1');
    expect(getExceptionDecisionKey(second)).toBe('advance-2');
    expect(getExceptionDecisionKey(first)).not.toBe(getExceptionDecisionKey(second));
  });

  it('keeps unassigned paid advances resolvable without offering transfer actions', () => {
    expect(getAvailableExceptionDecisionValues({
      advanceStatus: 'paid',
      enumeratorId: undefined,
    })).toEqual(['return', 'writeoff']);
  });

  it('offers paid reassignment and redirect only when an enumerator can be verified', () => {
    expect(getAvailableExceptionDecisionValues({
      advanceStatus: 'paid',
      enumeratorId: 'enumerator-id',
    })).toEqual(['reassign', 'roll', 'return', 'writeoff', 'redirect']);
  });

  it('keeps unassigned approved advances resolvable through cancel or reduce only', () => {
    expect(getAvailableExceptionDecisionValues({
      advanceStatus: 'approved',
      enumeratorId: undefined,
    })).toEqual(['cancel', 'reduce']);
  });
});