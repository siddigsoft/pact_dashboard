/**
 * rewardCalc — task reward deductions calculation.
 *
 * Mirrors the salary deductions pattern in src/pages/Payroll.tsx:212-228
 * so the same numbers appear in:
 *   - the task create / edit forms
 *   - the StartTaskDialog (acknowledge step)
 *   - the Completion Reward editor on the task detail
 *   - the RewardApprovalsPanel
 *   - the TaskAdmin Payroll Calculation Panel
 *   - the employee Payroll page task table
 *   - the credit-task-reward edge function (mirrors compute_reward_net SQL RPC)
 *
 * Keep this file dependency-free so it can be imported from anywhere.
 */

export type RewardDeductionType = 'fixed' | 'percent';

export interface RewardDeduction {
  name: string;
  type: RewardDeductionType;
  /** For 'fixed': absolute amount in the task currency.
   *  For 'percent': percentage of the gross reward (0-100). */
  amount: number;
}

export interface RewardDeductionComputed extends RewardDeduction {
  /** The final money amount this line subtracts from the gross. */
  computed: number;
}

export interface RewardBreakdown {
  gross: number;
  deductions: RewardDeductionComputed[];
  dedTotal: number;
  /** max(0, gross - dedTotal) — the amount actually credited to the wallet. */
  net: number;
}

/**
 * Pure calculation. Always returns a fully populated breakdown — even when
 * gross is 0 or deductions is empty / undefined — so callers never have to
 * null-check.
 */
export function computeRewardBreakdown(
  gross: number | null | undefined,
  deductions: RewardDeduction[] | null | undefined,
): RewardBreakdown {
  const g = Math.max(0, Number(gross) || 0);
  const list: RewardDeductionComputed[] = (deductions ?? []).map(d => {
    const amt = Number(d.amount) || 0;
    const computed = d.type === 'percent' ? (g * amt) / 100 : amt;
    return { ...d, amount: amt, computed: round2(computed) };
  });
  const dedTotal = round2(list.reduce((s, d) => s + d.computed, 0));
  const net = Math.max(0, round2(g - dedTotal));
  return { gross: round2(g), deductions: list, dedTotal, net };
}

/** Validate a single deduction line item. Returns an error message or null. */
export function validateDeduction(d: Partial<RewardDeduction>): string | null {
  if (!d.name || !String(d.name).trim()) return 'Name required';
  if (d.type !== 'fixed' && d.type !== 'percent') return 'Type must be fixed or percent';
  const amt = Number(d.amount);
  if (!Number.isFinite(amt) || amt < 0) return 'Amount must be ≥ 0';
  if (d.type === 'percent' && amt > 100) return 'Percent must be ≤ 100';
  return null;
}

/** Format a money line for emails / PDF — keeps two decimals. */
export function fmtRewardMoney(amount: number, currency: string): string {
  return `${currency} ${(amount ?? 0).toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
