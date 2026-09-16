import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_ROLE_PERMISSIONS } from '@/types/roles';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';

describe('Pre-Fund payment permissions', () => {
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
  });

  it('exposes both capabilities in unified Buttons & Actions registry', () => {
    const actions = MODULE_REGISTRY
      .flatMap(module => module.pages)
      .flatMap(page => page.actions);
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'cost_submissions:mark_paid' }),
      expect.objectContaining({ key: 'pre_funding:use_for_payment' }),
    ]));
  });
});