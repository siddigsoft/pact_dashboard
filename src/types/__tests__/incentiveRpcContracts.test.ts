import { describe, expect, it } from 'vitest';
import {
  buildIncentivePreapprovalArgs,
  buildPayMmpIncentiveArgs,
  CONFIGURABLE_INCENTIVE_ROLES,
} from '../incentive';

describe('incentive RPC contracts', () => {
  it('limits editable settings to roles supported by the calculator UI', () => {
    expect(CONFIGURABLE_INCENTIVE_ROLES).toEqual(['coordinator', 'supervisor']);
    expect(CONFIGURABLE_INCENTIVE_ROLES).not.toContain('datacollector');
    expect(CONFIGURABLE_INCENTIVE_ROLES).not.toContain('fom');
    expect(CONFIGURABLE_INCENTIVE_ROLES).not.toContain('teamleader');
  });

  it('sends only the MMP identity and noted exclusions for preapproval', () => {
    expect(buildIncentivePreapprovalArgs('mmp-1', [{
      user_id: 'user-1',
      role: 'coordinator',
      note: '  Ineligible for this cycle  ',
    }])).toEqual({
      p_mmp_id: 'mmp-1',
      p_exclusions: [{
        user_id: 'user-1',
        role: 'coordinator',
        note: 'Ineligible for this cycle',
      }],
    });
  });

  it('requires a note for every exclusion', () => {
    expect(() => buildIncentivePreapprovalArgs('mmp-1', [{
      user_id: 'user-1',
      role: 'coordinator',
      note: '   ',
    }])).toThrow('A note is required');
  });

  it('builds the canonical wallet and payroll settlement inputs', () => {
    expect(buildPayMmpIncentiveArgs('payment-1', 'wallet', '2026-09')).toEqual({
      p_payment_id: 'payment-1',
      p_method: 'wallet',
      p_payroll_run_id: null,
      p_payroll_period: null,
    });
    expect(buildPayMmpIncentiveArgs('payment-2', 'payroll', '2026-09')).toEqual({
      p_payment_id: 'payment-2',
      p_method: 'payroll',
      p_payroll_run_id: null,
      p_payroll_period: '2026-09',
    });
  });
});