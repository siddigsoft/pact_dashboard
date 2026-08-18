import { describe, expect, it } from 'vitest';
import { rolesToRemoveOnPrimaryChange } from '../syncPrimaryUserRole';

describe('rolesToRemoveOnPrimaryChange', () => {
  it('removes the old primary role when the profile role changes', () => {
    expect(rolesToRemoveOnPrimaryChange({
      previousPrimary: 'admin',
      nextPrimary: 'supervisor',
    })).toEqual(expect.arrayContaining(['admin', 'dataCollector']));
  });

  it('keeps the old primary when it is still an additional role', () => {
    expect(rolesToRemoveOnPrimaryChange({
      previousPrimary: 'admin',
      nextPrimary: 'supervisor',
      additionalRoles: [{ role: 'admin' }],
    })).toEqual(['dataCollector']);
  });

  it('does not remove the current primary when the role is unchanged', () => {
    expect(rolesToRemoveOnPrimaryChange({
      previousPrimary: 'supervisor',
      nextPrimary: 'supervisor',
    })).toEqual(['dataCollector']);
  });
});
