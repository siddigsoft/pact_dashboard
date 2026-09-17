import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIONS, DEFAULT_ROLE_PERMISSIONS } from '@/types/roles';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';

describe('Pre-Fund payment permissions', () => {
  it('preserves intended recruitment, survey, and self-service defaults', () => {
    const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, resource: string, action: string) =>
      DEFAULT_ROLE_PERMISSIONS[role].some(p => p.resource === resource && p.action === action);
    expect(has('Admin', 'hr', 'create')).toBe(true);
    expect(has('Admin', 'hr', 'approve')).toBe(true);
    expect(has('Admin', 'surveys', 'status')).toBe(true);
    expect(has('Field Operation Manager (FOM)', 'surveys', 'status')).toBe(true);
    expect(has('FinancialAdmin', 'hr', 'create')).toBe(false);
    expect(has('Supervisor', 'leave', 'create')).toBe(true);
    expect(has('Coordinator', 'benefits', 'submit')).toBe(true);
  });

  it('keeps payment actions distinct from approval and page access', () => {
    expect(ACTIONS).toEqual(expect.arrayContaining(['mark_paid', 'use_for_payment']));
    expect(DEFAULT_ROLE_PERMISSIONS.Admin).toEqual(expect.arrayContaining([
      { resource: 'cost_submissions', action: 'mark_paid' },
      { resource: 'pre_funding', action: 'use_for_payment' },
    ]));
    expect(DEFAULT_ROLE_PERMISSIONS.FinancialAdmin).toEqual(expect.arrayContaining([
      { resource: 'cost_submissions', action: 'mark_paid' },
      { resource: 'pre_funding', action: 'use_for_payment' },
    ]));
    expect(DEFAULT_ROLE_PERMISSIONS.Admin).toEqual(expect.arrayContaining([
      { resource: 'down_payments', action: 'mark_paid' },
      { resource: 'pre_funding', action: 'use_for_payment' },
    ]));
    expect(DEFAULT_ROLE_PERMISSIONS.FinancialAdmin).toEqual(expect.arrayContaining([
      { resource: 'down_payments', action: 'mark_paid' },
      { resource: 'pre_funding', action: 'use_for_payment' },
    ]));
    expect(DEFAULT_ROLE_PERMISSIONS['Field Operation Manager (FOM)']).not.toEqual(expect.arrayContaining([
      { resource: 'down_payments', action: 'mark_paid' },
    ]));
  });

  it('exposes both capabilities in unified Buttons & Actions registry', () => {
    const actions = MODULE_REGISTRY
      .flatMap(module => module.pages)
      .flatMap(page => page.actions);
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'cost_submissions:mark_paid' }),
      expect.objectContaining({ key: 'pre_funding:use_for_payment' }),
      expect.objectContaining({ key: 'down_payments:mark_paid', label: 'Make Down Payment Payment' }),
    ]));
  });

  it('limits the former Field Assistant payment grant to Kassala supervisors', () => {
    const originalMigration = readFileSync(
      `${process.cwd()}/supabase/migrations/20260917150000_field_assistant_payment_permissions.sql`,
      'utf8',
    );
    const scopedMigration = readFileSync(
      `${process.cwd()}/supabase/migrations/20260917180000_kassala_supervisor_payment_scope.sql`,
      'utf8',
    );
    expect(originalMigration).not.toMatch(/\('(?:down_payments|cost_submissions|pre_funding)',\s*'approve'\)/);
    expect(scopedMigration).toContain('is_kassala_hub_supervisor');
    expect(scopedMigration).toContain("'down_payments'::text, 'mark_paid'::text");
    expect(scopedMigration).toContain("'pre_funding'::text, 'use_for_payment'::text");
    expect(scopedMigration).toContain('DELETE FROM public.permissions');
    expect(scopedMigration).toContain("'fieldassistant'");
    expect(scopedMigration).toContain('assert_kassala_down_payment_scope');
  });

  it('keeps both Down Payment batch actions behind the Field Assistant payment grants', () => {
    const authorization = readFileSync(
      `${process.cwd()}/src/hooks/use-authorization.ts`,
      'utf8',
    );
    const approvalPanel = readFileSync(
      `${process.cwd()}/src/components/downPayment/DownPaymentApprovalPanel.tsx`,
      'utf8',
    );

    expect(authorization).toMatch(
      /canMarkDownPaymentPaid[\s\S]*checkPermission\('down_payments', 'mark_paid'\)[\s\S]*checkPermission\('pre_funding', 'use_for_payment'\)/,
    );
    expect(approvalPanel).toMatch(
      /canMarkPaid && selectedApproved\.length > 1[\s\S]*data-testid="button-approved-batch-pay"/,
    );
    expect(approvalPanel).toMatch(
      /canMarkPaid && payableCount > 1[\s\S]*data-testid="button-batch-pay"/,
    );
  });

  it('keeps Field Assistant in Tier 1 payment processing without approval', () => {
    const page = readFileSync(
      `${process.cwd()}/src/pages/DownPaymentApproval.tsx`,
      'utf8',
    );
    const migration = readFileSync(
      `${process.cwd()}/supabase/migrations/20260917170000_field_assistant_payment_only_tier.sql`,
      'utf8',
    );

    expect(page).toContain('Tier 1: Payment Processing');
    expect(page).toContain('Approval and rejection actions are unavailable.');
    expect(page).toContain('const isFieldPaymentOnly = canMarkPaidActions && !canApproveActions;');
    expect(page).toMatch(/isFieldPaymentOnly[\s\S]*approvalMode=\{isFieldPaymentOnly[\s\S]*\? 'explicit_payment'/);
    expect(migration).toContain("p.action = 'approve'");
    expect(migration).toContain("o.action = 'approve'");
    expect(migration).toContain("o.is_granted = true");
    expect(migration).toContain("'fieldassistant'");
  });
});