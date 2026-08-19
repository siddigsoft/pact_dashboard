import { describe, expect, it } from 'vitest';
import { getMmpCycleCloseAccess } from '../cycleCloseAccess';

describe('getMmpCycleCloseAccess', () => {
  it('lets an additional FOM role open the Cycle Close wizard', () => {
    const access = getMmpCycleCloseAccess({
      role: 'enumerator',
      additionalRoles: [{ role: 'FOM' }],
    });

    expect(access.isFOM).toBe(true);
    expect(access.canAccessCycleWizard).toBe(true);
  });

  it('also supports the database-shaped additional_roles field', () => {
    const access = getMmpCycleCloseAccess({
      role: 'enumerator',
      additional_roles: [{ role: 'Field Operation Manager' }],
    });

    expect(access.isFOM).toBe(true);
    expect(access.canAccessCycleWizard).toBe(true);
  });

  it('keeps the established parenthesized FOM role eligible', () => {
    const access = getMmpCycleCloseAccess({
      role: 'Field Operation Manager (FOM)',
    });

    expect(access.isFOM).toBe(true);
    expect(access.canAccessCycleWizard).toBe(true);
  });
});