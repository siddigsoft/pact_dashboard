import { describe, expect, it } from 'vitest';
import { getPageDefaultPermissions, withPageDefaultPermissions } from '@/lib/page-default-permissions';

describe('page default permissions', () => {
  it('grants the read permission a granted page needs to open', () => {
    expect(getPageDefaultPermissions('monitoring-plan')).toContainEqual({ resource: 'mmp', action: 'read' });
  });

  it('never auto-grants org-wide reads for self-service pages open to all roles', () => {
    expect(getPageDefaultPermissions('hr-payslip')).toEqual([]);
    expect(getPageDefaultPermissions('my-advances')).toEqual([]);
    expect(getPageDefaultPermissions('incentives')).toEqual([]);
  });

  it('merges page defaults with explicit permissions without duplicates', () => {
    const merged = withPageDefaultPermissions(
      [{ resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'update' }],
      ['monitoring-plan'],
    );
    expect(merged.filter(p => p.resource === 'mmp' && p.action === 'read')).toHaveLength(1);
    expect(merged).toContainEqual({ resource: 'mmp', action: 'update' });
  });
});
