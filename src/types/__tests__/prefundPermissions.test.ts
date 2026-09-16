import { describe, expect, it } from 'vitest';
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
});