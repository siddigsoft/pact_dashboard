import { describe, expect, it } from 'vitest';
import { accessWorkspaceUrl } from '@/lib/access-workspace-url';

describe('canonical access workspace navigation', () => {
  it('points at Role Management (canonical baselines surface)', () => {
    const destination = new URL(accessWorkspaceUrl({ userId: 'user&1', pageSlug: 'accounting:reports' }), 'https://example.test');
    expect(destination.pathname).toBe('/role-management');
    expect(destination.search).toBe('');
  });
});
