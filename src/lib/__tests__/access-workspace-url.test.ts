import { describe, expect, it } from 'vitest';
import { accessWorkspaceUrl } from '@/lib/access-workspace-url';

describe('canonical access workspace navigation', () => {
  it('preserves selected user and tab slug without corrupting query parameters', () => {
    const destination = new URL(accessWorkspaceUrl({ userId: 'user&1', pageSlug: 'accounting:reports' }), 'https://example.test');
    expect(destination.pathname).toBe('/super-admin-hub');
    expect(destination.searchParams.get('tab')).toBe('user-access');
    expect(destination.searchParams.get('accessUser')).toBe('user&1');
    expect(destination.searchParams.get('accessPage')).toBe('accounting:reports');
  });
});
