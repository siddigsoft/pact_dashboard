import type { ExceptionDecision } from './CycleCloseWizard';

export interface ExceptionAmounts {
  advancePaid: number;
  requestedAmount: number;
}

export interface ExceptionExecutorFlags {
  isFinance?: boolean;
  isFOM?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export interface ExceptionAdvanceIdentity {
  advanceId: string;
  advanceStatus: 'paid' | 'fully_paid' | 'partially_paid' | 'approved';
  enumeratorId?: string;
}

export function getExceptionDecisionKey(exception: Pick<ExceptionAdvanceIdentity, 'advanceId'>): string {
  return exception.advanceId;
}

export function getAvailableExceptionDecisionValues(
  exception: Pick<ExceptionAdvanceIdentity, 'advanceStatus' | 'enumeratorId'>,
): ExceptionDecision['decision'][] {
  if (exception.advanceStatus === 'approved') {
    return exception.enumeratorId
      ? ['cancel', 'hold', 'reassign', 'reduce']
      : ['cancel', 'reduce'];
  }
  return exception.enumeratorId
    ? ['reassign', 'roll', 'return', 'writeoff', 'redirect']
    : ['return', 'writeoff'];
}

export function isExceptionDecisionDraftValid(
  site: ExceptionAmounts,
  decision: ExceptionDecision | undefined,
): boolean {
  if (!decision?.decision) return false;

  switch (decision.decision) {
    case 'return':
      return decision.amount === site.advancePaid
        && !!decision.justification?.trim()
        && !!decision.receiptReference?.trim()
        && !!decision.returnMethod
        && !!decision.recoveryDate;
    case 'writeoff':
      return decision.amount === site.advancePaid
        && !!decision.justification?.trim();
    case 'redirect':
      // A redirect settles the complete disbursed advance against a different
      // covered site's outstanding enumerator fee. The server caps the fee
      // settlement and rejects a target with insufficient outstanding fee.
      return decision.amount === site.advancePaid
        && !!decision.targetSiteId
        && !!decision.justification?.trim();
    case 'roll':
    case 'hold':
      return !!decision.targetMmpId
        && !!decision.targetSiteId
        && !!decision.justification?.trim();
    case 'cancel':
      return !!decision.justification?.trim();
    case 'reduce':
      return (decision.amount ?? 0) > 0
        && (decision.amount ?? 0) < site.requestedAmount;
    case 'reassign':
      return !!decision.targetSiteId;
    default:
      return false;
  }
}

export function canExecuteExceptionDecision(
  flags: ExceptionExecutorFlags,
  decision: ExceptionDecision['decision'] | undefined,
): boolean {
  if (!decision) return false;
  if (flags.isSuperAdmin || flags.isAdmin || flags.isFOM) return true;
  return !!flags.isFinance && (decision === 'return' || decision === 'redirect');
}

export function allExceptionActionsExecuted(
  decisions: Record<string, ExceptionDecision>,
): boolean {
  return Object.values(decisions).every(decision => decision.executed === true);
}