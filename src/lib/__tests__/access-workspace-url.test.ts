import { describe, expect, it } from 'vitest';
import { accessWorkspaceUrl } from '@/lib/access-workspace-url';

describe('canonical access workspace navigation', () => {
  it('points at Super Admin Roles (User Access page removed)', () => {
    const destination = new URL(accessWorkspaceUrl({ userId: 'user&1', pageSlug: 'accounting:reports' }), 'https://example.test');
    expect(destination.pathname).toBe('/super-admin-hub');
    expect(destination.searchParams.get('tab')).toBe('roles');
  });
});
