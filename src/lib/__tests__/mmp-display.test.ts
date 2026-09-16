import { describe, expect, it } from 'vitest';
import { getMmpDisplayLabel, isFieldRoleOnly } from '@/lib/mmp-display';
import { getWorkflowMenuGroups } from '@/navigation/menu';
import { DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';

function menuMmpLabel(defaultRole: string, roles: string[] = [], isSuperAdmin = false) {
  return getWorkflowMenuGroups(
    roles as any,
    defaultRole,
    { mmp: true },
    isSuperAdmin,
    DEFAULT_MENU_PREFERENCES,
  )
    .flatMap(group => group.items)
    .find(item => item.id === 'mmp-management')?.title;
}

describe('MMP display label precedence', () => {
  it.each([
    ['Super Admin', ['dataCollector'], false],
    ['dataCollector', [], true],
    ['admin', ['supervisor'], false],
    ['FOM', ['coordinator'], false],
  ])('%s with field roles keeps the management label', (defaultRole, roles, isSuperAdmin) => {
    expect(getMmpDisplayLabel(defaultRole, roles, isSuperAdmin)).toBe('MMP Management');
    expect(menuMmpLabel(defaultRole, roles, isSuperAdmin)).toBe('MMP Management');
  });

  it.each([
    ['dataCollector', []],
    ['coordinator', []],
    ['supervisor', []],
  ])('%s-only access uses the field label', defaultRole => {
    expect(isFieldRoleOnly(defaultRole)).toBe(true);
    expect(getMmpDisplayLabel(defaultRole)).toBe('My Sites Management');
    expect(menuMmpLabel(defaultRole)).toBe('My Sites Management');
  });
});