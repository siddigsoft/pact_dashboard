import { describe, expect, it } from 'vitest';
import { projectFinancialSummary } from './projectFinancialReporting';
import { isOperationalCostFinallyApproved } from './operationalCostApproval';
describe('project financial report basis', () => {
  it.each([
    ['Coordinator', { tier1_status: 'approved', tier2_status: 'approved', tier3_status: 'approved', tier4_status: 'pending' }],
    ['Supervisor', { tier1_status: 'approved', tier2_status: 'approved', tier3_status: 'pending' }],
    ['FOM', { tier1_status: 'approved', tier2_status: 'pending' }],
  ])('does not promote partial %s approvals', (submitter_role, tiers) => {
    expect(isOperationalCostFinallyApproved({ submitter_role, status: 'approved', ...tiers })).toBe(false);
  });
  it('uses the final applicable tier and ignores unused poisoned defaults', () => {
    expect(isOperationalCostFinallyApproved({ submitter_role: 'Country Director', tier1_status: 'approved', tier2_status: 'pending', tier4_status: 'pending' })).toBe(true);
    expect(isOperationalCostFinallyApproved({ submitter_role: 'FOM', tier1_status: 'approved', tier2_status: 'approved', tier4_status: 'pending' })).toBe(true);
    expect(isOperationalCostFinallyApproved({ submitter_role: 'Supervisor', tier1_status: 'approved', tier2_status: 'approved', tier3_status: 'approved', tier4_status: 'pending' })).toBe(true);
  });
  it('excludes cancelled or rejected costs even when an approval exists', () => {
    expect(isOperationalCostFinallyApproved({ status: 'cancelled', tier2_status: 'approved' })).toBe(false);
    expect(isOperationalCostFinallyApproved({ tier1_status: 'rejected', tier2_status: 'approved' })).toBe(false);
  });
  it('keeps approved costs, advances and funding separate, without adding a spend total', () => {
    const summary = projectFinancialSummary([
      { amount_cents: 10000, currency: 'SDG', tier2_status: 'approved' },
      { amount_cents: 5000, currency: 'USD', tier2_status: 'approved' },
      { amount_cents: 3000, currency: 'SDG', tier1_status: 'approved', tier2_status: 'pending' },
    ], [{ currency: 'SDG', total_paid_amount: 100 }], [{ currency: 'SDG', paid_amount: 100 }], 'SDG');
    expect(summary.approvedCostCents).toBe(10000);
    expect(summary.advancesPaid).toBe(100);
    expect(summary.fundingDisbursed).toBe(100);
    expect(summary).not.toHaveProperty('totalSpent');
    expect(summary.currencies).toEqual(['SDG', 'USD']);
  });
  it('does not invent a currency for legacy payments', () => {
    const summary = projectFinancialSummary([], [{ total_paid_amount: 50 }], [{ paid_amount: 30 }], 'UGX');
    expect(summary.advancesPaid).toBeNull();
    expect(summary.fundingDisbursed).toBeNull();
  });
  it('normalizes explicit currency codes but never converts amounts', () => {
    const summary = projectFinancialSummary([], [{ total_paid_amount: 4, currency: ' ugx ' }], [{ paid_amount: 90, currency: 'USD' }], 'UGX');
    expect(summary.advancesPaid).toBe(4); expect(summary.fundingDisbursed).toBe(0);
  });
});
