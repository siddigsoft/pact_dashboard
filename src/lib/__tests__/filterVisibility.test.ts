import { describe, expect, it } from 'vitest';
import { nextFilterOverride, resolveFilterVisibility } from '../filter-visibility';

const base = {
  key: 'crm-contacts.search',
  userId: 'user-1',
  roles: ['staff'],
  isSuperAdmin: false,
  rows: [],
  initialLoading: false,
  failedWithoutData: false,
};

describe('filter visibility resolution', () => {
  it('fails closed before the initial configuration load and on an empty failed load', () => {
    expect(resolveFilterVisibility({ ...base, initialLoading: true })).toBe(false);
    expect(resolveFilterVisibility({ ...base, failedWithoutData: true })).toBe(false);
  });

  it('lets an explicit user-visible override win over a role hide', () => {
    expect(resolveFilterVisibility({
      ...base,
      rows: [
        { filter_key: base.key, role: 'staff', is_hidden: true },
        { filter_key: base.key, user_id: base.userId, is_hidden: false },
      ],
    })).toBe(true);
  });

  it('creates the opposite of inherited visibility and restores an existing override', () => {
    expect(nextFilterOverride(undefined, true)).toBe(false);
    expect(nextFilterOverride(undefined, false)).toBe(true);
    expect(nextFilterOverride({ filter_key: base.key, user_id: base.userId, is_hidden: true }, false)).toBeNull();
  });
});