import { isOperationalCostFinallyApproved, type OperationalCostTierInput } from './operationalCostApproval';

interface Cost extends OperationalCostTierInput { amount_cents: number; currency?: string | null }
interface Payment { currency?: string | null; total_paid_amount?: number | null; paid_amount?: number | null }
const currencyCode = (value?: string | null) => value?.trim().toUpperCase() || null;

/** These sources overlap economically: never add funding, advances and approved
 * costs together and call the result actual expenditure. No FX is inferred. */
export function projectFinancialSummary<C extends Cost>(costs: C[], advances: Payment[], funds: Payment[], currency: string) {
  const code = currencyCode(currency);
  const approvedCosts = costs.filter(cost => currencyCode(cost.currency) === code && isOperationalCostFinallyApproved(cost));
  const paid = (rows: Payment[], field: 'total_paid_amount' | 'paid_amount') => {
    if (rows.some(row => Number(row[field] ?? 0) !== 0 && !currencyCode(row.currency))) return null;
    return rows.filter(row => currencyCode(row.currency) === code).reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  };
  const currencies = [...new Set([...costs, ...advances, ...funds].map(row => currencyCode(row.currency)).filter(Boolean))];
  return {
    approvedCosts, approvedCostCents: approvedCosts.reduce((sum, cost) => sum + Number(cost.amount_cents), 0),
    advancesPaid: paid(advances, 'total_paid_amount'), fundingDisbursed: paid(funds, 'paid_amount'),
    currencies,
  };
}
