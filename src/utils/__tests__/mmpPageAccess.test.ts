import { describe, expect, it } from 'vitest';
import {
  canDeleteMmpItems,
  canViewMmpOperationalData,
  usesOversightMmpCategorization,
} from '../mmpPageAccess';

const none = {};

describe('canViewMmpOperationalData', () => {
  it('lets a country director see MMP and site data', () => {
    expect(canViewMmpOperationalData({ isCountryDirector: true })).toBe(true);
  });

  it('lets FOM and admin keep seeing data', () => {
    expect(canViewMmpOperationalData({ isFOM: true })).toBe(true);
    expect(canViewMmpOperationalData({ isAdmin: true })).toBe(true);
  });

  it('hides operational data from roles with no MMP oversight', () => {
    expect(canViewMmpOperationalData(none)).toBe(false);
  });
});

describe('usesOversightMmpCategorization', () => {
  it('puts country director on the admin-style New/Forwarded/Verified split', () => {
    expect(usesOversightMmpCategorization({ isCountryDirector: true })).toBe(true);
    expect(usesOversightMmpCategorization({ isAdmin: true })).toBe(true);
  });

  it('does not use FOM inbox categorization for country director', () => {
    expect(usesOversightMmpCategorization({ isFOM: true })).toBe(false);
  });
});

describe('canDeleteMmpItems', () => {
  it('never lets a country director delete MMP items', () => {
    expect(canDeleteMmpItems({ isCountryDirector: true })).toBe(false);
    expect(canDeleteMmpItems({ isCountryDirector: true, isAdmin: true })).toBe(false);
  });

  it('still lets admin and super admin delete', () => {
    expect(canDeleteMmpItems({ isAdmin: true })).toBe(true);
    expect(canDeleteMmpItems({ isSuperAdmin: true })).toBe(true);
  });
});
